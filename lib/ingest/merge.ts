import type { ISODate } from "@/lib/dates";
import type { ItemStatus } from "@/lib/deadlines/compute";
import type { ParsedItem, ParsedOrder } from "@/lib/ingest/types";

/**
 * Section 6.4 merge rules, as a pure decision. The DB layer (upsert.ts)
 * applies the plan and recomputes deadlines.
 */

export const LOW_CONFIDENCE = 0.7;

export type ReviewReason =
  | "low_confidence"
  | "no_items"
  | "missing_order_date"
  | "unknown_return_window"
  | "image_only"
  | "llm_unavailable"
  | "llm_cap_reached";

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  low_confidence: "We weren't sure we read this email correctly.",
  no_items: "We couldn't find the item names.",
  missing_order_date:
    "We couldn't find the order date, so we used the email's date.",
  unknown_return_window: "We don't know the return window.",
  image_only: "The order details were in images we couldn't read.",
  llm_unavailable: "Automatic reading isn't available for this store yet.",
  llm_cap_reached: "We hit today's limit for automatic reading.",
};

export type ExistingPurchase = {
  status: string;
  orderDate: ISODate;
  deliveryDate: ISODate | null;
  deliveryDateEstimated: boolean;
  currency: string | null;
  totalAmount: string | null;
  externalOrderId: string | null;
  returnWindowDays: number | null;
  returnWindowSource: string | null;
  userEditedFields: string[];
  items: { id: string; name: string; itemStatus: ItemStatus }[];
};

export type PurchaseFields = {
  orderDate?: ISODate;
  deliveryDate?: ISODate | null;
  deliveryDateEstimated?: boolean;
  currency?: string | null;
  totalAmount?: string | null;
  externalOrderId?: string | null;
  returnWindowDays?: number | null;
  returnWindowSource?: "email" | null;
  nonReturnable?: boolean;
};

export type MergePlan =
  | { kind: "ignore"; reason: "not_a_purchase" | "unmatched_update" }
  | {
      kind: "create";
      fields: Required<
        Pick<
          PurchaseFields,
          "orderDate" | "deliveryDate" | "deliveryDateEstimated"
        >
      > &
        PurchaseFields;
      items: ParsedItem[];
      reviewReasons: ReviewReason[];
    }
  | {
      kind: "update";
      fields: PurchaseFields;
      addItems: ParsedItem[];
      itemStatus: { id: string; status: ItemStatus }[];
      /** For purchases without items, where item statuses can't carry it. */
      purchaseStatus?: "cancelled" | "returned";
    };

const UPDATE_TYPES = new Set(["cancelled", "refund", "return_initiated"]);

const toMoney = (n: number | null) => (n === null ? null : n.toFixed(2));

function tokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

/** Fuzzy item-name match for partial cancellations/returns (6.4). */
export function itemNamesMatch(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const smaller = Math.min(ta.size, tb.size);
  return shared / smaller >= 0.6;
}

function sameMoney(a: string | null, b: number | null): boolean {
  return a !== null && b !== null && Math.abs(Number(a) - b) < 0.005;
}

/** Dedupe without an order id: same store, order date ±1 day, same total. */
export function looselyMatches(
  existing: { orderDate: ISODate; totalAmount: string | null },
  order: ParsedOrder,
  diffDays: (a: ISODate, b: ISODate) => number,
): boolean {
  if (!order.order_date || order.total_amount === null) return false;
  return (
    Math.abs(diffDays(existing.orderDate, order.order_date)) <= 1 &&
    sameMoney(existing.totalAmount, order.total_amount)
  );
}

export function planMerge(
  existing: ExistingPurchase | null,
  order: ParsedOrder,
  ctx: { emailDate: ISODate | null; today: ISODate },
): MergePlan {
  if (
    order.email_type === "other" ||
    order.email_type === "gmail_verification"
  ) {
    return { kind: "ignore", reason: "not_a_purchase" };
  }
  if (!existing) {
    // A cancellation/refund for an order we never saw has nothing to update.
    if (UPDATE_TYPES.has(order.email_type)) {
      return { kind: "ignore", reason: "unmatched_update" };
    }
    return planCreate(order, ctx);
  }
  return planUpdate(existing, order, ctx);
}

