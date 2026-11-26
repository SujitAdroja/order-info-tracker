import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signUp } from "./helpers";

// Phase 6 accessibility pass: WCAG 2.1 A/AA checks on the main screens.
test.use({ timezoneId: "Asia/Kolkata" });

async function check(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${name}: ${v.id} (${v.impact}) ${v.nodes.length}× — ${v.nodes[0]?.target.join(" ")}`,
  );
  expect(summary, summary.join("\n")).toEqual([]);
}

test("public pages have no WCAG A/AA violations", async ({ page }) => {
  for (const path of ["/", "/login", "/privacy", "/terms"]) {
    await page.goto(path);
    await page.waitForLoadState("domcontentloaded");
    await check(page, path);
  }
});

test("app pages have no WCAG A/AA violations", async ({ page }) => {
  await signUp(page);
  await page.goto("/add");
  await page.getByLabel("Store").fill("Amazon.in");
  await page.getByLabel("Order date").fill("2026-11-20");
  await page.getByLabel("Item name").fill("Kettle");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]{36}$/);
  await check(page, "purchase detail");

  for (const path of [
    "/dashboard",
    "/dashboard?tab=review",
    "/add",
    "/settings",
    "/onboarding",
    "/add/review?share=00000000-0000-0000-0000-000000000000",
    "/add/review?share_error=1",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500); // let client components settle
    await check(page, path);
  }
});
