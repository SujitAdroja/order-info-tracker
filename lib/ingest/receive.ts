import "server-only";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { forwardingAddresses, inboundEmails, users } from "@/lib/db/schema";
import { encrypt, safeEqual, sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { parseAddress } from "@/lib/ingest/parse-utils";
import {
  ourLocalParts,
  recipientAddresses,
  toRawEmail,
  type PostmarkInbound,
} from "@/lib/ingest/postmark";
import {
  resendRecipients,
  verifyResendSignature,
  type ResendRef,
  type ResendWebhook,
  type SvixHeaders,
} from "@/lib/ingest/resend";
import type { RawEmail } from "@/lib/ingest/types";

export const ADDRESS_GRACE_DAYS = 7; // EC-ING-13 / EC-ACC-06
export const RATE_LIMIT_PER_HOUR = 50; // EC-ING-14

/** EC-SEC-01: Basic auth configured in Postmark, compared in constant time. */
export function checkWebhookAuth(
  header: string | null,
): "ok" | "unauthorized" | "not_configured" {
  const e = env();
  if (!e.INBOUND_WEBHOOK_USER || !e.INBOUND_WEBHOOK_PASSWORD)
    return "not_configured";
  if (!header?.startsWith("Basic ")) return "unauthorized";
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  if (sep === -1) return "unauthorized";
  const okUser = safeEqual(decoded.slice(0, sep), e.INBOUND_WEBHOOK_USER);
  const okPass = safeEqual(decoded.slice(sep + 1), e.INBOUND_WEBHOOK_PASSWORD);
  return okUser && okPass ? "ok" : "unauthorized";
}

/** EC-SEC-01 for Resend: Svix signature over the raw body. */
export function checkResendSignature(
  rawBody: string,
  headers: SvixHeaders,
): "ok" | "unauthorized" | "not_configured" {
  const secret = env().RESEND_WEBHOOK_SECRET;
  if (!secret) return "not_configured";
  return verifyResendSignature(rawBody, headers, secret)
    ? "ok"
    : "unauthorized";
}

/**
 * Provider-neutral view of an inbound delivery. `stored` is what gets
 * encrypted: the email itself (Postmark) or a pointer to fetch it (Resend).
 */
export type InboundEnvelope = {
  providerMessageId: string;
  from: string;
  subject: string;
  recipients: string[];
  stored: RawEmail | ResendRef;
};

export function envelopeFromPostmark(p: PostmarkInbound): InboundEnvelope {
  return {
    providerMessageId: p.MessageID,
    from: p.FromFull?.Email || p.From,
    subject: p.Subject ?? "",
    recipients: recipientAddresses(p),
    stored: toRawEmail(p).raw,
  };
}

export function envelopeFromResend(w: ResendWebhook): InboundEnvelope {
  return {
    // Namespaced so ids from two providers can never collide.
    providerMessageId: `resend:${w.data.email_id}`,
    from: w.data.from,
    subject: w.data.subject ?? "",
    recipients: resendRecipients(w.data),
    stored: { provider: "resend", emailId: w.data.email_id },
  };
}

export type ReceiveResult =
  | { kind: "duplicate" }
  | { kind: "ignored"; reason: "unknown_recipient" | "rate_limited" }
  | { kind: "accepted"; id: string };

export async function receiveInbound(
  p: InboundEnvelope,
): Promise<ReceiveResult> {
  const db = getDb();
  const e = env();

  // EC-ING-01: provider retries are no-ops.
  const dupe = await db.query.inboundEmails.findFirst({
    where: eq(inboundEmails.providerMessageId, p.providerMessageId),
    columns: { id: true },
  });
  if (dupe) return { kind: "duplicate" };

  const fromDomain = parseAddress(p.from).domain;
  const subjectHash = sha256Hex(p.subject);

  // Section 6.1 step 4: resolve the user from any of our recipient addresses.
  const localParts = ourLocalParts(p.recipients, e.INBOUND_DOMAIN);
  const address = localParts.length
    ? await db.query.forwardingAddresses.findFirst({
        where: and(
          inArray(forwardingAddresses.localPart, localParts),
          or(
            eq(forwardingAddresses.active, true),
            gt(
              forwardingAddresses.deactivatedAt,
              sql`now() - make_interval(days => ${ADDRESS_GRACE_DAYS})`,
            ),
          ),
        ),
        columns: { userId: true },
      })
    : null;
  const owner = address
    ? await db.query.users.findFirst({
        where: and(eq(users.id, address.userId), isNull(users.deletedAt)),
        columns: { id: true },
      })
    : null;

  const ignore = async (
    reason: "unknown_recipient" | "rate_limited",
    userId: string | null,
  ) => {
    await db
      .insert(inboundEmails)
      .values({
        userId,
        providerMessageId: p.providerMessageId,
        fromDomain,
        subjectHash,
        status: "ignored",
        errorCode: reason,
        processedAt: new Date(),
      })
      .onConflictDoNothing();
    return { kind: "ignored" as const, reason };
  };

  // Never bounce (avoids backscatter): record and drop.
  if (!owner) return ignore("unknown_recipient", null);

  // EC-ING-14: leaked address / spam flood.
  const [{ recent }] = await db
    .select({ recent: sql<number>`count(*)`.mapWith(Number) })
    .from(inboundEmails)
    .where(
      and(
        eq(inboundEmails.userId, owner.id),
        sql`${inboundEmails.receivedAt} > now() - interval '1 hour'`,
      ),
    );
  if (recent >= RATE_LIMIT_PER_HOUR) {
    // TODO EC-ING-14 (Phase 5): notify the user to regenerate their address.
    return ignore("rate_limited", owner.id);
  }

  if (!e.DATA_ENCRYPTION_KEY) throw new Error("encryption_not_configured");
  const [row] = await db
    .insert(inboundEmails)
    .values({
      userId: owner.id,
      providerMessageId: p.providerMessageId,
      fromDomain,
      subjectHash,
      rawEncrypted: encrypt(JSON.stringify(p.stored), e.DATA_ENCRYPTION_KEY),
      status: "pending",
    })
    .onConflictDoNothing({ target: inboundEmails.providerMessageId })
    .returning({ id: inboundEmails.id });

  return row ? { kind: "accepted", id: row.id } : { kind: "duplicate" };
}
