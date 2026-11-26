import { describe, expect, it } from "vitest";
import { genericExtract } from "@/lib/ingest/generic-extract";
import type { ParsedOrder } from "@/lib/ingest/types";
import { newPurchaseValues } from "@/lib/purchases/form-values";
import {
  findDuplicate,
  orderToDraft,
  storeFromText,
  type ExistingForDuplicate,
} from "@/lib/uploads/drafts";
import { mergeDraftIntoExisting } from "@/lib/uploads/merge-draft";
import {
  enrichFromScreenText,
  guessItemName,
  parseYearlessDate,
} from "@/lib/uploads/screen-text";

const order = (over: Partial<ParsedOrder> = {}): ParsedOrder => ({
  email_type: "order_confirmation",
  store_name: null,
  external_order_id: null,
  order_date: null,
  delivery_date: null,
  expected_delivery_date: null,
  currency: null,
  total_amount: null,
  items: [],
  return_window_days_stated: null,
  seller_name: null,
  confidence: 0.9,
  ...over,
});

const stores = [
  {
    id: "1",
    slug: "amazon-in",
    name: "Amazon.in",
    country: "IN",
    senderDomains: ["amazon.in"],
  },
  {
    id: "2",
    slug: "amazon-us",
    name: "Amazon.com",
    country: "US",
    senderDomains: ["amazon.com"],
  },
  {
    id: "3",
    slug: "flipkart",
    name: "Flipkart",
    country: "IN",
    senderDomains: ["flipkart.com"],
  },
];

describe("storeFromText", () => {
  it("finds a store by name or domain label as a whole word", () => {
    expect(storeFromText("Order details - Flipkart", stores, "IN")?.slug).toBe(
      "flipkart",
    );
    expect(storeFromText("notflipkartish", stores, "IN")).toBeNull();
  });

  it("breaks amazon.in / amazon.com ties by the user's country", () => {
    expect(storeFromText("amazon Your Orders", stores, "IN")?.slug).toBe(
      "amazon-in",
    );
    expect(storeFromText("amazon Your Orders", stores, "US")?.slug).toBe(
      "amazon-us",
    );
    expect(storeFromText("www.amazon.com order", stores, "IN")?.slug).toBe(
      "amazon-us",
    );
  });
});

describe("orderToDraft", () => {
  it("prefills the form; a single item without a price takes the total", () => {
    const d = orderToDraft(
      order({
        external_order_id: "OD123456789",
        order_date: "2026-11-20",
        total_amount: 1299,
        currency: "INR",
        items: [
          {
            name: "boAt Airdopes 141",
            quantity: 1,
            unit_price: null,
            category: "electronics",
            serial_number: null,
            warranty_months: null,
            non_returnable: false,
          },
        ],
      }),
      { key: "d0", storeName: "Flipkart", currencyFallback: "USD" },
    );
    expect(d.values).toMatchObject({
      storeName: "Flipkart",
      externalOrderId: "OD123456789",
      orderDate: "2026-11-20",
      currency: "INR",
    });
    expect(d.values.items[0]).toMatchObject({
      name: "boAt Airdopes 141",
      unitPrice: "1299",
      category: "electronics",
    });
    expect(d.missing).toEqual([]);
    expect(d.check).toEqual([]);
  });

  it("leaves a missing order date empty and highlights it (EC-SHR-06)", () => {
    const d = orderToDraft(order({ confidence: 0.3 }), {
      key: "d0",
      storeName: "Flipkart",
      currencyFallback: "INR",
    });
    expect(d.values.orderDate).toBe("");
    expect(d.missing).toEqual(["orderDate", "items"]);
    expect(d.check).toEqual(["storeName"]); // found, but low confidence (EC-SHR-19)
    expect(d.values.items).toHaveLength(1); // an empty item row to fill in
  });
});

