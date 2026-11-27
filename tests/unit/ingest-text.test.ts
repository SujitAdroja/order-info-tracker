import { describe, expect, it } from "vitest";
import { decrypt, encrypt, safeEqual, sha256Hex } from "@/lib/crypto";
import { classifyEmail, isOutForDelivery } from "@/lib/ingest/classify";
import {
  extractGmailCode,
  extractGmailConfirmation,
  extractGmailConfirmUrl,
  isGmailConfirmUrl,
  pendingGmailConfirmation,
  isGmailVerification,
} from "@/lib/ingest/gmail-verification";
import { capText, htmlToText, looksImageOnly } from "@/lib/ingest/html-to-text";
import {
  parseAddress,
  parseAmount,
  parseLooseDate,
} from "@/lib/ingest/parse-utils";
import { redact } from "@/lib/ingest/redact";
import { matchStore } from "@/lib/ingest/store-match";
import { unwrapForward } from "@/lib/ingest/unwrap";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("crypto (AES-256-GCM)", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("hello order", KEY);
    const b = encrypt("hello order", KEY);
    expect(a.equals(b)).toBe(false);
    expect(decrypt(a, KEY).toString()).toBe("hello order");
  });
  it("rejects tampering and wrong keys", () => {
    const c = encrypt("secret", KEY);
    c[c.length - 1] ^= 1;
    expect(() => decrypt(c, KEY)).toThrow();
    expect(() =>
      decrypt(encrypt("x", KEY), Buffer.alloc(32, 8).toString("base64")),
    ).toThrow();
  });
  it("hashes and compares safely", () => {
    expect(sha256Hex("abc")).toHaveLength(64);
    expect(safeEqual("pw", "pw")).toBe(true);
    expect(safeEqual("pw", "pw2")).toBe(false);
  });
});

describe("parse utils", () => {
  it("parses addresses", () => {
    expect(parseAddress('"Amazon.in" <auto-confirm@Amazon.in>')).toEqual({
      name: "Amazon.in",
      address: "auto-confirm@amazon.in",
      domain: "amazon.in",
    });
    expect(parseAddress("orders@flipkart.com").domain).toBe("flipkart.com");
    expect(parseAddress(null).address).toBeNull();
  });

  it.each([
    ["2026-03-03", "2026-03-03"],
    ["Tue, 03 Mar 2026 10:15:00 +0530", "2026-03-03"],
    ["Tue, Mar 3, 2026 at 10:15 AM", "2026-03-03"],
    ["Tuesday, March 3, 2026 10:15 AM", "2026-03-03"],
    ["3rd March 2026", "2026-03-03"],
    ["03/04/2026", "2026-04-03"],
    ["Sept 9, 2026", "2026-09-09"],
    ["31 Feb 2026", null],
    ["no date here", null],
  ])("date %s → %s", (raw, expected) => {
    expect(parseLooseDate(raw)).toBe(expected);
  });

  it("parses amounts in Indian and western formats", () => {
    expect(parseAmount("₹1,29,999.00")).toBe(129999);
    expect(parseAmount("Rs. 499")).toBe(499);
    expect(parseAmount("$1,299.99")).toBe(1299.99);
  });
});

describe("htmlToText (EC-ING-07)", () => {
  const html = `<html><head><style>.x{}</style><script>evil()</script></head><body>
    <h1>Order Confirmed</h1>
    <img src="https://track.example/pixel.gif">
    <p>Hi, your order <a href="https://track.example/r?u=1">#403-1234567-1234567</a> is placed.</p>
    <table><tr><th>Item</th><th>Price</th></tr><tr><td>Boat Airdopes 141</td><td>₹1,299</td></tr></table>
  </body></html>`;

  it("keeps text and tables, drops scripts, images and link targets", () => {
    const text = htmlToText(html);
    expect(text).toContain("Order Confirmed");
    expect(text).toContain("#403-1234567-1234567");
    expect(text).toMatch(/Boat Airdopes 141\s+₹1,299/);
    expect(text).not.toContain("evil()");
    expect(text).not.toContain("track.example");
  });

  it("caps long text keeping head and tail (EC-ING-15)", () => {
    const long = "A".repeat(20_000) + "MIDDLE" + "Z".repeat(20_000);
    const capped = capText(long);
    expect(capped.length).toBeLessThanOrEqual(30_000);
    expect(capped.startsWith("AAAA")).toBe(true);
    expect(capped.endsWith("ZZZZ")).toBe(true);
    expect(capped).toContain("truncated");
  });

  it("detects image-only emails (EC-ING-09)", () => {
    expect(looksImageOnly('<img src="a"><img src="b">', "Order")).toBe(true);
    expect(looksImageOnly("<p>text</p>", "Order")).toBe(false);
  });
});

