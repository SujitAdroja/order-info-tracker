import { convert } from "html-to-text";

export const MAX_TEXT_CHARS = 30_000;

/**
 * Section 6.2 step 3: HTML → plain text with tables kept readable; images,
 * link targets and scripts dropped. We never render email HTML anywhere.
 */
export function htmlToText(html: string): string {
  const text = convert(html, {
    wordwrap: false,
    preserveNewlines: false,
    selectors: [
      { selector: "img", format: "skip" },
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

/** Collapses whitespace noise common in email bodies. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[​-‍﻿­]/g, "") // zero-width + soft hyphen
    .replace(/ /g, " ")
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
