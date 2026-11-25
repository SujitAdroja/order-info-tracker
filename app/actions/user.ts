"use server";

import { regenerateUserReminders } from "@/lib/reminders/service";
import { getCurrentUser } from "@/lib/session";
import { setDetectedTimezone, timezoneSchema } from "@/lib/users";

/** F1/Section 5: store the browser timezone on first login. */
export async function syncDetectedTimezone(tz: string) {
  const parsed = timezoneSchema.safeParse(tz);
  if (!parsed.success) return { ok: false as const };
  const user = await getCurrentUser();
  if (await setDetectedTimezone(user.id, parsed.data)) {
    await regenerateUserReminders(user.id); // EC-DATE-08
  }
  return { ok: true as const };
}
