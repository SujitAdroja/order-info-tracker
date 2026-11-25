import type { ISODate } from "@/lib/dates";
import type { PurchaseStatus } from "@/lib/purchases/status";

export const DASHBOARD_TABS = [
  "returns",
  "warranty",
  "review",
  "history",
] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export const DASHBOARD_TAB_LABELS: Record<DashboardTab, string> = {
  returns: "Returns closing soon",
  warranty: "Under warranty",
  review: "Needs review",
  history: "History",
};

export type BucketablePurchase = {
  status: PurchaseStatus;
  needsReview: boolean;
  returnDeadline: ISODate | null;
  latestWarrantyEnd: ISODate | null;
};

/**
 * Which dashboard tabs a purchase appears in. Uses `today` rather than the
 * persisted `expired` flag, so the dashboard is right even before the daily
 * cleanup job runs. A purchase can be in both Returns and Warranty.
 */
export function tabsFor(p: BucketablePurchase, today: ISODate): DashboardTab[] {
  const tabs: DashboardTab[] = [];
  const open = p.status === "active" || p.status === "expired";

  if (p.needsReview && p.status !== "returned" && p.status !== "cancelled") {
    tabs.push("review");
  }
  if (open && p.returnDeadline && p.returnDeadline >= today) {
    tabs.push("returns");
  }
  if (
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
): Record<DashboardTab, T[]> {
  const buckets: Record<DashboardTab, T[]> = {
    returns: [],
    warranty: [],
    review: [],
    history: [],
  };
  for (const p of purchases) {
    for (const tab of tabsFor(p, today)) buckets[tab].push(p);
  }
  buckets.returns.sort((a, b) =>
    a.returnDeadline!.localeCompare(b.returnDeadline!),
  );
  buckets.warranty.sort((a, b) =>
    a.latestWarrantyEnd!.localeCompare(b.latestWarrantyEnd!),
  );
  return buckets;
}
