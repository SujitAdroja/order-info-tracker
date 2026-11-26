import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { purchaseItems, purchases } from "@/lib/db/schema";
import { diffDaysISO, type ISODate } from "@/lib/dates";
import {
  looselyMatches,
  planMerge,
  type ExistingPurchase,
  type ReviewReason,
} from "@/lib/ingest/merge";
import type { ParsedOrder } from "@/lib/ingest/types";
import type { Tx } from "@/lib/db";
import { recomputePurchase } from "@/lib/purchases/service";

export type StoreRef = { id: string; name: string } | null;

export type ApplyResult =
  | { outcome: "created" | "updated"; purchaseId: string; needsReview: boolean }
  | { outcome: "ignored"; reason: string };

/** Store key per 6.4: store_id, or the normalized store name when unknown. */
function storeCondition(store: StoreRef, storeName: string) {
  return store
    ? eq(purchases.storeId, store.id)
    : and(
        isNull(purchases.storeId),
        sql`lower(${purchases.storeName}) = ${storeName.toLowerCase()}`,
      );
}

async function findExisting(
  tx: Tx,
  userId: string,
  store: StoreRef,
  storeName: string,
  order: ParsedOrder,
) {
  const base = and(
    eq(purchases.userId, userId),
    isNull(purchases.deletedAt),
    storeCondition(store, storeName),
  );
  const withItems = {
    items: { columns: { id: true, name: true, itemStatus: true } },
  } as const;

  if (order.external_order_id) {
    return (
      (await tx.query.purchases.findFirst({
        where: and(
          base,
          eq(purchases.externalOrderId, order.external_order_id),
        ),
        with: withItems,
      })) ?? null
    );
  }
  // No order id: same store, order date ±1 day, same total.
  if (!order.order_date || order.total_amount === null) return null;
  const candidates = await tx.query.purchases.findMany({
    where: and(
      base,
      sql`${purchases.orderDate} between (${order.order_date}::date - 1) and (${order.order_date}::date + 1)`,
    ),
    with: withItems,
    limit: 10,
  });
  return candidates.find((c) => looselyMatches(c, order, diffDaysISO)) ?? null;
}

export async function applyOrder(
  db: Db,
  args: {
    userId: string;
    timeZone: string;
    store: StoreRef;
    storeName: string;
    currencyFallback: string;
    order: ParsedOrder;
    emailDate: ISODate | null;
    today: ISODate;
    confidence: number;
    extraReasons: ReviewReason[];
    outForDelivery?: boolean;
  },
): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const { order } = args;
    const existingRow = await findExisting(
      tx,
      args.userId,
      args.store,
      args.storeName,
      order,
    );
    const existing: ExistingPurchase | null = existingRow
      ? {
          status: existingRow.status,
          shippingStatus: existingRow.shippingStatus,
          orderDate: existingRow.orderDate,
          deliveryDate: existingRow.deliveryDate,
          deliveryDateEstimated: existingRow.deliveryDateEstimated,
          currency: existingRow.currency,
          totalAmount: existingRow.totalAmount,
          externalOrderId: existingRow.externalOrderId,
          returnWindowDays: existingRow.returnWindowDays,
          returnWindowSource: existingRow.returnWindowSource,
          userEditedFields: existingRow.userEditedFields,
          items: existingRow.items,
        }
      : null;

    const plan = planMerge(existing, order, {
      emailDate: args.emailDate,
      today: args.today,
      outForDelivery: args.outForDelivery,
    });
    if (plan.kind === "ignore")
      return { outcome: "ignored", reason: plan.reason };

    const itemRows = (purchaseId: string, items: ParsedOrder["items"]) =>
      items.map((i) => ({
        purchaseId,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.unit_price === null ? null : i.unit_price.toFixed(2),
        category: i.category,
        serialNumber: i.serial_number,
        warrantyMonths: i.warranty_months,
      }));

    let purchaseId: string;
    let reasons: string[] = [];
    if (plan.kind === "create") {
      const [row] = await tx
        .insert(purchases)
        .values({
          userId: args.userId,
          storeId: args.store?.id ?? null,
          storeName: args.storeName,
          source: "email",
          parseConfidence: args.confidence,
          orderDate: plan.fields.orderDate,
          shippingStatus: plan.fields.shippingStatus ?? "ordered",
          deliveryDate: plan.fields.deliveryDate,
          deliveryDateEstimated: plan.fields.deliveryDateEstimated,
          externalOrderId: plan.fields.externalOrderId ?? null,
          currency: plan.fields.currency ?? args.currencyFallback,
          totalAmount: plan.fields.totalAmount ?? null,
          returnWindowDays: plan.fields.returnWindowDays ?? null,
          returnWindowSource: plan.fields.returnWindowSource ?? null,
          nonReturnable: plan.fields.nonReturnable ?? false,
          // EC-ING-20: marketplace seller noted; its policy may differ.
          notes: order.seller_name
            ? `Sold by ${order.seller_name.slice(0, 100)}`
            : null,
        })
        .returning({ id: purchases.id });
      purchaseId = row.id;
      if (plan.items.length)
        await tx.insert(purchaseItems).values(itemRows(purchaseId, plan.items));
      reasons = [...plan.reviewReasons, ...args.extraReasons];
    } else {
      purchaseId = existingRow!.id;
      if (Object.keys(plan.fields).length || plan.purchaseStatus) {
        await tx
          .update(purchases)
          .set({
            ...plan.fields,
            ...(plan.purchaseStatus ? { status: plan.purchaseStatus } : {}),
          })
          .where(eq(purchases.id, purchaseId));
      }
      if (plan.addItems.length) {
        await tx
          .insert(purchaseItems)
          .values(itemRows(purchaseId, plan.addItems));
      }
      for (const change of plan.itemStatus) {
        await tx
          .update(purchaseItems)
          .set({ itemStatus: change.status })
          .where(
            and(
              eq(purchaseItems.id, change.id),
              eq(purchaseItems.purchaseId, purchaseId),
            ),
          );
      }
      // EC-PUSH-06: recomputePurchase below regenerates reminders for the new status.
    }

    const result = await recomputePurchase(tx, purchaseId, args.timeZone, {
      addReasons: reasons,
    });
    const after = await tx.query.purchases.findFirst({
      where: eq(purchases.id, purchaseId),
      columns: { needsReview: true },
    });
    return {
      outcome: plan.kind === "create" ? "created" : "updated",
      purchaseId,
      needsReview: after?.needsReview ?? result?.needsReview ?? false,
    };
  });
}