describe("duplicate detection", () => {
  const existing: ExistingForDuplicate[] = [
    {
      id: "p1",
      title: "Airdopes",
      storeName: "Flipkart",
      externalOrderId: "OD-1234 5678",
      orderDate: "2026-11-20",
      totalAmount: "1299.00",
    },
  ];

  it("same order number (ignoring spaces, # and dashes) → same_order", () => {
    expect(
      findDuplicate(
        {
          storeName: "Flipkart",
          externalOrderId: "#od12345678",
          orderDate: "",
          total: null,
        },
        existing,
      ),
    ).toEqual({ purchaseId: "p1", title: "Airdopes", kind: "same_order" });
  });

  it("same store, date ±1 day and total → possible", () => {
    expect(
      findDuplicate(
        {
          storeName: "flipkart",
          externalOrderId: "",
          orderDate: "2026-11-21",
          total: 1299,
        },
        existing,
      )?.kind,
    ).toBe("possible");
  });

  it("different total, store or date → no match", () => {
    for (const d of [
      {
        storeName: "Flipkart",
        externalOrderId: "",
        orderDate: "2026-11-21",
        total: 999,
      },
      {
        storeName: "Myntra",
        externalOrderId: "",
        orderDate: "2026-11-20",
        total: 1299,
      },
      {
        storeName: "Flipkart",
        externalOrderId: "",
        orderDate: "2026-11-23",
        total: 1299,
      },
      {
        storeName: "Myntra",
        externalOrderId: "OD12345678",
        orderDate: "",
        total: null,
      },
    ]) {
      expect(findDuplicate(d, existing)).toBeNull();
    }
  });
});

describe("screenshot text (OCR, no API key)", () => {
  it("parses dates without a year as the latest one not in the future", () => {
    expect(parseYearlessDate("24 Nov", "2026-11-26")).toBe("2026-11-24");
    expect(parseYearlessDate("Mon, 28 Dec", "2026-11-26")).toBe("2025-12-28");
    expect(parseYearlessDate("Nov 3rd", "2026-11-26")).toBe("2026-11-03");
    expect(parseYearlessDate("31 Feb", "2026-11-26")).toBeNull();
    expect(parseYearlessDate("soon", "2026-11-26")).toBeNull();
  });

  it("guesses the item title above 'Sold by' / 'Qty'", () => {
    const text = [
      "Order details",
      "Delivered on Nov 22",
      "",
      "boAt Airdopes 141 Bluetooth Truly",
      "Wireless Earbuds, Bold Black",
      "Sold by: RetailNet",
      "₹1,299",
    ].join("\n");
    expect(guessItemName(text)).toBe(
      "boAt Airdopes 141 Bluetooth Truly Wireless Earbuds, Bold Black",
    );
    expect(guessItemName("Order total ₹499\nQty: 1")).toBeNull();
  });

  it("fills order id, dates and item from a Flipkart-style screen", () => {
    const text = [
      "9:41 4G 78%",
      "Order Details",
      "Order ID - OD432112345678901234",
      "Ordered on 20 Nov",
      "Noise ColorFit Pulse Smartwatch",
      "Size: Regular",
      "Delivered on Nov 23",
      "Total Amount ₹1,999",
    ].join("\n");
    const base = genericExtract({
      type: "order_confirmation",
      body: text,
      emailDate: null,
      storeName: null,
      defaultCurrency: "INR",
    });
    const o = enrichFromScreenText(base, text, "2026-11-26");
    expect(o).toMatchObject({
      external_order_id: "OD432112345678901234",
      order_date: "2026-11-20",
      delivery_date: "2026-11-23",
      total_amount: 1999,
      currency: "INR",
    });
    expect(o.items[0].name).toBe("Noise ColorFit Pulse Smartwatch");
    expect(o.confidence).toBeLessThanOrEqual(0.4); // always reviewed
  });
});

describe("Update existing (merge)", () => {
  it("keeps the user's data, fills blanks, takes an actual delivery date", () => {
    const existing = {
      ...newPurchaseValues("2026-11-20", "INR"),
      storeName: "Flipkart",
      deliveryDate: "2026-11-28", // expected
    };
    existing.items[0].name = "Watch";
    const draft = {
      ...newPurchaseValues("2026-11-19", "INR"),
      storeName: "Other",
      externalOrderId: "OD1",
      deliveryDate: "2026-11-24",
    };
    draft.items[0].unitPrice = "1999";
    const merged = mergeDraftIntoExisting(existing, draft, "2026-11-26");
    expect(merged).toMatchObject({
      storeName: "Flipkart",
      orderDate: "2026-11-20",
      externalOrderId: "OD1",
      deliveryDate: "2026-11-24",
    });
    expect(merged.items[0]).toMatchObject({ name: "Watch", unitPrice: "1999" });
  });

  it("a future (expected) date doesn't replace an existing one", () => {
    const existing = {
      ...newPurchaseValues("2026-11-20", "INR"),
      deliveryDate: "2026-11-22",
    };
    const draft = {
      ...newPurchaseValues("2026-11-20", "INR"),
      deliveryDate: "2026-11-30",
    };
    expect(
      mergeDraftIntoExisting(existing, draft, "2026-11-26").deliveryDate,
    ).toBe("2026-11-22");
  });
});
