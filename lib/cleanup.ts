import "server-only";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { inboundEmails, purchases, users } from "@/lib/db/schema";
import { recomputePurchase } from "@/lib/purchases/service";
import { purgeOldRateLimits } from "@/lib/rate-limit";

/**
 * Daily cleanup (Section 4 `/api/cron/cleanup`):
 * - EC-ACC-07: hard-delete raw email content older than 24h, whatever its status.
 * - Expire Gmail verification codes after 7 days.
 * - Drop expired rate-limit windows (EC-SEC-04).
 * - Section 8 status auto-update + store-policy changes: recompute every
 *   open purchase (active / kept / expired).
 */
export async function runDailyCleanup() {
  const db = getDb();

  const purged = await db
    .update(inboundEmails)
    .set({
      rawEncrypted: null,
      // Anything still unprocessed can't be processed now.
      status: sql`case when ${inboundEmails.status} in ('pending','processing','failed') then 'needs_review' else ${inboundEmails.status} end`,
      reviewReason: sql`case when ${inboundEmails.status} in ('pending','processing','failed') then 'processing_failed' else ${inboundEmails.reviewReason} end`,
    })
    .where(
      and(
        sql`${inboundEmails.rawEncrypted} is not null`,
        lt(inboundEmails.receivedAt, sql`now() - interval '24 hours'`),
      ),
    )
    .returning({ id: inboundEmails.id });

  await db
    .update(users)
    .set({ pendingGmailCode: null, pendingGmailCodeExpiresAt: null })
    .where(lt(users.pendingGmailCodeExpiresAt, sql`now()`));

  const open = await db
    .select({ id: purchases.id, timezone: users.timezone })
    .from(purchases)
    .innerJoin(users, eq(users.id, purchases.userId))
    .where(
      and(
        isNull(purchases.deletedAt),
        isNull(users.deletedAt),
        inArray(purchases.status, ["active", "kept", "expired"]),
      ),
    );
  for (const p of open) await recomputePurchase(db, p.id, p.timezone);

  const rateLimitsPurged = await purgeOldRateLimits();

  return {
    rawPurged: purged.length,
    recomputed: open.length,
    rateLimitsPurged,
  };
}
