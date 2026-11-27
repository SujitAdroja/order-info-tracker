import { expect, test } from "@playwright/test";
import { signUp } from "./helpers";

test.skip(({ isMobile }) => isMobile, "runs once (desktop)");

test("Add to contacts downloads a vCard of the forwarding address", async ({
  page,
  request,
}) => {
  await signUp(page, "/settings");
  const address = (await page
    .getByTestId("forwarding-address")
    .textContent())!.trim();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("add-to-contacts").click(),
  ]);
  expect(download.suggestedFilename()).toBe("KeepTrack.vcf");
  const chunks = await (await download.createReadStream()).toArray();
  const text = Buffer.concat(chunks).toString("utf8");
  expect(text).toContain("FN:KeepTrack Orders");
  expect(text).toContain(`EMAIL;TYPE=INTERNET:${address}`);

  // Signed out, the contact isn't handed out.
  const res = await request.get("/api/me/contact");
  expect(res.status()).toBe(401);
});
