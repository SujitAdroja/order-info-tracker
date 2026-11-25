import { createECDH, createHash, randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { addDaysISO, todayInTimeZone } from "../../lib/dates";
import {
  E2E_SECRETS,
  MAGIC_LINK_DIR,
  MOCK_RESEND_URL,
} from "../../playwright.config";
import { signUp } from "./helpers";

// Phase 5: reminders, push, email fallback, PWA. Server-side flows run once (desktop).
test.skip(({ isMobile }) => isMobile, "reminder pipeline runs once (desktop)");

/**
 * A real timezone where it's currently mid-afternoon, so "today's" reminders
 * are due right away and never fall in quiet hours (22:00–08:00).
 */
const ZONES = [
  "Pacific/Pago_Pago",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Atlantic/South_Georgia",
  "Atlantic/Azores",
  "UTC",
  "Europe/Paris",
  "Europe/Athens",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Brisbane",
  "Pacific/Noumea",
  "Pacific/Auckland",
  "Pacific/Kiritimati",
];
const hourIn = (tz: string) =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
const TZ = ZONES.find((z) => hourIn(z) >= 12 && hourIn(z) <= 18) ?? "UTC";
test.use({ timezoneId: TZ });
const today = () => todayInTimeZone(TZ);

const CRON = { authorization: `Bearer ${E2E_SECRETS.CRON_SECRET}` };

function db() {
  return postgres(
    process.env.DATABASE_URL ??
      "postgres://keeptrack:keeptrack@localhost:5434/keeptrack",
    { max: 1 },
  );
}

async function signUpInZone(page: Page) {
  const email = await signUp(page);
  // First login stores the browser timezone (F1); reminders depend on it.
  await expect(async () => {
    await page.goto("/settings");
    await expect(page.getByTestId("account-timezone")).toHaveText(TZ);
  }).toPass({ timeout: 20_000 });
  return email;
}

async function addPurchase(
  page: Page,
  item: string,
  deliveredDaysAgo: number,
  returnDays: number,
) {
  await page.goto("/add");
  await page.getByLabel("Store").fill("Amazon.in");
  await page
    .getByLabel("Order date")
    .fill(addDaysISO(today(), -deliveredDaysAgo - 2));
  await page
    .getByLabel("Delivery date")
    .fill(addDaysISO(today(), -deliveredDaysAgo));
  await page.getByLabel("Return window (days)").fill(String(returnDays));
  await page.getByLabel("Item name").fill(item);
  await page.getByLabel("Price").fill("1299");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

/** A push subscription whose endpoint is the local fake push service. */
async function addFakeDevice(email: string, id = randomUUID()) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const sql = db();
  try {
    await sql`
      insert into push_subscriptions (user_id, endpoint, p256dh, auth)
      select id, ${`${MOCK_RESEND_URL}/push/${id}`}, ${ecdh.getPublicKey("base64url")},
             ${randomBytes(16).toString("base64url")}
      from users where email = ${email}`;
  } finally {
    await sql.end();
  }
  return id;
}

async function pushesTo(
  id: string,
): Promise<{ bytes: number; encoding: string; vapid: boolean }[]> {
  return (await fetch(`${MOCK_RESEND_URL}/__push/${id}`)).json();
}

async function remindersOf(purchaseId: string) {
  const sql = db();
  try {
    return await sql<
      {
        kind: string;
        offset_label: string;
        sent_at: Date | null;
        channel_used: string | null;
      }[]
    >`
      select kind, offset_label, sent_at, channel_used from reminders
      where purchase_id = ${purchaseId} order by send_at`;
  } finally {
    await sql.end();
  }
}

async function outboxFor(email: string) {
  const dir = path.join(MAGIC_LINK_DIR, "outbox");
  const prefix = createHash("sha256").update(email.toLowerCase()).digest("hex");
  const files = (await readdir(dir).catch(() => [])).filter((f) =>
    f.startsWith(prefix),
  );
  return Promise.all(
    files.map(
      async (f) =>
        JSON.parse(await readFile(path.join(dir, f), "utf8")) as {
          subject: string;
          text: string;
        },
    ),
  );
}

test("PWA basics: manifest, icons, service worker headers", async ({
  request,
}) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    short_name: "KeepTrack",
    display: "standalone",
    start_url: "/dashboard",
  });
  expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toEqual([
    "any",
    "any",
    "maskable",
  ]);
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).status()).toBe(200);
  }
  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  expect(await sw.text()).toContain('addEventListener("push"');
  expect((await request.get("/api/purchases")).status()).toBe(401);
});

test("reminders: scheduled on save, emailed when no device has push, then stop after Returned", async ({
  page,
  request,
}) => {
  const email = await signUpInZone(page);
  // Delivered 9 days ago with a 10-day window → closes tomorrow.
  const id = await addPurchase(page, "Boat Airdopes 141", 9, 10);

  // T-1 is due now (today's reminder hour has passed); T-0 is tomorrow.
  const planned = await remindersOf(id);
  expect(planned.map((r) => r.offset_label)).toEqual(["T-1", "T-0"]);

  const run = await (
    await request.get("/api/cron/reminders", { headers: CRON })
  ).json();
  expect(run).toMatchObject({ ok: true });
  await expect
    .poll(async () => (await remindersOf(id))[0].channel_used)
    .toBe("email");

  const mails = await outboxFor(email);
  expect(mails.map((m) => m.subject)).toContain(
    "Return window closes tomorrow",
  );
  expect(mails[0].text).toContain("Boat Airdopes 141 · Amazon.in · ₹1,299");
  expect(mails[0].text).toContain(`/purchases/${id}`);

  // EC-PUSH-06: Returned → the unsent T-0 is removed; the sent T-1 stays as history.
  await page.goto(`/purchases/${id}`);
  await page.getByRole("button", { name: "Returned" }).click();
  await expect(page.getByTestId("status-badge")).toHaveText("Returned");
  expect((await remindersOf(id)).map((r) => r.offset_label)).toEqual(["T-1"]);

  // Cron endpoint needs the secret (EC-SEC-06).
  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
});

