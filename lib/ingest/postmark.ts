import { z } from "zod";
import { LOCAL_PART_PATTERN } from "@/lib/forwarding";
import type { RawEmail } from "@/lib/ingest/types";

/** Postmark inbound webhook JSON (only the fields we use). */
const addressSchema = z.object({
  Email: z.string().default(""),
  Name: z.string().nullish(),
});

export const postmarkInboundSchema = z.object({
  MessageID: z.string().min(1).max(256),
  From: z.string().default(""),
  FromFull: addressSchema.nullish(),
  To: z.string().nullish(),
  ToFull: z.array(addressSchema).nullish(),
  Cc: z.string().nullish(),
  CcFull: z.array(addressSchema).nullish(),
  OriginalRecipient: z.string().nullish(),
  Subject: z.string().nullish(),
  Date: z.string().nullish(),
  TextBody: z.string().nullish(),
  HtmlBody: z.string().nullish(),
  Headers: z.array(z.object({ Name: z.string(), Value: z.string() })).nullish(),
  Attachments: z
    .array(
      z.object({
        Name: z.string().default("attachment"),
        Content: z.string().default(""),
        ContentType: z.string().default(""),
        ContentLength: z.number().nullish(),
      }),
    )
    .nullish(),
});
export type PostmarkInbound = z.infer<typeof postmarkInboundSchema>;

export const MAX_PAYLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Every address the email was delivered to (To, Cc, OriginalRecipient). */
export function recipientAddresses(p: PostmarkInbound): string[] {
  const out = new Set<string>();
  const add = (v: string | null | undefined) => {
    if (!v) return;
    for (const m of v.matchAll(
      /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    )) {
      out.add(m[0].toLowerCase());
    }
  };
  add(p.OriginalRecipient);
  p.ToFull?.forEach((a) => add(a.Email));
  p.CcFull?.forEach((a) => add(a.Email));
  add(p.To);
  add(p.Cc);
  return [...out];
}

/** Section 6.1 step 4: local parts of recipients on our inbound domain. */
export function ourLocalParts(
  addresses: string[],
  inboundDomain: string,
): string[] {
  const domain = `@${inboundDomain.toLowerCase()}`;
  return [
    ...new Set(
      addresses
        .filter((a) => a.endsWith(domain))
        .map((a) => a.slice(0, -domain.length).split("+")[0])
        .filter((lp) => LOCAL_PART_PATTERN.test(lp)),
    ),
  ];
}

/**
 * The minimal raw record we encrypt and keep for ≤24h: bodies, a few
 * headers, and PDF attachments within limits. Everything else is dropped.
 */
export function toRawEmail(p: PostmarkInbound): {
  raw: RawEmail;
  skippedAttachments: number;
} {
  const pdfs: RawEmail["pdfAttachments"] = [];
  let skipped = 0;
  for (const a of p.Attachments ?? []) {
    const isPdf = a.ContentType.toLowerCase() === "application/pdf";
    const size = a.ContentLength ?? Math.floor((a.Content.length * 3) / 4);
    if (!isPdf) continue;
    if (pdfs.length >= MAX_PDF_ATTACHMENTS || size > MAX_ATTACHMENT_BYTES) {
      skipped++;
      continue;
    }
    pdfs.push({ name: a.Name.slice(0, 200), base64: a.Content });
  }

  const keepHeaders = new Set([
    "x-forwarded-for",
    "x-forwarded-to",
    "x-gm-original-to",
    "auto-submitted",
  ]);
  return {
    raw: {
      from: p.FromFull?.Email
        ? `${p.FromFull.Name ? `"${p.FromFull.Name}" ` : ""}<${p.FromFull.Email}>`
        : p.From,
      to: recipientAddresses(p),
      subject: (p.Subject ?? "").slice(0, 998),
      date: p.Date ?? null,
      text: p.TextBody ?? null,
      html: p.HtmlBody ?? null,
      headers: (p.Headers ?? [])
        .filter((h) => keepHeaders.has(h.Name.toLowerCase()))
        .map((h) => ({ name: h.Name, value: h.Value.slice(0, 500) })),
      pdfAttachments: pdfs,
    },
    skippedAttachments: skipped,
  };
}

/** Gmail auto-forwarding adds X-Forwarded-For / X-Forwarded-To (F2 step 4). */
export function isAutoForwarded(raw: RawEmail): boolean {
  return raw.headers.some((h) =>
    ["x-forwarded-for", "x-forwarded-to"].includes(h.name.toLowerCase()),
  );
}
