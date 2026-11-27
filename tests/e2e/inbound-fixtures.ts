import { randomUUID } from "node:crypto";

/**
 * SYNTHETIC Postmark inbound payloads for pipeline tests. These are NOT real
 * store emails and must not be used to build store templates (Section 7 needs
 * real anonymized samples in tests/fixtures/emails/<store>/).
 */

type Payload = Record<string, unknown>;

function base(to: string, over: Payload): Payload {
  return {
    MessageID: randomUUID(),
    From: "me@gmail.example",
    FromFull: { Email: "me@gmail.example", Name: "Test User" },
    To: to,
    ToFull: [{ Email: to, Name: "" }],
    OriginalRecipient: to,
    Date: "Tue, 03 Mar 2026 10:15:00 +0530",
    Headers: [],
    Attachments: [],
    ...over,
  };
}

/** Gmail manual forward of an order confirmation from a known store domain. */
export function orderConfirmation(
  to: string,
  orderId: string,
  extra: Payload = {},
) {
  return base(to, {
    Subject: `Fwd: Your order ${orderId} has been placed`,
    TextBody: "",
    HtmlBody: `<div>Keeping this one for the warranty.</div>
<div>---------- Forwarded message ---------<br>
From: Amazon.in &lt;auto-confirm@amazon.in&gt;<br>
Date: Tue, Mar 3, 2026 at 10:15 AM<br>
Subject: Your order ${orderId} has been placed<br>
To: &lt;me@gmail.example&gt;<br><br></div>
<div>
  <h2>Thank you for your order</h2>
  <p>Order ID: ${orderId}</p>
  <p>Ordered on 3 March 2026</p>
  <p>Shipping address:<br>Test Person<br>1 Example Street<br>Bengaluru 560001</p>
  <table><tr><td>Grand Total:</td><td>₹1,299.00</td></tr></table>
  <p>Contact us at +91 98765 43210</p>
</div>`,
    ...extra,
  });
}

/** Auto-forwarded (Gmail filter) delivery notice for the same order. */
export function deliveredNotice(to: string, orderId: string) {
  return base(to, {
    From: "auto-confirm@amazon.in",
    FromFull: { Email: "auto-confirm@amazon.in", Name: "Amazon.in" },
    Subject: `Delivered: your order ${orderId}`,
    Date: "Thu, 05 Mar 2026 18:00:00 +0530",
    Headers: [{ Name: "X-Forwarded-For", Value: `me@gmail.example ${to}` }],
    TextBody: `Your package was delivered.\nOrder ID: ${orderId}\nDelivered on 5 March 2026`,
    HtmlBody: null,
  });
}

/** Auto-forwarded shipping update; `outForDelivery` for the last-mile email. */
export function shippedNotice(
  to: string,
  orderId: string,
  outForDelivery = false,
) {
  return base(to, {
    From: "shipment-tracking@amazon.in",
    FromFull: { Email: "shipment-tracking@amazon.in", Name: "Amazon.in" },
    Subject: outForDelivery
      ? `Out for delivery: your order ${orderId}`
      : `Shipped: your order ${orderId}`,
    Date: "Wed, 04 Mar 2026 09:00:00 +0530",
    Headers: [{ Name: "X-Forwarded-For", Value: `me@gmail.example ${to}` }],
    TextBody: outForDelivery
      ? `Your package is out for delivery and arriving today.\nOrder ID: ${orderId}`
      : `Your package has shipped.\nOrder ID: ${orderId}\nArriving by 6 March 2026`,
    HtmlBody: null,
  });
}

export function cancellation(to: string, orderId: string) {
  return base(to, {
    From: "auto-confirm@amazon.in",
    FromFull: { Email: "auto-confirm@amazon.in", Name: "Amazon.in" },
    Subject: `Your order ${orderId} has been cancelled`,
    TextBody: `We've cancelled your order.\nOrder ID: ${orderId}`,
    HtmlBody: null,
  });
}

export function gmailVerification(to: string, code: string) {
  return base(to, {
    From: "forwarding-noreply@google.com",
    FromFull: { Email: "forwarding-noreply@google.com", Name: "Gmail Team" },
    Subject: `(#${code}) Gmail Forwarding Confirmation - Receive Mail from me@gmail.example`,
    TextBody: `me@gmail.example has requested to automatically forward mail to your email address ${to}.\n\nConfirmation code: ${code}\n\nTo allow me@gmail.example to automatically forward mail to your address, please click the link below to confirm the request:\nhttps://mail-settings.google.com/mail/vf-example`,
    HtmlBody: null,
  });
}

