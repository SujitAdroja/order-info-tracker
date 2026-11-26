import type { ParsedOrder } from "@/lib/ingest/types";
import { CATEGORIES, type Category } from "@/lib/purchases/constants";
import {
  emptyItem,
  type ItemFormValues,
  type PurchaseFormValues,
} from "@/lib/purchases/form-values";
import type { StoreForMatching } from "@/lib/ingest/store-match";
import type { Draft, DraftField, DuplicateRef } from "@/lib/uploads/types";

/** Below this, fields that were found are still highlighted (EC-SHR-19). */
export const CHECK_BELOW_CONFIDENCE = 0.7;

const str = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "" : String(v);

/** One extracted order → prefilled form values plus what to highlight. */
export function orderToDraft(
  order: ParsedOrder,
  opts: { key: string; storeName: string | null; currencyFallback: string },
): Omit<Draft, "duplicate"> {
  const items: ItemFormValues[] = order.items.map((i) => ({
    ...emptyItem(),
    name: i.name,
    quantity: str(i.quantity),
    unitPrice: str(i.unit_price),
    category: (CATEGORIES as readonly string[]).includes(i.category)
      ? (i.category as Category)
      : "",
    serialNumber: str(i.serial_number),
    warrantyMonths: str(i.warranty_months),
  }));
  // One item, no price, but a total: the total is that item's price.
  if (
    items.length === 1 &&
    !items[0].unitPrice &&
    items[0].quantity === "1" &&
    order.total_amount !== null
  ) {
    items[0].unitPrice = str(order.total_amount);
  }

  const values: PurchaseFormValues = {
    storeName: (opts.storeName ?? order.store_name ?? "").slice(0, 100),
    externalOrderId: str(order.external_order_id).slice(0, 100),
    // EC-SHR-06: left empty when not found, so the user is asked.
    orderDate: str(order.order_date),
    deliveryDate: str(order.delivery_date ?? order.expected_delivery_date),
    currency: order.currency ?? opts.currencyFallback,
    returnWindowDays: str(order.return_window_days_stated),
    nonReturnable:
      order.items.length > 0 && order.items.every((i) => i.non_returnable),
    notes: "",
    items: items.length ? items : [emptyItem()],
  };

  const missing: DraftField[] = [];
  if (!values.storeName) missing.push("storeName");
  if (!values.orderDate) missing.push("orderDate");
  if (!items.length) missing.push("items");
  const check: DraftField[] =
    order.confidence < CHECK_BELOW_CONFIDENCE
      ? (["storeName", "orderDate", "items"] as const).filter(
          (f) => !missing.includes(f),
        )
      : [];

  return {
    key: opts.key,
    values,
    check,
    missing,
    confidence: order.confidence,
    total: order.total_amount,
  };
}

/**
 * Store named in screenshot/PDF text: the full domain ("amazon.in") is the
 * strongest signal, then the store's name or domain label as a whole word
 * ("Flipkart", "amazon"). Ties (amazon.in vs amazon.com) go to the store
 * whose country matches the user's currency.
 */
export function storeFromText<T extends StoreForMatching>(
  text: string,
  stores: T[],
  preferCountry: string | null,
): T | null {
  const lower = text.toLowerCase();
  const word = (w: string) =>
    new RegExp(
      `(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`,
    ).test(lower);
  let best: { store: T; score: number } | null = null;
  for (const store of stores) {
    let score = 0;
    for (const d of store.senderDomains) {
      const domain = d.toLowerCase();
      if (word(domain)) score = Math.max(score, 3);
      else if (word(domain.split(".")[0])) score = Math.max(score, 1);
    }
    if (word(store.name.toLowerCase())) score = Math.max(score, 2);
    if (!score) continue;
    if (preferCountry && store.country === preferCountry) score += 0.5;
    if (!best || score > best.score) best = { store, score };
  }
  return best?.store ?? null;
}

// ---------------------------------------------------------------------------
// Duplicates (Section 3.5 of the share spec)
// ---------------------------------------------------------------------------

export type ExistingForDuplicate = {
  id: string;
  title: string;
  storeName: string;
  externalOrderId: string | null;
  orderDate: string;
  totalAmount: string | number | null;
};

const normId = (s: string) => s.replace(/[\s#-]/g, "").toUpperCase();
const normStore = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.(in|com|co\.uk|ae|sg)$/, "")
    .replace(/[^a-z0-9]/g, "");

function dayDiff(a: string, b: string): number {
  return (
    Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) /
    86_400_000
  );
}

export function findDuplicate(
  draft: {
    storeName: string;
    externalOrderId: string;
    orderDate: string;
    total: number | null;
  },
  existing: ExistingForDuplicate[],
): DuplicateRef | null {
  const store = normStore(draft.storeName);
  const sameStore = (p: ExistingForDuplicate) =>
    !store || normStore(p.storeName) === store;

  if (draft.externalOrderId) {
    const id = normId(draft.externalOrderId);
    const hit = existing.find(
      (p) =>
        p.externalOrderId && normId(p.externalOrderId) === id && sameStore(p),
    );
    if (hit)
      return { purchaseId: hit.id, title: hit.title, kind: "same_order" };
  }
  if (store && draft.orderDate && draft.total !== null) {
    const hit = existing.find(
      (p) =>
        normStore(p.storeName) === store &&
        dayDiff(p.orderDate, draft.orderDate) <= 1 &&
        p.totalAmount !== null &&
        Math.abs(Number(p.totalAmount) - draft.total!) < 0.01,
    );
    if (hit) return { purchaseId: hit.id, title: hit.title, kind: "possible" };
  }
  return null;
}
