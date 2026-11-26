import { expect, test, type Browser, type Page } from "@playwright/test";
import { requestMagicLink, signUp } from "./helpers";

// Share screenshots to the app (Web Share Target) and the Upload button.
// The e2e server has no ANTHROPIC_API_KEY, so screenshots are read with the
// on-device OCR (Tesseract.js) — the real thing, in the browser.
test.skip(({ isMobile }) => isMobile, "share flows run once (desktop)");
test.use({ timezoneId: "Asia/Kolkata" });
// OCR on a cold dev server (first run also downloads the OCR files).
test.setTimeout(240_000);

const ORDER_ID = () => `OD${Date.now()}${Math.floor(Math.random() * 1000)}`;

/** Renders a fake shopping-app order screen and screenshots it (PNG). */
async function orderScreenshot(browser: Browser, orderId: string) {
  const page = await browser.newPage({
    viewport: { width: 420, height: 640 },
  });
  await page.setContent(`
    <body style="font: 22px Arial, sans-serif; margin: 24px; color: #111; background: #fff">
      <p>9:41&nbsp;&nbsp;4G&nbsp;&nbsp;78%</p>
      <h1 style="font-size: 28px">Flipkart</h1>
      <p>Order ID - ${orderId}</p>
      <p>Ordered on 20 Nov</p>
      <p>Noise ColorFit Pulse Smartwatch</p>
      <p>Size: Regular</p>
      <p>Total Amount Rs. 1,999</p>
    </body>`);
  const png = await page.screenshot();
  await page.close();
  return png;
}

/** A small text PDF invoice, made by the browser. */
async function invoicePdf(browser: Browser, orderId: string) {
  const page = await browser.newPage();
  await page.setContent(`
    <body style="font: 14px Arial, sans-serif">
      <h1>Tax Invoice</h1>
      <p>Sold by: RetailNet, Flipkart</p>
      <p>Order ID: ${orderId}</p>
      <p>Order Date: 18-11-2026</p>
      <p>Grand Total: Rs. 2,499.00</p>
    </body>`);
  const pdf = await page.pdf({ format: "A6" });
  await page.close();
  return pdf;
}

async function uploadOnAddPage(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  await page.goto("/add");
  // The tip renders only after hydration, so the file input's handler is live.
  await expect(page.getByTestId("share-tip")).toBeVisible();
  await page.getByTestId("receipt-file-input").setInputFiles(file);
  await expect(page).toHaveURL(/\/add\/review\?share=/);
}

/** Shares through the service worker, like Android's share sheet does. */
async function shareViaServiceWorker(
  page: Page,
  share: {
    text?: string;
    files?: { name: string; type: string; base64: string }[];
  },
) {
  await page.goto("/dashboard");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const finalUrl = await page.evaluate(async ({ text, files }) => {
    const form = new FormData();
    if (text) form.append("text", text);
    for (const f of files ?? []) {
      const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
      form.append("files", new File([bytes], f.name, { type: f.type }));
    }
    const res = await fetch("/share-target", { method: "POST", body: form });
    return res.url;
  }, share);
  expect(finalUrl).toMatch(/\/add\/review\?share=[0-9a-f-]{36}$/);
  await page.goto(finalUrl);
}