/** Newer Gmail confirmation: no code, only a link (the token is made up). */
export function gmailVerificationLink(to: string, token: string) {
  return base(to, {
    From: "forwarding-noreply@google.com",
    FromFull: { Email: "forwarding-noreply@google.com", Name: "Gmail Team" },
    Subject:
      "(Gmail Forwarding Confirmation - Receive Mail from me@gmail.example",
    TextBody: `me@gmail.example has requested to automatically forward mail to your email address ${to}.\n\nTo allow me@gmail.example to automatically forward mail to your address, please click the link below to confirm the request:\n\nhttps://mail.google.com/mail/vf-%5B${token}%5D-x\n\nTo cancel:\nhttps://mail.google.com/mail/uf-%5B${token}%5D-x`,
    HtmlBody: null,
  });
}

export function newsletter(to: string) {
  return base(to, {
    From: "deals@amazon.in",
    FromFull: { Email: "deals@amazon.in", Name: "Amazon.in" },
    Subject: "Big sale starts now – 50% off",
    TextBody: "Shop our biggest sale. Unsubscribe from these emails anytime.",
    HtmlBody: null,
  });
}

const AUTO_FORWARDED = (to: string) => [
  { Name: "X-Forwarded-For", Value: `me@gmail.example ${to}` },
];

/** Shaped like a real Flipkart "order placed" email (anonymized). */
export function flipkartPlaced(to: string, orderId: string) {
  return base(to, {
    From: "noreply@rmt.flipkart.com",
    FromFull: { Email: "noreply@rmt.flipkart.com", Name: "Flipkart" },
    Subject:
      "Your Order for PUMA Men Royalcat Comf... has been successfully placed",
    Date: "Tue, 03 Mar 2026 10:15:00 +0530",
    Headers: AUTO_FORWARDED(to),
    TextBody: "",
    HtmlBody: `<div><p>Order Placed</p>
<p>Your order has been successfully placed.</p>
<p>Order placed on Mar 3, 2026</p>
<p>Order ID ${orderId}</p>
<p>Delivery by Thu, Mar 5, 2026</p>
<p>Amount Paid₨. 1332</p>
<img src="https://example.com/p.jpg" alt="PUMA Men Royalcat Comfort Slides">
<p>PUMA Men Royalcat Comfort Slides</p><p>Qty: 1</p></div>`,
  });
}

/** A shipping update that names the item but carries no order number. */
export function flipkartShippedNoId(to: string) {
  return base(to, {
    From: "noreply@rmt.flipkart.com",
    FromFull: { Email: "noreply@rmt.flipkart.com", Name: "Flipkart" },
    Subject: "Your item has been shipped",
    Date: "Wed, 04 Mar 2026 09:00:00 +0530",
    Headers: AUTO_FORWARDED(to),
    TextBody: "",
    HtmlBody: `<div><p>Your item has been shipped and will be delivered soon.</p>
<img src="https://example.com/p.jpg" alt="PUMA Men Royalcat Comfort Slides">
<p>PUMA Men Royalcat Comf...</p></div>`,
  });
}

/** Shaped like Amazon.in's shipped email: the order number sits behind U+202B. */
export function amazonShippedReal(to: string, orderId: string) {
  return base(to, {
    From: "shipment-tracking@amazon.in",
    FromFull: { Email: "shipment-tracking@amazon.in", Name: "Amazon.in" },
    Subject: "Shipped: “Acme Black RFID...”",
    Date: "Wed, 04 Mar 2026 09:00:00 +0530",
    Headers: AUTO_FORWARDED(to),
    TextBody: "",
    HtmlBody: `<div><p>Your package was shipped!</p><p>Arriving tomorrow</p>
<img src="https://example.com/a.jpg" alt="Acme Black RFID Blocking Aluminium Card Holder">
<p>Acme Black RFID Blocking Al...</p><p>Quantity: 1</p>
<p>Total ₹168.00</p><p>Order # ‫${orderId}</p></div>`,
  });
}
