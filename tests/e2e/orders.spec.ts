import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { addDaysISO, formatISODate, todayInTimeZone } from "../../lib/dates";
import { E2E_SECRETS } from "../../playwright.config";
import {
  deliveredNotice,
  orderConfirmation,
  shippedNotice,
} from "./inbound-fixtures";
import { signUp } from "./helpers";

// Order tracking: Ordered → Shipped → Out for delivery → Delivered, with an Orders tab.
test.use({ timezoneId: "Asia/Kolkata" });
const today = () => todayInTimeZone("Asia/Kolkata");

const AUTH = `Basic ${Buffer.from(
  `${E2E_SECRETS.INBOUND_WEBHOOK_USER}:${E2E_SECRETS.INBOUND_WEBHOOK_PASSWORD}`,
).toString("base64")}`;

async function post(request: APIRequestContext, payload: unknown) {
  return request.post("/api/inbound/email", {
    data: payload,
    headers: { authorization: AUTH },
  });
}

async function stageOf(page: Page) {
  return page.getByTestId("order-progress").getAttribute("data-stage");
}

test("manual order: shows under Orders until marked delivered", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/add");
  await page.getByLabel("Store").fill("Myntra");
  await page.getByLabel("Order date").fill(addDaysISO(today(), -3));
  await page.getByLabel("Return window (days)").fill("14");
  await page.getByLabel("Item name").fill("Running shoes");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]{36}$/);
  const url = page.url();
  await expect(page.getByTestId("order-progress")).toHaveAttribute(
    "data-stage",
    "ordered",
  );

  // Dashboard opens on Orders (first tab with something in it).
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: /^Orders/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const card = page
    .getByTestId("purchase-card")
    .filter({ hasText: "Running shoes" });
  await expect(card.getByTestId("order-stage")).toHaveText("Ordered");

  // Shipped → out for delivery → delivered (yesterday).
  await page.goto(url);
  await page.getByRole("button", { name: "Mark as shipped" }).click();
  await expect(page.getByTestId("order-progress")).toHaveAttribute(
    "data-stage",
    "shipped",
  );
  await page.getByRole("button", { name: "Out for delivery" }).click();
  await expect(page.getByTestId("order-progress")).toHaveAttribute(
    "data-stage",
    "out_for_delivery",
  );

  await page.getByRole("button", { name: "Mark as delivered" }).click();
  const yesterday = addDaysISO(today(), -1);
  await page.getByLabel("Delivered on").fill(yesterday);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("order-progress")).toHaveAttribute(
    "data-stage",
    "delivered",
  );
  await expect(page.getByTestId("order-eta")).toHaveText(
    `Delivered ${formatISODate(yesterday)}.`,
  );
  // The return window now counts from delivery: 14 days from yesterday → 13 left.
  await expect(page.getByTestId("return-countdown")).toHaveText(
    "Return: 13 days left",
  );

  await page.goto("/dashboard?tab=orders");
  await expect(
    page.getByTestId("purchase-card").filter({ hasText: "Running shoes" }),
  ).toHaveCount(0);
  await expect(page.getByText("Nothing on its way.")).toBeVisible();
});

test("emails move an order through the stages", async ({ page, request }) => {
  test.skip(
    test.info().project.name === "mobile-chrome",
    "pipeline runs once (desktop)",
  );
  await signUp(page);
  await page.goto("/settings");
  const to = (await page
    .getByTestId("forwarding-address")
    .textContent())!.trim();
  const orderId = `402-${Date.now()}-5`;

  await post(request, orderConfirmation(to, orderId));
  await expect(async () => {
    await page.goto("/dashboard?tab=orders");
    await expect(page.getByTestId("purchase-card")).toHaveCount(1);
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] });
  await page.getByTestId("purchase-card").click();
  await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]{36}$/);
  const url = page.url();
  expect(await stageOf(page)).toBe("ordered");

  for (const [payload, stage] of [
    [shippedNotice(to, orderId), "shipped"],
    [shippedNotice(to, orderId, true), "out_for_delivery"],
    [shippedNotice(to, orderId), "out_for_delivery"], // late "shipped" email: no step back
    [deliveredNotice(to, orderId), "delivered"],
  ] as const) {
    await post(request, payload);
    await expect(async () => {
      await page.goto(url);
      expect(await stageOf(page)).toBe(stage);
    }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] });
  }
  await expect(page.getByTestId("order-eta")).toHaveText(
    "Delivered 5 Mar 2026.",
  );
});
