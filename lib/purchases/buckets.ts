import type { ISODate } from "@/lib/dates";
import { FEATURES } from "@/lib/features";
import {
  expectedDelivery,
  isInTransit,
  type StageInput,
} from "@/lib/purchases/order-stage";
import type { PurchaseStatus } from "@/lib/purchases/status";

const ALL_TABS = [
  "orders",
  "returns",
  "warranty",
  "review",
  "history",
] as const;
export type DashboardTab = (typeof ALL_TABS)[number];
/** Tabs shown on the dashboard (warranty is behind FEATURES.warranty). */
export const DASHBOARD_TABS: readonly DashboardTab[] = ALL_TABS.filter(
  (t) => t !== "warranty" || FEATURES.warranty,
);

export const DASHBOARD_TAB_LABELS: Record<DashboardTab, string> = {
  orders: "Orders",
  returns: "Returns closing soon",
  warranty: "Under warranty",
  review: "Needs review",
  history: "History",
};

export type BucketablePurchase = StageInput & {
  status: PurchaseStatus;
  orderDate: ISODate;
  needsReview: boolean;
  returnDeadline: ISODate | null;
  latestWarrantyEnd: ISODate | null;
};

/**
 * Which dashboard tabs a purchase appears in. Uses `today` rather than the
 * persisted `expired` flag, so the dashboard is right even before the daily
 * cleanup job runs. A purchase can be in both Returns and Warranty.
 */
export function tabsFor(
  p: BucketablePurchase,
  today: ISODate,
  { warranty = FEATURES.warranty }: { warranty?: boolean } = {},
): DashboardTab[] {
  const tabs: DashboardTab[] = [];
  const open = p.status === "active" || p.status === "expired";

  // Ordered but not delivered yet, from any store.
  if (isInTransit(p)) tabs.push("orders");
  if (p.needsReview && p.status !== "returned" && p.status !== "cancelled") {
    tabs.push("review");
  }
  if (open && p.returnDeadline && p.returnDeadline >= today) {
    tabs.push("returns");
  }
  if (
    warranty &&
    (open || p.status === "kept") &&
    p.latestWarrantyEnd &&
    p.latestWarrantyEnd >= today
  ) {
    tabs.push("warranty");
  }
  if (tabs.length === 0) tabs.push("history");
  return tabs;
}

export function bucketPurchases<T extends BucketablePurchase>(
  purchases: T[],
  today: ISODate,
  opts: { warranty?: boolean } = {},
): Record<DashboardTab, T[]> {
  const buckets: Record<DashboardTab, T[]> = {
    orders: [],
    returns: [],
    warranty: [],
    review: [],
    history: [],
  };
  for (const p of purchases) {
    for (const tab of tabsFor(p, today, opts)) buckets[tab].push(p);
  }
  // Soonest expected arrival first; unknown dates after, newest order first.
  buckets.orders.sort((a, b) => {
    const ea = expectedDelivery(a);
    const eb = expectedDelivery(b);
    if (ea && eb && ea !== eb) return ea.localeCompare(eb);
    if (ea && !eb) return -1;
    if (!ea && eb) return 1;
    return b.orderDate.localeCompare(a.orderDate);
  });
  buckets.returns.sort((a, b) =>
    a.returnDeadline!.localeCompare(b.returnDeadline!),
  );
  buckets.warranty.sort((a, b) =>
    a.latestWarrantyEnd!.localeCompare(b.latestWarrantyEnd!),
  );
  return buckets;
}
