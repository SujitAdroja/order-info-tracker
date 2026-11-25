import { describe, expect, it } from "vitest";
import { isISODate } from "@/lib/dates";
import { STORE_SEEDS } from "@/lib/db/seed/stores";
import { CATEGORIES, MAX_RETURN_WINDOW_DAYS } from "@/lib/purchases/constants";

describe("store seeds (Section 7: verified policies or null)", () => {
  it("has the top 10 stores with unique slugs", () => {
    expect(STORE_SEEDS).toHaveLength(10);
    expect(new Set(STORE_SEEDS.map((s) => s.slug)).size).toBe(10);
  });

  it.each(STORE_SEEDS.map((s) => [s.slug, s] as const))(
    "%s: policy values only when verified, with source",
    (_slug, s) => {
      const hasPolicy =
        s.defaultReturnDays !== null || s.categoryPolicies.length > 0;
      if (hasPolicy) {
        expect(s.policyUrl).toMatch(/^https:\/\//);
        expect(s.policyVerifiedAt && isISODate(s.policyVerifiedAt)).toBe(true);
      } else {
        expect(s.policyVerifiedAt).toBeNull();
      }
      if (s.defaultReturnDays !== null) {
        expect(s.defaultReturnDays).toBeGreaterThan(0);
        expect(s.defaultReturnDays).toBeLessThanOrEqual(MAX_RETURN_WINDOW_DAYS);
      }
      for (const p of s.categoryPolicies) {
        expect(CATEGORIES).toContain(p.category);
        if (p.nonReturnable) expect(p.returnDays).toBeNull();
        else expect(p.returnDays).toBeGreaterThan(0);
      }
    },
  );
});
