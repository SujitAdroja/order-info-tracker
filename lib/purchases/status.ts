import type { ItemStatus } from "@/lib/deadlines/compute";

export type PurchaseStatus =
  "active" | "returned" | "kept" | "cancelled" | "expired";
export type StatusAction = "returned" | "kept" | "cancelled" | "reopen";

export const STATUS_ACTIONS: readonly StatusAction[] = [
  "returned",
  "kept",
  "cancelled",
  "reopen",
];

const GONE: ReadonlySet<ItemStatus> = new Set(["returned", "cancelled"]);

/** F7: applies a purchase-level action to its items. */
export function applyStatusAction(
  action: StatusAction,
  items: ItemStatus[],
): ItemStatus[] {
  switch (action) {
    case "returned":
    case "cancelled":
      return items.map((s) => (GONE.has(s) ? s : action));
    case "kept":
      return items.map((s) => (s === "active" ? "kept" : s));
    case "reopen":
      return items.map(() => "active");
  }
}

/**
 * Purchase status follows its items (EC-DATE-11: stays active until every
 * item is resolved). `shouldExpire` comes from computeDeadlines.
 */
export function derivePurchaseStatus(
  items: ItemStatus[],
  current: PurchaseStatus,
  shouldExpire: boolean,
): PurchaseStatus {
  if (items.length === 0) {
    if (current === "active" || current === "expired") {
      return shouldExpire ? "expired" : "active";
    }
    return current;
  }

  const remaining = items.filter((s) => !GONE.has(s));
  if (remaining.length === 0) {
    return items.every((s) => s === "cancelled") ? "cancelled" : "returned";
  }
  if (remaining.every((s) => s === "kept")) return "kept";
  return shouldExpire ? "expired" : "active";
}
