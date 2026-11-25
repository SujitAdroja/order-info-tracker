import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import postgres from "postgres";
import { E2E_SECRETS } from "../../playwright.config";
import {
  cancellation,
  deliveredNotice,
  gmailVerification,
  newsletter,
  orderConfirmation,
} from "./inbound-fixtures";
import { signUp } from "./helpers";

// One mobile pass is enough for a server pipeline; UI is covered elsewhere.
test.skip(({ isMobile }) => isMobile, "pipeline tests run once (desktop)");
test.use({ timezoneId: "Asia/Kolkata" });

const AUTH = `Basic ${Buffer.from(
  `${E2E_SECRETS.INBOUND_WEBHOOK_USER}:${E2E_SECRETS.INBOUND_WEBHOOK_PASSWORD}`,
).toString("base64")}`;

async function post(request: APIRequestContext, payload: unknown, auth = AUTH) {
  return request.post("/api/inbound/email", {
    data: payload,
    headers: { authorization: auth },
  });
}

async function forwardingAddress(page: Page) {
  await page.goto("/settings");
  return (await page.getByTestId("forwarding-address").textContent())!.trim();
}

/** Reloads a page until `check` passes (processing runs after the response). */
async function eventually(page: Page, url: string, check: () => Promise<void>) {
  await expect(async () => {
    await page.goto(url);
    await check();
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] });
}

function db() {
  return postgres(
    process.env.DATABASE_URL ??
      "postgres://keeptrack:keeptrack@localhost:5434/keeptrack",
    {
      max: 1,
    },
  );
}

test.describe("webhook security", () => {
  test("rejects missing or wrong credentials", async ({ request }) => {
    expect((await post(request, {}, "")).status()).toBe(401);
    const wrong = `Basic ${Buffer.from("e2e-postmark:nope").toString("base64")}`;
    expect((await post(request, {}, wrong)).status()).toBe(401);
  });

  test("rejects malformed payloads and accepts unknown recipients silently", async ({
    request,
  }) => {
    expect((await post(request, { nope: true })).status()).toBe(400);
    const res = await post(request, newsletter("u-zzzzzzzz@in.keeptrack.app"));
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ignored" });
  });

  test("cron endpoints require the secret", async ({ request }) => {
    expect((await request.get("/api/cron/retry")).status()).toBe(401);
    const ok = await request.get("/api/cron/retry", {
      headers: { authorization: `Bearer ${E2E_SECRETS.CRON_SECRET}` },
    });
    expect(ok.status()).toBe(200);
  });
});

test("forwarded order → review draft → delivered merges → cancelled; raw deleted", async ({
  page,
  request,
}) => {
  await signUp(page);
  const to = await forwardingAddress(page);
  const orderId = `403-${Date.now()}-1`;

  // 1. Order confirmation (manual Gmail forward). No LLM in tests → plan B draft.
  const first = orderConfirmation(to, orderId);
  const res = await post(request, first);
  expect(await res.json()).toMatchObject({ ok: true, status: "accepted" });

  // EC-ING-01: provider retry with the same MessageID is a no-op.
  expect(await (await post(request, first)).json()).toMatchObject({
    status: "duplicate",
  });

  await eventually(page, "/dashboard?tab=review", async () => {
    await expect(
      page.getByTestId("purchase-card").filter({ hasText: "Amazon.in" }),
    ).toBeVisible();
  });
  await page
    .getByTestId("purchase-card")
    .filter({ hasText: "Amazon.in" })
    .click();

  // Review screen explains why, and the generic extractor pre-filled details.
  const callout = page.getByTestId("review-callout");
  await expect(callout).toContainText("Please confirm these details");
  await expect(callout).toContainText("We couldn't find the item names.");
  await expect(callout).toContainText("Automatic reading isn't available");
  await expect(page.getByRole("article").getByText(orderId)).toBeVisible();
  await expect(page.getByRole("article").getByText(/₹1,299/)).toBeVisible();
  await expect(page.getByTestId("email-provenance")).toContainText(
    "original deleted",
  );
  const purchaseUrl = page.url();

  // 2. Delivered (auto-forwarded) → same purchase, delivery date set (EC-ING-03).
  await post(request, deliveredNotice(to, orderId));
  await eventually(page, purchaseUrl, async () => {
    await expect(
      page.locator("dl").getByText("Delivered", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("5 Mar 2026")).toBeVisible();
  });
  await expect(page.getByTestId("email-provenance").locator("li")).toHaveCount(
    2,
  );

  // Auto-forward header marks Gmail forwarding as verified (F2 step 4).
  await page.goto("/onboarding");
  await expect(page.getByText("Gmail forwarding is working")).toBeVisible();

  // 3. Cancellation → purchase cancelled.
  await post(request, cancellation(to, orderId));
  await eventually(page, purchaseUrl, async () => {
    await expect(page.getByTestId("status-badge")).toHaveText("Cancelled");
  });

  // Only one purchase exists for this order (EC-ING-02/03).
  await page.goto("/dashboard?tab=history");
  await expect(
    page.getByTestId("purchase-card").filter({ hasText: "Amazon.in" }),
  ).toHaveCount(1);

  // Privacy: no raw content left, and no subject stored in clear (EC-ACC-07).
  const sql = db();
  try {
    const rows = await sql`
      select raw_encrypted is null as raw_gone, subject_hash
      from inbound_emails e
      join forwarding_addresses f on f.user_id = e.user_id
      where f.local_part = ${to.split("@")[0]}`;
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.raw_gone).toBe(true);
      expect(r.subject_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  } finally {
    await sql.end();
  }
});

test("Gmail verification code shows in onboarding and creates no purchase", async ({
  page,
  request,
}) => {
  await signUp(page);
  const to = await forwardingAddress(page);

  await page.goto("/onboarding");
  await expect(
    page.getByText("Waiting for Gmail's confirmation email"),
  ).toBeVisible();

  await post(request, gmailVerification(to, "123456789"));
  // Live polling: the code appears without reloading.
  await expect(page.getByTestId("gmail-code")).toHaveText("123456789", {
    timeout: 45_000, // first hit compiles the polling route on a cold dev server
  });

  await post(request, newsletter(to)); // EC-ING-10: not a purchase
  await page.waitForTimeout(1500);
  await page.goto("/dashboard");
  await expect(page.getByText("Nothing tracked yet")).toBeVisible();
});

test("'Looks right' clears email review flags", async ({ page, request }) => {
  await signUp(page);
  const to = await forwardingAddress(page);
  await post(request, orderConfirmation(to, `171-${Date.now()}-9`));

  await eventually(page, "/dashboard?tab=review", async () => {
    await expect(page.getByTestId("purchase-card")).toHaveCount(1);
  });
  await page.getByTestId("purchase-card").click();
  await page.getByRole("button", { name: "Looks right" }).click();

  // Amazon.in's policy isn't verified, so only the window question remains.
  await expect(page.getByTestId("review-callout")).toContainText(
    "We don't know the return window",
  );
  await expect(page.getByRole("button", { name: "Looks right" })).toHaveCount(
    0,
  );
});