describe("unwrapForward (EC-ING-06)", () => {
  it("Gmail manual forward with a user note on top", () => {
    const r = unwrapForward({
      from: "Me <me@gmail.com>",
      subject: "Fwd: Your Amazon.in order #403-1",
      date: "Wed, 4 Mar 2026 09:00:00 +0530",
      body: [
        "FYI keep this one",
        "",
        "---------- Forwarded message ---------",
        'From: "Amazon.in" <auto-confirm@amazon.in>',
        "Date: Tue, Mar 3, 2026 at 10:15 AM",
        "Subject: Your Amazon.in order #403-1",
        "To: <me@gmail.com>",
        "",
        "Hello, your order has been placed.",
      ].join("\n"),
    });
    expect(r).toMatchObject({
      wasForwarded: true,
      fromAddress: "auto-confirm@amazon.in",
      fromDomain: "amazon.in",
      subject: "Your Amazon.in order #403-1",
      date: "2026-03-03",
      body: "Hello, your order has been placed.",
    });
    expect(r.body).not.toContain("FYI");
  });

  it("Apple Mail forward", () => {
    const r = unwrapForward({
      from: "me@icloud.com",
      subject: "Fwd: Order confirmed",
      date: null,
      body: [
        "Begin forwarded message:",
        "",
        "From: Flipkart <no-reply@flipkart.com>",
        "Subject: Order confirmed",
        "Date: 3 March 2026 at 10:15:00 GMT+5:30",
        "To: me@icloud.com",
        "",
        "Your order OD1234567890 is confirmed.",
      ].join("\n"),
    });
    expect(r.fromDomain).toBe("flipkart.com");
    expect(r.date).toBe("2026-03-03");
    expect(r.body).toBe("Your order OD1234567890 is confirmed.");
  });

  it("Outlook forward without a marker line", () => {
    const r = unwrapForward({
      from: "me@outlook.com",
      subject: "FW: Your Myntra order",
      date: null,
      body: [
        "see below",
        "",
        "From: Myntra <updates@myntra.com>",
        "Sent: Tuesday, March 3, 2026 10:15 AM",
        "To: Me <me@outlook.com>",
        "Subject: Your Myntra order",
        "",
        "Thanks for shopping.",
      ].join("\n"),
    });
    expect(r.fromDomain).toBe("myntra.com");
    expect(r.date).toBe("2026-03-03");
    expect(r.body).toBe("Thanks for shopping.");
  });

  it("auto-forwarded mail keeps its own headers", () => {
    const r = unwrapForward({
      from: "Nykaa <care@nykaa.com>",
      subject: "Your order is confirmed",
      date: "Tue, 03 Mar 2026 10:15:00 +0530",
      body: "Order NYK123 confirmed",
    });
    expect(r).toMatchObject({
      wasForwarded: false,
      fromDomain: "nykaa.com",
      date: "2026-03-03",
    });
  });
});

describe("classifyEmail", () => {
  it.each([
    ["Your Amazon.in order #403 has been placed", "order_confirmation"],
    ["Thank you for your order", "order_confirmation"],
    ["Your package has shipped", "shipped"],
    ["Out for delivery today", "shipped"],
    ["Delivered: Boat Airdopes", "delivered"],
    ["Your order has been cancelled", "cancelled"],
    ["Refund processed for your cancelled order", "refund"],
    ["Return request received", "return_initiated"],
    ["Tax Invoice for order 123", "invoice"],
    ["Your OTP for login is 123456", "other"],
    ["Big Diwali sale starts now – 50% off", "other"],
  ])("%s → %s", (subject, type) => {
    expect(classifyEmail(subject, "")).toBe(type);
  });

  it("falls back to the body when the subject is vague", () => {
    expect(classifyEmail("Update", "Your item was delivered today.")).toBe(
      "delivered",
    );
  });
});

describe("Gmail verification (EC-ING-19)", () => {
  it("detects the sender and extracts the code", () => {
    expect(isGmailVerification("forwarding-noreply@google.com")).toBe(true);
    expect(isGmailVerification("noreply@google.com")).toBe(false);
    expect(
      extractGmailCode(
        "(#123456789) Gmail Forwarding Confirmation - Receive Mail from me@gmail.com",
        "Confirmation code: 123456789\n\nTo allow ... click the link below",
      ),
    ).toBe("123456789");
    expect(
      extractGmailCode("(#987654321) Gmail Forwarding Confirmation", ""),
    ).toBe("987654321");
  });
});

describe("matchStore", () => {
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
      slug: "ikea",
      name: "IKEA",
      country: "IN",
      senderDomains: ["ikea.com", "ikea.in"],
    },
  ];
  it("matches exact domains and subdomains only", () => {
    expect(matchStore("amazon.in", stores)?.slug).toBe("amazon-in");
    expect(matchStore("marketplace.amazon.in", stores)?.slug).toBe("amazon-in");
    expect(matchStore("amazon.com", stores)?.slug).toBe("amazon-us");
    expect(matchStore("notamazon.in", stores)).toBeNull();
    expect(matchStore("amazon.in.evil.com", stores)).toBeNull();
    expect(matchStore("email.ikea.in", stores)?.slug).toBe("ikea");
    expect(matchStore(null, stores)).toBeNull();
  });
});

