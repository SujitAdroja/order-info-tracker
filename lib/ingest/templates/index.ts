import type { EmailType, ParsedOrder } from "@/lib/ingest/types";

/**
 * Section 7 store templates. Each lives in `./<store>.ts`, is built from 3+
 * real anonymized emails in `tests/fixtures/emails/<store>/`, and is
 * registered below. A template returns confidence 0.95 when every required
 * field is found.
 *
 * TODO(Section 7): add templates once real sample emails are available for
 * amazon-in, flipkart, myntra, ajio, nykaa, croma, amazon-us, apple, bestbuy,
 * ikea. Until then, emails go to the LLM fallback, or (without an API key)
 * to the generic extractor and "needs review".
 */
export type StoreTemplate = {
  storeSlug: string;
  match: (fromDomain: string, subject: string) => boolean;
  classify: (text: string, subject: string) => EmailType | null;
  parse: (text: string, type: EmailType) => ParsedOrder | null;
};

export const TEMPLATES: StoreTemplate[] = [];

export function findTemplate(
  storeSlug: string | null,
  fromDomain: string | null,
  subject: string,
  templates: StoreTemplate[] = TEMPLATES,
): StoreTemplate | null {
  if (!storeSlug || !fromDomain) return null;
  return (
    templates.find(
      (t) => t.storeSlug === storeSlug && t.match(fromDomain, subject),
    ) ?? null
  );
}

/** Required fields for a template result to count as complete. */
export function templateComplete(order: ParsedOrder): boolean {
  return Boolean(
    order.external_order_id && order.order_date && order.items.length > 0,
  );
}
