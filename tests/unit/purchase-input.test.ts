import { describe, expect, it } from "vitest";
import {
  emptyItem,
  newPurchaseValues,
  purchaseToFormValues,
} from "@/lib/purchases/form-values";
import {
  checkOrderDateBounds,
  purchaseInputSchema,
  toFieldErrors,
} from "@/lib/purchases/input";

const form = (
  over: Record<string, unknown> = {},
  item: Record<string, unknown> = {},
) => ({
  ...newPurchaseValues("2026-03-10", "INR"),
  storeName: "Amazon.in",
  items: [{ ...emptyItem(), name: "Boat Airdopes 141", ...item }],
  ...over,
});

const errorsOf = (input: unknown) => {
  const r = purchaseInputSchema.safeParse(input);
  return r.success ? {} : toFieldErrors(r.error);
};

describe("purchaseInputSchema", () => {
  it("parses string form values into typed input; blanks become null", () => {
    const r = purchaseInputSchema.parse(
      form({ returnWindowDays: "10" }, { unitPrice: "1299.50", quantity: "2" }),
    );
    expect(r).toMatchObject({
      storeName: "Amazon.in",
      orderDate: "2026-03-10",
      deliveryDate: null,
      returnWindowDays: 10,
      externalOrderId: null,
      notes: null,
      items: [
        {
          name: "Boat Airdopes 141",
          quantity: 2,
          unitPrice: 1299.5,
          category: null,
        },
      ],
    });
  });

  it("accepts 2-decimal prices without float noise", () => {
    for (const price of ["0.1", "19.99", "1299.99", "0.07"]) {
      expect(errorsOf(form({}, { unitPrice: price }))).toEqual({});
    }
    expect(
      errorsOf(form({}, { unitPrice: "1.005" }))["items.0.unitPrice"],
    ).toBeDefined();
  });

  it("requires store, order date, and at least one named item", () => {
    expect(errorsOf(form({ storeName: " " })).storeName).toBe(
      "Store is required",
    );
    expect(errorsOf(form({ orderDate: "" })).orderDate).toBeDefined();
    expect(errorsOf(form({}, { name: "" }))["items.0.name"]).toBe(
      "Item name is required",
    );
    expect(errorsOf(form({ items: [] })).items).toBe("Add at least one item");
  });

  it("rejects impossible dates and delivery before order", () => {
    expect(errorsOf(form({ orderDate: "2026-02-30" })).orderDate).toBe(
      "Enter a valid date",
    );
    expect(errorsOf(form({ deliveryDate: "2026-03-01" })).deliveryDate).toBe(
      "Delivery can't be before the order date",
    );
  });

  it("bounds return window, warranty and price", () => {
    expect(
      errorsOf(form({ returnWindowDays: "400" })).returnWindowDays,
    ).toBeDefined();
    expect(
      errorsOf(form({ returnWindowDays: "2.5" })).returnWindowDays,
    ).toBeDefined();
    expect(
      errorsOf(form({}, { warrantyMonths: "-1" }))["items.0.warrantyMonths"],
    ).toBeDefined();
    expect(
      errorsOf(form({}, { unitPrice: "-5" }))["items.0.unitPrice"],
    ).toBeDefined();
  });

  it("rejects unknown categories and bad currency codes", () => {
    expect(
      errorsOf(form({}, { category: "weapons" }))["items.0.category"],
    ).toBeDefined();
    expect(errorsOf(form({ currency: "rupees" })).currency).toBeDefined();
  });
});

describe("checkOrderDateBounds", () => {
  it("allows today and tomorrow (timezone slack), rejects later", () => {
    expect(checkOrderDateBounds("2026-03-11", "2026-03-10")).toBeNull();
    expect(checkOrderDateBounds("2026-03-12", "2026-03-10")).toMatch(/future/);
  });
  it("rejects orders older than 5 years", () => {
    expect(checkOrderDateBounds("2021-03-10", "2026-03-10")).toBeNull();
    expect(checkOrderDateBounds("2021-03-09", "2026-03-10")).toMatch(/5 years/);
    expect(checkOrderDateBounds("2023-02-28", "2028-02-29")).toBeNull();
  });
});

describe("purchaseToFormValues", () => {
  const stored = {
    storeName: "Amazon.in",
    externalOrderId: null,
    orderDate: "2026-03-01",
    deliveryDate: "2026-03-04",
    currency: "INR",
    returnWindowDays: 10,
    returnWindowSource: "store",
    nonReturnable: false,
    notes: null,
    items: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Kettle",
        quantity: 1,
        unitPrice: "1299.00",
        category: "appliance",
        serialNumber: null,
        warrantyMonths: null,
        extendedWarrantyEnd: null,
        itemStatus: "active" as const,
      },
    ],
  };

  it("hides policy-derived windows so they stay policy-driven", () => {
    expect(purchaseToFormValues(stored, "INR").returnWindowDays).toBe("");
    expect(
      purchaseToFormValues({ ...stored, returnWindowSource: "user" }, "INR")
        .returnWindowDays,
    ).toBe("10");
  });

  it("round-trips through the schema", () => {
    const values = purchaseToFormValues(stored, "INR");
    expect(values.items[0].unitPrice).toBe("1299");
    expect(purchaseInputSchema.safeParse(values).success).toBe(true);
  });
});
