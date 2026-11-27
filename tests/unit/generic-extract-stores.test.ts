import { describe, expect, it } from "vitest";
import {
  extractItems,
  guessCategory,
  GENERIC_COMPLETE_CONFIDENCE,
  genericExtract,
} from "@/lib/ingest/generic-extract";
import {
  htmlToText,
  normalizeText,
  stripInvisible,
} from "@/lib/ingest/html-to-text";
import { LOW_CONFIDENCE } from "@/lib/ingest/merge";

/*
 * Shapes taken from real store emails (Nov 2026), anonymized: no names,
 * addresses or real order numbers. They pin down why emails used to land in
 * "needs review" or create a second purchase without an API key.
 */

const RLE = "‫"; // Amazon wraps order numbers in a direction mark
const CGJ = "͏"; // preheader padding

const amazonShipped = `Shipped: “Acme Black RFID...”${CGJ} ${CGJ}
Your Orders
Your package was shipped!
Ordered
Shipped
Out for delivery
Delivered
Arriving tomorrow
Track package
[image: Acme Black RFID Blocking Aluminium Pop-Up Card Holder]
Acme Black RFID Blocking Al...
Quantity: 1
₹16300
Total ₹168.00
Order # ${RLE}405-1234567-7654321`;

const amazonDelivered = `Delivered: “Acme Black RFID...”
Your package was delivered!
Delivered today
Order # ${RLE}405-1234567-7654321
Return or replace items in Your Orders`;

const flipkartHtml = `<div><p>Order Placed</p>
<p>Your order has been successfully placed.</p>
<p>Order placed on Apr 28, 2026</p>
<p>Order ID OD100000000000000001</p>
<p>Delivery by Thu, Apr 30, 2026</p>
<p>Amount Paid₨. 1332</p>
<img src="x.jpg" alt="PUMA Men Royalcat Comfort Slides">
<p>PUMA Men Royalcat Comfort Slides</p><p>Qty: 1</p>
<img src="journey.png" alt="journey"></div>`;

const shopifyTable = `Order #AB1234567
Thank you for your order!
Order summary

   Premium DualGrip Socks × 1   Rs. 799.00
   Pack of 8-Pairs
   DualGrip Casual Socks Edition × 1   Rs. 799.00
   Pack of 7-Pairs

   Subtotal         Rs. 1,598.00
   Order discount   -Rs. 499.00
   Total              Rs. 1,099.00 INR
   Total paid today   Rs. 0.00 INR
Order placed on 22 Nov 2026`;

const base = {
  storeName: null,
  defaultCurrency: "INR",
};

describe("invisible characters", () => {
  it("are removed so order numbers can be read", () => {
    expect(stripInvisible(`Order # ${RLE}405-1`)).toBe("Order # 405-1");
    expect(normalizeText(`a${CGJ}​b c`)).toBe("ab c");
  });
});

describe("HTML to text keeps product photo captions", () => {
  it("as [image: …], skipping empty or tiny alt text", () => {
    const text = htmlToText(
      `<img alt="PUMA Men Slides"><img alt=""><img alt="x"><p>PUMA Men Slides</p>`,
    );
    expect(text).toContain("[image: PUMA Men Slides]");
    expect(text).not.toContain("[image: ]");
    expect(text).not.toContain("[image: x]");
  });
});

