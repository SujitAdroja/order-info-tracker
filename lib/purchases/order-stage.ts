import type { ISODate } from "@/lib/dates";
import type { ShippingStatus } from "@/lib/purchases/constants";

/**
 * Order tracking: Ordered → Shipped → Out for delivery → Delivered.
 * "Delivered" is derived from an actual (not estimated) delivery date, so
 * the return window and the order stage can never disagree.
 */
export type OrderStage = ShippingStatus | "delivered";

export const ORDER_STAGES: readonly OrderStage[] = [
  "ordered",
  "shipped",
  "out_for_delivery",
  "delivered",
];

export const ORDER_STAGE_LABELS: Record<OrderStage, string> = {
  ordered: "Ordered",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
};

export type StageInput = {
  shippingStatus: ShippingStatus;
  deliveryDate: ISODate | null;
  deliveryDateEstimated: boolean;
};

export function orderStage(p: StageInput): OrderStage {
  return p.deliveryDate && !p.deliveryDateEstimated
    ? "delivered"
    : p.shippingStatus;
}

/** Still on its way: open purchase whose delivery isn't confirmed. */
export function isInTransit(p: StageInput & { status: string }): boolean {
  return (
    (p.status === "active" || p.status === "expired") &&
    orderStage(p) !== "delivered"
  );
}

/** Stages only move forward (a late "shipped" email can't undo "out for delivery"). */
export function laterShippingStatus(
  a: ShippingStatus,
  b: ShippingStatus,
): ShippingStatus {
  return ORDER_STAGES.indexOf(b) > ORDER_STAGES.indexOf(a) ? b : a;
}

/** The expected arrival date, if we have one (estimated delivery date). */
export function expectedDelivery(p: StageInput): ISODate | null {
  return p.deliveryDate && p.deliveryDateEstimated ? p.deliveryDate : null;
}

/** Days after ordering we ask "did it arrive?" when no expected date is known. */
export const DELIVERY_CHECK_AFTER_ORDER_DAYS = 7;
