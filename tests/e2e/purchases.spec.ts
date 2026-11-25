import { expect, test, type Page } from "@playwright/test";
import {
  addDaysISO,
  addMonthsISO,
  formatISODate,
  todayInTimeZone,
} from "../../lib/dates";
import { signUp } from "./helpers";

// New users default to Asia/Kolkata; keep the browser consistent with that.
test.use({ timezoneId: "Asia/Kolkata" });
const today = () => todayInTimeZone("Asia/Kolkata");

type ManualPurchase = {
  store: string;
  item: string;
  orderDate: string;
  deliveryDate?: string;
  returnDays?: string;
  category?: string;
  price?: string;
};

async function addPurchase(page: Page, p: ManualPurchase) {
  await page.goto("/add");
  await page.getByLabel("Store").fill(p.store);
  await page.getByLabel("Order date").fill(p.orderDate);
  if (p.deliveryDate)
    await page.getByLabel("Delivery date").fill(p.deliveryDate);
  if (p.returnDays)
    await page.getByLabel("Return window (days)").fill(p.returnDays);
  await page.getByLabel("Item name").fill(p.item);
  if (p.category) await page.getByLabel("Category").selectOption(p.category);
  if (p.price) await page.getByLabel("Price").fill(p.price);
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: p.item }),
  ).toBeVisible();
}

test("manual purchase shows the correct countdown, then moves to History when returned", async ({
  page,
}) => {
  await signUp(page);
  const delivered = addDaysISO(today(), -1);
  const deadline = addDaysISO(delivered, 10); // 9 days from today

  await addPurchase(page, {
    store: "Amazon.in",
    item: "Boat Airdopes 141",
    orderDate: addDaysISO(today(), -3),
    deliveryDate: delivered,
    returnDays: "10",
    category: "electronics",
    price: "1299",
  });

  // Detail page: exact return countdown + 12-month default warranty from delivery.
  const chip = page.getByTestId("return-countdown");
  await expect(chip).toHaveText("Return: 9 days left");
  await expect(chip).toHaveAttribute("data-tone", "neutral");
  await expect(page.getByTestId("return-deadline")).toHaveText(
    `By ${formatISODate(deadline)}`,
  );
  await expect(page.getByTestId("warranty-end")).toHaveText(
    `Until ${formatISODate(addMonthsISO(delivered, 12))}`,
  );
  await expect(
    page.getByText("10 days from delivery (you set this)"),
  ).toBeVisible();

  // Dashboard: Returns tab card with the same chip.
  await page.goto("/dashboard?tab=returns");
  const card = page
    .getByTestId("purchase-card")
    .filter({ hasText: "Boat Airdopes 141" });
  await expect(card.getByTestId("return-countdown")).toHaveText(
    "Return: 9 days left",
  );
  await expect(card).toContainText("₹1,299");

  // Mark returned → leaves Returns and Warranty, shows in History.
  await card.click();
  await page.getByRole("button", { name: "Returned", exact: true }).click();
  await expect(page.getByTestId("status-badge")).toHaveText("Returned");
  await page.goto("/dashboard?tab=returns");
  await expect(page.getByTestId("purchase-card")).toHaveCount(0);
  await page.goto("/dashboard?tab=history");
  await expect(
    page.getByTestId("purchase-card").filter({ hasText: "Boat Airdopes 141" }),
  ).toBeVisible();
});

test("countdown chips turn red within 3 days and estimates show ~", async ({
  page,
}) => {
  await signUp(page);

  await addPurchase(page, {
    store: "Corner Electronics",
    item: "USB-C cable",
    orderDate: today(),
    deliveryDate: today(),
    returnDays: "3",
  });
  await expect(page.getByTestId("return-countdown")).toHaveText(
    "Return: 3 days left",
  );
  await expect(page.getByTestId("return-countdown")).toHaveAttribute(
    "data-tone",
    "danger",
  );

  // Not delivered yet → estimated from order date.
  await addPurchase(page, {
    store: "Flipkart",
    item: "Desk lamp",
    orderDate: today(),
    returnDays: "5",
  });
  await expect(page.getByTestId("return-countdown")).toHaveText(
    "Return: ~5 days left",
  );
  await expect(page.getByTestId("return-countdown")).toHaveAttribute(
    "data-tone",
    "warning",
  );
});

