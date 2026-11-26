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
  // Delivered by default; order-tracking cases override the delivery fields.
  const p = (over: Partial<BucketablePurchase>): BucketablePurchase => ({
    status: "active",
    needsReview: false,
    returnDeadline: null,
    latestWarrantyEnd: null,
    orderDate: "2026-03-01",
    shippingStatus: "ordered",
    deliveryDate: "2026-03-03",
    deliveryDateEstimated: false,
    ...over,
  });

  it("warranty tab is hidden while FEATURES.warranty is off", () => {
    expect(
      tabsFor(p({ status: "kept", latestWarrantyEnd: "2027-01-01" }), today),
    ).toEqual(["history"]);
  });

  it("not delivered yet → Orders (and still Returns while the estimate is open)", () => {
    expect(tabsFor(p({ deliveryDate: null }), today)).toEqual(["orders"]);
    expect(
      tabsFor(
        p({
          shippingStatus: "shipped",
          deliveryDate: "2026-03-12",
          deliveryDateEstimated: true,
          returnDeadline: "2026-03-22",
        }),
        today,
      ),
    ).toEqual(["orders", "returns"]);
    // Delivered, cancelled or returned → not in Orders.
    expect(
      tabsFor(p({ status: "cancelled", deliveryDate: null }), today),
    ).toEqual(["history"]);
  });

  it("sorts Orders by expected arrival, unknown dates last (newest first)", () => {
    const soon = p({ deliveryDate: "2026-03-11", deliveryDateEstimated: true });
    const later = p({
      deliveryDate: "2026-03-15",
      deliveryDateEstimated: true,
    });
    const unknownOld = p({ deliveryDate: null, orderDate: "2026-02-01" });
    const unknownNew = p({ deliveryDate: null, orderDate: "2026-03-08" });
    expect(
      bucketPurchases([unknownOld, later, unknownNew, soon], today).orders,
    ).toEqual([soon, later, unknownNew, unknownOld]);
  });

  it("open return window → Returns; also warranty → both tabs", () => {
    expect(
      tabsFor(p({ returnDeadline: "2026-03-10" }), today, { warranty: true }),
    ).toEqual(["returns"]);
    expect(
      tabsFor(
        p({ returnDeadline: "2026-03-12", latestWarrantyEnd: "2027-03-01" }),
        today,
        { warranty: true },
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
        { warranty: true },
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
    const buckets = bucketPurchases([a, b], today, { warranty: true });
    expect(buckets.returns).toEqual([b, a]);
    expect(buckets.warranty).toEqual([a, b]);
  });
});
