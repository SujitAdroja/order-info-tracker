import { parseAddress, parseLooseDate } from "@/lib/ingest/parse-utils";
import type { OriginalEmail } from "@/lib/ingest/types";

/**
 * Section 6.2 step 2 / EC-ING-06: find the original email inside a manual
 * forward (Gmail, Apple Mail, Outlook) and ignore any note the user typed
 * above the forwarded block. Auto-forwarded mail keeps its own headers, so
 * it's returned as-is.
 */

const FORWARD_MARKERS = [
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/im, // Gmail
  /^Begin forwarded message:\s*$/im, // Apple Mail
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im, // Outlook (older)
  /^_{5,}\s*$/m, // Outlook web divider
];

const FWD_SUBJECT = /^\s*(?:(?:fwd?|fw|tr|wg)\s*:\s*)+/i;

type HeaderBlock = {
  from?: string;
  date?: string;
  subject?: string;
  endIndex: number; // index in `lines` where the original body starts
};

/** Reads `Key: value` lines (From/Date/Sent/Subject/To/Cc) after a marker. */
function readHeaderBlock(lines: string[], start: number): HeaderBlock | null {
  const block: HeaderBlock = { endIndex: start };
  let i = start;
  // Allow blank lines before the first header.
  while (i < lines.length && lines[i].trim() === "") i++;
  let seen = 0;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") {
      if (seen > 0) break;
      continue;
    }
    const m = line.match(
      /^\*?(From|Date|Sent|Subject|To|Cc|Reply-To)\*?:\s*(.*)$/i,
    );
    if (!m) break;
    seen++;
    const key = m[1].toLowerCase();
    if (key === "from") block.from = m[2];
    else if (key === "date" || key === "sent") block.date = m[2];
    else if (key === "subject") block.subject = m[2];
  }
  if (!block.from) return null;
  block.endIndex = i;
  return block;
}

export function unwrapForward(input: {
  from: string;
  subject: string;
  date: string | null;
  body: string;
}): OriginalEmail {
  const lines = input.body.split("\n");

  for (const marker of FORWARD_MARKERS) {
    const idx = lines.findIndex((l) => marker.test(l));
    if (idx === -1) continue;
    const block = readHeaderBlock(lines, idx + 1);
    if (!block) continue;
    const from = parseAddress(block.from);
    return {
      fromAddress: from.address,
      fromDomain: from.domain,
      fromName: from.name,
      subject: block.subject?.trim() || input.subject.replace(FWD_SUBJECT, ""),
      date: parseLooseDate(block.date) ?? parseLooseDate(input.date),
      body: lines.slice(block.endIndex).join("\n").trim(),
      wasForwarded: true,
    };
  }

  // Outlook (newer) has no marker: a header block starting "From:" right
  // after the user's note, with "Sent:" instead of "Date:".
  if (FWD_SUBJECT.test(input.subject)) {
    const idx = lines.findIndex((l) => /^\*?From\*?:\s*\S/i.test(l.trim()));
    if (idx !== -1) {
      const block = readHeaderBlock(lines, idx);
      if (block) {
        const from = parseAddress(block.from);
        return {
          fromAddress: from.address,
          fromDomain: from.domain,
          fromName: from.name,
          subject:
            block.subject?.trim() || input.subject.replace(FWD_SUBJECT, ""),
          date: parseLooseDate(block.date) ?? parseLooseDate(input.date),
          body: lines.slice(block.endIndex).join("\n").trim(),
          wasForwarded: true,
        };
      }
    }
  }

  // Auto-forward (Gmail filter) or a direct send: headers are the original.
  const from = parseAddress(input.from);
  return {
    fromAddress: from.address,
    fromDomain: from.domain,
    fromName: from.name,
    subject: input.subject.replace(FWD_SUBJECT, ""),
    date: parseLooseDate(input.date),
    body: input.body.trim(),
    wasForwarded: false,
  };
}
