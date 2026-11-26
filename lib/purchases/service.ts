import "server-only";
import { and, desc, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import { getDb, type Db, type Tx } from "@/lib/db";
import { purchaseItems, purchases, stores } from "@/lib/db/schema";
import { maxISO, todayInTimeZone, type ISODate } from "@/lib/dates";
import {
  computeDeadlines,
  type DeadlineResult,
  type ItemStatus,
} from "@/lib/deadlines/compute";
import {
  checkOrderDateBounds,
  type FieldErrors,
  type PurchaseInput,
} from "@/lib/purchases/input";
import {
  applyStatusAction,
  derivePurchaseStatus,
  type PurchaseStatus,
  type StatusAction,
} from "@/lib/purchases/status";
import type { StorePolicyInfo } from "@/lib/purchases/policy-hint";
import type { ShippingStatus } from "@/lib/purchases/constants";
import { regenerateReminders } from "@/lib/reminders/service";
import type { CurrentUser } from "@/lib/session";

export type StoreWithPolicies = typeof stores.$inferSelect & {
  categoryPolicies: {
    category: string;
    returnDays: number | null;
    nonReturnable: boolean;
  }[];
};

export type StoreOption = StorePolicyInfo & { id: string };

type WriteResult =
  { ok: true; id: string } | { ok: false; errors: FieldErrors };

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export async function listStoreOptions(): Promise<StoreOption[]> {
  const rows = await getDb().query.stores.findMany({
    columns: {
      id: true,
      name: true,
      defaultReturnDays: true,
      returnFrom: true,
      policyVerifiedAt: true,
    },
    with: {
      categoryPolicies: {
        columns: { category: true, returnDays: true, nonReturnable: true },
      },
    },
    orderBy: (s, { asc }) => asc(s.name),
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    defaultReturnDays: r.defaultReturnDays,
    returnFrom: r.returnFrom,
    policyVerified: r.policyVerifiedAt !== null,
    categoryPolicies: r.categoryPolicies,
  }));
}

/** Known store by exact (case-insensitive) name or slug; else null = free text. */
async function resolveStore(db: Db | Tx, storeName: string) {
  const name = storeName.trim().toLowerCase();
  return (
    (await db.query.stores.findFirst({
      where: or(sql`lower(${stores.name}) = ${name}`, eq(stores.slug, name)),
      with: { categoryPolicies: true },
    })) ?? null
  );
}

// ---------------------------------------------------------------------------
// Deadline computation shared by every write
// ---------------------------------------------------------------------------

type ComputeArgs = {
  orderDate: ISODate;
  deliveryDate: ISODate | null;
  deliveryDateEstimated: boolean;
  returnWindowDays: number | null;
  returnWindowSource: "user" | "email" | null;
  nonReturnable: boolean;
  items: {
    category: string | null;
    warrantyMonths: number | null;
    extendedWarrantyEnd: ISODate | null;
    itemStatus: ItemStatus;
  }[];
  store: StoreWithPolicies | null;
  timeZone: string;
  today: ISODate;
};

function compute(args: ComputeArgs): DeadlineResult {
  return computeDeadlines({
    orderDate: args.orderDate,
    deliveryDate: args.deliveryDate,
    deliveryDateEstimated: args.deliveryDateEstimated,
    explicitReturnWindow:
      args.returnWindowDays !== null && args.returnWindowSource
        ? { days: args.returnWindowDays, source: args.returnWindowSource }
        : null,
    nonReturnable: args.nonReturnable,
    store: args.store
      ? {
          defaultReturnDays: args.store.defaultReturnDays,
          returnFrom: args.store.returnFrom,
        }
      : null,
    categoryPolicies: args.store?.categoryPolicies ?? [],
    items: args.items,
    timeZone: args.timeZone,
    today: args.today,
  });
}

/**
 * `keepReasons` are review reasons from parsing an email (low confidence,
 * missing items…). They survive recomputes until the user edits or confirms
 * the purchase; the window reason is always re-derived.
 */
