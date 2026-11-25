import { describe, expect, it } from "vitest";
import {
  bucketPurchases,
  tabsFor,
  type BucketablePurchase,
} from "@/lib/purchases/buckets";
import {
  applyStatusAction,
  derivePurchaseStatus,
} from "@/lib/purchases/status";

describe("applyStatusAction", () => {
  it("returned/cancelled leave already-gone items alone", () => {
    expect(
      applyStatusAction("returned", ["active", "cancelled", "kept"]),
    ).toEqual(["returned", "cancelled", "returned"]);
    expect(applyStatusAction("cancelled", ["active", "returned"])).toEqual([
      "cancelled",
      "returned",
    ]);
  });

  it("kept only touches active items", () => {
    expect(applyStatusAction("kept", ["active", "returned"])).toEqual([
      "kept",
      "returned",
    ]);
  });

  it("reopen makes everything active", () => {
    expect(applyStatusAction("reopen", ["returned", "kept"])).toEqual([
      "active",
      "active",
    ]);
  });
});

describe("derivePurchaseStatus (EC-DATE-11)", () => {
  it("partial return keeps the purchase active", () => {
    expect(derivePurchaseStatus(["returned", "active"], "active", false)).toBe(
      "active",
    );
  });
  it("all returned → returned; all cancelled → cancelled; mixed → returned", () => {
    expect(
      derivePurchaseStatus(["returned", "returned"], "active", false),
    ).toBe("returned");
    expect(derivePurchaseStatus(["cancelled"], "active", false)).toBe(
      "cancelled",
    );
    expect(
      derivePurchaseStatus(["cancelled", "returned"], "active", false),
    ).toBe("returned");
  });
  it("remaining items all kept → kept", () => {
    expect(derivePurchaseStatus(["kept", "returned"], "active", false)).toBe(
      "kept",
    );
  });
  it("active purchase with nothing left to track → expired, and back", () => {
    expect(derivePurchaseStatus(["active"], "active", true)).toBe("expired");
    expect(derivePurchaseStatus(["active"], "expired", false)).toBe("active");
  });
});

describe("dashboard tabs", () => {
  const today = "2026-03-10";
  const p = (over: Partial<BucketablePurchase>): BucketablePurchase => ({
    status: "active",
    needsReview: false,
    returnDeadline: null,
    latestWarrantyEnd: null,
    ...over,
  });

  it("open return window → Returns; also warranty → both tabs", () => {
    expect(tabsFor(p({ returnDeadline: "2026-03-10" }), today)).toEqual([
      "returns",
    ]);
    expect(
      tabsFor(
        p({ returnDeadline: "2026-03-12", latestWarrantyEnd: "2027-03-01" }),
        today,
      ),
    ).toEqual(["returns", "warranty"]);
  });

  it("kept items show under warranty only", () => {
    expect(
      tabsFor(
        p({
          status: "kept",
          returnDeadline: "2026-03-12",
          latestWarrantyEnd: "2027-01-01",
        }),
        today,
      ),
    ).toEqual(["warranty"]);
  });

  it("needs review shows in Review and not History", () => {
    expect(tabsFor(p({ needsReview: true }), today)).toEqual(["review"]);
  });

  it("closed, returned, cancelled → History", () => {
    expect(tabsFor(p({ returnDeadline: "2026-03-09" }), today)).toEqual([
      "history",
    ]);
    expect(
      tabsFor(p({ status: "returned", needsReview: true }), today),
    ).toEqual(["history"]);
    expect(tabsFor(p({ status: "cancelled" }), today)).toEqual(["history"]);
  });

  it("sorts Returns by deadline and Warranty by end date", () => {
    const a = p({
      returnDeadline: "2026-03-20",
      latestWarrantyEnd: "2027-01-01",
    });
    const b = p({
      returnDeadline: "2026-03-11",
      latestWarrantyEnd: "2028-01-01",
    });
    const buckets = bucketPurchases([a, b], today);
    expect(buckets.returns).toEqual([b, a]);
    expect(buckets.warranty).toEqual([a, b]);
  });
});
