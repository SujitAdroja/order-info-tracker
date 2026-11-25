import { createHmac, randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { E2E_SECRETS, MOCK_RESEND_URL } from "../../playwright.config";
import { signUp } from "./helpers";

// SYNTHETIC data only. Resend path: signed metadata webhook → app fetches
// the email from the (mocked) Receiving API during processing.
test.skip(({ isMobile }) => isMobile, "pipeline tests run once (desktop)");
test.use({ timezoneId: "Asia/Kolkata" });

function sign(body: string, secret = E2E_SECRETS.RESEND_WEBHOOK_SECRET) {
  const id = `msg_${randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${sig}`,
  };
}

async function postWebhook(
  request: APIRequestContext,
  payload: unknown,
  secret?: string,
) {
  const body = JSON.stringify(payload);
  return request.post("/api/inbound/email", {
    data: body,
    headers: { "content-type": "application/json", ...sign(body, secret) },
  });
}

async function forwardingAddress(page: Page) {
  await page.goto("/settings");
  return (await page.getByTestId("forwarding-address").textContent())!.trim();
}

function webhookFor(emailId: string, to: string) {
  return {
    type: "email.received",
    created_at: new Date().toISOString(),
    data: {
      email_id: emailId,
      created_at: new Date().toISOString(),
      from: "me@gmail.example",
      to: [to],
      cc: [],
      bcc: [],
      received_for: [to],
      message_id: `<${emailId}@gmail.example>`,
      subject: "Fwd: Your order has been placed",
      attachments: [],
    },
  };
}

function receivedEmail(emailId: string, to: string, orderId: string) {
  return {
    object: "email",
    id: emailId,
    to: [to],
    from: "me@gmail.example",
    created_at: "2026-03-03T04:45:00.000Z",
    subject: `Fwd: Your order ${orderId} has been placed`,
    html: `<div>---------- Forwarded message ---------<br>
From: Amazon.in &lt;auto-confirm@amazon.in&gt;<br>
Date: Tue, Mar 3, 2026 at 10:15 AM<br>
Subject: Your order ${orderId} has been placed<br>
To: &lt;me@gmail.example&gt;<br><br></div>
<h2>Thank you for your order</h2>
<p>Order ID: ${orderId}</p>
<p>Ordered on 3 March 2026</p>
<p>Order Total: ₹1,299.00</p>`,
    text: null,
    headers: {
      from: "Test User <me@gmail.example>",
      date: "Tue, 03 Mar 2026 10:15:00 +0530",
    },
    received_for: [to],
    attachments: [],
  };
}

test("rejects unsigned or wrongly signed Resend webhooks", async ({
  request,
}) => {
  const payload = webhookFor(randomUUID(), "u-zzzzzzzz@in.keeptrack.app");
  const wrong = `whsec_${Buffer.alloc(32, 9).toString("base64")}`;
  expect((await postWebhook(request, payload, wrong)).status()).toBe(401);
  const unsigned = await request.post("/api/inbound/email", {
    data: payload,
    headers: { "svix-id": "msg_x" },
  });
  expect(unsigned.status()).toBe(401);
});

test("Resend: signed webhook → content fetched → review draft", async ({
  page,
  request,
}) => {
  await signUp(page);
  const to = await forwardingAddress(page);
  const emailId = randomUUID();
  const orderId = `402-${Date.now()}-7`;

  const registered = await request.post(
    `${MOCK_RESEND_URL}/__fixtures/emails/${emailId}`,
    {
      data: receivedEmail(emailId, to, orderId),
    },
  );
  expect(registered.ok()).toBe(true);

  const res = await postWebhook(request, webhookFor(emailId, to));
  expect(await res.json()).toMatchObject({ ok: true, status: "accepted" });
  // Svix retries the same email_id → no second row (EC-ING-01).
  expect(
    await (await postWebhook(request, webhookFor(emailId, to))).json(),
  ).toMatchObject({
    status: "duplicate",
  });

  await expect(async () => {
    await page.goto("/dashboard?tab=review");
    await expect(
      page.getByTestId("purchase-card").filter({ hasText: "Amazon.in" }),
    ).toBeVisible();
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] });
  await page
    .getByTestId("purchase-card")
    .filter({ hasText: "Amazon.in" })
    .click();
  await expect(page.getByRole("article").getByText(orderId)).toBeVisible();
  await expect(page.getByRole("article").getByText(/₹1,299/)).toBeVisible();
});

test("dev paste tool feeds the same pipeline", async ({ page }) => {
  await signUp(page);
  const orderId = `171-${Date.now()}-3`;
  await page.goto("/dev/inbound");
  await page.getByLabel("From").fill("Amazon.in <auto-confirm@amazon.in>");
  await page.getByLabel("Subject").fill(`Your order ${orderId}`);
  await page
    .getByLabel("Email text")
    .fill(
      `Thank you for your order\nOrder ID: ${orderId}\nOrdered on 3 March 2026\nOrder Total: ₹2,499.00`,
    );
  await page.getByRole("button", { name: "Send to my inbox" }).click();
  await expect(page.getByTestId("paste-result")).toContainText("Received");

  await expect(async () => {
    await page.goto("/dashboard?tab=review");
    await expect(page.getByTestId("purchase-card")).toHaveCount(1);
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] });
  await page.getByTestId("purchase-card").click();
  await expect(page.getByRole("article").getByText(orderId)).toBeVisible();
  await expect(page.getByRole("article").getByText(/₹2,499/)).toBeVisible();
});