function purchaseColumnsFrom(
  result: DeadlineResult,
  keepReasons: readonly string[] = [],
) {
  const reviewReasons = [
    ...new Set([
      ...keepReasons.filter((r) => r !== "unknown_return_window"),
      ...result.reviewReasons,
    ]),
  ];
  return {
    returnWindowDays: result.returnWindowDays,
    returnWindowSource: result.returnWindowSource,
    returnDeadline: result.returnDeadline,
    returnDeadlineEstimated: result.returnDeadlineEstimated,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

function totalOf(items: PurchaseInput["items"]): string | null {
  if (!items.every((i) => i.unitPrice !== null)) return null;
  const cents = items.reduce(
    (sum, i) => sum + Math.round(i.unitPrice! * 100) * i.quantity,
    0,
  );
  return (cents / 100).toFixed(2);
}

const toPrice = (n: number | null) => (n === null ? null : n.toFixed(2));

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const e = error as {
    code?: string;
    constraint_name?: string;
    cause?: unknown;
  };
  if (e?.code === "23505" && e.constraint_name === constraint) return true;
  return e?.cause ? isUniqueViolation(e.cause, constraint) : false;
}

const DUPLICATE_ORDER: FieldErrors = {
  externalOrderId: "You've already added this order from this store",
};

/** Validates things the zod schema can't know (user's "today"). */
function boundsErrors(
  input: PurchaseInput,
  today: ISODate,
): FieldErrors | null {
  const orderDateError = checkOrderDateBounds(input.orderDate, today);
  return orderDateError ? { orderDate: orderDateError } : null;
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

export async function createManualPurchase(
  user: CurrentUser,
  input: PurchaseInput,
): Promise<WriteResult> {
  const today = todayInTimeZone(user.timezone);
  const bounds = boundsErrors(input, today);
  if (bounds) return { ok: false, errors: bounds };

  const db = getDb();
  try {
    const id = await db.transaction(async (tx) => {
      const store = await resolveStore(tx, input.storeName);
      const deliveryDateEstimated =
        input.deliveryDate !== null && input.deliveryDate > today;
      const result = compute({
        ...input,
        deliveryDateEstimated,
        returnWindowSource: input.returnWindowDays !== null ? "user" : null,
        store,
        timeZone: user.timezone,
        today,
      });
      const status = derivePurchaseStatus(
        input.items.map((i) => i.itemStatus),
        "active",
        result.shouldExpire,
      );

      const [row] = await tx
        .insert(purchases)
        .values({
          userId: user.id,
          storeId: store?.id ?? null,
          storeName: store?.name ?? input.storeName,
          externalOrderId: input.externalOrderId,
          source: "manual",
          status,
          orderDate: input.orderDate,
          deliveryDate: input.deliveryDate,
          deliveryDateEstimated,
          currency: input.currency,
          totalAmount: totalOf(input.items),
          nonReturnable: input.nonReturnable,
          notes: input.notes,
          userEditedFields: userFieldsOf(input),
          ...purchaseColumnsFrom(result),
        })
        .returning({ id: purchases.id });

      await tx
        .insert(purchaseItems)
        .values(
          input.items.map((item, i) => itemValues(row.id, item, result, i)),
        );
      await regenerateReminders(tx, row.id);
      return row.id;
    });
    return { ok: true, id };
  } catch (error) {
    if (isUniqueViolation(error, "purchases_user_store_order_unique")) {
      return { ok: false, errors: DUPLICATE_ORDER };
    }
    throw error;
  }
}

export async function updatePurchase(
  user: CurrentUser,
  purchaseId: string,
  input: PurchaseInput,
): Promise<WriteResult | null> {
  const today = todayInTimeZone(user.timezone);
  const bounds = boundsErrors(input, today);
  if (bounds) return { ok: false, errors: bounds };

  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const existing = await findOwnedPurchase(tx, user.id, purchaseId);
      if (!existing) return null;

      const store = await resolveStore(tx, input.storeName);
      const deliveryDateEstimated =
        input.deliveryDate !== null && input.deliveryDate > today;

      // Keep an email-stated window labelled as such if the user didn't change it.
      const returnWindowSource =
        input.returnWindowDays === null
          ? null
          : existing.returnWindowSource === "email" &&
              existing.returnWindowDays === input.returnWindowDays
            ? "email"
            : "user";

      const result = compute({
        ...input,
        deliveryDateEstimated,
        returnWindowSource,
        store,
        timeZone: user.timezone,
        today,
      });
      const status = derivePurchaseStatus(
        input.items.map((i) => i.itemStatus),
        existing.status,
        result.shouldExpire,
      );

      const edited = new Set(existing.userEditedFields);
      for (const f of changedFields(existing, input)) edited.add(f);

      await tx
        .update(purchases)
        .set({
          storeId: store?.id ?? null,
          storeName: store?.name ?? input.storeName,
          externalOrderId: input.externalOrderId,
          status,
          orderDate: input.orderDate,
          deliveryDate: input.deliveryDate,
          deliveryDateEstimated,
          currency: input.currency,
          totalAmount: totalOf(input.items),
          nonReturnable: input.nonReturnable,
          notes: input.notes,
          userEditedFields: [...edited],
          ...purchaseColumnsFrom(result),
        })
        .where(eq(purchases.id, existing.id));

      // Items: update matching ids, insert new ones, delete removed ones.
      const existingIds = new Set(existing.items.map((i) => i.id));
      const keptIds = input.items
        .map((i) => i.id)
        .filter((id): id is string => !!id && existingIds.has(id));
      await tx
        .delete(purchaseItems)
        .where(
          and(
            eq(purchaseItems.purchaseId, existing.id),
            keptIds.length ? notInArray(purchaseItems.id, keptIds) : undefined,
          ),
        );
      for (const [i, item] of input.items.entries()) {
        const values = itemValues(existing.id, item, result, i);
        if (item.id && existingIds.has(item.id)) {
          await tx
            .update(purchaseItems)
            .set(values)
            .where(eq(purchaseItems.id, item.id));
        } else {
          await tx.insert(purchaseItems).values(values);
        }
      }
      await regenerateReminders(tx, existing.id);
      return { ok: true as const, id: existing.id };
    });
  } catch (error) {
    if (isUniqueViolation(error, "purchases_user_store_order_unique")) {
      return { ok: false, errors: DUPLICATE_ORDER };
    }
    throw error;
  }
}

