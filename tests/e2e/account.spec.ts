import { strFromU8, unzipSync } from "fflate";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import postgres from "postgres";
import { addDaysISO, todayInTimeZone } from "../../lib/dates";
import { E2E_SECRETS } from "../../playwright.config";
import { orderConfirmation } from "./inbound-fixtures";
import { signUp, uniqueEmail } from "./helpers";

// Phase 6: export, address change, delete account, rate limits, legal pages.
test.skip(({ isMobile }) => isMobile, "account flows run once (desktop)");
test.use({ timezoneId: "Asia/Kolkata" });

const AUTH = `Basic ${Buffer.from(
  `${E2E_SECRETS.INBOUND_WEBHOOK_USER}:${E2E_SECRETS.INBOUND_WEBHOOK_PASSWORD}`,
).toString("base64")}`;

function db() {
  return postgres(
    process.env.DATABASE_URL ??
      "postgres://keeptrack:keeptrack@localhost:5434/keeptrack",
    { max: 1 },
  );
}

async function forwardingAddress(page: Page) {
  await page.goto("/settings");
  return (await page.getByTestId("forwarding-address").textContent())!.trim();
}

async function postEmail(request: APIRequestContext, payload: unknown) {
  return (
    await request.post("/api/inbound/email", {
      data: payload,
      headers: { authorization: AUTH },
    })
  ).json();
}

async function settingsReady(page: Page) {
  await page.goto("/settings");
  // Hydrated once the push card has checked this device.
  await expect(page.getByTestId("push-settings")).not.toHaveAttribute(
    "data-status",
    "checking",
  );
}

