export type StoreForMatching = {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  senderDomains: string[];
};

/**
 * Section 6.2 step 4: match the original sender's domain against
 * `stores.sender_domains`, including subdomains (marketplace.amazon.in →
 * amazon.in) but never partial labels (notamazon.in ≠ amazon.in).
 * The most specific (longest) matching domain wins.
 */
export function matchStore<T extends StoreForMatching>(
  fromDomain: string | null,
  stores: T[],
): T | null {
  if (!fromDomain) return null;
  const domain = fromDomain.toLowerCase().replace(/\.$/, "");
  let best: { store: T; length: number } | null = null;
  for (const store of stores) {
    for (const d of store.senderDomains) {
      const candidate = d.toLowerCase();
      if (domain === candidate || domain.endsWith(`.${candidate}`)) {
        if (!best || candidate.length > best.length) {
          best = { store, length: candidate.length };
        }
      }
    }
  }
  return best?.store ?? null;
}

/** Country → default currency (EC-ING-12: never convert, only default). */
export const COUNTRY_CURRENCY: Record<string, string> = {
  IN: "INR",
  US: "USD",
  GB: "GBP",
  AE: "AED",
  SG: "SGD",
};
