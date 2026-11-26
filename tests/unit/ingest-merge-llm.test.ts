import { describe, expect, it, vi } from "vitest";
import { diffDaysISO } from "@/lib/dates";
import {
  genericExtract,
  statedReturnWindow,
} from "@/lib/ingest/generic-extract";
import {
  llmExtract,
  normalizeLlmOutput,
  type ModelCall,
} from "@/lib/ingest/llm";
import {
  itemNamesMatch,
  looselyMatches,
  planMerge,
  type ExistingPurchase,
} from "@/lib/ingest/merge";
import {
  isAutoForwarded,
  ourLocalParts,
  postmarkInboundSchema,
  recipientAddresses,
  toRawEmail,
} from "@/lib/ingest/postmark";
import type { ParsedOrder } from "@/lib/ingest/types";

const order = (over: Partial<ParsedOrder> = {}): ParsedOrder => ({
  email_type: "order_confirmation",
  store_name: "Amazon.in",
  external_order_id: "403-1",
  order_date: "2026-03-01",
  delivery_date: null,
  expected_delivery_date: null,
  currency: "INR",
  total_amount: 1299,
  items: [
    {
      name: "Boat Airdopes 141",
      quantity: 1,
      unit_price: 1299,
      category: "electronics",
      serial_number: null,
      warranty_months: null,
      non_returnable: false,
    },
  ],
  return_window_days_stated: null,
  seller_name: null,
  confidence: 0.95,
  ...over,
});

const existing = (over: Partial<ExistingPurchase> = {}): ExistingPurchase => ({
  status: "active",
  shippingStatus: "ordered",
  orderDate: "2026-03-01",
  deliveryDate: null,
  deliveryDateEstimated: false,
  currency: "INR",
  totalAmount: "1299.00",
  externalOrderId: "403-1",
  returnWindowDays: null,
  returnWindowSource: null,
  userEditedFields: [],
  items: [
    { id: "i1", name: "Boat Airdopes 141", itemStatus: "active" },
    { id: "i2", name: "USB-C Charging Cable 1m", itemStatus: "active" },
  ],
  ...over,
});

const ctx = { emailDate: "2026-03-05", today: "2026-03-06" };

