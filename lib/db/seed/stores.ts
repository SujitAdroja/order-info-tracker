/**
 * Section 7 top-10 stores.
 *
 * POLICY VALUES: per the plan, `defaultReturnDays` and category policies must
 * be verified from each retailer's current policy page and recorded with
 * `policyUrl` + `policyVerifiedAt`. Until verified they stay null, and the
 * user is asked for the return window (EC-DATE-04). Never guess.
 *
 * Sender domains are used for store matching in Phase 3; confirm them against
 * real fixture emails when building templates.
 */

export type StoreSeed = {
  slug: string;
  name: string;
  country: string;
  senderDomains: string[];
  defaultReturnDays: number | null;
  returnFrom: "delivery" | "order";
  policyUrl: string | null;
  policyVerifiedAt: string | null; // YYYY-MM-DD
  categoryPolicies: {
    category: string;
    returnDays: number | null;
    nonReturnable: boolean;
  }[];
};

const unverified = {
  defaultReturnDays: null,
  returnFrom: "delivery",
  policyUrl: null,
  policyVerifiedAt: null,
  categoryPolicies: [],
} as const satisfies Partial<StoreSeed>;

const VERIFIED_ON = "2026-11-25";

/**
 * Where a store's own range spans one of our categories (e.g. Flipkart home:
 * furniture 10 days, décor 7), we store the shorter number (Section 8:
 * "pick the earlier deadline"). Many Flipkart windows are replacement-only;
 * the date still matters, so we track it as the return window.
 *
 * Unverified (official page unreadable on VERIFIED_ON; leave null, don't guess):
 * Amazon.in and Amazon.com (HTTP 503), Myntra (timeout), AJIO and Croma (HTTP 403).
 */
export const STORE_SEEDS: StoreSeed[] = [
  {
    slug: "amazon-in",
    name: "Amazon.in",
    country: "IN",
    senderDomains: ["amazon.in"],
    ...unverified,
  },
  {
    slug: "flipkart",
    name: "Flipkart",
    country: "IN",
    senderDomains: ["flipkart.com"],
    // No single default: "the returns/replacement policy provided on the
    // product page shall prevail over the general returns policy."
    defaultReturnDays: null,
    returnFrom: "delivery",
    policyUrl: "https://www.flipkart.com/pages/returnpolicy",
    policyVerifiedAt: VERIFIED_ON,
    categoryPolicies: [
      { category: "fashion", returnDays: 10, nonReturnable: false },
      // Furniture 10, home décor/household 7 → 7.
      { category: "home", returnDays: 7, nonReturnable: false },
      // Mobiles/electronics 7 (replacement only; some brands service-centre only).
      { category: "electronics", returnDays: 7, nonReturnable: false },
      // Small appliances 7, chimney/purifier/fan/geyser 10 → 7.
      { category: "appliance", returnDays: 7, nonReturnable: false },
      // Dairy/bakery/produce 2, staples 7 → 2.
      { category: "grocery", returnDays: 2, nonReturnable: false },
    ],
  },
  {
    slug: "myntra",
    name: "Myntra",
    country: "IN",
    senderDomains: ["myntra.com"],
    ...unverified,
  },
  {
    slug: "ajio",
    name: "AJIO",
    country: "IN",
    senderDomains: ["ajio.com"],
    ...unverified,
  },
  {
    slug: "nykaa",
    name: "Nykaa",
    country: "IN",
    senderDomains: ["nykaa.com"],
    // "within 15 days of its delivery"
    defaultReturnDays: 15,
    returnFrom: "delivery",
    policyUrl: "https://nykaa.com/cancellation-policy",
    policyVerifiedAt: VERIFIED_ON,
    categoryPolicies: [
      // "Personal care appliances cannot be returned due to hygiene issues."
      { category: "appliance", returnDays: null, nonReturnable: true },
    ],
  },
  {
    slug: "croma",
    name: "Croma",
    country: "IN",
    senderDomains: ["croma.com"],
    ...unverified,
  },
  {
    slug: "amazon-us",
    name: "Amazon.com",
    country: "US",
    senderDomains: ["amazon.com"],
    ...unverified,
  },
  {
    slug: "apple",
    name: "Apple",
    country: "US",
    senderDomains: ["apple.com"],
    // "within 14 days of the date you receive the product from Apple" (US store)
    defaultReturnDays: 14,
    returnFrom: "delivery",
    policyUrl: "https://www.apple.com/shop/open/salespolicies",
    policyVerifiedAt: VERIFIED_ON,
    categoryPolicies: [],
  },
  {
    slug: "bestbuy",
    name: "Best Buy",
    country: "US",
    senderDomains: ["bestbuy.com"],
    // Standard members, "Most products": 15 days; "the time period begins the
    // day you receive your product". Paid tiers (60 days) and the holiday
    // extension aren't modelled; users can set the window themselves.
    defaultReturnDays: 15,
    returnFrom: "delivery",
    policyUrl:
      "https://www.bestbuy.com/site/help-topics/return-exchange-policy/pcmcat260800050014.c?id=pcmcat260800050014",
    policyVerifiedAt: VERIFIED_ON,
    categoryPolicies: [
      // Activatable devices (phones, cellular tablets/wearables) 14 → 14.
      { category: "electronics", returnDays: 14, nonReturnable: false },
      // Non-subscription digital content, codes and prepaid cards: nonreturnable.
      { category: "digital", returnDays: null, nonReturnable: true },
    ],
  },
  {
    slug: "ikea",
    name: "IKEA",
    country: "IN",
    senderDomains: ["ikea.com", "ikea.in"],
    // "You have 365 days to exchange or return your purchase for a full refund."
    // The start isn't stated (mattresses: "from the date of purchase"), so we
    // count from the order date, the earlier option.
    defaultReturnDays: 365,
    returnFrom: "order",
    policyUrl: "https://www.ikea.com/in/en/customer-service/returns-claims",
    policyVerifiedAt: VERIFIED_ON,
    categoryPolicies: [
      // Non-returnable: "Food Articles", "Plants", "Custom made worktops", "Gift card".
      { category: "grocery", returnDays: null, nonReturnable: true },
    ],
  },
];
