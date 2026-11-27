import { convert } from "html-to-text";

export const MAX_TEXT_CHARS = 30_000;

/**
 * Section 6.2 step 3: HTML → plain text with tables kept readable; images
 * reduced to their alt text, link targets and scripts dropped. We never
 * render email HTML anywhere.
 */
export function htmlToText(html: string): string {
  const text = convert(html, {
    wordwrap: false,
    formatters: {
      imageAlt: (elem, _walk, builder) => {
        const alt = String(elem.attribs?.alt ?? "")
          .replace(/\s+/g, " ")
          .trim();
        if (alt.length >= 3 && alt.length <= 200) {
          builder.addInline(`[image: ${alt}]`);
        }
      },
    },
    preserveNewlines: false,
    selectors: [
      // Product photos carry the full item name in their alt text; keep it
      // as "[image: …]" (the same shape Gmail uses in forwarded text).
      { selector: "img", format: "imageAlt" },
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "head", format: "skip" },
      // Keep link text, drop (tracking) URLs.
      { selector: "a", options: { ignoreHref: true } },
      {
        selector: "table",
        format: "dataTable",
        options: { colSpacing: 3, uppercaseHeaderCells: false },
      },
      { selector: "h1", options: { uppercase: false } },
      { selector: "h2", options: { uppercase: false } },
      { selector: "h3", options: { uppercase: false } },
    ],
  });
  return normalizeText(text);
}

/**
 * Invisible characters stores put in emails: zero-width spaces/joiners,
 * direction marks (Amazon wraps order numbers in U+202B), the combining
 * grapheme joiner used as preheader padding, word joiners and soft hyphens.
 * Left in, they split "Order # 405-…" so the number can't be read.
 */
const INVISIBLE =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u3164\uFEFF\uFFA0]/g;

export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE, "").replace(/[\u00A0\u2007\u202F]/g, " ");
}

/** Collapses whitespace noise common in email bodies. */
export function normalizeText(text: string): string {
  return stripInvisible(text.replace(/\r\n?/g, "\n"))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Caps text at 30k chars, keeping head and tail (EC-ING-15). */
export function capText(text: string, max = MAX_TEXT_CHARS): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head - 20;
  return `${text.slice(0, head)}\n\n[…truncated…]\n\n${text.slice(-tail)}`;
}

/** EC-ING-09: an email whose content is (almost) only images. */
export function looksImageOnly(html: string | null, text: string): boolean {
  if (!html) return false;
  const images = (html.match(/<img\b/gi) ?? []).length;
  const words = text.split(/\s+/).filter((w) => w.length > 1).length;
  return images > 0 && words < 25;
}
