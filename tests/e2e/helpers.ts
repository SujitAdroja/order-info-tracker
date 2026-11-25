import { createHash, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { MAGIC_LINK_DIR } from "../../playwright.config";

export const ADDRESS_PATTERN =
  /^u-[abcdefghjkmnpqrstuvwxyz23456789]{8}@in\.keeptrack\.app$/;

export function uniqueEmail() {
  return `e2e-${randomUUID()}@example.test`;
}

/** Reads the magic link the dev server wrote for this email, waiting for it to appear. */
export async function readMagicLink(email: string): Promise<string> {
  const file = path.join(
    MAGIC_LINK_DIR,
    `${createHash("sha256").update(email.toLowerCase()).digest("hex")}.txt`,
  );
  let link = "";
  await expect
    .poll(async () => (link = await readFile(file, "utf8").catch(() => "")), {
      timeout: 15_000,
    })
    .not.toBe("");
  await rm(file, { force: true }); // one link per request
  return link;
}

/** The sign-in code sent with the latest link for this email (dev/test sink). */
export async function readSignInCode(email: string): Promise<string> {
  const file = path.join(
    MAGIC_LINK_DIR,
    `${createHash("sha256").update(email.toLowerCase()).digest("hex")}.code`,
  );
  let code = "";
  await expect
    .poll(async () => (code = await readFile(file, "utf8").catch(() => "")), {
      timeout: 15_000,
    })
    .not.toBe("");
  return code.trim();
}

export async function requestMagicLink(
  page: Page,
  email: string,
  callbackUrl = "/settings",
) {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  // On a cold dev server, filling before hydration can be wiped by React.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page).toHaveURL(/\/login\/check-email/);
  return readMagicLink(email);
}

/** Signs up a brand-new user and lands on `callbackUrl`. */
export async function signUp(page: Page, callbackUrl = "/dashboard") {
  const email = uniqueEmail();
  await page.goto(await requestMagicLink(page, email, callbackUrl));
  await expect(page).toHaveURL(new RegExp(`${callbackUrl}$`));
  return email;
}
