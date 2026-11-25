import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import webpush from "web-push";
import { getDb } from "@/lib/db";
import { pushSubscriptions, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import type { NotificationMessage } from "@/lib/reminders/content";

export const MAX_PUSH_FAILURES = 5;

export function pushConfigured(): boolean {
  const e = env();
  return Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.VAPID_SUBJECT);
}

let configured = false;
function configure() {
  if (configured) return;
  const e = env();
  webpush.setVapidDetails(
    e.VAPID_SUBJECT!,
    e.VAPID_PUBLIC_KEY!,
    e.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export type PushOutcome = { delivered: number; attempted: number };

/**
 * Sends one notification to every device the user subscribed (EC-PUSH-04).
 * 404/410 → subscription deleted (EC-PUSH-03); other errors count up and the
 * subscription is dropped after 5 failures. Logs ids and status codes only.
 */
export async function sendPushToUser(
  userId: string,
  message: NotificationMessage,
): Promise<PushOutcome> {
  if (!pushConfigured()) return { delivered: 0, attempted: 0 };
  configure();
  const db = getDb();
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (!subs.length) return { delivered: 0, attempted: 0 };

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url,
    tag: message.tag,
    actions: message.actions,
    purchaseId: message.purchaseId,
  });

  let delivered = 0;
  const gone: string[] = [];
  const failed: string[] = [];
  const ok: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      const status = await deliver(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      if (status !== null && status >= 200 && status < 300) {
        delivered++;
        ok.push(s.id);
      } else if (status === 404 || status === 410) {
        gone.push(s.id);
      } else {
        failed.push(s.id);
        console.warn(`[push] ${s.id} failed status=${status ?? "network"}`);
      }
    }),
  );

  if (ok.length) {
    await db
      .update(pushSubscriptions)
      .set({ lastSuccessAt: new Date(), failedCount: 0 })
      .where(inArray(pushSubscriptions.id, ok));
  }
  if (failed.length) {
    await db
      .update(pushSubscriptions)
      .set({ failedCount: sql`${pushSubscriptions.failedCount} + 1` })
      .where(inArray(pushSubscriptions.id, failed));
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          inArray(pushSubscriptions.id, failed),
          gte(pushSubscriptions.failedCount, MAX_PUSH_FAILURES),
        ),
      );
  }
  if (gone.length)
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.id, gone));
  if (gone.length || failed.length) await syncPushEnabled(userId);

  return { delivered, attempted: subs.length };
}

/**
 * web-push does the RFC 8291 encryption and VAPID signing; the request itself
 * goes through fetch (timeouts, plain status codes). Returns the HTTP status,
 * or null on a network error.
 */
async function deliver(
  subscription: webpush.PushSubscription,
  payload: string,
): Promise<number | null> {
  try {
    const req = webpush.generateRequestDetails(subscription, payload, {
      TTL: 24 * 60 * 60,
      urgency: "normal",
    });
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (k.toLowerCase() !== "content-length") headers.set(k, String(v));
    }
    const res = await fetch(req.endpoint, {
      method: req.method,
      headers,
      body: new Uint8Array(req.body),
      signal: AbortSignal.timeout(10_000),
    });
    return res.status;
  } catch {
    return null;
  }
}

/** users.push_enabled mirrors "has at least one subscription". */
export async function syncPushEnabled(userId: string): Promise<void> {
  const db = getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  await db
    .update(users)
    .set({ pushEnabled: n > 0 })
    .where(eq(users.id, userId));
}