function itemValues(
  purchaseId: string,
  item: PurchaseInput["items"][number],
  result: DeadlineResult,
  index: number,
) {
  const computed = result.items[index];
  return {
    purchaseId,
    name: item.name,
    quantity: item.quantity,
    unitPrice: toPrice(item.unitPrice),
    category: item.category,
    serialNumber: item.serialNumber,
    warrantyMonths: item.warrantyMonths,
    warrantyStart: computed.warrantyStart,
    warrantyEnd: computed.warrantyEnd,
    extendedWarrantyEnd: item.extendedWarrantyEnd,
    itemStatus: item.itemStatus,
  };
}

function userFieldsOf(input: PurchaseInput): string[] {
  const fields: string[] = ["storeName", "orderDate", "currency", "items"];
  if (input.externalOrderId) fields.push("externalOrderId");
  if (input.deliveryDate) fields.push("deliveryDate");
  if (input.returnWindowDays !== null) fields.push("returnWindowDays");
  if (input.nonReturnable) fields.push("nonReturnable");
  if (input.notes) fields.push("notes");
  return fields;
}

type OwnedPurchase = NonNullable<Awaited<ReturnType<typeof findOwnedPurchase>>>;

function changedFields(
  existing: OwnedPurchase,
  input: PurchaseInput,
): string[] {
  const changed: string[] = [];
  const cmp: [string, unknown, unknown][] = [
    [
      "storeName",
      existing.storeName.toLowerCase(),
      input.storeName.toLowerCase(),
    ],
    ["externalOrderId", existing.externalOrderId, input.externalOrderId],
    ["orderDate", existing.orderDate, input.orderDate],
    ["deliveryDate", existing.deliveryDate, input.deliveryDate],
    ["currency", existing.currency, input.currency],
    ["nonReturnable", existing.nonReturnable, input.nonReturnable],
    ["notes", existing.notes, input.notes],
  ];
  for (const [field, before, after] of cmp) {
    if (before !== after) changed.push(field);
  }
  if (
    input.returnWindowDays !== null &&
    (existing.returnWindowSource !== "user" ||
      existing.returnWindowDays !== input.returnWindowDays)
  ) {
    changed.push("returnWindowDays");
  }
  changed.push("items"); // the edit form always submits the full item list
  return changed;
}

// ---------------------------------------------------------------------------
// Status + delete
// ---------------------------------------------------------------------------

