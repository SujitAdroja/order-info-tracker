import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_PDF_ATTACHMENTS,
} from "@/lib/ingest/postmark";
import type { RawEmail } from "@/lib/ingest/types";

/**
 * Resend inbound ("Receiving"). The `email.received` webhook carries only
 * metadata; the body, headers and attachments are fetched from the Receiving
 * API during processing (so the retry cron covers fetch failures).
 * Docs: resend.com/docs/dashboard/receiving/introduction (read 2026-11-25).
 */

// ---------------------------------------------------------------------------
// Webhook signature (Resend signs with Svix: svix-id / -timestamp / -signature)
// ---------------------------------------------------------------------------

export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

/**
 * EC-SEC-01 for Resend. Signed content is `${id}.${timestamp}.${rawBody}`,
 * HMAC-SHA256 with the base64 secret after the `whsec_` prefix; the header
 * holds space-separated `v1,<base64>` entries. Old timestamps are rejected to
 * stop replays.
 */
export function verifyResendSignature(
  rawBody: string,
  h: SvixHeaders,
  secret: string,
  nowMs = Date.now(),
): boolean {
  if (!h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowMs / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key)
    .update(`${h.id}.${h.timestamp}.${rawBody}`)
    .digest();

  return h.signature.split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Builds the headers for a signed request (tests and the local mock). */
export function signResendPayload(
  rawBody: string,
  secret: string,
  id: string,
  nowMs = Date.now(),
) {
  const timestamp = String(Math.floor(nowMs / 1000));
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${sig}`,
  };
}

// ---------------------------------------------------------------------------
// Webhook payload
// ---------------------------------------------------------------------------

const addressList = z
  .array(z.string())
  .nullish()
  .transform((v) => v ?? []);

export const resendWebhookSchema = z.object({
  type: z.string(),
  created_at: z.string().nullish(),
  data: z.object({
    email_id: z.string().min(1).max(256),
    created_at: z.string().nullish(),
    from: z
      .string()
      .nullish()
      .transform((v) => v ?? ""),
    to: addressList,
    cc: addressList,
    bcc: addressList,
    received_for: addressList,
    message_id: z.string().nullish(),
    subject: z.string().nullish(),
  }),
});
export type ResendWebhook = z.infer<typeof resendWebhookSchema>;

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Every address the email was delivered to (received_for first: Gmail forwards). */
export function resendRecipients(d: ResendWebhook["data"]): string[] {
  const out = new Set<string>();
  for (const v of [...d.received_for, ...d.to, ...d.cc, ...d.bcc]) {
    for (const m of v.matchAll(EMAIL_IN_TEXT)) out.add(m[0].toLowerCase());
  }
  return [...out];
}

/** What we encrypt at receive time for Resend: a pointer, not content. */
export type ResendRef = { provider: "resend"; emailId: string };

export function isResendRef(v: unknown): v is ResendRef {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { provider?: unknown }).provider === "resend" &&
    typeof (v as { emailId?: unknown }).emailId === "string"
  );
}

// ---------------------------------------------------------------------------
// Receiving API
// ---------------------------------------------------------------------------

const headerValue = z.union([z.string(), z.array(z.string())]);

export const resendReceivedEmailSchema = z.object({
  id: z.string(),
  from: z.string().nullish(),
  to: addressList,
  cc: addressList,
  received_for: addressList,
  created_at: z.string().nullish(),
  subject: z.string().nullish(),
  html: z.string().nullish(),
  text: z.string().nullish(),
  headers: z.record(z.string(), headerValue).nullish(),
  attachments: z
    .array(
      z.object({
        id: z.string(),
        filename: z.string().nullish(),
        content_type: z.string().nullish(),
        size: z.number().nullish(),
      }),
    )
    .nullish(),
});
export type ResendReceivedEmail = z.infer<typeof resendReceivedEmailSchema>;

const attachmentListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      filename: z.string().nullish(),
      content_type: z.string().nullish(),
      size: z.number().nullish(),
      download_url: z.string(),
    }),
  ),
});

/** Why a fetch failed: retry later, or give up (email gone / bad config). */
export class ResendFetchError extends Error {
  constructor(
    public code:
      | "provider_unavailable"
      | "provider_not_found"
      | "provider_unauthorized"
      | "provider_bad_response",
    public retryable: boolean,
  ) {
    super(code);
  }
}

const KEEP_HEADERS = new Set([
  "x-forwarded-for",
  "x-forwarded-to",
  "x-gm-original-to",
  "auto-submitted",
  "date",
]);

function firstHeader(
  headers: ResendReceivedEmail["headers"],
  name: string,
): string | null {
  if (!headers) return null;
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === name) return Array.isArray(v) ? (v[0] ?? null) : v;
  }
  return null;
}

/** Maps a Receiving API email (+ downloaded PDFs) to the record we process. */
export function resendToRawEmail(
  email: ResendReceivedEmail,
  pdfAttachments: RawEmail["pdfAttachments"],
): RawEmail {
  const headers: RawEmail["headers"] = [];
  for (const [name, value] of Object.entries(email.headers ?? {})) {
    if (!KEEP_HEADERS.has(name.toLowerCase())) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      headers.push({ name, value: v.slice(0, 500) });
    }
  }
  const to = new Set<string>();
  for (const v of [...email.received_for, ...email.to, ...email.cc]) {
    for (const m of v.matchAll(EMAIL_IN_TEXT)) to.add(m[0].toLowerCase());
  }
  return {
    // headers.from keeps the display name ("Amazon.in <auto-confirm@amazon.in>").
    from: firstHeader(email.headers, "from") ?? email.from ?? "",
    to: [...to],
    subject: (email.subject ?? "").slice(0, 998),
    date: firstHeader(email.headers, "date") ?? email.created_at ?? null,
    text: email.text ?? null,
    html: email.html ?? null,
    headers: headers.filter((h) => h.name.toLowerCase() !== "date"),
    pdfAttachments,
  };
}

type FetchDeps = {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

async function getJson(url: string, deps: FetchDeps): Promise<unknown> {
  const f = deps.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(url, {
      headers: {
        authorization: `Bearer ${deps.apiKey}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(deps.timeoutMs ?? 15_000),
      cache: "no-store",
    });
  } catch {
    throw new ResendFetchError("provider_unavailable", true);
  }
  if (res.status === 404)
    throw new ResendFetchError("provider_not_found", false);
  // A wrong or send-only key won't fix itself, but the user may fix the key:
  // keep it retryable so the cron picks the email up once it's corrected.
  if (res.status === 401 || res.status === 403)
    throw new ResendFetchError("provider_unauthorized", true);
  if (!res.ok) throw new ResendFetchError("provider_unavailable", true);
  try {
    return await res.json();
  } catch {
    throw new ResendFetchError("provider_bad_response", true);
  }
}

