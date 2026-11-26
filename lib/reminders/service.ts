import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, type Db, type Tx } from "@/lib/db";
import { purchases, reminders, users } from "@/lib/db/schema";
import { planReminders } from "@/lib/reminders/schedule";

/**
 * Section 9 "Regeneration": any change to a purchase's dates or status
 * deletes its unsent reminders and recreates them. Sent reminders stay (the
 * unique constraint stops a sent offset from being scheduled again).
 */
export async function regenerateReminders(
  db: Db | Tx,
  purchaseId: string,
  now: Date = new Date(),
): Promise<number> {
  await db
    .delete(reminders)
    .where(
      and(
        eq(reminders.purchaseId, purchaseId),
        isNull(reminders.sentAt),
        isNull(reminders.cancelledAt),
      ),
    );

  const p = await db.query.purchases.findFirst({
    where: and(eq(purchases.id, purchaseId), isNull(purchases.deletedAt)),
    columns: {
      id: true,
      userId: true,
      status: true,
      needsReview: true,
      createdAt: true,
      returnDeadline: true,
      nonReturnable: true,
      orderDate: true,
      shippingStatus: true,
      deliveryDate: true,
      deliveryDateEstimated: true,
    },
    with: {
      items: {
        columns: {
          id: true,
          itemStatus: true,
          warrantyEnd: true,
          extendedWarrantyEnd: true,
        },
      },
    },
  });
  if (!p) return 0; // deleted: unsent reminders are gone, nothing new (EC-PUSH-06)

  const user = await db.query.users.findFirst({
    where: and(eq(users.id, p.userId), isNull(users.deletedAt)),
    columns: { timezone: true, reminderHour: true },
  });
  if (!user) return 0;

  const planned = planReminders({
    ...p,
    timeZone: user.timezone,
    reminderHour: user.reminderHour,
    now,
  });
  if (!planned.length) return 0;

  const rows = await db
    .insert(reminders)
    .values(
      planned.map((r) => ({
        userId: p.userId,
        purchaseId: p.id,
        itemId: r.itemId,
        kind: r.kind,
        offsetLabel: r.offsetLabel,
        sendAt: r.sendAt,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: reminders.id });
  return rows.length;
}

/** EC-DATE-08: timezone or reminder-hour change → reschedule every open purchase. */
export async function regenerateUserReminders(
  userId: string,
  now = new Date(),
): Promise<void> {
  const db = getDb();
  const open = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.userId, userId), isNull(purchases.deletedAt)));
  for (const { id } of open) await regenerateReminders(db, id, now);
}
