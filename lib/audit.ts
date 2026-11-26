import "server-only";
import { getDb } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

/**
 * Phase 6 audit log: security-relevant account events. `meta` must never
 * hold email addresses, email content or secrets (EC-ACC-08). Best effort.
 */
export type AuditAction =
  | "auth.sign_in"
  | "auth.sign_out"
  | "account.export"
  | "account.delete"
  | "forwarding.regenerate"
  | "settings.update"
  | "push.subscribe"
  | "push.unsubscribe";

export async function audit(
  userId: string | null,
  action: AuditAction,
  meta?: Record<string, string | number | boolean | null>,
): Promise<void> {
  try {
    await getDb()
      .insert(auditLog)
      .values({ userId, action, meta: meta ?? null });
  } catch {
    console.warn(`[audit] failed to record ${action}`);
  }
}
