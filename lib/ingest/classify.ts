import type { EmailType } from "@/lib/ingest/types";

/**
 * Rule-based classification (Section 6.2 step 5). Subject is the strongest
 * signal; the body is only used when the subject says nothing. Order matters:
 * a "refund for your cancelled order" is a refund, not a cancellation.
 */
const RULES: { type: Exclude<EmailType, "gmail_verification">; re: RegExp }[] =
  [
    { type: "refund", re: /\brefund(ed)?\b/i },
    {
      type: "return_initiated",
      re: /\breturn\b.*\b(initiated|requested|request|received|scheduled|pickup|picked up|created)\b|\bpickup\b.*\breturn\b/i,
    },
    { type: "cancelled", re: /\b(cancel(l)?ed|cancellation)\b/i },
    {
      type: "delivered",
      re: /\bdelivered\b|\bhas been delivered\b|\bdelivery (complete|successful)\b/i,
    },
    {
      type: "shipped",
      re: /\b(shipped|dispatched|out for delivery|on (its|the) way|in transit|has shipped)\b/i,
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
