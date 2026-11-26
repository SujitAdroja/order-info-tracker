import type { PurchaseFormValues } from "@/lib/purchases/form-values";

/**
 * "Update existing" for a duplicate share: keep everything the user already
 * has, fill only what's blank, and take an actual delivery date from the
 * new screenshot (it's usually why they shared it again). Items stay as they
 * are, except blank prices filled when the item lists line up.
 */
export function mergeDraftIntoExisting(
  existing: PurchaseFormValues,
  draft: PurchaseFormValues,
  today: string,
): PurchaseFormValues {
  const fill = (a: string, b: string) => (a.trim() ? a : b);
  const sameItems = existing.items.length === draft.items.length;
  return {
    ...existing,
    externalOrderId: fill(existing.externalOrderId, draft.externalOrderId),
    // A past date on the new screenshot is an actual delivery: it wins.
    // A future (expected) one only fills a blank.
    deliveryDate:
      draft.deliveryDate && draft.deliveryDate <= today
        ? draft.deliveryDate
        : fill(existing.deliveryDate, draft.deliveryDate),
    returnWindowDays: fill(existing.returnWindowDays, draft.returnWindowDays),
    items: existing.items.map((item, i) => ({
      ...item,
      unitPrice:
        sameItems && !item.unitPrice
          ? draft.items[i].unitPrice
          : item.unitPrice,
    })),
  };
}