export async function setPurchaseStatus(
  user: CurrentUser,
  purchaseId: string,
  action: StatusAction,
): Promise<boolean> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const existing = await findOwnedPurchase(tx, user.id, purchaseId);
    if (!existing) return false;

    const nextItemStatuses = applyStatusAction(
      action,
      existing.items.map((i) => i.itemStatus),
    );
    const today = todayInTimeZone(user.timezone);
    const result = compute({
      orderDate: existing.orderDate,
      deliveryDate: existing.deliveryDate,
      deliveryDateEstimated: existing.deliveryDateEstimated,
      returnWindowDays: existing.returnWindowDays,
      returnWindowSource: explicitSource(existing.returnWindowSource),
      nonReturnable: existing.nonReturnable,
      items: existing.items.map((item, i) => ({
        ...item,
        itemStatus: nextItemStatuses[i],
      })),
      store: existing.store,
      timeZone: user.timezone,
      today,
    });

    // With no items, the action sets the purchase status directly.
    const fallback: PurchaseStatus = action === "reopen" ? "active" : action;
    const status = existing.items.length
      ? derivePurchaseStatus(
          nextItemStatuses,
          existing.status,
          result.shouldExpire,
        )
      : derivePurchaseStatus([], fallback, result.shouldExpire);

    for (const [i, item] of existing.items.entries()) {
      if (item.itemStatus !== nextItemStatuses[i]) {
        await tx
          .update(purchaseItems)
          .set({ itemStatus: nextItemStatuses[i] })
          .where(eq(purchaseItems.id, item.id));
      }
    }
    await tx
      .update(purchases)
      .set({ status, ...purchaseColumnsFrom(result, existing.reviewReasons) })
      .where(eq(purchases.id, existing.id));
    // EC-PUSH-06: returned/kept/cancelled drops the reminders that no longer apply.
    await regenerateReminders(tx, existing.id);
    return true;
  });
}

/**
 * Order tracking from the purchase page. "delivered" sets the actual delivery
 * date (the return window counts from it) and marks it user-edited so later
 * emails don't change it (EC-DATE-10).
 */
export async function setOrderStage(
  user: CurrentUser,
  purchaseId: string,
  stage: ShippingStatus | "delivered",
  deliveredOn: ISODate | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const today = todayInTimeZone(user.timezone);
  const db = getDb();
  return db.transaction(async (tx) => {
    const existing = await findOwnedPurchase(tx, user.id, purchaseId);
    if (!existing) return { ok: false as const, error: "not_found" };

    if (stage === "delivered") {
      const date = deliveredOn ?? today;
      if (date > today)
        return {
          ok: false as const,
          error: "The delivery date can't be in the future.",
        };
      if (date < existing.orderDate) {
        return {
          ok: false as const,
          error: "The delivery date can't be before the order date.",
        };
      }
      const edited = new Set([...existing.userEditedFields, "deliveryDate"]);
      await tx
        .update(purchases)
        .set({
          deliveryDate: date,
          deliveryDateEstimated: false,
          userEditedFields: [...edited],
        })
        .where(eq(purchases.id, existing.id));
    } else {
      await tx
        .update(purchases)
        .set({
          shippingStatus: stage,
          // Undo a delivery marked by mistake: back to an estimate.
          ...(existing.deliveryDate && !existing.deliveryDateEstimated
            ? { deliveryDateEstimated: true }
            : {}),
        })
        .where(eq(purchases.id, existing.id));
    }
    await recomputePurchase(tx, existing.id, user.timezone); // deadlines + reminders
    return { ok: true as const };
  });
}

/** Soft delete (Section 11). The row stays for 6.4 dedupe history; UI hides it. */
export async function softDeletePurchase(
  user: CurrentUser,
  purchaseId: string,
): Promise<boolean> {
  const rows = await getDb()
    .update(purchases)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(purchases.id, purchaseId),
        eq(purchases.userId, user.id),
        isNull(purchases.deletedAt),
      ),
    )
    .returning({ id: purchases.id });
  if (rows.length) await regenerateReminders(getDb(), purchaseId);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Recompute (shared by email ingest, review confirmation and the daily job)
// ---------------------------------------------------------------------------

/**
 * Recomputes deadlines, warranty dates, review flags and status for one
 * purchase from what's stored, and saves them. `clearParseReasons` drops
 * email-parsing review reasons (the user has confirmed the details).
 */
export async function recomputePurchase(
  db: Db | Tx,
  purchaseId: string,
  timeZone: string,
  opts: { clearParseReasons?: boolean; addReasons?: string[] } = {},
): Promise<DeadlineResult | null> {
  const p = await db.query.purchases.findFirst({
    where: and(eq(purchases.id, purchaseId), isNull(purchases.deletedAt)),
    with: {
      items: { orderBy: (i, { asc }) => asc(i.name) },
      store: { with: { categoryPolicies: true } },
    },
  });
  if (!p) return null;

  const today = todayInTimeZone(timeZone);
  const result = compute({
    ...p,
    returnWindowSource: explicitSource(p.returnWindowSource),
    store: p.store,
    timeZone,
    today,
  });
  const status = derivePurchaseStatus(
    p.items.map((i) => i.itemStatus),
    p.status,
    result.shouldExpire,
  );
  const keep = opts.clearParseReasons
    ? []
    : [...p.reviewReasons, ...(opts.addReasons ?? [])];

  for (const [i, item] of p.items.entries()) {
    const c = result.items[i];
    if (
      item.warrantyStart !== c.warrantyStart ||
      item.warrantyEnd !== c.warrantyEnd
    ) {
      await db
        .update(purchaseItems)
        .set({ warrantyStart: c.warrantyStart, warrantyEnd: c.warrantyEnd })
        .where(eq(purchaseItems.id, item.id));
    }
  }
  await db
    .update(purchases)
    .set({ status, ...purchaseColumnsFrom(result, keep) })
    .where(eq(purchases.id, p.id));
  await regenerateReminders(db, p.id);
  return result;
}