describe("genericExtract on real store email shapes", () => {
  it("Amazon shipped: order number behind a direction mark, full item name", () => {
    const body = normalizeText(amazonShipped);
    const o = genericExtract({
      ...base,
      type: "shipped",
      body,
      emailDate: "2026-11-26",
      subject: "Shipped: “Acme Black RFID...”",
    });
    expect(o.external_order_id).toBe("405-1234567-7654321");
    expect(o.items.map((i) => i.name)).toEqual([
      "Acme Black RFID Blocking Aluminium Pop-Up Card Holder",
    ]);
    expect(o.total_amount).toBe(168);
    expect(o.expected_delivery_date).toBe("2026-11-27"); // "Arriving tomorrow"
  });

  it("Amazon delivered: same order number, item from the subject", () => {
    const o = genericExtract({
      ...base,
      type: "delivered",
      body: normalizeText(amazonDelivered),
      emailDate: "2026-11-27",
      subject: "Delivered: “Acme Black RFID...”",
    });
    expect(o.external_order_id).toBe("405-1234567-7654321");
    expect(o.items.map((i) => i.name)).toEqual(["Acme Black RFID"]);
  });

  it("Flipkart (HTML): complete read, so no review needed", () => {
    const o = genericExtract({
      ...base,
      type: "order_confirmation",
      body: htmlToText(flipkartHtml),
      emailDate: "2026-04-28",
      subject:
        "Your Order for PUMA Men Royalcat Comf... has been successfully placed",
    });
    expect(o.external_order_id).toBe("OD100000000000000001");
    expect(o.order_date).toBe("2026-04-28");
    expect(o.expected_delivery_date).toBe("2026-04-30");
    expect(o.total_amount).toBe(1332);
    expect(o.currency).toBe("INR");
    expect(o.items.map((i) => [i.name, i.quantity])).toEqual([
      ["PUMA Men Royalcat Comfort Slides", 1],
    ]);
    expect(o.confidence).toBe(GENERIC_COMPLETE_CONFIDENCE);
    expect(o.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE);
  });

  it("Shopify store: items with prices, the first non-zero total", () => {
    const o = genericExtract({
      ...base,
      type: "order_confirmation",
      body: shopifyTable,
      emailDate: "2026-11-22",
      subject: "Order #AB1234567 confirmed",
    });
    expect(o.external_order_id).toBe("AB1234567");
    expect(o.total_amount).toBe(1099); // not "Total paid today Rs. 0.00"
    expect(o.items.map((i) => [i.name, i.quantity, i.unit_price])).toEqual([
      ["Premium DualGrip Socks", 1, 799],
      ["DualGrip Casual Socks Edition", 1, 799],
    ]);
    expect(o.confidence).toBeGreaterThanOrEqual(LOW_CONFIDENCE);
  });

  it("stays below the review threshold when something is missing", () => {
    const o = genericExtract({
      ...base,
      type: "order_confirmation",
      body: "Thanks for shopping with us! Total ₹499",
      emailDate: "2026-11-22",
      subject: "Thanks!",
    });
    expect(o.items).toEqual([]);
    expect(o.confidence).toBeLessThan(LOW_CONFIDENCE);
  });
});

describe("extractItems", () => {
  it("skips a link between the caption and the name (plain-text forwards)", () => {
    const body =
      "[image: PUMA Men Royalcat Comfort Slides]\n<https://example.com/c/?u=abc\ndef>\nPUMA Men Royalcat Comfort Slides\nQty: 2";
    expect(extractItems(body, "").map((i) => [i.name, i.quantity])).toEqual([
      ["PUMA Men Royalcat Comfort Slides", 2],
    ]);
  });

  it("ignores captions that aren't repeated as the item line", () => {
    expect(
      extractItems(
        "[image: Completed]\nOrdered\n[image: Amazon.in]\nTotal",
        "",
      ),
    ).toEqual([]);
  });

  it("falls back to the subject, without Fwd: or the trailing ...", () => {
    expect(
      extractItems(
        "no items here",
        "Fwd: Your Order for Boat Airdopes 141... has been placed",
      ).map((i) => i.name),
    ).toEqual(["Boat Airdopes 141"]);
    expect(
      extractItems("", "Order #AB1234567 confirmed").map((i) => i.name),
    ).toEqual([]);
  });
});

describe("guessCategory", () => {
  it("uses only unmistakable words", () => {
    expect(guessCategory("PUMA Men Royalcat Comfort Slides")).toBe("fashion");
    expect(guessCategory("boAt Airdopes 141 Bluetooth Earbuds")).toBe(
      "electronics",
    );
    expect(guessCategory("Noise ColorFit smart watch")).toBe("electronics");
    expect(guessCategory("Mickey Mouse T-shirt")).toBe("fashion");
    expect(guessCategory("Logitech wireless mouse")).toBe("electronics");
    expect(guessCategory("Premium DualGrip Socks")).toBe("fashion");
    expect(guessCategory("Gift voucher")).toBe("other");
  });
});
