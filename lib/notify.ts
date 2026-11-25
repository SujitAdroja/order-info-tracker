import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { appUrl, escapeHtml, sendEmail } from "@/lib/email/send";
import { sendPushToUser } from "@/lib/push/send";
import type { NotificationMessage } from "@/lib/reminders/content";

/**
 * One-off account notices (not deadline reminders): push to every device,
 * email if no push got through. Best effort; never throws.
 */
export async function notifyUser(
  userId: string,
  notice: { title: string; body: string; url: string; tag: string },
): Promise<"push" | "email" | "none"> {
  try {
    const message: NotificationMessage = {
      ...notice,
      actions: [],
      purchaseId: null,
    };
    const push = await sendPushToUser(userId, message);
    if (push.delivered > 0) return "push";
    const user = await getDb().query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true, deletedAt: true },
    });
    if (!user || user.deletedAt) return "none";
    const link = appUrl(notice.url);
    const ok = await sendEmail({
      to: user.email,
      subject: notice.title,
      text: `${notice.body}\n\n${link}`,
      html: `<p>${escapeHtml(notice.body)}</p><p><a href="${escapeHtml(link)}">Open KeepTrack</a></p>`,
    });
    return ok ? "email" : "none";
  } catch {
    console.warn("[notify] failed");
    return "none";
  }
}