/** "Looks right": the user confirms details parsed from an email. */
export async function confirmPurchaseReview(
  user: CurrentUser,
  purchaseId: string,
): Promise<boolean> {
  const owned = await findOwnedPurchase(getDb(), user.id, purchaseId);
  if (!owned) return false;
  await recomputePurchase(getDb(), owned.id, user.timezone, {
    clearParseReasons: true,
  });
  return true;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function findOwnedPurchase(db: Db | Tx, userId: string, purchaseId: string) {
  return db.query.purchases.findFirst({
    where: and(
      eq(purchases.id, purchaseId),
      eq(purchases.userId, userId),
      isNull(purchases.deletedAt),
    ),
    with: {
      items: { orderBy: (i, { asc }) => asc(i.name) },
      store: { with: { categoryPolicies: true } },
    },
  });
}

const explicitSource = (s: string | null) =>
  s === "user" || s === "email" ? s : null;

export type PurchaseDetail = OwnedPurchase & {
  computed: DeadlineResult;
  today: ISODate;
};

export async function getPurchaseDetail(
  user: CurrentUser,
  purchaseId: string,
): Promise<PurchaseDetail | null> {
  const purchase = await findOwnedPurchase(getDb(), user.id, purchaseId);
  if (!purchase) return null;
  const today = todayInTimeZone(user.timezone);
  const computed = compute({
    ...purchase,
    returnWindowSource: explicitSource(purchase.returnWindowSource),
    store: purchase.store,
    timeZone: user.timezone,
    today,
  });
  return { ...purchase, computed, today };
}

export type PurchaseSummary = {
  id: string;
  title: string;
  storeName: string;
  currency: string | null;
  totalAmount: string | null;
  orderDate: ISODate;
  status: PurchaseStatus;
  needsReview: boolean;
  nonReturnable: boolean;
  returnDeadline: ISODate | null;
  returnDeadlineEstimated: boolean;
  latestWarrantyEnd: ISODate | null;
  shippingStatus: ShippingStatus;
  deliveryDate: ISODate | null;
  deliveryDateEstimated: boolean;
};

const GONE_ITEM: ReadonlySet<string> = new Set(["returned", "cancelled"]);

export async function listPurchaseSummaries(
  user: CurrentUser,
): Promise<PurchaseSummary[]> {
  const rows = await getDb().query.purchases.findMany({
    where: and(eq(purchases.userId, user.id), isNull(purchases.deletedAt)),
    orderBy: [desc(purchases.orderDate), desc(purchases.createdAt)],
    limit: 500,
    columns: {
      id: true,
      storeName: true,
      currency: true,
      totalAmount: true,
      orderDate: true,
      status: true,
      needsReview: true,
      nonReturnable: true,
      returnDeadline: true,
      returnDeadlineEstimated: true,
      shippingStatus: true,
      deliveryDate: true,
      deliveryDateEstimated: true,
    },
    with: {
      items: {
        columns: {
          name: true,
          itemStatus: true,
          warrantyEnd: true,
          extendedWarrantyEnd: true,
        },
      },
    },
  });

  return rows.map(({ items, ...p }) => {
    const live = items.filter((i) => !GONE_ITEM.has(i.itemStatus));
    const latestWarrantyEnd =
      live
        .flatMap((i) => [i.warrantyEnd, i.extendedWarrantyEnd])
        .filter((d): d is string => d !== null)
        .reduce<string | null>((acc, d) => (acc ? maxISO(acc, d) : d), null) ??
      null;
    const title = items.length
      ? items.length > 1
        ? `${items[0].name} + ${items.length - 1} more`
        : items[0].name
      : p.storeName;
    return { ...p, title, latestWarrantyEnd };
  });
}
