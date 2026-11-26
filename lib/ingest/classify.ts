import type { EmailType } from "@/lib/ingest/types";

/**
 * Rule-based classification (Section 6.2 step 5). Subject is the strongest
 * signal; the body is only used when the subject says nothing. Order matters:
 * a "refund for your cancelled order" is a refund, not a cancellation.
 */
const OUT_FOR_DELIVERY = /\bout for delivery\b|\barriving today\b/i;

const RULES: { type: Exclude<EmailType, "gmail_verification">; re: RegExp }[] =
  [
    { type: "refund", re: /\brefund(ed)?\b/i },
    {
      type: "return_initiated",
      re: /\breturn\b.*\b(initiated|requested|request|received|scheduled|pickup|picked up|created)\b|\bpickup\b.*\breturn\b/i,
    },
    { type: "cancelled", re: /\b(cancel(l)?ed|cancellation)\b/i },
    // Before "delivered": "out for delivery, will be delivered today" isn't delivered yet.
    { type: "shipped", re: OUT_FOR_DELIVERY },
    {
      type: "delivered",
      // Not "will be / to be / being delivered" (a promise, not a delivery).
      re: /(?<!\b(?:will be|to be|being|be)\s)\bdelivered\b|\bdelivery (complete|successful)\b/i,
    },
    {
      type: "shipped",
      re: /\b(shipped|dispatched|out for delivery|on (its|the) way|in transit|has shipped|will be delivered|arriving)\b/i,
    },
    { type: "invoice", re: /\b(invoice|tax invoice|receipt)\b/i },
    {
      type: "order_confirmation",
      re: /\b(order (placed|confirmed|confirmation|received|summary)|thank(s| you) for (your )?(order|purchase|shopping)|your order\b|order #|order no)/i,
    },
  ];

const NOT_A_PURCHASE =
  /\b(otp|one[- ]time password|verification code|newsletter|unsubscribe from|sale starts|% off|deal of the day|password reset|sign[- ]in attempt)\b/i;

export function classifyEmail(subject: string, body: string): EmailType {
  for (const { type, re } of RULES) if (re.test(subject)) return type;
  if (NOT_A_PURCHASE.test(subject)) return "other";

  const head = body.slice(0, 3000);
  for (const { type, re } of RULES) if (re.test(head)) return type;
  return "other";
}

/** Order tracking: a shipping email that says the parcel is out for delivery. */
export function isOutForDelivery(subject: string, body: string): boolean {
  return (
    OUT_FOR_DELIVERY.test(subject) || OUT_FOR_DELIVERY.test(body.slice(0, 3000))
  );
}
