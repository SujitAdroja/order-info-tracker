import {
  currencyFromSymbol,
  parseAmount,
  parseLooseDate,
} from "@/lib/ingest/parse-utils";
import type { EmailType, ParsedOrder } from "@/lib/ingest/types";

/**
 * Best-effort extraction used when no store template matches and the LLM is
 * off or over its cap. It never claims more than it found: confidence stays
 * ≤ 0.4, so the purchase always lands in "needs review" for the user to finish.
 */
export const GENERIC_MAX_CONFIDENCE = 0.4;

const ORDER_ID =
  /\border[ \t]*(?:id|#|no\.?|number|ref(?:erence)?)?[ \t]*[:#]?[ \t]*#?[ \t]*([A-Z0-9][A-Z0-9-]{4,39})\b/gi;

const TOTAL =
  /\b(grand total|order total|total amount|amount paid|total paid|total)\b[^\n\d₹$€£]{0,20}((?:₹|Rs\.?|INR|USD|US\$|\$|€|£|AED|SGD)?\s?[\d,]+(?:\.\d{1,2})?)/i;

const ORDER_DATE =
  /\b(order(?:ed)?\s*(?:date|placed(?: on)?|on)|placed on|date of order|purchase date)\b\s*[:\-]?\s*([^\n]{6,40})/i;

const DELIVERY_DATE =
  /\b(delivered on|delivery date|was delivered|arriving(?: on| by)?|expected (?:delivery|by)|estimated delivery|arrives(?: on| by)?)\b\s*[:\-]?\s*([^\n]{6,40})/i;

export function genericExtract(input: {
  type: EmailType;
  body: string;
  emailDate: string | null;
  storeName: string | null;
  defaultCurrency: string | null;
}): ParsedOrder {
  const { body } = input;

  // First candidate containing a digit: skips "your order\nOrder ID: …"
  // and "Order Summary"-style words.
  const externalOrderId =
    [...body.matchAll(ORDER_ID)].map((m) => m[1]).find((id) => /\d/.test(id)) ??
    null;

  const totalMatch = body.match(TOTAL);
  const totalAmount = totalMatch ? parseAmount(totalMatch[2]) : null;
  const currency =
    (totalMatch && currencyFromSymbol(totalMatch[2])) ?? input.defaultCurrency;

  const statedOrderDate = parseLooseDate(body.match(ORDER_DATE)?.[2]);
  const deliveryText = body.match(DELIVERY_DATE);
  const deliveryDate = deliveryText ? parseLooseDate(deliveryText[2]) : null;
  const deliveredAlready =
    input.type === "delivered" ||
    /delivered on|was delivered/i.test(deliveryText?.[1] ?? "");

  // For confirmation-type emails the send date is a good guess at the order date.
  const orderDate =
    statedOrderDate ??
    (input.type === "order_confirmation" || input.type === "invoice"
      ? input.emailDate
      : null);

  let found = 0;
  if (externalOrderId) found++;
  if (totalAmount !== null) found++;
  if (statedOrderDate) found++;

  return {
    email_type: input.type,
    store_name: input.storeName,
    external_order_id: externalOrderId,
    order_date: orderDate,
    delivery_date: deliveredAlready ? deliveryDate : null,
    expected_delivery_date: deliveredAlready ? null : deliveryDate,
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    total_amount: totalAmount,
    items: [], // item names are too varied to guess reliably
    return_window_days_stated: statedReturnWindow(body),
    seller_name: null,
    confidence: Math.min(GENERIC_MAX_CONFIDENCE, 0.1 + found * 0.1),
  };
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