function planCreate(
  order: ParsedOrder,
  ctx: { emailDate: ISODate | null; today: ISODate },
): MergePlan {
  const reasons: ReviewReason[] = [];
  const delivered = order.email_type === "delivered";
  const actualDelivery =
    order.delivery_date ?? (delivered ? (ctx.emailDate ?? ctx.today) : null);

  let orderDate = order.order_date;
  if (!orderDate) {
    reasons.push("missing_order_date");
    orderDate = actualDelivery ?? ctx.emailDate ?? ctx.today;
  }
  // Never let a delivery date precede the order date.
  const delivery = actualDelivery ?? order.expected_delivery_date;
  const deliveryDate = delivery && delivery >= orderDate ? delivery : null;

  if (order.items.length === 0) reasons.push("no_items");
  if (order.confidence < LOW_CONFIDENCE) reasons.push("low_confidence");

  return {
    kind: "create",
    fields: {
      orderDate,
      deliveryDate,
      deliveryDateEstimated: deliveryDate !== null && !actualDelivery,
      currency: order.currency,
      totalAmount: toMoney(order.total_amount),
      externalOrderId: order.external_order_id,
      returnWindowDays: order.return_window_days_stated,
      returnWindowSource:
        order.return_window_days_stated !== null ? "email" : null,
      nonReturnable:
        order.items.length > 0 && order.items.every((i) => i.non_returnable),
    },
    items: order.items,
    reviewReasons: reasons,
  };
}

function planUpdate(
  existing: ExistingPurchase,
  order: ParsedOrder,
  ctx: { emailDate: ISODate | null; today: ISODate },
): MergePlan {
  const edited = new Set(existing.userEditedFields);
  const fields: PurchaseFields = {};
  const canSet = (field: string) => !edited.has(field);

  // Fill missing fields from any email type; never overwrite user edits (EC-DATE-10).
  if (
    !existing.externalOrderId &&
    order.external_order_id &&
    canSet("externalOrderId")
  ) {
    fields.externalOrderId = order.external_order_id;
  }
  if (!existing.currency && order.currency && canSet("currency")) {
    fields.currency = order.currency;
  }
  if (existing.totalAmount === null && order.total_amount !== null) {
    fields.totalAmount = toMoney(order.total_amount);
  }
  if (
    order.return_window_days_stated !== null &&
    canSet("returnWindowDays") &&
    existing.returnWindowSource !== "user" &&
    existing.returnWindowDays !== order.return_window_days_stated
  ) {
    fields.returnWindowDays = order.return_window_days_stated;
    fields.returnWindowSource = "email";
  }

  // Delivery dates (EC-ING-03, EC-DATE-01).
  if (canSet("deliveryDate")) {
    if (order.email_type === "delivered") {
      const date = order.delivery_date ?? ctx.emailDate ?? ctx.today;
      if (date >= existing.orderDate) {
        fields.deliveryDate = date;
        fields.deliveryDateEstimated = false;
      }
    } else if (
      order.delivery_date &&
      existing.deliveryDateEstimated !== false
    ) {
      fields.deliveryDate = order.delivery_date;
      fields.deliveryDateEstimated = false;
    } else if (
      order.expected_delivery_date &&
      (existing.deliveryDate === null || existing.deliveryDateEstimated) &&
      order.expected_delivery_date >= existing.orderDate
    ) {
      fields.deliveryDate = order.expected_delivery_date;
      fields.deliveryDateEstimated = true;
    }
  }

  // Items: add when we had none (e.g. created from a "shipped" email).
  const addItems =
    existing.items.length === 0 && canSet("items") ? order.items : [];

  // Status-changing emails.
  const itemStatus: { id: string; status: ItemStatus }[] = [];
  const open = existing.items.filter(
    (i) => i.itemStatus !== "cancelled" && i.itemStatus !== "returned",
  );
  const targets = (names: string[]) =>
    names.length === 0
      ? open
      : open.filter((i) => names.some((n) => itemNamesMatch(i.name, n)));

  if (order.email_type === "cancelled") {
    for (const i of targets(order.items.map((x) => x.name))) {
      itemStatus.push({ id: i.id, status: "cancelled" });
    }
  } else if (
    order.email_type === "refund" ||
    order.email_type === "return_initiated"
  ) {
    for (const i of targets(order.items.map((x) => x.name))) {
      itemStatus.push({ id: i.id, status: "returned" });
    }
  }

  let purchaseStatus: "cancelled" | "returned" | undefined;
  if (existing.items.length === 0) {
    if (order.email_type === "cancelled") purchaseStatus = "cancelled";
    if (
      order.email_type === "refund" ||
      order.email_type === "return_initiated"
    ) {
      purchaseStatus = "returned";
    }
  }

  return { kind: "update", fields, addItems, itemStatus, purchaseStatus };
}
