import { describe, expect, it } from "vitest";
import { STORE_SEEDS } from "@/lib/db/seed/stores";
import {
  storeWindowHint,
  type StorePolicyInfo,
} from "@/lib/purchases/policy-hint";

const store = (slug: string): StorePolicyInfo => {
  const s = STORE_SEEDS.find((x) => x.slug === slug)!;
  return { ...s, policyVerified: s.policyVerifiedAt !== null };
};

describe("storeWindowHint", () => {
  it("unknown store → generic guidance", () => {
    expect(storeWindowHint(null, []).hint).toMatch(/Check your receipt/);
  });

  it("unverified store says so", () => {
    expect(storeWindowHint(store("amazon-in"), ["electronics"]).hint).toMatch(
      /haven't verified Amazon\.in/,
    );
  });

  it("store default applies when no category is chosen", () => {
    expect(storeWindowHint(store("nykaa"), [""])).toEqual({
      hint: "Nykaa policy: 15 days from delivery. Leave blank to use it.",
      placeholder: "15",
    });
  });

  it("category-only store asks for a category first", () => {
    expect(storeWindowHint(store("flipkart"), [""]).hint).toMatch(
      /depends on the category/,
    );
  });

  it("category policy wins over the store default", () => {
    expect(storeWindowHint(store("bestbuy"), ["electronics"])).toMatchObject({
      placeholder: "14",
    });
    expect(storeWindowHint(store("flipkart"), ["fashion"])).toEqual({
      hint: "Flipkart policy for fashion: 10 days from delivery. Leave blank to use it.",
      placeholder: "10",
    });
  });

  it("order-based stores say 'from purchase'", () => {
    expect(storeWindowHint(store("ikea"), ["home"]).hint).toBe(
      "IKEA policy for home: 365 days from purchase. Leave blank to use it.",
    );
  });

  it("non-returnable categories are called out", () => {
    expect(storeWindowHint(store("nykaa"), ["appliance"])).toMatchObject({
      placeholder: "0",
    });
    expect(storeWindowHint(store("nykaa"), ["appliance"]).hint).toMatch(
      /doesn't accept returns for appliance/,
    );
  });

  it("categories the policy doesn't cover ask the user", () => {
    expect(storeWindowHint(store("flipkart"), ["beauty"]).hint).toMatch(
      /doesn't cover beauty/,
    );
  });

  it("mixed windows explain that each item is tracked", () => {
    expect(
      storeWindowHint(store("flipkart"), ["fashion", "electronics"]).hint,
    ).toMatch(/differs between these items/);
  });
});
