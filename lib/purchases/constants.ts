/** Item categories (Section 6.3 schema + `digital` for EC-ING-25). */
export const CATEGORIES = [
  "electronics",
  "appliance",
  "fashion",
  "home",
  "beauty",
  "grocery",
  "digital",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  electronics: "Electronics",
  appliance: "Appliance",
  fashion: "Fashion",
  home: "Home",
  beauty: "Beauty",
  grocery: "Grocery",
  digital: "Digital / subscription",
  other: "Other",
};

/** Section 8: warranty default by category when nothing else is known. */
export const WARRANTY_DEFAULT_MONTHS: Partial<Record<Category, number>> = {
  electronics: 12,
  appliance: 12,
};

/** EC-ING-25: digital purchases are non-returnable unless a window is stated. */
export const NON_RETURNABLE_CATEGORIES: ReadonlySet<string> = new Set([
  "digital",
]);

export const RETURN_WINDOW_SOURCES = [
  "user",
  "email",
  "category",
  "store",
] as const;
export type ReturnWindowSource = (typeof RETURN_WINDOW_SOURCES)[number];

export const CURRENCIES = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "AED",
  "SGD",
  "AUD",
  "CAD",
  "JPY",
] as const;

/** Section 6.2 step 7 sanity bounds, reused for manual entry. */
export const MAX_PURCHASE_AGE_YEARS = 5;
export const MAX_RETURN_WINDOW_DAYS = 365;
export const MAX_WARRANTY_MONTHS = 240;
export const MAX_ITEMS_PER_PURCHASE = 20;
