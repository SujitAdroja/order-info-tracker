import "server-only";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { inboundEmails } from "@/lib/db/schema";

export type UnreadableEmail = {
  id: string;
  fromDomain: string | null;
  receivedAt: Date;
  reviewReason: string | null;
};

/** EC-ING-09/17: emails we couldn't turn into a purchase (last 30 days). */
export async function listUnreadableEmails(
  userId: string,
): Promise<UnreadableEmail[]> {
  return getDb()
    .select({
      id: inboundEmails.id,
      fromDomain: inboundEmails.fromDomain,
      receivedAt: inboundEmails.receivedAt,
      reviewReason: inboundEmails.reviewReason,
    })
    .from(inboundEmails)
    .where(
      and(
        eq(inboundEmails.userId, userId),
        eq(inboundEmails.status, "needs_review"),
        isNull(inboundEmails.purchaseId),
        gt(inboundEmails.receivedAt, sql`now() - interval '30 days'`),
      ),
    )
    .orderBy(desc(inboundEmails.receivedAt))
    .limit(20);
}
