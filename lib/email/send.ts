import "server-only";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * Transactional email (reminder fallback). Uses Resend's REST API with the
 * same key and sender as magic links. In dev/test without a key, mail goes to
 * the e2e outbox folder or is skipped — never logged with its content.
 */
export async function sendEmail(mail: OutgoingEmail): Promise<boolean> {
  const e = env();
  if (e.E2E_MAGIC_LINK_DIR) {
    const dir = path.join(e.E2E_MAGIC_LINK_DIR, "outbox");
    const name = createHash("sha256")
      .update(mail.to.toLowerCase())
      .digest("hex");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, `${name}-${Date.now()}.json`),
      JSON.stringify(mail),
      "utf8",
    );
    return true;
  }
  if (!e.RESEND_API_KEY) {
    console.info("[email:dev] RESEND_API_KEY not set; reminder email skipped");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${e.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: e.EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.warn(`[email] send failed status=${res.status}`);
    return res.ok;
  } catch {
    console.warn("[email] send failed status=network");
    return false;
  }
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Absolute app URL for links in emails. */
export function appUrl(pathname: string): string {
  const base = env().AUTH_URL ?? "http://localhost:3000";
  return new URL(pathname, base).toString();
}
