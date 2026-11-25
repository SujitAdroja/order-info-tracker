"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { pushSubscriptions, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  pushConfigured,
  sendPushToUser,
  syncPushEnabled,
} from "@/lib/push/send";
import { regenerateUserReminders } from "@/lib/reminders/service";
import { clampReminderHour } from "@/lib/reminders/schedule";
import { getCurrentUser } from "@/lib/session";
import { timezoneSchema } from "@/lib/users";

const base64url = z
  .string()
  .regex(/^[A-Za-z0-9_-]+={0,2}$/)
  .min(16)
  .max(256);

/** PushSubscription.toJSON() as the browser sends it. */
const subscriptionSchema = z.object({
  endpoint: z
    .url()
    .max(2048)
    .refine(
      (u) => u.startsWith("https://") || env().NODE_ENV !== "production",
      "Push endpoints must use HTTPS",
    ),
  keys: z.object({ p256dh: base64url, auth: base64url }),
  userAgent: z.string().max(300).optional(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Saves this device's push subscription (EC-PUSH-04: one row per device). */
export async function subscribePushAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid subscription" };
  const { endpoint, keys, userAgent } = parsed.data;
  // An endpoint belongs to one browser profile; if another account used this
  // browser before, the subscription moves to the signed-in user.
  await getDb()
    .insert(pushSubscriptions)
    .values({
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
        failedCount: 0,
      },
    });
  await syncPushEnabled(user.id);
  return { ok: true };
}

export async function unsubscribePushAction(
  endpoint: unknown,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = z.url().max(2048).safeParse(endpoint);
  if (!parsed.success) return { ok: false, error: "Invalid subscription" };
  await getDb()
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, parsed.data),
        eq(pushSubscriptions.userId, user.id),
      ),
    );
  await syncPushEnabled(user.id);
  return { ok: true };
}

export type TestResult =
  | { ok: true; delivered: number; devices: number }
  | { ok: false; error: string };

/** Settings "Send a test notification" (Section 11, screen 8). */
export async function sendTestNotificationAction(): Promise<TestResult> {
  const user = await getCurrentUser();
  if (!pushConfigured())
    return {
      ok: false,
      error: "Push isn't configured on the server (VAPID keys).",
    };
  const result = await sendPushToUser(user.id, {
    title: "Test notification",
    body: "Reminders will look like this. You're all set.",
    url: "/settings",
    tag: "test",
    actions: [],
    purchaseId: null,
  });
  if (result.attempted === 0)
    return { ok: false, error: "No devices have notifications turned on yet." };
  return { ok: true, delivered: result.delivered, devices: result.attempted };
}

const settingsSchema = z.object({
  reminderHour: z.coerce.number().int().min(0).max(23),
  timezone: timezoneSchema,
  emailRemindersEnabled: z.boolean(),
});

/** Reminder hour / timezone / email fallback. Reschedules reminders (EC-DATE-08). */
export async function updateReminderSettingsAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "Please check the values and try again." };
  const { timezone, emailRemindersEnabled } = parsed.data;
  const reminderHour = clampReminderHour(parsed.data.reminderHour);

  await getDb()
    .update(users)
    .set({
      reminderHour,
      timezone,
      emailRemindersEnabled,
      timezoneDetected: true,
    })
    .where(eq(users.id, user.id));
  if (reminderHour !== user.reminderHour || timezone !== user.timezone) {
    await regenerateUserReminders(user.id);
  }
  refresh();
  return { ok: true };
}
