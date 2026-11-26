import { describe, expect, it } from "vitest";
import {
  expectedDelivery,
  isInTransit,
  laterShippingStatus,
  orderStage,
} from "@/lib/purchases/order-stage";

describe("order stage", () => {
  const base = {
    shippingStatus: "ordered" as const,
    deliveryDate: null,
    deliveryDateEstimated: false,
  };

  it("delivered only with an actual delivery date", () => {
    expect(orderStage(base)).toBe("ordered");
    expect(
      orderStage({
        ...base,
        shippingStatus: "shipped",
        deliveryDate: "2026-12-01",
        deliveryDateEstimated: true,
      }),
    ).toBe("shipped");
    expect(
      orderStage({
        ...base,
        shippingStatus: "out_for_delivery",
        deliveryDate: "2026-12-01",
        deliveryDateEstimated: false,
      }),
    ).toBe("delivered");
  });

  it("in transit = open and not delivered", () => {
    expect(isInTransit({ ...base, status: "active" })).toBe(true);
    expect(isInTransit({ ...base, status: "cancelled" })).toBe(false);
    expect(
      isInTransit({ ...base, status: "active", deliveryDate: "2026-12-01" }),
    ).toBe(false);
  });

  it("stages never move backwards", () => {
    expect(laterShippingStatus("ordered", "shipped")).toBe("shipped");
    expect(laterShippingStatus("out_for_delivery", "shipped")).toBe(
      "out_for_delivery",
    );
    expect(laterShippingStatus("shipped", "shipped")).toBe("shipped");
  });

  it("expected delivery is the estimated date only", () => {
    expect(
      expectedDelivery({
        ...base,
        deliveryDate: "2026-12-01",
        deliveryDateEstimated: true,
      }),
    ).toBe("2026-12-01");
    expect(
      expectedDelivery({ ...base, deliveryDate: "2026-12-01" }),
    ).toBeNull();
  });
});