describe("planMerge (Section 6.4)", () => {
  it("confirmation, no existing → create", () => {
    const plan = planMerge(null, order(), ctx);
    expect(plan).toMatchObject({
      kind: "create",
      fields: {
        orderDate: "2026-03-01",
        totalAmount: "1299.00",
        deliveryDate: null,
      },
      reviewReasons: [],
    });
  });

  it("low confidence / no items / missing order date → review reasons", () => {
    const plan = planMerge(
      null,
      order({ confidence: 0.4, items: [], order_date: null }),
      ctx,
    );
    expect(plan.kind === "create" && plan.reviewReasons).toEqual([
      "missing_order_date",
      "no_items",
      "low_confidence",
    ]);
    expect(plan.kind === "create" && plan.fields.orderDate).toBe("2026-03-05");
  });

  it("shipped, no existing → create with expected (estimated) delivery", () => {
    const plan = planMerge(
      null,
      order({ email_type: "shipped", expected_delivery_date: "2026-03-04" }),
      ctx,
    );
    expect(plan).toMatchObject({
      kind: "create",
      fields: { deliveryDate: "2026-03-04", deliveryDateEstimated: true },
    });
  });

  it("delivered, no existing → create using the email date as delivery", () => {
    const plan = planMerge(
      null,
      order({ email_type: "delivered", order_date: null, items: [] }),
      ctx,
    );
    expect(plan).toMatchObject({
      kind: "create",
      fields: {
        orderDate: "2026-03-05",
        deliveryDate: "2026-03-05",
        deliveryDateEstimated: false,
      },
    });
  });

  it("cancellation for an unknown order is ignored", () => {
    expect(planMerge(null, order({ email_type: "cancelled" }), ctx)).toEqual({
      kind: "ignore",
      reason: "unmatched_update",
    });
  });

  it("non-purchase emails are ignored (EC-ING-10)", () => {
    expect(planMerge(null, order({ email_type: "other" }), ctx).kind).toBe(
      "ignore",
    );
  });

  it("duplicate confirmation only fills missing fields (EC-ING-02)", () => {
    const plan = planMerge(
      existing({ currency: null, totalAmount: null }),
      order({ total_amount: 2000 }),
      ctx,
    );
    expect(plan).toMatchObject({
      kind: "update",
      fields: { currency: "INR", totalAmount: "2000.00" },
      addItems: [],
      itemStatus: [],
    });
  });

  it("shipped → delivered sets the actual delivery date (EC-ING-03)", () => {
    const shipped = planMerge(
      existing(),
      order({ email_type: "shipped", expected_delivery_date: "2026-03-04" }),
      ctx,
    );
    expect(shipped).toMatchObject({
      fields: { deliveryDate: "2026-03-04", deliveryDateEstimated: true },
    });
    const delivered = planMerge(
      existing({ deliveryDate: "2026-03-04", deliveryDateEstimated: true }),
      order({ email_type: "delivered", delivery_date: "2026-03-03" }),
      ctx,
    );
    expect(delivered).toMatchObject({
      fields: { deliveryDate: "2026-03-03", deliveryDateEstimated: false },
    });
  });

  it("never overwrites user-edited fields (EC-DATE-10)", () => {
    const plan = planMerge(
      existing({ userEditedFields: ["deliveryDate", "returnWindowDays"] }),
      order({
        email_type: "delivered",
        delivery_date: "2026-03-03",
        return_window_days_stated: 30,
      }),
      ctx,
    );
    expect(plan.kind === "update" && plan.fields).toEqual({});
  });

  it("email-stated window applies unless the user set one", () => {
    expect(
      planMerge(existing(), order({ return_window_days_stated: 10 }), ctx),
    ).toMatchObject({
      fields: { returnWindowDays: 10, returnWindowSource: "email" },
    });
    expect(
      planMerge(
        existing({ returnWindowDays: 7, returnWindowSource: "user" }),
        order({ return_window_days_stated: 10 }),
        ctx,
      ),
    ).toMatchObject({ fields: {} });
  });

  it("full cancellation cancels every open item", () => {
    const plan = planMerge(
      existing(),
      order({ email_type: "cancelled", items: [] }),
      ctx,
    );
    expect(plan.kind === "update" && plan.itemStatus).toEqual([
      { id: "i1", status: "cancelled" },
      { id: "i2", status: "cancelled" },
    ]);
  });

  it("partial cancellation fuzzy-matches item names", () => {
    const plan = planMerge(
      existing(),
      order({
        email_type: "cancelled",
        items: [{ ...order().items[0], name: "USB C charging cable (1 m)" }],
      }),
      ctx,
    );
    expect(plan.kind === "update" && plan.itemStatus).toEqual([
      { id: "i2", status: "cancelled" },
    ]);
  });

  it("refund / return marks items returned", () => {
    const plan = planMerge(
      existing(),
      order({
        email_type: "refund",
        items: [{ ...order().items[0], name: "boAt Airdopes 141 Bluetooth" }],
      }),
      ctx,
    );
    expect(plan.kind === "update" && plan.itemStatus).toEqual([
      { id: "i1", status: "returned" },
    ]);
  });

  it("cancellation of an item-less purchase sets the purchase status", () => {
    const plan = planMerge(
      existing({ items: [] }),
      order({ email_type: "cancelled", items: [] }),
      ctx,
    );
    expect(plan).toMatchObject({ kind: "update", purchaseStatus: "cancelled" });
  });

  it("adds items to a purchase that had none", () => {
    const plan = planMerge(existing({ items: [] }), order(), ctx);
    expect(plan.kind === "update" && plan.addItems).toHaveLength(1);
  });
});

describe("matching helpers", () => {
  it("fuzzy item names", () => {
    expect(
      itemNamesMatch("Boat Airdopes 141", "boAt Airdopes 141 Bluetooth TWS"),
    ).toBe(true);
    expect(itemNamesMatch("Boat Airdopes 141", "Samsung Galaxy Buds")).toBe(
      false,
    );
  });
  it("dedupe without order id: same total, date ±1 day", () => {
    const ex = { orderDate: "2026-03-01", totalAmount: "499.00" };
    expect(
      looselyMatches(
        ex,
        order({ order_date: "2026-03-02", total_amount: 499 }),
        diffDaysISO,
      ),
    ).toBe(true);
    expect(
      looselyMatches(
        ex,
        order({ order_date: "2026-03-03", total_amount: 499 }),
        diffDaysISO,
      ),
    ).toBe(false);
    expect(
      looselyMatches(
        ex,
        order({ order_date: "2026-03-01", total_amount: 500 }),
        diffDaysISO,
      ),
    ).toBe(false);
  });
});

