import { expect, test } from "@playwright/test";
import {
  ADDRESS_PATTERN,
  readSignInCode,
  requestMagicLink,
  uniqueEmail,
} from "./helpers";

test("app pages redirect to login when signed out", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fsettings/);
  await expect(
    page.getByRole("heading", { name: "Log in or sign up" }),
  ).toBeVisible();
});

test("invalid email shows an inline error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.locator("#email-error")).toHaveText(
    "Please enter a valid email address.",
  );
  await expect(page.getByLabel("Email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test.describe("sign up and log in", () => {
  test.use({ timezoneId: "Europe/Berlin" });

  test("new user sees a forwarding address on Settings, kept across logins", async ({
    page,
  }) => {
    const email = uniqueEmail();

    // Sign up via magic link.
    await page.goto(await requestMagicLink(page, email));
    await expect(page).toHaveURL(/\/settings$/);

    const address = page.getByTestId("forwarding-address");
    await expect(address).toHaveText(ADDRESS_PATTERN);
    const firstAddress = (await address.textContent())!.trim();
    await expect(page.getByTestId("account-email")).toHaveText(email);

    // Browser timezone is detected on first login.
    await expect
      .poll(async () => {
        await page.reload();
        return page.getByTestId("account-timezone").textContent();
      })
      .toBe("Europe/Berlin");

    // Log out, then log back in: same address, not a new one.
    // (Wait for hydration first: the push card leaves "checking".)
    await expect(page.getByTestId("push-settings")).not.toHaveAttribute(
      "data-status",
      "checking",
    );
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login/);

    await page.goto(await requestMagicLink(page, email));
    await expect(page.getByTestId("forwarding-address")).toHaveText(
      firstAddress,
    );
  });

  test("a used magic link shows a friendly expired page", async ({
    page,
    context,
  }) => {
    const email = uniqueEmail();
    const link = await requestMagicLink(page, email, "/dashboard");

    await page.goto(link);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("forwarding-address")).toHaveText(
      ADDRESS_PATTERN,
    );

    await context.clearCookies();
    await page.goto(link); // second use
    await expect(
      page.getByRole("heading", { name: "That code or link didn't work" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send new code" }),
    ).toBeVisible();
  });
});

test("sign in by typing the emailed code (works in the installed app)", async ({
  page,
}) => {
  const email = uniqueEmail();
  await requestMagicLink(page, email, "/settings");
  const code = await readSignInCode(email);
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);

  // The check-email page names the address and takes the code.
  await page.goto("/login/check-email");
  await expect(page.getByText(email)).toBeVisible();

  // A wrong code doesn't use up the real one: retry works.
  await page.getByLabel("Sign-in code").fill("ZZZZ-ZZZZ");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "That code or link didn't work" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Try the code again" }).click();

  // Lower-case with a dash, as people type it.
  await page
    .getByLabel("Sign-in code")
    .fill(`${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase());
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId("account-email")).toHaveText(email);
});