test("unknown return window goes to Needs review until the user sets it", async ({
  page,
}) => {
  await signUp(page);
  await addPurchase(page, {
    store: "Myntra",
    item: "Running shoes",
    orderDate: addDaysISO(today(), -2),
    deliveryDate: today(),
    category: "fashion",
  });

  await expect(page.getByText("We don't know the return window")).toBeVisible();
  await page.goto("/dashboard?tab=review");
  await expect(
    page.getByTestId("purchase-card").filter({ hasText: "Running shoes" }),
  ).toBeVisible();

  // Set it via Edit → deadline appears, review cleared.
  await page
    .getByTestId("purchase-card")
    .filter({ hasText: "Running shoes" })
    .click();
  await page.getByRole("link", { name: "Set return window" }).click();
  await page.getByLabel("Return window (days)").fill("14");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("return-countdown")).toHaveText(
    "Return: 14 days left",
  );
  await expect(page.getByText("We don't know the return window")).toHaveCount(
    0,
  );

  await page.goto("/dashboard?tab=review");
  await expect(page.getByTestId("purchase-card")).toHaveCount(0);
});

test("multi-item purchase: partial return keeps it active", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/add");
  await page.getByLabel("Store").fill("Croma");
  await page.getByLabel("Order date").fill(addDaysISO(today(), -1));
  await page.getByLabel("Delivery date").fill(today());
  await page.getByLabel("Return window (days)").fill("7");
  await page.getByLabel("Item name").fill("Mixer grinder");
  await page.getByRole("button", { name: "Add another item" }).click();
  await page.getByLabel("Item name").nth(1).fill("Spare jar");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Mixer grinder + 1 more",
  );
  await expect(page.getByTestId("item-row")).toHaveCount(2);

  // Return one item via Edit.
  await page.getByRole("link", { name: "Edit" }).click();
  const itemBoxes = page.getByTestId("item-fields");
  await itemBoxes
    .filter({
      has: page
        .getByLabel("Item name")
        .and(page.locator('[value="Spare jar"]')),
    })
    .getByLabel("Item status")
    .selectOption("returned");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("status-badge")).toHaveText("Active");
  await expect(page.getByTestId("return-countdown")).toHaveText(
    "Return: 7 days left",
  );
});

test("validation errors show inline, and delete asks for confirmation", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/add");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page.getByText("Store is required")).toBeVisible();
  await expect(page.getByText("Item name is required")).toBeVisible();

  await page.getByLabel("Order date").fill(addDaysISO(today(), 5));
  await page.getByLabel("Store").fill("IKEA");
  await page.getByLabel("Item name").fill("Bookshelf");
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(
    page.getByText("Order date can't be in the future"),
  ).toBeVisible();

  await page.getByLabel("Order date").fill(today());
  await page.getByRole("button", { name: "Save purchase" }).click();
  await expect(page).toHaveURL(/\/purchases\//);

  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Delete purchase" }).click();
  await expect(page).toHaveURL(/\/dashboard\?deleted=1/);
  await expect(page.getByRole("status")).toHaveText("Purchase deleted.");
  await expect(page.getByText("Nothing tracked yet")).toBeVisible();
});

test("verified store policy fills the return window when left blank", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/add");
  await page.getByLabel("Store").fill("Nykaa");
  await expect(
    page.getByText(
      "Nykaa policy: 15 days from delivery. Leave blank to use it.",
    ),
  ).toBeVisible();

  await page.getByLabel("Order date").fill(addDaysISO(today(), -2));
  await page.getByLabel("Delivery date").fill(today());
  await page.getByLabel("Item name").fill("Sunscreen SPF 50");
  await page.getByLabel("Category").selectOption("beauty");
  await page.getByRole("button", { name: "Save purchase" }).click();

  await expect(page.getByTestId("return-countdown")).toHaveText(
    "Return: 15 days left",
  );
  await expect(
    page.getByText("15 days from delivery (store policy)"),
  ).toBeVisible();
  await expect(page.getByText("We don't know the return window")).toHaveCount(
    0,
  );
});
