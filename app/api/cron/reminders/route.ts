import { cronAuthorized, unauthorized } from "@/lib/cron";
import { sendDueReminders } from "@/lib/reminders/send";

/** Every 15 min: send due reminders by push, email fallback (Section 9, F6). */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) return unauthorized();
  const summary = await sendDueReminders();
  console.info(
    `[reminders] due=${summary.due} sent=${summary.sent} push=${summary.push} email=${summary.email} cancelled=${summary.cancelled} postponed=${summary.postponed}`,
  );
  return Response.json({ ok: true, ...summary });
}