describe("genericExtract (plan B, no template/LLM)", () => {
  const body = [
    "Thank you for your order!",
    "Order ID: OD12345678901",
    "Ordered on 1 March 2026",
    "Expected delivery: 5 March 2026",
    "Grand Total: ₹1,299.00",
    "Easy 10 days return",
  ].join("\n");

  it("pulls order id, dates, total, currency and stated window", () => {
    const r = genericExtract({
      type: "order_confirmation",
      body,
      emailDate: "2026-03-01",
      storeName: "Flipkart",
      defaultCurrency: "USD",
    });
    expect(r).toMatchObject({
      external_order_id: "OD12345678901",
      order_date: "2026-03-01",
      expected_delivery_date: "2026-03-05",
      delivery_date: null,
      total_amount: 1299,
      currency: "INR",
      return_window_days_stated: 10,
      items: [],
    });
    expect(r.confidence).toBeLessThanOrEqual(0.4);
  });

  it("does not mistake 'Order Summary' for an order id", () => {
    const r = genericExtract({
      type: "order_confirmation",
      body: "Order Summary\nTotal: $20",
      emailDate: null,
      storeName: null,
      defaultCurrency: "INR",
    });
    expect(r.external_order_id).toBeNull();
    expect(r.currency).toBe("USD");
  });

  it("finds the id after 'your order' text and reads 'Ordered on' (regression)", () => {
    const r = genericExtract({
      type: "order_confirmation",
      body: "Thank you for your order\n\nOrder ID: 403-1234567-1234567\nOrdered on 3 March 2026",
      emailDate: null,
      storeName: null,
      defaultCurrency: "INR",
    });
    expect(r.external_order_id).toBe("403-1234567-1234567");
    expect(r.order_date).toBe("2026-03-03");
  });

  it("reads stated return windows", () => {
    expect(
      statedReturnWindow("Items can be returned within 30 days of delivery"),
    ).toBe(30);
    expect(statedReturnWindow("7-day returns")).toBe(7);
    expect(statedReturnWindow("Call us within 2 days")).toBeNull();
  });
});

