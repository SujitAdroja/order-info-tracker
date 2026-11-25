import type { ISODate } from "@/lib/dates";

/** String-typed form state; the zod schema coerces on submit. */
export type ItemFormValues = {
  key: string;
  id?: string;
  name: string;
  quantity: string;
  unitPrice: string;
  category: string;
  serialNumber: string;
  warrantyMonths: string;
  extendedWarrantyEnd: string;
  itemStatus: "active" | "returned" | "kept" | "cancelled";
};

export type PurchaseFormValues = {
  storeName: string;
  externalOrderId: string;
  orderDate: string;
  deliveryDate: string;
  currency: string;
  returnWindowDays: string;
  nonReturnable: boolean;
  notes: string;
  items: ItemFormValues[];
};

const randomKey = () =>
  `k-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

export function emptyItem(): ItemFormValues {
  return {
    key: randomKey(),
    name: "",
    quantity: "1",
    unitPrice: "",
    category: "",
    serialNumber: "",
    warrantyMonths: "",
    extendedWarrantyEnd: "",
    itemStatus: "active",
  };
}

export function newPurchaseValues(
  today: ISODate,
  currency: string,
): PurchaseFormValues {
  return {
    storeName: "",
    externalOrderId: "",
    orderDate: today,
    deliveryDate: "",
    currency,
    returnWindowDays: "",
    nonReturnable: false,
    notes: "",
    items: [emptyItem()],
  };
}

const str = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "" : String(v);

type StoredPurchase = {
  storeName: string;
  externalOrderId: string | null;
  orderDate: string;
  deliveryDate: string | null;
  currency: string | null;
  returnWindowDays: number | null;
  returnWindowSource: string | null;
  nonReturnable: boolean;
  notes: string | null;
  items: {
    id: string;
    name: string;
    quantity: number;
    unitPrice: string | null;
    category: string | null;
    serialNumber: string | null;
    warrantyMonths: number | null;
    extendedWarrantyEnd: string | null;
    itemStatus: ItemFormValues["itemStatus"];
  }[];
};

export function purchaseToFormValues(
  p: StoredPurchase,
  fallbackCurrency: string,
): PurchaseFormValues {
  // Only an explicit window is shown as typed; a policy-derived one stays a placeholder.
  const explicitWindow =
    p.returnWindowSource === "user" || p.returnWindowSource === "email";
  return {
    storeName: p.storeName,
    externalOrderId: str(p.externalOrderId),
    orderDate: p.orderDate,
    deliveryDate: str(p.deliveryDate),
    currency: p.currency ?? fallbackCurrency,
    returnWindowDays: explicitWindow ? str(p.returnWindowDays) : "",
    nonReturnable: p.nonReturnable,
    notes: str(p.notes),
    items: p.items.map((i) => ({
      key: i.id,
      id: i.id,
      name: i.name,
      quantity: str(i.quantity),
      unitPrice: i.unitPrice === null ? "" : String(Number(i.unitPrice)),
      category: str(i.category),
      serialNumber: str(i.serialNumber),
      warrantyMonths: str(i.warrantyMonths),
      extendedWarrantyEnd: str(i.extendedWarrantyEnd),
      itemStatus: i.itemStatus,
    })),
  };
}