describe("redact (Section 6.3)", () => {
  const email = [
    "Order #403-1234567-1234567 placed on 3 March 2026",
    "Item: Boat Airdopes 141   ₹1,299.00",
    "Shipping address:",
    "Asha Kumar",
    "12, MG Road, Koramangala",
    "Bengaluru 560034",
    "",
    "Contact: +91 98765 43210 or asha.k@gmail.com",
    "Questions? Write to cs-reply@amazon.in",
    "Paid with Visa card ending in 4242",
    "UPI: asha@okicici",
    "Your OTP is 482913",
  ].join("\n");
  const out = redact(email, "amazon.in");

  it("removes personal data", () => {
    for (const secret of [
      "Asha Kumar",
      "MG Road",
      "560034",
      "98765",
      "asha.k@gmail.com",
      "4242",
      "asha@okicici",
      "482913",
    ]) {
      expect(out).not.toContain(secret);
    }
  });
  it("keeps what extraction needs", () => {
    for (const keep of [
      "403-1234567-1234567",
      "3 March 2026",
      "Boat Airdopes 141",
      "₹1,299.00",
      "cs-reply@amazon.in",
    ]) {
      expect(out).toContain(keep);
    }
  });
});

describe("classify: delivery promises vs deliveries (order tracking)", () => {
  it("'will be delivered' / 'arriving' are shipping updates, not deliveries", () => {
    expect(classifyEmail("Your package will be delivered today", "")).toBe(
      "shipped",
    );
    expect(classifyEmail("Arriving tomorrow: Boat Airdopes", "")).toBe(
      "shipped",
    );
    expect(classifyEmail("Out for delivery: your order 403-1", "")).toBe(
      "shipped",
    );
    expect(classifyEmail("Delivered: your order 403-1", "")).toBe("delivered");
    expect(classifyEmail("Your package has been delivered", "")).toBe(
      "delivered",
    );
  });

  it("detects out for delivery", () => {
    expect(isOutForDelivery("Out for delivery", "")).toBe(true);
    expect(isOutForDelivery("Shipped", "It's arriving today by 9 pm")).toBe(
      true,
    );
    expect(isOutForDelivery("Your order has shipped", "Arriving Friday")).toBe(
      false,
    );
  });
});

describe("Gmail confirmation link (newer emails have no code)", () => {
  // Shape of Gmail's Nov 2026 email; the token is made up.
  const confirm =
    "https://mail.google.com/mail/vf-%5BANGjdJ-fakeToken_123%5D-AbC-dEf9";
  const cancel =
    "https://mail.google.com/mail/uf-%5BANGjdJ-fakeCancel_456%5D-AbC-dEf9";
  const subject =
    "(Gmail Forwarding Confirmation - Receive Mail from me@gmail.com";
  const body = `me@gmail.com has requested to automatically forward mail to
your email
address u-abcdefgh@in.example.

To allow me@gmail.com to automatically forward mail to your address,
please click the link below to confirm the request:

${confirm}

If you accidentally clicked the link, click this link to cancel this
verification:
${cancel}
`;

  it("finds the confirm link, never the cancel link", () => {
    expect(extractGmailCode(subject, body)).toBeNull();
    expect(extractGmailConfirmUrl(body)).toBe(confirm);
    expect(extractGmailConfirmation(subject, body)).toBe(confirm);
  });

  it("still prefers the code when an email has one", () => {
    expect(
      extractGmailConfirmation(
        "(#123456789) Gmail Forwarding Confirmation",
        `Confirmation code: 123456789\n${confirm}`,
      ),
    ).toBe("123456789");
  });

  it("only accepts Gmail's own confirmation page", () => {
    expect(isGmailConfirmUrl(confirm)).toBe(true);
    expect(isGmailConfirmUrl(cancel)).toBe(false);
    expect(isGmailConfirmUrl("https://evil.example/mail/vf-x")).toBe(false);
    expect(
      isGmailConfirmUrl("https://mail.google.com.evil.example/mail/vf-x"),
    ).toBe(false);
    expect(isGmailConfirmUrl(`${confirm}"><script>`)).toBe(false);
    expect(
      extractGmailConfirmUrl("click https://evil.example/mail/vf-abc"),
    ).toBeNull();
  });

  it("splits the stored value into a code or a link", () => {
    expect(pendingGmailConfirmation(confirm)).toEqual({
      code: null,
      confirmUrl: confirm,
    });
    expect(pendingGmailConfirmation("123456789")).toEqual({
      code: "123456789",
      confirmUrl: null,
    });
    expect(pendingGmailConfirmation(null)).toEqual({
      code: null,
      confirmUrl: null,
    });
  });
});
