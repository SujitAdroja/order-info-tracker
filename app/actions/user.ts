"use server";

import { getCurrentUser } from "@/lib/session";
import { setDetectedTimezone, timezoneSchema } from "@/lib/users";

/** F1/Section 5: store the browser timezone on first login. */
export async function syncDetectedTimezone(tz: string) {
  const parsed = timezoneSchema.safeParse(tz);
  if (!parsed.success) return { ok: false as const };
  const user = await getCurrentUser();
  await setDetectedTimezone(user.id, parsed.data);
  return { ok: true as const };
}
