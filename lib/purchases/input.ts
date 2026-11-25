import { z } from "zod";
import { addDaysISO, isISODate, type ISODate } from "@/lib/dates";
import {
  CATEGORIES,
  MAX_ITEMS_PER_PURCHASE,
  MAX_PURCHASE_AGE_YEARS,
  MAX_RETURN_WINDOW_DAYS,
  MAX_WARRANTY_MONTHS,
} from "@/lib/purchases/constants";

/** Empty form fields arrive as "" — treat them as "not provided". */
const blankToNull = (v: unknown) =>
  v === "" || v === undefined
    ? null
    : typeof v === "string"
      ? v.trim() || null
      : v;

const isoDate = z.string().refine(isISODate, "Enter a valid date");

const optionalDate = z.preprocess(blankToNull, isoDate.nullable());

const optionalInt = (min: number, max: number, message: string) =>
  z.preprocess(
    blankToNull,
    z.coerce
      .number()
      .int(message)
      .min(min, message)
      .max(max, message)
      .nullable(),
  );

const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().max(max).nullable());

export const ITEM_STATUS_VALUES = [
  "active",
  "returned",
  "kept",
  "cancelled",
] as const;

export const purchaseItemInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Item name is required").max(200),
  quantity: z.coerce.number().int().min(1, "At least 1").max(999).default(1),
  unitPrice: z.preprocess(
    blankToNull,
    z.coerce
      .number()
      .min(0, "Price can't be negative")
      .max(9_999_999_999, "Price is too large")
      .multipleOf(0.01, "Use at most 2 decimals")
      .nullable(),
  ),
  category: z.preprocess(blankToNull, z.enum(CATEGORIES).nullable()),
  serialNumber: optionalText(100),
  warrantyMonths: optionalInt(
    0,
    MAX_WARRANTY_MONTHS,
    `Enter whole months (0–${MAX_WARRANTY_MONTHS})`,
  ),
  extendedWarrantyEnd: optionalDate,
  itemStatus: z.enum(ITEM_STATUS_VALUES).default("active"),
});

export const purchaseInputSchema = z
  .object({
    storeName: z.string().trim().min(1, "Store is required").max(100),
    externalOrderId: optionalText(100),
    orderDate: isoDate,
    deliveryDate: optionalDate,
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code"),
    returnWindowDays: optionalInt(
      0,
      MAX_RETURN_WINDOW_DAYS,
      `Enter whole days (0–${MAX_RETURN_WINDOW_DAYS})`,
    ),
    nonReturnable: z.boolean().default(false),
    notes: optionalText(2000),
    items: z
      .array(purchaseItemInputSchema)
      .min(1, "Add at least one item")
      .max(MAX_ITEMS_PER_PURCHASE),
  })
  .superRefine((p, ctx) => {
    if (p.deliveryDate && p.deliveryDate < p.orderDate) {
      ctx.addIssue({
        code: "custom",
        path: ["deliveryDate"],
        message: "Delivery can't be before the order date",
      });
    }
    p.items.forEach((item, i) => {
      if (item.extendedWarrantyEnd && item.extendedWarrantyEnd < p.orderDate) {
        ctx.addIssue({
          code: "custom",
          path: ["items", i, "extendedWarrantyEnd"],
          message: "Must be after the order date",
        });
      }
    });
  });

export type PurchaseInput = z.infer<typeof purchaseInputSchema>;
export type PurchaseItemInput = z.infer<typeof purchaseItemInputSchema>;

/** Section 6.2 step 7: order date not in the future (+1 day) or older than 5 years. */
export function checkOrderDateBounds(
  orderDate: ISODate,
  today: ISODate,
): string | null {
  if (orderDate > addDaysISO(today, 1))
    return "Order date can't be in the future";
  const [y, m, d] = today.split("-");
  const oldest = `${Number(y) - MAX_PURCHASE_AGE_YEARS}-${m}-${d === "29" && m === "02" ? "28" : d}`;
  if (orderDate < oldest) {
    return `Order date can't be more than ${MAX_PURCHASE_AGE_YEARS} years ago`;
  }
  return null;
}

export type FieldErrors = Record<string, string>;

/** Flattens zod issues to `{ "items.0.name": "message" }` for the form. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}

/** Purchase fields the user typed, for `user_edited_fields` (EC-DATE-10). */
export const USER_EDITABLE_FIELDS = [
  "storeName",
  "externalOrderId",
  "orderDate",
  "deliveryDate",
  "currency",
  "returnWindowDays",
  "nonReturnable",
  "notes",
  "items",
] as const;