test("upload a screenshot → read on the device → review → save; same order again → duplicate", async ({
  page,
  browser,
}) => {
  await signUp(page);
  const orderId = ORDER_ID();
  const png = await orderScreenshot(browser, orderId);

  await uploadOnAddPage(page, {
    name: "Screenshot_order.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.getByRole("img", { name: "Shared image 1" })).toBeVisible();

  // OCR (first run downloads ~7 MB of OCR files from our own site).
  const store = page.getByLabel("Store");
  await expect(store).toHaveValue("Flipkart", { timeout: 90_000 });
  await expect(page.getByLabel("Order number")).toHaveValue(orderId);
  await expect(page.getByLabel("Order date")).toHaveValue(/^\d{4}-11-20$/);
  await expect(page.getByLabel("Item name")).toHaveValue(
    "Noise ColorFit Pulse Smartwatch",
  );
  await expect(page.getByLabel("Price")).toHaveValue("1999");
  // OCR results are always low confidence: fields are highlighted to check.
  await expect(
    page.getByText("Check the highlighted fields before saving."),
  ).toBeVisible();
  await expect(page.locator('[data-check="true"]').first()).toBeVisible();

  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]{36}$/);
  const purchaseId = page.url().split("/").pop()!;
  await expect(
    page.getByRole("heading", { name: "Noise ColorFit Pulse Smartwatch" }),
  ).toBeVisible();

  // Saved shares are removed from the device.
  await page.goto("/dashboard");
  await expect(page.getByTestId("unsaved-shares")).toHaveCount(0);

  // Same screenshot again → "already added" → Update existing.
  await uploadOnAddPage(page, {
    name: "Screenshot_again.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    page.getByText("This looks like an order you already added"),
  ).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Update existing" }).click();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/purchases/${purchaseId}$`));
});

test("share a PDF invoice through the service worker → draft from its text", async ({
  page,
  browser,
}) => {
  await signUp(page);
  const orderId = ORDER_ID();
  const pdf = await invoicePdf(browser, orderId);
  await shareViaServiceWorker(page, {
    files: [
      {
        name: "invoice.pdf",
        type: "application/pdf",
        base64: pdf.toString("base64"),
      },
    ],
  });
  await expect(page.getByText("invoice.pdf")).toBeVisible();
  await expect(page.getByLabel("Order number")).toHaveValue(orderId, {
    timeout: 60_000,
  });
  await expect(page.getByLabel("Store")).toHaveValue("Flipkart");
  await expect(page.getByLabel("Order date")).toHaveValue("2026-11-18");

  // No item name on the invoice: Save is refused until it's filled in.
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page.getByText("Item name is required")).toBeVisible();
  await page.getByLabel("Item name").fill("Desk lamp");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]{36}$/);
});

test("a shared product link gets help, not a fetch (EC-SHR-01); unsaved shares show on the dashboard", async ({
  page,
}) => {
  await signUp(page);
  const linkRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("amzn.example")) linkRequests.push(r.url());
  });
  await shareViaServiceWorker(page, {
    text: "Check out boAt Airdopes 141 on Amazon https://amzn.example/d/abc",
  });
  await expect(
    page.getByRole("heading", { name: "That's only a product link" }),
  ).toBeVisible();
  expect(linkRequests).toEqual([]);

  // Left without saving → dashboard banner → back to the review.
  await page.goto("/dashboard");
  await expect(page.getByTestId("unsaved-shares")).toContainText(
    "You have 1 unsaved share",
  );
  await page.getByRole("link", { name: "Review", exact: true }).click();
  await expect(page).toHaveURL(/\/add\/review\?share=/);
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("unsaved-shares")).toHaveCount(0);
});

