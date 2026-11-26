import { describe, expect, it, vi } from "vitest";
import {
  VISION_SYSTEM_PROMPT,
  visionExtract,
  type VisionCall,
} from "@/lib/uploads/vision";

const llmOrder = (id: string) => ({
  email_type: "delivered",
  store_name: "Amazon.in",
  seller_name: null,
  external_order_id: id,
  order_date: "2026-11-10",
  delivery_date: "2026-11-14",
  expected_delivery_date: null,
  currency: "INR",
  total_amount: 499,
  items: [
    {
      name: "USB-C cable",
      quantity: 1,
      unit_price: 499,
      category: "electronics",
      serial_number: null,
      warranty_months: null,
      non_returnable: false,
    },
  ],
  return_window_days_stated: null,
  confidence: 0.92,
});

const image = { mediaType: "image/jpeg" as const, base64: "AAAA" };

describe("visionExtract (mocked model)", () => {
  it("sends all images in one call with the screenshot rules (EC-SHR-02/08)", async () => {
    const call = vi.fn<VisionCall>(async () => ({
      output: { orders: [llmOrder("403-1")] },
      refused: false,
    }));
    const res = await visionExtract(
      { images: [image, image, image], context: "", today: "2026-11-26" },
      call,
    );
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][0].images).toHaveLength(3);
    expect(VISION_SYSTEM_PROMPT).toContain(
      "Ignore the phone status bar, notifications, ads, recommendations, and addresses/phone numbers",
    );
    expect(res).toMatchObject({
      ok: true,
      orders: [{ external_order_id: "403-1" }],
    });
  });

  it("returns every order from an order-list screenshot (EC-SHR-04)", async () => {
    const res = await visionExtract(
      { images: [image], context: "", today: "2026-11-26" },
      async () => ({
        output: { orders: [llmOrder("A1"), llmOrder("B2")] },
        refused: false,
      }),
    );
    expect(res.ok && res.orders.map((o) => o.external_order_id)).toEqual([
      "A1",
      "B2",
    ]);
  });

  it("retries invalid output once, then gives up", async () => {
    const call = vi.fn<VisionCall>(async () => ({
      output: { nope: 1 },
      refused: false,
    }));
    const res = await visionExtract(
      { images: [image], context: "", today: "2026-11-26" },
      call,
    );
    expect(call).toHaveBeenCalledTimes(2);
    expect(res).toEqual({
      ok: false,
      error: "llm_invalid_output",
      retryable: false,
    });
  });

  it("network errors are reported, not thrown (EC-SHR-15)", async () => {
    const res = await visionExtract(
      { images: [image], context: "", today: "2026-11-26" },
      async () => {
        throw new Error("boom");
      },
    );
    expect(res).toMatchObject({ ok: false });
  });
});
