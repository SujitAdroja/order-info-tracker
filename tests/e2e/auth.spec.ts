import { expect, test } from "@playwright/test";
import { ADDRESS_PATTERN, requestMagicLink, uniqueEmail } from "./helpers";

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
      page.getByRole("heading", { name: "That link has expired" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send new link" }),
    ).toBeVisible();
  });
});
