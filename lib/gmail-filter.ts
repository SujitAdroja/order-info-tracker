/**
 * The Gmail search used for auto-forwarding (onboarding and the landing
 * page). Gmail forwards only mail that matches it, so order, shipping and
 * delivery emails from these stores reach KeepTrack without manual forwards.
 */
export const GMAIL_FILTER_FROM = [
  "amazon.in",
  "flipkart.com",
  "myntra.com",
  "ajio.com",
  "nykaa.com",
  "croma.com",
  "meesho.com",
  // Most small Indian brand stores run on Shopify and send from here.
  "shopifyemail.com",
  "amazon.com",
  "apple.com",
  "ikea.com",
] as const;

export const GMAIL_FILTER_SUBJECT = [
  "order",
  "shipped",
  "dispatched",
  "delivered",
  "delivery",
  "invoice",
  "refund",
  "return",
  "cancelled",
] as const;

export const GMAIL_FILTER = `from:(${GMAIL_FILTER_FROM.join(" OR ")}) subject:(${GMAIL_FILTER_SUBJECT.join(" OR ")})`;
