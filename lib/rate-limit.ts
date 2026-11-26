import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { env } from "@/lib/env";

/**
 * EC-SEC-04: fixed-window rate limits in Postgres (no extra service).
 * Keys are hashed, so the table never holds raw emails or IP addresses.
 */
export type Limit = { limit: number; windowSeconds: number };

export const LIMITS = {
  signInEmailPerAddress: { limit: 5, windowSeconds: 60 * 60 },
  signInCodeAttempts: { limit: 10, windowSeconds: 15 * 60 },
  export: { limit: 10, windowSeconds: 24 * 60 * 60 },
  regenerateAddress: { limit: 3, windowSeconds: 24 * 60 * 60 },
  // Shared/uploaded receipts (share spec 3.4: ~20 a day per user).
  receiptUpload: { limit: 20, windowSeconds: 24 * 60 * 60 },
  heicConvert: { limit: 40, windowSeconds: 24 * 60 * 60 },
} satisfies Record<string, Limit>;

export function signInIpLimit(): Limit {
  return { limit: env().SIGNIN_IP_LIMIT_PER_HOUR, windowSeconds: 60 * 60 };
}

export function rateKey(scope: string, value: string): string {
  return `${scope}:${createHash("sha256").update(value.toLowerCase()).digest("hex").slice(0, 32)}`;
}

/**
 * Counts one attempt. Returns ok=false once the window's limit is passed,
 * with the seconds until it resets.
 */
export async function consume(
  key: string,
  { limit, windowSeconds }: Limit,
): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  const window = sql`make_interval(secs => ${windowSeconds})`;
  const [row] = await getDb()
    .insert(rateLimits)
    .values({ key, windowStart: sql`now()`, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} <= now() - ${window} then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} <= now() - ${window} then now() else ${rateLimits.windowStart} end`,
      },
    })
    .returning({
      count: rateLimits.count,
      resetIn:
        sql<number>`greatest(0, ceil(extract(epoch from (${rateLimits.windowStart} + ${window} - now()))))`.mapWith(
          Number,
        ),
    });
  return { ok: row.count <= limit, retryAfterSeconds: row.resetIn };
}

/** Best-effort client IP (Vercel sets x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

/** Daily cleanup: drop windows that ended more than a day ago. */
export async function purgeOldRateLimits(): Promise<number> {
  const rows = await getDb()
    .delete(rateLimits)
    .where(sql`${rateLimits.windowStart} < now() - interval '2 days'`)
    .returning({ key: rateLimits.key });
  return rows.length;
}

export function minutesText(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return m >= 60
    ? `${Math.ceil(m / 60)} hour${m >= 120 ? "s" : ""}`
    : `${m} minute${m === 1 ? "" : "s"}`;
}