test("full journey: email → purchase → returned → export → delete leaves nothing", async ({
  page,
  request,
}) => {
  const email = await signUp(page);
  const to = await forwardingAddress(page);
  const orderId = `408-${Date.now()}-2`;

  // Email in → purchase appears (plan B draft, needs review).
  expect(
    await postEmail(request, orderConfirmation(to, orderId)),
  ).toMatchObject({
    status: "accepted",
  });
  await expect(async () => {
    await page.goto("/dashboard?tab=review");
    await expect(page.getByTestId("purchase-card")).toHaveCount(1);
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] });
  await page.getByTestId("purchase-card").click();
  await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]{36}$/);
  const purchaseId = page.url().split("/").pop()!;

  // Give it a return window (so it has reminders), then mark Returned → reminders cancelled.
  await page
    .getByRole("link", { name: /Edit details|Set return window/ })
    .click();
  await page
    .getByLabel("Delivery date")
    .fill(addDaysISO(todayInTimeZone("Asia/Kolkata"), -1));
  await page.getByLabel("Return window (days)").fill("30");
  await page.getByRole("button", { name: "Add an item" }).click();
  await page.getByLabel("Item name").fill('=HYPERLINK("http://evil")');
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/purchases/${purchaseId}$`));

  const sql = db();
  try {
    const before =
      await sql`select count(*)::int as n from reminders where purchase_id = ${purchaseId} and sent_at is null`;
    expect(before[0].n).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Returned" }).click();
    await expect(page.getByTestId("status-badge")).toHaveText("Returned");
    const after =
      await sql`select count(*)::int as n from reminders where purchase_id = ${purchaseId} and sent_at is null and kind = 'return'`;
    expect(after[0].n).toBe(0);

    // Export: a zip with JSON + CSV; spreadsheet formulas are neutralised.
    const res = await page.request.get("/api/me/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(
      /attachment; filename="keeptrack-export-\d{4}-\d{2}-\d{2}\.zip"/,
    );
    const files = unzipSync(new Uint8Array(await res.body()));
    expect(Object.keys(files).sort()).toEqual([
      "README.txt",
      "account.json",
      "email_history.csv",
      "items.csv",
      "purchases.csv",
      "purchases.json",
      "reminders.csv",
    ]);
    const account = JSON.parse(strFromU8(files["account.json"]));
    expect(account.email).toBe(email);
    expect(account.forwardingAddresses[0].address).toBe(to);
    expect(strFromU8(files["purchases.csv"])).toContain(orderId);
    expect(strFromU8(files["items.csv"])).toContain(
      `"'=HYPERLINK(""http://evil"")"`,
    );
    expect(strFromU8(files["email_history.csv"])).toContain("amazon.in");

    // Delete account (must type the email).
    await settingsReady(page);
    await page.getByRole("button", { name: "Delete my account" }).click();
    const confirm = page.getByRole("button", { name: "Delete account" });
    await expect(confirm).toBeDisabled();
    await page
      .getByLabel("Type your email address to confirm")
      .fill(email.toUpperCase());
    await confirm.click();
    await expect(page).toHaveURL(/\/\?account=deleted$/);
    await expect(
      page.getByText("Your account and all its data have been deleted."),
    ).toBeVisible();

    // Nothing left for this user (EC-ACC-04).
    const left = await sql`
      select
        (select count(*)::int from users where email = ${email}) as users,
        (select count(*)::int from purchases where id = ${purchaseId}) as purchases,
        (select count(*)::int from purchase_items where purchase_id = ${purchaseId}) as items,
        (select count(*)::int from reminders where purchase_id = ${purchaseId}) as reminders,
        (select count(*)::int from inbound_emails e where e.purchase_id = ${purchaseId}) as emails`;
    expect(left[0]).toEqual({
      users: 0,
      purchases: 0,
      items: 0,
      reminders: 0,
      emails: 0,
    });

    // The address is retired forever: unlinked tombstone, mail to it is ignored.
    const [tomb] =
      await sql`select user_id, active from forwarding_addresses where local_part = ${to.split("@")[0]}`;
    expect(tomb).toEqual({ user_id: null, active: false });
    expect(
      await postEmail(request, orderConfirmation(to, `${orderId}-x`)),
    ).toMatchObject({
      status: "ignored",
    });

    // Signed out: app pages go to login.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await sql.end();
  }
});

test("new forwarding address: old one keeps working during the grace period", async ({
  page,
  request,
}) => {
  await signUp(page);
  const oldAddress = await forwardingAddress(page);
  await settingsReady(page);

  await page.getByRole("button", { name: "Get a new address" }).click();
  await page.getByRole("button", { name: "Get new address" }).click();
  await expect(page.getByText("New address ready")).toBeVisible();
  await expect(page.getByTestId("forwarding-address")).not.toHaveText(
    oldAddress,
  );
  const newAddress = (await page
    .getByTestId("forwarding-address")
    .textContent())!.trim();
  expect(newAddress).toMatch(/^u-[a-z0-9]{8}@/);

  // EC-ACC-06: both addresses deliver for now.
  expect(
    await postEmail(
      request,
      orderConfirmation(oldAddress, `111-${Date.now()}-1`),
    ),
  ).toMatchObject({
    status: "accepted",
  });
  expect(
    await postEmail(
      request,
      orderConfirmation(newAddress, `111-${Date.now()}-2`),
    ),
  ).toMatchObject({
    status: "accepted",
  });
});

test("sign-in emails are rate limited per address (EC-SEC-04)", async ({
  page,
}) => {
  const email = uniqueEmail();
  for (let i = 0; i < 5; i++) {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page).toHaveURL(/\/login\/check-email/);
  }
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.locator("#email-error")).toContainText(
    "Too many sign-in emails",
  );
});

test("legal pages, export needs a session, unknown pages show a 404", async ({
  page,
  request,
}) => {
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { level: 1, name: "Privacy" }),
  ).toBeVisible();
  await expect(
    page.getByText("We never get access to your inbox"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Terms" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Terms" }),
  ).toBeVisible();

  expect((await request.get("/api/me/export")).status()).toBe(401);

  await page.goto("/no-such-page");
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});