test("push: delivered to every device, digest for several, expired device removed", async ({
  page,
  request,
}) => {
  const email = await signUpInZone(page);
  const phone = await addFakeDevice(email);
  const laptop = await addFakeDevice(email);
  const expired = await addFakeDevice(email, `gone-${randomUUID()}`);

  const a = await addPurchase(page, "Kettle", 9, 10); // closes tomorrow
  const b = await addPurchase(page, "Headphones", 10, 10); // closes today

  await request.get("/api/cron/reminders", { headers: CRON });
  await expect
    .poll(async () => (await remindersOf(a))[0].channel_used)
    .toBe("push");
  expect((await remindersOf(b))[0].channel_used).toBe("push");

  // EC-PUSH-04 + EC-PUSH-05: one encrypted, VAPID-signed digest per device.
  for (const device of [phone, laptop]) {
    const got = await pushesTo(device);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ encoding: "aes128gcm", vapid: true });
  }
  // EC-PUSH-03: 410 → subscription deleted.
  const sql = db();
  try {
    const rows =
      await sql`select endpoint from push_subscriptions where endpoint like ${`%${expired}`}`;
    expect(rows).toHaveLength(0);
  } finally {
    await sql.end();
  }
  expect(await outboxFor(email)).toHaveLength(0); // push worked → no email
});

test("notification 'Keeping it' button updates the purchase", async ({
  page,
}) => {
  await signUpInZone(page);
  const id = await addPurchase(page, "Desk lamp", 2, 10);
  // Same request the service worker sends (session cookie, same origin).
  const res = await page.request.post("/api/notifications/action", {
    data: { purchaseId: id, action: "kept" },
  });
  expect(res.status()).toBe(200);
  await page.goto(`/purchases/${id}`);
  await expect(page.getByTestId("status-badge")).toHaveText("Keeping");
  expect((await remindersOf(id)).filter((r) => r.kind === "return")).toEqual(
    [],
  );

  const bad = await page.request.post("/api/notifications/action", {
    data: { purchaseId: randomUUID(), action: "kept" },
  });
  expect(bad.status()).toBe(404);
});

test("settings: reminder hour change reschedules (EC-DATE-08); notification and install cards", async ({
  page,
  context,
}) => {
  await signUpInZone(page);
  const id = await addPurchase(page, "Blender", 1, 30); // T-7 etc. in the future
  const before = await remindersOf(id);
  expect(before.map((r) => r.offset_label)).toEqual([
    "T-7",
    "T-3",
    "T-1",
    "T-0",
  ]);

  // Headless Chromium may report notifications as blocked even when granted;
  // either way the card must explain the state (EC-PUSH-02: never re-prompt).
  await context.grantPermissions(["notifications"]);
  await page.goto("/settings");
  const push = page.getByTestId("push-settings");
  await expect(push).toHaveAttribute("data-status", /^(off|denied)$/);
  if ((await push.getAttribute("data-status")) === "off") {
    await expect(
      page.getByRole("button", { name: "Turn on notifications" }),
    ).toBeVisible();
  } else {
    await expect(push).toContainText("Notifications are blocked for this site");
    await expect(
      page.getByRole("button", { name: "Turn on notifications" }),
    ).toHaveCount(0);
  }
  await expect(page.getByTestId("install-prompt")).toBeVisible();

  await page.getByLabel("Send reminders at").selectOption("18");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Reminder settings saved")).toBeVisible();

  const sql = db();
  try {
    const [row] = await sql<{ local: string }[]>`
      select to_char(send_at at time zone ${TZ}, 'HH24:MI') as local from reminders
      where purchase_id = ${id} and offset_label = 'T-7'`;
    expect(row.local).toBe("18:00");
  } finally {
    await sql.end();
  }
});

test("offline: banner, paused changes, and the saved dashboard (EC-PWA-01)", async ({
  page,
  context,
}) => {
  await signUpInZone(page);
  await addPurchase(page, "Air fryer", 2, 10);

  // Let the service worker take control and save the dashboard data.
  await page.goto("/dashboard");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(
      () =>
        page.evaluate(
          async () =>
            !!(await (
              await caches.open("keeptrack-data")
            ).match("/api/purchases")),
        ),
      {
        timeout: 20_000,
      },
    )
    .toBe(true);

  await context.setOffline(true);
  try {
    await expect(
      page.getByText("You're offline. Changes are paused"),
    ).toBeVisible();

    // Full navigation while offline → the service worker serves /offline.
    await page.goto("/dashboard").catch(() => {});
    await expect(page.getByText("Offline — showing saved data")).toBeVisible();
    await expect(
      page.getByTestId("offline-purchase").filter({ hasText: "Air fryer" }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }

  // Logging out clears the saved copy (shared devices).
  await page.goto("/settings");
  // Wait for hydration (the push card leaves "checking"), then log out.
  await expect(page.getByTestId("push-settings")).not.toHaveAttribute(
    "data-status",
    "checking",
  );
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(
    await page.evaluate(
      async () =>
        !!(await (await caches.open("keeptrack-data")).match("/api/purchases")),
    ),
  ).toBe(false);
});