/**
 * Fetches the full email and its PDF attachments (same limits as Postmark:
 * ≤5 PDFs, ≤5 MB each). Other attachment types are never downloaded.
 */
export async function fetchResendEmail(
  emailId: string,
  deps: FetchDeps,
): Promise<RawEmail> {
  const base = deps.baseUrl.replace(/\/+$/, "");
  const id = encodeURIComponent(emailId);
  const parsed = resendReceivedEmailSchema.safeParse(
    await getJson(`${base}/emails/receiving/${id}`, deps),
  );
  if (!parsed.success)
    throw new ResendFetchError("provider_bad_response", true);
  const email = parsed.data;

  const pdfs: RawEmail["pdfAttachments"] = [];
  const hasPdf = (email.attachments ?? []).some((a) =>
    isPdf(a.content_type, a.filename),
  );
  if (hasPdf) {
    const list = attachmentListSchema.safeParse(
      await getJson(
        `${base}/emails/receiving/${id}/attachments?limit=100`,
        deps,
      ),
    );
    if (!list.success)
      throw new ResendFetchError("provider_bad_response", true);
    for (const a of list.data.data) {
      if (!isPdf(a.content_type, a.filename)) continue;
      if (pdfs.length >= MAX_PDF_ATTACHMENTS) break;
      if ((a.size ?? 0) > MAX_ATTACHMENT_BYTES) continue;
      const bytes = await download(a.download_url, deps);
      if (!bytes) continue;
      pdfs.push({
        name: (a.filename ?? "attachment.pdf").slice(0, 200),
        base64: bytes.toString("base64"),
      });
    }
  }
  return resendToRawEmail(email, pdfs);
}

function isPdf(
  contentType: string | null | undefined,
  filename: string | null | undefined,
) {
  return (
    contentType?.toLowerCase() === "application/pdf" ||
    Boolean(filename?.toLowerCase().endsWith(".pdf"))
  );
}

/** Signed CDN URL (no auth header). Oversized or failed downloads are skipped (EC-ING-15). */
async function download(url: string, deps: FetchDeps): Promise<Buffer | null> {
  if (!/^https?:\/\//.test(url)) return null;
  const f = deps.fetchImpl ?? fetch;
  try {
    const res = await f(url, {
      signal: AbortSignal.timeout(deps.timeoutMs ?? 15_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_ATTACHMENT_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > MAX_ATTACHMENT_BYTES ? null : buf;
  } catch {
    return null; // EC-ING-15: skip the attachment, never fail the whole email
  }
}