test("unsupported and expired shares, and the server fallback (EC-SHR-12/16)", async ({
  page,
}) => {
  await signUp(page);

  // A video only: nothing usable.
  await shareViaServiceWorker(page, {
    files: [{ name: "clip.mp4", type: "video/mp4", base64: "AAAA" }],
  });
  await expect(
    page.getByText("Only screenshots, photos and PDF invoices are supported."),
  ).toBeVisible();

  await page.goto("/add/review?share=00000000-0000-0000-0000-000000000000");
  await expect(
    page.getByText("This share has expired or was already saved"),
  ).toBeVisible();

  // Service worker not active yet: the server answers with a redirect.
  const res = await page.request.post("/share-target", {
    multipart: { text: "hello" },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(303);
  expect(res.headers().location).toMatch(/\/add\/review\?share_error=1$/);
  await page.goto("/add/review?share_error=1");
  await expect(
    page.getByText("Couldn't receive the shared file"),
  ).toBeVisible();
});

test("upload API: auth, file types, link-only, no API key", async ({
  page,
  request,
}) => {
  expect(
    (
      await request.post("/api/uploads/receipt", {
        multipart: { text: "x" },
      })
    ).status(),
  ).toBe(401);

  await signUp(page);
  const api = page.request;
  const post = (
    multipart: Record<
      string,
      string | { name: string; mimeType: string; buffer: Buffer }
    >,
  ) => api.post("/api/uploads/receipt", { multipart });

  // Declared as an image, but the bytes aren't one (EC-SEC-02).
  const fake = await post({
    files: {
      name: "a.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image at all"),
    },
  });
  expect(fake.status()).toBe(415);
  expect(await fake.json()).toMatchObject({ error: "unsupported" });

  expect(
    await (await post({ text: "https://dl.flipkart.example/s/xyz" })).json(),
  ).toMatchObject({ ok: false, error: "link_only" });

  // Without the key, images aren't read on the server: the device does OCR.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  expect(
    await (
      await post({
        files: { name: "s.png", mimeType: "image/png", buffer: png },
      })
    ).json(),
  ).toMatchObject({ ok: false, error: "vision_unavailable" });

  // OCR text from the device → parsed on the server.
  const ocr = await (
    await post({
      ocrText:
        "Myntra\nOrder No: 1234567890123\nOrdered on 21 Nov\nTotal Rs. 799",
      source: "share_target",
    })
  ).json();
  expect(ocr).toMatchObject({ ok: true, method: "ocr" });
  expect(ocr.drafts[0].values).toMatchObject({
    storeName: "Myntra",
    externalOrderId: "1234567890123",
  });

  // Not an order (EC-SHR-05).
  expect(
    await (await post({ ocrText: "See you at 7 for dinner? 😊" })).json(),
  ).toMatchObject({ ok: false, error: "not_an_order" });
});

test("shared while offline: kept on the device, read when back online (EC-SHR-09)", async ({
  page,
  context,
}) => {
  await signUp(page);
  await page.goto("/dashboard");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);

  await context.setOffline(true);
  // A real navigation POST, like the share sheet makes.
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/share-target";
    form.enctype = "multipart/form-data";
    const text = document.createElement("textarea");
    text.name = "text";
    text.value =
      "Ajio order\nOrder No: FN1234567890\nOrder placed on 22 Nov\nTotal Rs. 899";
    form.append(text);
    document.body.append(form);
    form.submit();
  });
  await expect(page).toHaveURL(/\/add\/review\?share=/);
  await expect(page.getByTestId("offline-share")).toContainText(
    "We'll read it when you're back online",
  );

  await context.setOffline(false);
  await expect(page.getByLabel("Order number")).toHaveValue("FN1234567890", {
    timeout: 60_000,
  });
  await expect(page.getByLabel("Store")).toHaveValue("AJIO");
});

test("shared while signed out: kept through sign-in, back on the review (EC-SHR-11)", async ({
  page,
  context,
}) => {
  const email = await signUp(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.clearCookies(); // signed out, service worker still installed

  await page.goto("/login");
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/share-target";
    form.enctype = "multipart/form-data";
    const text = document.createElement("textarea");
    text.name = "text";
    text.value =
      "Nykaa\nOrder ID: NYK98765432\nOrdered on 19 Nov\nTotal Rs. 650";
    form.append(text);
    document.body.append(form);
    form.submit();
  });
  await expect(page).toHaveURL(/\/login\?callbackUrl=/);
  const callbackUrl = new URL(page.url()).searchParams.get("callbackUrl")!;
  expect(callbackUrl).toMatch(/^\/add\/review\?share=[0-9a-f-]{36}$/);

  await page.goto(await requestMagicLink(page, email, callbackUrl));
  await expect(page).toHaveURL(/\/add\/review\?share=/);
  await expect(page.getByLabel("Order number")).toHaveValue("NYK98765432", {
    timeout: 60_000,
  });
});
