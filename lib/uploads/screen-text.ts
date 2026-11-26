import { addDaysISO, type ISODate } from "@/lib/dates";
import { GENERIC_MAX_CONFIDENCE } from "@/lib/ingest/generic-extract";
import type { ParsedOrder } from "@/lib/ingest/types";

/**
 * Extra rules for text read off a screenshot with OCR (no API key). Shopping
 * app screens differ from emails: dates often have no year ("Ordered on
 * 24 Nov"), order numbers use "Order ID - OD123…", and the item title sits
 * just above "Sold by" / "Qty". Everything found here stays low-confidence,
 * so the review screen highlights it.
 */

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const monthOf = (s: string) => {
  const i = MONTHS.indexOf(s.slice(0, 3).toLowerCase());
  return i === -1 ? null : i + 1;
};

/** "24 Nov", "Nov 24", "Mon, 24 Nov" → the most recent such date ≤ today+1. */
export function parseYearlessDate(raw: string, today: ISODate): ISODate | null {
  let day: number | null = null;
  let month: number | null = null;
  let m = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\b/);
  if (m && monthOf(m[2])) {
    day = +m[1];
    month = monthOf(m[2]);
  } else {
    m = raw.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (m && monthOf(m[1])) {
      month = monthOf(m[1]);
      day = +m[2];
    }
  }
  if (!day || !month || day > 31) return null;
  const year = Number(today.slice(0, 4));
  for (const y of [year, year - 1]) {
    const iso: string = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const d: Date = new Date(`${iso}T00:00:00Z`);
    if (d.getUTCDate() !== day) return null; // 31 Feb
    if (iso <= addDaysISO(today, 1)) return iso;
  }
  return null;
}

const ORDER_ID_SCREEN =
  /\border\s*(?:id|no\.?|number|#)\s*[:#-]?\s*#?\s*([A-Z0-9][A-Z0-9-]{5,39})\b/i;
const ORDERED_ON =
  /\b(?:ordered|order placed|placed)\s*(?:on)?\s*[:\-]?\s*([^\n]{3,30})/i;
const DELIVERED_ON = /\bdelivered\s*(?:on)?\s*[:\-]?\s*([^\n]{3,30})/i;
const ARRIVING =
  /\b(?:arriving|expected by|delivery by|arrives)\s*(?:on|by)?\s*[:\-]?\s*([^\n]{3,30})/i;
const ITEM_ANCHOR = /^\s*(sold by|seller\b|qty\b|quantity\b|size\b|colou?r\b)/i;
const NOT_A_TITLE =
  /order|deliver|arriv|total|₹|\$|rs\.?\s?\d|price|return|refund|cancel|invoice|payment|address|help|track|ship/i;

/** Item title guess: the line(s) just above "Sold by" / "Qty" / "Size". */
export function guessItemName(text: string): string | null {
  const lines = text.split("\n").map((l) => l.trim());
  for (let i = 1; i < lines.length; i++) {
    if (!ITEM_ANCHOR.test(lines[i])) continue;
    const title: string[] = [];
    for (let j = i - 1; j >= 0 && title.length < 2; j--) {
      const l = lines[j];
      if (!l) {
        if (title.length) break;
        continue;
      }
      const letters = l.replace(/[^A-Za-z]/g, "").length;
      if (l.length < 8 || letters / l.length < 0.5 || NOT_A_TITLE.test(l))
        break;
      title.unshift(l);
    }
    const name = title.join(" ").replace(/\s+/g, " ").trim();
    if (name.length >= 8) return name.slice(0, 200);
  }
  return null;
}

export function enrichFromScreenText(
  order: ParsedOrder,
  text: string,
  today: ISODate,
): ParsedOrder {
  const out: ParsedOrder = { ...order, items: [...order.items] };
  let found = 0;
  if (!out.external_order_id) {
    const id = text.match(ORDER_ID_SCREEN)?.[1];
    if (id && /\d/.test(id)) {
      out.external_order_id = id;
      found++;
    }
  }
  if (!out.order_date) {
    const raw = text.match(ORDERED_ON)?.[1];
    const d = raw ? parseYearlessDate(raw, today) : null;
    if (d) {
      out.order_date = d;
      found++;
    }
  }
  if (!out.delivery_date && !out.expected_delivery_date) {
    const delivered = text.match(DELIVERED_ON)?.[1];
    const arriving = text.match(ARRIVING)?.[1];
    const d = delivered ? parseYearlessDate(delivered, today) : null;
    if (d) out.delivery_date = d;
    else if (arriving) {
      const e = parseYearlessDate(arriving, addDaysISO(today, 60));
      if (e && e >= today) out.expected_delivery_date = e;
    }
  }
  if (!out.items.length) {
    const name = guessItemName(text);
    if (name) {
      out.items.push({
        name,
        quantity: 1,
        unit_price: null,
        category: "other",
        serial_number: null,
        warranty_months: null,
        non_returnable: false,
      });
      found++;
    }
  }
  out.confidence = Math.min(
    GENERIC_MAX_CONFIDENCE,
    out.confidence + found * 0.1,
  );
  return out;
}
