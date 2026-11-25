import { isISODate, type ISODate } from "@/lib/dates";

export type ParsedAddress = {
  name: string | null;
  address: string | null;
  domain: string | null;
};

const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** `"Amazon.in" <auto-confirm@amazon.in>` → name/address/domain. */
export function parseAddress(raw: string | null | undefined): ParsedAddress {
  if (!raw) return { name: null, address: null, domain: null };
  const match = raw.match(EMAIL_RE);
  const address = match ? match[0].toLowerCase() : null;
  const name =
    raw
      .replace(/<[^>]*>/, "")
      .replace(EMAIL_RE, "")
      .replace(/^[\s"']+|[\s"']+$/g, "")
      .trim() || null;
  return { name, address, domain: address ? address.split("@")[1] : null };
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function monthOf(word: string): number | undefined {
  const w = word.toLowerCase();
  return MONTHS[w.slice(0, 4)] ?? MONTHS[w.slice(0, 3)];
}

const pad = (n: number) => String(n).padStart(2, "0");

function build(y: number, m: number, d: number): ISODate | null {
  if (y < 100) y += 2000;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  return isISODate(iso) ? iso : null;
}

/**
 * Extracts the calendar date as written (no timezone conversion, EC-ING-22)
 * from common email date formats:
 *   2026-03-03 · Tue, 03 Mar 2026 10:15 +0530 · Tue, Mar 3, 2026 at 10:15 AM
 *   Tuesday, March 3, 2026 · 3 March 2026 · 03/03/2026 (day first)
 */
export function parseLooseDate(raw: string | null | undefined): ISODate | null {
  if (!raw) return null;
  const s = raw.trim();

  let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return build(+m[1], +m[2], +m[3]);

  // "3 Mar 2026", "03 March, 2026", "3rd March 2026"
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  if (m && monthOf(m[2])) return build(+m[3], monthOf(m[2])!, +m[1]);

  // "Mar 3, 2026", "March 3 2026"
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/);
  if (m && monthOf(m[1])) return build(+m[3], monthOf(m[1])!, +m[2]);

  // "03/03/2026" or "3-3-26": day first (India/most of the world).
  m = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) return build(+m[3], +m[2], +m[1]);

  return null;
}

/** Parses "₹1,29,999.00", "Rs. 499", "$1,299.99" → number. */
export function parseAmount(raw: string): number | null {
  const m = raw.match(/\d[\d,]*(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function currencyFromSymbol(raw: string): string | null {
  if (/₹|\bRs\.?|\bINR\b/i.test(raw)) return "INR";
  if (/\bUSD\b|US\$/i.test(raw)) return "USD";
  if (/€|\bEUR\b/.test(raw)) return "EUR";
  if (/£|\bGBP\b/.test(raw)) return "GBP";
  if (/\bAED\b/.test(raw)) return "AED";
  if (/\bSGD\b|S\$/.test(raw)) return "SGD";
  if (/\$/.test(raw)) return "USD";
  return null;
}
