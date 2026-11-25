"use server";

import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { processInboundEmail } from "@/lib/ingest/process";
import { receiveInbound } from "@/lib/ingest/receive";
import { getCurrentUser } from "@/lib/session";
import { ensureForwardingAddress } from "@/lib/users";

/**
 * Development only: feeds a pasted email through the same receive → process
 * pipeline a provider webhook uses, addressed to the signed-in user.
 */
const pasteSchema = z.object({
  from: z.string().trim().min(3).max(300),
  subject: z.string().trim().max(998),
  body: z.string().trim().min(1, "Paste the email text").max(200_000),
});

export type PasteEmailResult =
  | { ok: true; status: "accepted" | "duplicate" | "ignored" }
  | { ok: false; error: string };

export async function pasteEmailAction(
  input: unknown,
): Promise<PasteEmailResult> {
  if (env().NODE_ENV === "production")
    return { ok: false, error: "Not available" };
  const user = await getCurrentUser();
  const parsed = pasteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  if (!env().DATA_ENCRYPTION_KEY) {
    return { ok: false, error: "Set DATA_ENCRYPTION_KEY in .env first" };
  }

  const address = await ensureForwardingAddress(user.id);
  const { from, subject, body } = parsed.data;
  const result = await receiveInbound({
    providerMessageId: `dev:${randomUUID()}`,
    from,
    subject,
    recipients: [address],
    stored: {
      from,
      to: [address],
      subject,
      date: new Date().toUTCString(),
      text: body,
      html: null,
      headers: [],
      pdfAttachments: [],
    },
  });
  if (result.kind === "accepted") after(() => processInboundEmail(result.id));
  return {
    ok: true,
    status: result.kind,
  };
}