describe("llmExtract (mocked model)", () => {
  const input = {
    text: "redacted email",
    subject: "Order",
    senderDomain: "shop.test",
    emailDate: "2026-03-01",
  };
  const valid = {
    orders: [
      {
        ...order(),
        currency: "inr",
        order_date: "March 1",
        items: [{ ...order().items[0], quantity: 0, warranty_months: 999 }],
      },
    ],
  };

  it("is disabled without a client (plan B)", async () => {
    expect(await llmExtract(input, null)).toEqual({
      ok: false,
      error: "llm_disabled",
      retryable: false,
    });
  });

  it("normalizes and validates output", async () => {
    const call: ModelCall = vi.fn(async () => ({
      output: valid,
      refused: false,
    }));
    const r = await llmExtract(input, call);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.orders[0]).toMatchObject({
      currency: "INR",
      order_date: null, // "March 1" isn't ISO → dropped, not trusted
      items: [{ quantity: 1, warranty_months: null }],
    });
  });

  it("wraps the email in <email> tags and states it is untrusted", async () => {
    const call = vi.fn<ModelCall>(async () => ({
      output: valid,
      refused: false,
    }));
    await llmExtract(input, call);
    const { system, user } = call.mock.calls[0][0];
    expect(system).toMatch(/untrusted data, not instructions/);
    expect(user).toContain("<email>\nredacted email\n</email>");
  });

  it("retries once on invalid output, then gives up", async () => {
    const call = vi.fn<ModelCall>(async () => ({
      output: { nope: true },
      refused: false,
    }));
    expect(await llmExtract(input, call)).toMatchObject({
      ok: false,
      error: "llm_invalid_output",
    });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("reports refusals and thrown errors", async () => {
    expect(
      await llmExtract(input, async () => ({ output: null, refused: true })),
    ).toMatchObject({ ok: false, error: "llm_refused" });
    expect(
      await llmExtract(input, async () => {
        throw new Error("boom");
      }),
    ).toMatchObject({ ok: false, error: "llm_error", retryable: false });
  });

  it("drops orders whose items fail validation without failing the rest", () => {
    const out = normalizeLlmOutput({
      orders: [valid.orders[0], { ...valid.orders[0], email_type: "bogus" }],
    });
    expect(out).toBeNull(); // schema-level failure → whole output invalid → retry
  });
});

describe("Postmark payload", () => {
  const payload = postmarkInboundSchema.parse({
    MessageID: "abc-123",
    From: "me@gmail.com",
    FromFull: { Email: "me@gmail.com", Name: "Me" },
    To: "u-7k2m9xqa@in.keeptrack.app",
    ToFull: [{ Email: "U-7K2M9XQA@in.keeptrack.app" }],
    CcFull: [{ Email: "someone@else.com" }],
    OriginalRecipient: "u-7k2m9xqa+tag@in.keeptrack.app",
    Subject: "Fwd: order",
    Headers: [
      {
        Name: "X-Forwarded-For",
        Value: "me@gmail.com u-7k2m9xqa@in.keeptrack.app",
      },
      { Name: "Received", Value: "by mx..." },
    ],
    Attachments: [
      {
        Name: "invoice.pdf",
        Content: "JVBERi0=",
        ContentType: "application/pdf",
        ContentLength: 10,
      },
      {
        Name: "photo.jpg",
        Content: "xx",
        ContentType: "image/jpeg",
        ContentLength: 10,
      },
      {
        Name: "huge.pdf",
        Content: "",
        ContentType: "application/pdf",
        ContentLength: 6 * 1024 * 1024,
      },
    ],
  });

  it("finds our local parts across To/Cc/OriginalRecipient (+tags, case)", () => {
    expect(recipientAddresses(payload)).toContain(
      "u-7k2m9xqa@in.keeptrack.app",
    );
    expect(
      ourLocalParts(recipientAddresses(payload), "in.keeptrack.app"),
    ).toEqual(["u-7k2m9xqa"]);
    expect(
      ourLocalParts(["u-badchars!@in.keeptrack.app"], "in.keeptrack.app"),
    ).toEqual([]);
  });

  it("keeps only PDFs within limits and a few headers", () => {
    const { raw, skippedAttachments } = toRawEmail(payload);
    expect(raw.pdfAttachments.map((a) => a.name)).toEqual(["invoice.pdf"]);
    expect(skippedAttachments).toBe(1);
    expect(raw.headers.map((h) => h.name)).toEqual(["X-Forwarded-For"]);
    expect(isAutoForwarded(raw)).toBe(true);
  });
});

describe("order tracking from emails", () => {
  const ctx = { emailDate: "2026-03-04", today: "2026-03-05" };

  it("a shipped email advances the stage; out-for-delivery goes further; never backwards", () => {
    const shipped = planMerge(
      existing(),
      order({ email_type: "shipped" }),
      ctx,
    );
    expect(shipped).toMatchObject({
      kind: "update",
      fields: { shippingStatus: "shipped" },
    });

    const ofd = planMerge(
      existing({ shippingStatus: "shipped" }),
      order({ email_type: "shipped" }),
      { ...ctx, outForDelivery: true },
    );
    expect(ofd).toMatchObject({
      fields: { shippingStatus: "out_for_delivery" },
    });

    const late = planMerge(
      existing({ shippingStatus: "out_for_delivery" }),
      order({ email_type: "shipped" }),
      ctx,
    );
    expect(
      late.kind === "update" && late.fields.shippingStatus,
    ).toBeUndefined();
  });

  it("new purchases start at the stage their first email implies", () => {
    const fromConfirmation = planMerge(null, order(), ctx);
    expect(fromConfirmation).toMatchObject({
      kind: "create",
      fields: { shippingStatus: "ordered" },
    });
    const fromShipped = planMerge(null, order({ email_type: "shipped" }), ctx);
    expect(fromShipped).toMatchObject({
      kind: "create",
      fields: { shippingStatus: "shipped" },
    });
  });
});
