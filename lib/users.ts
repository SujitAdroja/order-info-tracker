import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { forwardingAddresses, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { formatForwardingAddress, generateLocalPart } from "@/lib/forwarding";

const MAX_LOCAL_PART_ATTEMPTS = 5;

/**
 * Returns the user's active forwarding address, creating one if missing.
 * Idempotent and safe under concurrent calls (partial unique index allows
 * one active address per user; local_part is globally unique forever).
 */
export async function ensureForwardingAddress(userId: string): Promise<string> {
  const db = getDb();
  const domain = env().INBOUND_DOMAIN;

  const findActive = () =>
    db.query.forwardingAddresses.findFirst({
      columns: { localPart: true },
      where: and(
        eq(forwardingAddresses.userId, userId),
        eq(forwardingAddresses.active, true),
      ),
    });

  const existing = await findActive();
  if (existing) return formatForwardingAddress(existing.localPart, domain);

  for (let attempt = 0; attempt < MAX_LOCAL_PART_ATTEMPTS; attempt++) {
    const inserted = await db
      .insert(forwardingAddresses)
      .values({ userId, localPart: generateLocalPart() })
      .onConflictDoNothing()
      .returning({ localPart: forwardingAddresses.localPart });

    if (inserted[0])
      return formatForwardingAddress(inserted[0].localPart, domain);

    // Conflict: either a concurrent request created this user's address, or the
    // random local part collided with an existing one. Re-check, then retry.
    const raced = await findActive();
    if (raced) return formatForwardingAddress(raced.localPart, domain);
  }
  throw new Error("forwarding_address_generation_failed");
}

export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown IANA timezone");

/**
 * Records the browser-detected timezone the first time we see it.
 * Later changes go through Settings (EC-DATE-08 recompute lands in Phase 5).
 */
export async function setDetectedTimezone(userId: string, tz: string) {
  const timezone = timezoneSchema.parse(tz);
  await getDb()
    .update(users)
    .set({ timezone, timezoneDetected: true })
    .where(and(eq(users.id, userId), eq(users.timezoneDetected, false)));
}
