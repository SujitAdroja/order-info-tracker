import { addDaysISO, type ISODate } from "@/lib/dates";
import {
  currencyFromSymbol,
  parseAmount,
  parseLooseDate,
} from "@/lib/ingest/parse-utils";
import type { EmailType, ParsedItem, ParsedOrder } from "@/lib/ingest/types";

/**
 * Best-effort extraction used when no store template matches and the LLM is
 * off or over its cap. It reads the shapes most store emails share: an order
 * number, a total, the order date, and item names from product-photo
 * captions, "Name × 1" lines or the subject line.
 *
 * Confidence reaches GENERIC_COMPLETE_CONFIDENCE (above the review
 * threshold) only when the order number, the order date and at least one
 * item were all found. Anything less lands in "needs review".
 */
export const GENERIC_COMPLETE_CONFIDENCE = 0.8;
const PARTIAL_MAX_CONFIDENCE = 0.5;

const ORDER_ID =
  /\border[ \t]*(?:id|#|no\.?|number|ref(?:erence)?)?[ \t]*[:#]?[ \t]*#?[ \t]*([A-Z0-9][A-Z0-9-]{4,39})\b/gi;

/** "Total", "Grand total"… then up to 30 non-digit chars (may cross a line). */
const TOTAL =
  /\b(grand total|order total|total amount|amount paid|total paid|total)\b[^\d₹$€£₨]{0,30}((?:₹|₨\.?|Rs\.?|INR|USD|US\$|\$|€|£|AED|SGD)?\s?[\d,]+(?:\.\d{1,2})?)/gi;

const ORDER_DATE =
  /\b(order(?:ed)?\s*(?:date|placed(?: on)?|on)|placed on|date of order|purchase date)\b\s*[:\-]?\s*([^\n]{6,40})/i;

const DELIVERY_DATE =
  /\b(delivered on|delivery date|was delivered|delivery by|deliver(?:ed)? by|arriving(?: on| by)?|expected (?:delivery|by)|estimated delivery|arrives(?: on| by)?)\b\s*[:\-]?\s*([^\n]{3,40})/i;

const MAX_ITEMS = 20;

export function genericExtract(input: {
  type: EmailType;
  body: string;
  emailDate: string | null;
  storeName: string | null;
  defaultCurrency: string | null;
  subject?: string;
}): ParsedOrder {
  const { body } = input;
  const subject = input.subject ?? "";

  // First candidate containing a digit: skips "your order\nOrder ID: …"
  // and "Order Summary"-style words. The subject counts too.
  const externalOrderId =
    [...`${subject}\n${body}`.matchAll(ORDER_ID)]
      .map((m) => m[1])
      .find((id) => /\d/.test(id)) ?? null;

  const total = findTotal(body);
  const currency =
    (total && currencyFromSymbol(total.raw)) ?? input.defaultCurrency;

  const statedOrderDate = parseLooseDate(body.match(ORDER_DATE)?.[2]);
  const deliveryText = body.match(DELIVERY_DATE);
  const deliveryDate = deliveryText
    ? (parseLooseDate(deliveryText[2]) ??
      relativeDate(deliveryText[2], input.emailDate))
    : null;
  const deliveredAlready =
    input.type === "delivered" ||
    /delivered on|was delivered/i.test(deliveryText?.[1] ?? "");

  // For confirmation-type emails the send date is a good guess at the order date.
  const orderDate =
    statedOrderDate ??
    (input.type === "order_confirmation" || input.type === "invoice"
      ? input.emailDate
      : null);

  const items = extractItems(body, subject);

  const complete = Boolean(externalOrderId && orderDate && items.length);
  let found = 0;
  if (externalOrderId) found++;
  if (total) found++;
  if (statedOrderDate) found++;
  if (items.length) found++;

  return {
    email_type: input.type,
    store_name: input.storeName,
    external_order_id: externalOrderId,
    order_date: orderDate,
    delivery_date: deliveredAlready ? deliveryDate : null,
    expected_delivery_date: deliveredAlready ? null : deliveryDate,
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    total_amount: total?.amount ?? null,
    items,
    return_window_days_stated: statedReturnWindow(body),
    seller_name: null,
    confidence: complete
      ? GENERIC_COMPLETE_CONFIDENCE
      : Math.min(PARTIAL_MAX_CONFIDENCE, 0.1 + found * 0.1),
  };
}

/** The first positive total ("Total paid today ₹0.00" on COD orders is skipped). */
function findTotal(body: string): { amount: number; raw: string } | null {
  for (const m of body.matchAll(TOTAL)) {
    const amount = parseAmount(m[2]);
    if (amount !== null && amount > 0) return { amount, raw: m[2] };
  }
  return null;
}

/** "tomorrow" / "today" next to a delivery phrase, relative to the email date. */
function relativeDate(text: string, emailDate: string | null): ISODate | null {
  if (!emailDate) return null;
  if (/^\s*tomorrow\b/i.test(text)) return addDaysISO(emailDate, 1);
  if (/^\s*today\b/i.test(text)) return emailDate;
  return null;
}

/** Removes a trailing "…" / "..." that stores add to shortened names. */
function untruncate(name: string): string {
  return name.replace(/\s*(?:\.{2,}|…)\s*$/, "").trim();
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * A category from unmistakable words in the item name, so stores with
 * per-category return windows (Flipkart) don't have to ask. Anything unclear
 * stays "other", and the user is asked for the window instead.
 */
const CATEGORY_WORDS: [ParsedItem["category"], RegExp][] = [
  [
    "electronics",
    /\b(earbuds?|earphones?|headphones?|headset|airdopes|smart ?watch|smartphone|mobile phone|laptop|tablet|power ?bank|charger|bluetooth speaker|speaker|keyboard|(?:wireless|gaming|computer) mouse|monitor|camera|pendrive|ssd|hard disk|router)\b/i,
  ],
  [
    "fashion",
    /\b(shirt|t-shirt|tshirt|jeans|trousers?|shorts|kurta|kurti|saree|dress|jacket|hoodie|sweatshirt|shoes?|sneakers?|sandals?|slides|slippers?|flip ?flops?|socks|innerwear|briefs|bra|cap|wallet|belt|handbag|backpack|card holder|sunglasses|watch)\b/i,
  ],
  [
    "beauty",
    /\b(shampoo|conditioner|face ?wash|serum|moisturi[sz]er|sunscreen|lipstick|perfume|deodorant|trimmer|hair oil|body lotion)\b/i,
  ],
  [
    "appliance",
    /\b(mixer|grinder|blender|kettle|iron|microwave|refrigerator|fridge|washing machine|air fryer|vacuum cleaner|geyser|water purifier|chimney)\b/i,
  ],
  [
    "home",
    /\b(bedsheet|pillow|curtains?|mattress|towel|cookware|pressure cooker|tawa|bottle|lunch ?box|chair|table|lamp|storage box)\b/i,
  ],
];

export function guessCategory(name: string): ParsedItem["category"] {
  return CATEGORY_WORDS.find(([, re]) => re.test(name))?.[0] ?? "other";
}

function item(name: string, quantity = 1, unitPrice: number | null = null) {
  return {
    name: name.slice(0, 200),
    quantity: Math.min(Math.max(quantity, 1), 999),
    unit_price: unitPrice,
    category: guessCategory(name),
    serial_number: null,
    warranty_months: null,
    non_returnable: false,
  } satisfies ParsedItem;
}

/**
 * Item names, most reliable first:
 * 1. a product photo caption repeated as the next line of text (Amazon,
 *    Flipkart: "[image: Full name]" then "Full na…");
 * 2. "Name × 1" lines (Shopify stores);
 * 3. the subject: “Name…” in quotes, or "Your order for Name has been…".
 */
export function extractItems(body: string, subject: string): ParsedItem[] {
  const out: ParsedItem[] = [];
  const seen = new Set<string>();
  const add = (i: ParsedItem) => {
    const key = i.name.toLowerCase();
    if (i.name.length < 3 || seen.has(key) || out.length >= MAX_ITEMS) return;
    seen.add(key);
    out.push(i);
  };

  // 1. Photo caption + the same name as the next line.
  for (const m of body.matchAll(/\[image:\s*([^\]]{3,300})\]/g)) {
    const caption = clean(m[1]);
    // Plain-text forwards put the link target "<https://…>" (wrapped over
    // several lines) between the caption and the name.
    const after = body
      .slice(m.index + m[0].length, m.index + m[0].length + 2000)
      .replace(/<https?:[^>]*>/g, "");
    const next = after
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean);
    if (!next) continue;
    const shown = untruncate(next);
    if (
      shown.length >= 6 &&
      /\s/.test(caption) &&
      caption.toLowerCase().startsWith(shown.toLowerCase())
    ) {
      const qty = after
        .slice(0, 400)
        .match(/\b(?:quantity|qty)\s*:?\s*(\d{1,3})\b/i);
      add(item(caption, qty ? Number(qty[1]) : 1));
    }
  }

  // 2. "Premium DualGrip Socks × 1", with the price on the same line (HTML
  // tables) or one of the next lines (plain text).
  const lines = body.split("\n").map((l) => l.trim());
  const PRICE = /(?:₹|₨\.?|Rs\.?|INR|\$|€|£)\s?[\d,]+(?:\.\d{1,2})?/i;
  for (const [i, line] of lines.entries()) {
    const m = line.match(/^(.{3,150}?)\s+[×x]\s*(\d{1,3})(?:\s+(.*))?$/);
    if (!m || /^\d/.test(m[1])) continue;
    const qty = Number(m[2]);
    const priceText =
      (m[3] && PRICE.exec(m[3])?.[0]) ??
      lines
        .slice(i + 1, i + 4)
        .map((l) => l.replace(/^\*|\*$/g, ""))
        .find((l) => new RegExp(`^${PRICE.source}`, "i").test(l));
    const lineTotal = priceText ? parseAmount(priceText) : null;
    add(
      item(
        clean(m[1]),
        qty,
        lineTotal !== null && qty > 0
          ? Math.round((lineTotal / qty) * 100) / 100
          : null,
      ),
    );
  }

  // 3. The subject, when the body gave nothing.
  if (!out.length) {
    const s = subject.replace(/^(?:\s*(?:fwd?|fw|re)\s*:\s*)+/i, "");
    const quoted = s.match(/[“"]([^”"]{4,150})[”"]/);
    const orderFor = s.match(
      /\border (?:for|of)\s+(.{4,150}?)\s+(?:has|have|is|was|will)\b/i,
    );
    const name = untruncate(clean(quoted?.[1] ?? orderFor?.[1] ?? ""));
    if (name && !/^#?[A-Z0-9-]{5,}$/i.test(name)) add(item(name));
  }

  return out;
}

/** "return within 10 days", "10-day return policy", "returnable for 30 days". */
export function statedReturnWindow(body: string): number | null {
  const m =
    body.match(
      /\breturn(?:ed|able|s)?\b[^\n.]{0,40}?\b(?:within|for|in)\s+(\d{1,3})\s*days?\b/i,
    ) ?? body.match(/\b(\d{1,3})[- ]days?\s+(?:easy\s+)?returns?\b/i);
  if (!m) return null;
  const days = Number(m[1]);
  return days > 0 && days <= 365 ? days : null;
}
