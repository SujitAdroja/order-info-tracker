import { CATEGORY_LABELS, type Category } from "@/lib/purchases/constants";

export type StorePolicyInfo = {
  name: string;
  defaultReturnDays: number | null;
  returnFrom: "delivery" | "order";
  policyVerified: boolean;
  categoryPolicies: {
    category: string;
    returnDays: number | null;
    nonReturnable: boolean;
  }[];
};

export type WindowHint = { hint: string; placeholder: string };

type Resolved =
  { kind: "days"; days: number } | { kind: "none" } | { kind: "unknown" };

/** Mirrors computeDeadlines' policy steps 3–4 for one item category. */
function resolve(store: StorePolicyInfo, category: string): Resolved {
  const policy = store.categoryPolicies.find((p) => p.category === category);
  if (policy?.nonReturnable) return { kind: "none" };
  if (policy?.returnDays != null)
    return { kind: "days", days: policy.returnDays };
  if (store.defaultReturnDays != null) {
    return { kind: "days", days: store.defaultReturnDays };
  }
  return { kind: "unknown" };
}

const label = (category: string) =>
  CATEGORY_LABELS[category as Category]?.toLowerCase() ?? category;

/**
 * Form hint for the return-window field (F5: "prefilled from store policy").
 * `categories` are the item categories chosen so far ("" = not chosen).
 */
export function storeWindowHint(
  store: StorePolicyInfo | null,
  categories: string[],
): WindowHint {
  if (!store) {
    return {
      hint: "Check your receipt or the store's website. Leave blank if you don't know; we'll remind you to fill it in.",
      placeholder: "e.g. 7",
    };
  }
  if (!store.policyVerified) {
    return {
      hint: `We haven't verified ${store.name}'s return policy yet. Enter the window from your receipt or their website.`,
      placeholder: "e.g. 7",
    };
  }

  const from = store.returnFrom === "order" ? "purchase" : "delivery";
  const chosen = [...new Set(categories.filter(Boolean))];

  if (chosen.length === 0) {
    if (store.defaultReturnDays != null) {
      return {
        hint: `${store.name} policy: ${store.defaultReturnDays} days from ${from}. Leave blank to use it.`,
        placeholder: String(store.defaultReturnDays),
      };
    }
    return {
      hint: `${store.name}'s window depends on the category. Choose a category for each item, or enter the window yourself.`,
      placeholder: "e.g. 7",
    };
  }

  const results = chosen.map((c) => ({ category: c, r: resolve(store, c) }));
  const unknown = results.filter((x) => x.r.kind === "unknown");
  if (unknown.length) {
    return {
      hint: `${store.name}'s policy doesn't cover ${unknown.map((x) => label(x.category)).join(", ")}. Enter the window from your receipt or the product page.`,
      placeholder: "e.g. 7",
    };
  }
  if (results.every((x) => x.r.kind === "none")) {
    return {
      hint: `${store.name} doesn't accept returns for ${results.map((x) => label(x.category)).join(", ")}. Enter a window only if your receipt says otherwise.`,
      placeholder: "0",
    };
  }

  const days = new Set(
    results.flatMap((x) => (x.r.kind === "days" ? [x.r.days] : [])),
  );
  if (days.size === 1 && results.every((x) => x.r.kind === "days")) {
    const [n] = days;
    return {
      hint: `${store.name} policy for ${results.map((x) => label(x.category)).join(", ")}: ${n} days from ${from}. Leave blank to use it.`,
      placeholder: String(n),
    };
  }
  return {
    hint: `${store.name}'s window differs between these items; we'll track each one and remind you about the earliest. Leave blank to use their policy.`,
    placeholder: "",
  };
}
