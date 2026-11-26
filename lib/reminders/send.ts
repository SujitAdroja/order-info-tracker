import "server-only";
import { and, asc, inArray, isNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { purchaseItems, purchases, reminders, users } from "@/lib/db/schema";
import { endOfDayInTimeZone, maxISO } from "@/lib/dates";
import { appUrl, escapeHtml, sendEmail } from "@/lib/email/send";
import { sendPushToUser } from "@/lib/push/send";
import {
  digestMessage,
  reminderMessage,
  type NotificationMessage,
  type ReminderContext,
} from "@/lib/reminders/content";
import { isInTransit } from "@/lib/purchases/order-stage";
import { isQuietHour, shiftOutOfQuietHours } from "@/lib/reminders/schedule";

export const SEND_BATCH = 500;

export type SendSummary = {
  due: number;
  sent: number;
  cancelled: number;
  postponed: number;
  push: number;
  email: number;
  none: number;
  retryLater: number;
};

/**
 * Section 9 "Sending" (`/api/cron/reminders`, every 15 min). Rows are locked
 * with FOR UPDATE SKIP LOCKED, so overlapping runs never double-send.
 * Logs counts only (EC-ACC-08).
 */
export async function sendDueReminders(
  now: Date = new Date(),
): Promise<SendSummary> {
  const summary: SendSummary = {
    due: 0,
    sent: 0,
    cancelled: 0,
    postponed: 0,
    push: 0,
    email: 0,
    none: 0,
    retryLater: 0,
  };

  await getDb().transaction(async (tx) => {
    const due = await tx
      .select({
        id: reminders.id,
        kind: reminders.kind,
        userId: reminders.userId,
        purchaseId: reminders.purchaseId,
        itemId: reminders.itemId,
      })
      .from(reminders)
      .where(
        and(
          lte(reminders.sendAt, now),
          isNull(reminders.sentAt),
          isNull(reminders.cancelledAt),
        ),
      )
      .orderBy(asc(reminders.sendAt))
      .limit(SEND_BATCH)
      .for("update", { skipLocked: true });
    summary.due = due.length;
    if (!due.length) return;

    const purchaseRows = await tx
      .select()
      .from(purchases)
      .where(inArray(purchases.id, [...new Set(due.map((r) => r.purchaseId))]));
    const itemRows = await tx
      .select()
      .from(purchaseItems)
      .where(
        inArray(
          purchaseItems.purchaseId,
          purchaseRows.map((p) => p.id),
        ),
      )
      .orderBy(asc(purchaseItems.name));
    const userRows = await tx
      .select({
        id: users.id,
        email: users.email,
        timezone: users.timezone,
        emailRemindersEnabled: users.emailRemindersEnabled,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(inArray(users.id, [...new Set(due.map((r) => r.userId))]));

    const purchaseById = new Map(purchaseRows.map((p) => [p.id, p]));
    const userById = new Map(userRows.map((u) => [u.id, u]));
    const itemById = new Map(itemRows.map((i) => [i.id, i]));
    const firstItem = new Map<string, string>();
    for (const i of itemRows)
      if (!firstItem.has(i.purchaseId)) firstItem.set(i.purchaseId, i.name);

    const cancel: string[] = [];
    const byUser = new Map<
      string,
      { ids: string[]; messages: NotificationMessage[] }
    >();

    for (const r of due) {
      const p = purchaseById.get(r.purchaseId);
      const u = userById.get(r.userId);
      if (!p || p.deletedAt || !u || u.deletedAt) {
        cancel.push(r.id);
        continue;
      }
      const item = r.itemId ? itemById.get(r.itemId) : undefined;
      const warrantyEnd =
        item?.warrantyEnd && item.extendedWarrantyEnd
          ? maxISO(item.warrantyEnd, item.extendedWarrantyEnd)
          : (item?.warrantyEnd ?? item?.extendedWarrantyEnd ?? null);

      // EC-PUSH-06: re-check the purchase still needs this reminder.
      let lastMoment: Date | null = null;
      let valid: boolean;
      switch (r.kind) {
        case "return":
          valid =
            p.status === "active" && !!p.returnDeadline && !p.nonReturnable;
          if (valid)
            lastMoment = endOfDayInTimeZone(p.returnDeadline!, u.timezone);
          break;
        case "warranty":
          valid =
            (p.status === "active" || p.status === "kept") &&
            !!item &&
            (item.itemStatus === "active" || item.itemStatus === "kept") &&
            !!warrantyEnd;
          if (valid) lastMoment = endOfDayInTimeZone(warrantyEnd!, u.timezone);
          break;
        case "review_needed":
          valid = p.needsReview && p.status !== "cancelled";
          break;
        case "delivery_check":
          valid = isInTransit(p); // EC-PUSH-06: delivered/cancelled → drop
          break;
        default:
          valid = false; // claim_followup: built with Phase 6 claims (Section 9)
      }
      if (!valid || (lastMoment && now > lastMoment)) {
        cancel.push(r.id);
        continue;
      }

      // Section 9 step 7: quiet hours 22:00–08:00 local → shift to 08:00.
      if (isQuietHour(now, u.timezone)) {
        const later = shiftOutOfQuietHours(now, u.timezone);
        if (lastMoment && later > lastMoment) {
          cancel.push(r.id);
        } else {
          await tx
            .update(reminders)
            .set({ sendAt: later })
            .where(inArray(reminders.id, [r.id]));
          summary.postponed++;
        }
        continue;
      }

      const ctx: ReminderContext = {
        kind: r.kind,
        purchaseId: p.id,
        storeName: p.storeName,
        itemName: item?.name ?? firstItem.get(p.id) ?? null,
        totalAmount: p.totalAmount,
        currency: p.currency,
        returnDeadline: p.returnDeadline,
        warrantyEnd,
      };
      const entry = byUser.get(u.id) ?? { ids: [], messages: [] };
      entry.ids.push(r.id);
      entry.messages.push(reminderMessage(ctx, u.timezone, now));
      byUser.set(u.id, entry);
    }

    if (cancel.length) {
      await tx
        .update(reminders)
        .set({ cancelledAt: now })
        .where(inArray(reminders.id, cancel));
      summary.cancelled += cancel.length;
    }

    for (const [userId, { ids, messages }] of byUser) {
      const u = userById.get(userId)!;
      // EC-PUSH-05: more than one due → one digest.
      const message =
        messages.length > 1 ? digestMessage(messages) : messages[0];

      let channel: "push" | "email" | null = null;
      const push = await sendPushToUser(userId, message);
      if (push.delivered > 0) channel = "push";
      else if (u.emailRemindersEnabled) {
        const ok = await sendEmail(reminderEmail(u.email, message, messages));
        if (!ok) {
          summary.retryLater += ids.length; // transient: next run tries again
          continue;
        }
        channel = "email";
      }

      await tx
        .update(reminders)
        .set({ sentAt: now, channelUsed: channel })
        .where(inArray(reminders.id, ids));
      summary.sent += ids.length;
      if (channel === "push") summary.push++;
      else if (channel === "email") summary.email++;
      else summary.none++;
    }
  });

  return summary;
}

function reminderEmail(
  to: string,
  message: NotificationMessage,
  all: NotificationMessage[],
) {
  const lines =
    all.length > 1 ? all.map((m) => `• ${m.title}: ${m.body}`) : [message.body];
  const link = appUrl(message.url);
  const settings = appUrl("/settings");
  const text = [
    message.title,
    "",
    ...lines,
    "",
    `Open KeepTrack: ${link}`,
    "",
    `You get this email because push notifications aren't set up on any device. Change it in Settings: ${settings}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5">
<h2 style="margin:0 0 12px">${escapeHtml(message.title)}</h2>
<ul style="padding-left:18px">${(all.length > 1 ? all : [message])
    .map(
      (m) =>
        `<li>${all.length > 1 ? `<strong>${escapeHtml(m.title)}</strong> — ` : ""}${escapeHtml(m.body)}</li>`,
    )
    .join("")}</ul>
<p><a href="${escapeHtml(link)}">Open KeepTrack</a></p>
<p style="color:#666;font-size:12px">You get this email because push notifications aren't set up on any device.
<a href="${escapeHtml(settings)}">Change it in Settings</a>.</p>
</body></html>`;
  return { to, subject: message.title, text, html };
}
