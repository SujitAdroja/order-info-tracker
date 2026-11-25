import { after, type NextRequest } from "next/server";
import { processInboundEmail } from "@/lib/ingest/process";
import {
  MAX_PAYLOAD_BYTES,
  postmarkInboundSchema,
} from "@/lib/ingest/postmark";
import {
  checkResendSignature,
  checkWebhookAuth,
  envelopeFromPostmark,
  envelopeFromResend,
  receiveInbound,
  type InboundEnvelope,
} from "@/lib/ingest/receive";
import { resendWebhookSchema } from "@/lib/ingest/resend";

/**
 * Section 6.1: inbound email webhook. One URL serves both providers:
 * - Resend (default): Svix-signed `email.received` event, metadata only.
 * - Postmark: Basic auth, full email in the payload.
 * Responds fast and processes after the response via `after()`; the retry
 * cron picks up anything left behind. Never logs bodies, subjects or
 * addresses (EC-ACC-08).
 */
export async function POST(request: NextRequest) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_PAYLOAD_BYTES) return tooLarge();
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_PAYLOAD_BYTES) return tooLarge();

  const isResend = request.headers.has("svix-id");
  const auth = isResend
    ? checkResendSignature(text, {
        id: request.headers.get("svix-id"),
        timestamp: request.headers.get("svix-timestamp"),
        signature: request.headers.get("svix-signature"),
      })
    : checkWebhookAuth(request.headers.get("authorization"));
  if (auth === "not_configured") {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  if (auth === "unauthorized") {
    return Response.json(
      { error: "unauthorized" },
      {
        status: 401,
        headers: isResend
          ? {}
          : { "WWW-Authenticate": 'Basic realm="inbound"' },
      },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  let envelope: InboundEnvelope;
  if (isResend) {
    const parsed = resendWebhookSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ error: "invalid_payload" }, { status: 400 });
    }
    // Other event types (if the webhook subscribes to more) are acknowledged and dropped.
    if (parsed.data.type !== "email.received") {
      return Response.json({ ok: true, status: "ignored" });
    }
    envelope = envelopeFromResend(parsed.data);
  } else {
    const parsed = postmarkInboundSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ error: "invalid_payload" }, { status: 400 });
    }
    envelope = envelopeFromPostmark(parsed.data);
  }

  const result = await receiveInbound(envelope);
  if (result.kind === "accepted") {
    after(() => processInboundEmail(result.id));
  }
  // Always 200 for accepted/duplicate/ignored so the provider doesn't retry or bounce.
  return Response.json({ ok: true, status: result.kind });
}

function tooLarge() {
  console.warn("[inbound] payload_too_large");
  return Response.json({ error: "payload_too_large" }, { status: 413 });
}
