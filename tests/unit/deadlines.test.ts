import { describe, expect, it } from "vitest";
import {
  computeDeadlines,
  type DeadlineInput,
  type DeadlineItemInput,
} from "@/lib/deadlines/compute";

const item = (over: Partial<DeadlineItemInput> = {}): DeadlineItemInput => ({
  category: "other",
  warrantyMonths: null,
  extendedWarrantyEnd: null,
  itemStatus: "active",
  ...over,
});

const deliveryStore = {
  defaultReturnDays: 10,
  returnFrom: "delivery" as const,
};
const orderStore = { defaultReturnDays: 30, returnFrom: "order" as const };

const input = (over: Partial<DeadlineInput> = {}): DeadlineInput => ({
  orderDate: "2026-03-01",
  deliveryDate: "2026-03-04",
  deliveryDateEstimated: false,
  explicitReturnWindow: null,
  nonReturnable: false,
  store: deliveryStore,
  categoryPolicies: [],
  items: [item()],
  timeZone: "Asia/Kolkata",
  today: "2026-03-05",
  ...over,
});

describe("return window priority (Section 8)", () => {
  it("1. user-set window beats everything", () => {
    const r = computeDeadlines(
      input({
        explicitReturnWindow: { days: 15, source: "user" },
        categoryPolicies: [
          { category: "other", returnDays: 7, nonReturnable: false },
        ],
      }),
    );
    expect(r.returnWindowDays).toBe(15);
    expect(r.returnWindowSource).toBe("user");
    expect(r.returnDeadline).toBe("2026-03-19");
  });

  it("2. email-stated window beats store policies", () => {
    const r = computeDeadlines(
      input({ explicitReturnWindow: { days: 7, source: "email" } }),
    );
    expect(r.returnWindowSource).toBe("email");
    expect(r.returnDeadline).toBe("2026-03-11");
  });

  it("3. category policy beats store default", () => {
    const r = computeDeadlines(
      input({
        categoryPolicies: [
          { category: "other", returnDays: 7, nonReturnable: false },
        ],
      }),
    );
    expect(r.returnWindowSource).toBe("category");
    expect(r.returnDeadline).toBe("2026-03-11");
  });

  it("4. store default applies otherwise", () => {
    const r = computeDeadlines(input());
    expect(r.returnWindowSource).toBe("store");
    expect(r.returnWindowDays).toBe(10);
    expect(r.returnDeadline).toBe("2026-03-14");
    expect(r.returnDeadlineEstimated).toBe(false);
    expect(r.needsReview).toBe(false);
  });

  it("5. EC-DATE-04 unknown window → no deadline, needs review", () => {
    const r = computeDeadlines(
      input({ store: { defaultReturnDays: null, returnFrom: "delivery" } }),
    );
    expect(r.returnDeadline).toBeNull();
    expect(r.needsReview).toBe(true);
    expect(r.reviewReasons).toEqual(["unknown_return_window"]);
    expect(r.shouldExpire).toBe(false);
  });
});

describe("base date", () => {
  it("store counting from order uses order date even when delivered", () => {
    const r = computeDeadlines(input({ store: orderStore }));
    expect(r.returnBase).toBe("order");
    expect(r.returnDeadline).toBe("2026-03-31");
    expect(r.returnDeadlineEstimated).toBe(false);
  });

  it("EC-DATE-01 expected delivery → estimated deadline from expected date", () => {
    const r = computeDeadlines(
      input({ deliveryDate: "2026-03-08", deliveryDateEstimated: true }),
    );
    expect(r.returnBase).toBe("expected_delivery");
    expect(r.returnDeadline).toBe("2026-03-18");
    expect(r.returnDeadlineEstimated).toBe(true);
  });

  it("EC-DATE-01 no delivery info → estimated from order date", () => {
    const r = computeDeadlines(input({ deliveryDate: null }));
    expect(r.returnBase).toBe("order");
    expect(r.returnDeadline).toBe("2026-03-11");
    expect(r.returnDeadlineEstimated).toBe(true);
  });

  it("EC-DATE-01 recomputes when the delivered date arrives", () => {
    const before = computeDeadlines(input({ deliveryDate: null }));
    const after = computeDeadlines(input({ deliveryDate: "2026-03-06" }));
    expect(before.returnDeadline).toBe("2026-03-11");
    expect(after.returnDeadline).toBe("2026-03-16");
    expect(after.returnDeadlineEstimated).toBe(false);
  });

  it("unknown store uses the earlier (order) date, estimated", () => {
    const r = computeDeadlines(
      input({
        store: null,
        explicitReturnWindow: { days: 10, source: "user" },
      }),
    );
    expect(r.returnBaseDate).toBe("2026-03-01");
    expect(r.returnDeadline).toBe("2026-03-11");
    expect(r.returnDeadlineEstimated).toBe(true);
  });

  it("unknown store bought in person (delivered same day) is exact", () => {
    const r = computeDeadlines(
      input({
        store: null,
        deliveryDate: "2026-03-01",
        explicitReturnWindow: { days: 10, source: "user" },
      }),
    );
    expect(r.returnDeadline).toBe("2026-03-11");
    expect(r.returnDeadlineEstimated).toBe(false);
  });
});

describe("non-returnable (EC-DATE-05, EC-ING-25)", () => {
  it("purchase flagged non-returnable has no return deadline", () => {
    const r = computeDeadlines(input({ nonReturnable: true }));
    expect(r.returnDeadline).toBeNull();
    expect(r.nonReturnable).toBe(true);
    expect(r.needsReview).toBe(false);
  });

  it("window of 0 days means non-returnable", () => {
    const r = computeDeadlines(
      input({ explicitReturnWindow: { days: 0, source: "user" } }),
    );
    expect(r.returnDeadline).toBeNull();
    expect(r.nonReturnable).toBe(true);
  });

  it("category policy can make an item non-returnable", () => {
    const r = computeDeadlines(
      input({
        categoryPolicies: [
          { category: "other", returnDays: null, nonReturnable: true },
        ],
      }),
    );
    expect(r.nonReturnable).toBe(true);
  });

  it("digital purchases default to non-returnable but keep warranty", () => {
    const r = computeDeadlines(
      input({ items: [item({ category: "digital", warrantyMonths: 12 })] }),
    );
    expect(r.nonReturnable).toBe(true);
    expect(r.returnDeadline).toBeNull();
    expect(r.latestWarrantyEnd).toBe("2027-03-04");
  });
});

describe("multiple items (EC-ING-04, EC-DATE-11)", () => {
  const policies = [
    { category: "electronics", returnDays: 7, nonReturnable: false },
    { category: "fashion", returnDays: 30, nonReturnable: false },
  ];

  it("computes per item and shows the earliest", () => {
    const r = computeDeadlines(
      input({
        categoryPolicies: policies,
        items: [
          item({ category: "fashion" }),
          item({ category: "electronics" }),
        ],
      }),
    );
    expect(r.items.map((i) => i.returnDeadline)).toEqual([
      "2026-04-03",
      "2026-03-11",
    ]);
    expect(r.returnDeadline).toBe("2026-03-11");
  });

  it("partial return: returned item no longer drives the deadline", () => {
    const r = computeDeadlines(
      input({
        categoryPolicies: policies,
        items: [
          item({ category: "fashion" }),
          item({ category: "electronics", itemStatus: "returned" }),
        ],
      }),
    );
    expect(r.returnDeadline).toBe("2026-04-03");
  });

  it("kept items stop return tracking but keep warranty", () => {
    const r = computeDeadlines(
      input({
        items: [item({ category: "electronics", itemStatus: "kept" })],
      }),
    );
    expect(r.returnDeadline).toBeNull();
    expect(r.latestWarrantyEnd).toBe("2027-03-04");
  });

  it("cancelled items drop their warranty too", () => {
    const r = computeDeadlines(
      input({
        items: [item({ category: "electronics", itemStatus: "cancelled" })],
      }),
    );
    expect(r.latestWarrantyEnd).toBeNull();
  });

  it("unknown window on one item flags review even if another is known", () => {
    const r = computeDeadlines(
      input({
        store: { defaultReturnDays: null, returnFrom: "delivery" },
        categoryPolicies: [policies[0]],
        items: [item({ category: "electronics" }), item({ category: "home" })],
      }),
    );
    expect(r.returnDeadline).toBe("2026-03-11");
    expect(r.needsReview).toBe(true);
  });

  it("a purchase with no items still gets a return deadline", () => {
    const r = computeDeadlines(input({ items: [] }));
    expect(r.returnDeadline).toBe("2026-03-14");
  });
});

describe("warranty", () => {
  it("uses delivery date as start and category default months", () => {
    const r = computeDeadlines(
      input({ items: [item({ category: "electronics" })] }),
    );
    expect(r.items[0]).toMatchObject({
      warrantyStart: "2026-03-04",
      warrantyMonths: 12,
      warrantyMonthsIsDefault: true,
      warrantyEnd: "2027-03-04",
    });
  });

  it("item value beats category default", () => {
    const r = computeDeadlines(
      input({ items: [item({ category: "electronics", warrantyMonths: 24 })] }),
    );
    expect(r.items[0].warrantyEnd).toBe("2028-03-04");
    expect(r.items[0].warrantyMonthsIsDefault).toBe(false);
  });

  it("starts from order date when delivery is only estimated", () => {
    const r = computeDeadlines(
      input({
        deliveryDate: "2026-03-20",
        deliveryDateEstimated: true,
        items: [item({ warrantyMonths: 6 })],
      }),
    );
    expect(r.items[0].warrantyStart).toBe("2026-03-01");
    expect(r.items[0].warrantyEnd).toBe("2026-09-01");
  });

  it("no warranty for categories without a default", () => {
    const r = computeDeadlines(
      input({ items: [item({ category: "fashion" })] }),
    );
    expect(r.items[0].warrantyEnd).toBeNull();
    expect(r.latestWarrantyEnd).toBeNull();
  });

  it("warranty of 0 months means none", () => {
    const r = computeDeadlines(
      input({ items: [item({ category: "electronics", warrantyMonths: 0 })] }),
    );
    expect(r.items[0].warrantyEnd).toBeNull();
  });

  it("EC-DATE-06 month-end arithmetic: Jan 31 + 1 month = Feb 28", () => {
    const r = computeDeadlines(
      input({
        orderDate: "2026-01-31",
        deliveryDate: "2026-01-31",
        items: [item({ warrantyMonths: 1 })],
      }),
    );
    expect(r.items[0].warrantyEnd).toBe("2026-02-28");
  });

  it("EC-DATE-07 leap day: Jan 31 + 1 month in a leap year = Feb 29", () => {
    const r = computeDeadlines(
      input({
        orderDate: "2028-01-31",
        deliveryDate: "2028-01-31",
        today: "2028-02-01",
        items: [item({ warrantyMonths: 1 })],
      }),
    );
    expect(r.items[0].warrantyEnd).toBe("2028-02-29");
  });

  it("EC-DATE-07 leap day: Feb 29 + 12 months = Feb 28", () => {
    const r = computeDeadlines(
      input({
        orderDate: "2028-02-29",
        deliveryDate: "2028-02-29",
        today: "2028-03-01",
        items: [item({ warrantyMonths: 12 })],
      }),
    );
    expect(r.items[0].warrantyEnd).toBe("2029-02-28");
  });

  it("EC-DATE-07 return window across Feb 29", () => {
    const r = computeDeadlines(
      input({
        orderDate: "2028-02-20",
        deliveryDate: "2028-02-25",
        today: "2028-02-26",
      }),
    );
    expect(r.returnDeadline).toBe("2028-03-06");
  });

  it("EC-DATE-12 extended warranty wins when later", () => {
    const r = computeDeadlines(
      input({
        items: [
          item({ category: "electronics", extendedWarrantyEnd: "2029-03-04" }),
        ],
      }),
    );
    expect(r.items[0].warrantyEnd).toBe("2027-03-04");
    expect(r.items[0].effectiveWarrantyEnd).toBe("2029-03-04");
    expect(r.latestWarrantyEnd).toBe("2029-03-04");
  });

  it("EC-DATE-12 extended warranty alone still counts", () => {
    const r = computeDeadlines(
      input({
        items: [
          item({ category: "fashion", extendedWarrantyEnd: "2027-01-01" }),
        ],
      }),
    );
    expect(r.items[0].effectiveWarrantyEnd).toBe("2027-01-01");
  });
});

describe("status and timing", () => {
  it("EC-DATE-02 deadline already passed at import → closed; expires without warranty", () => {
    const r = computeDeadlines(input({ today: "2026-04-01" }));
    expect(r.returnClosed).toBe(true);
    expect(r.shouldExpire).toBe(true);
  });

  it("EC-DATE-02 past return but active warranty → keep tracking", () => {
    const r = computeDeadlines(
      input({
        today: "2026-04-01",
        items: [item({ category: "electronics" })],
      }),
    );
    expect(r.returnClosed).toBe(true);
    expect(r.shouldExpire).toBe(false);
  });

  it("both return and warranty over → expire", () => {
    const r = computeDeadlines(
      input({
        today: "2027-03-05",
        items: [item({ category: "electronics" })],
      }),
    );
    expect(r.shouldExpire).toBe(true);
  });

  it("deadline day itself is still open (EC-DATE-03 edge)", () => {
    const r = computeDeadlines(input({ today: "2026-03-14" }));
    expect(r.returnClosed).toBe(false);
    expect(r.shouldExpire).toBe(false);
  });

  it("non-returnable with no warranty has nothing to track", () => {
    const r = computeDeadlines(input({ nonReturnable: true }));
    expect(r.shouldExpire).toBe(true);
  });

  it("EC-ING-22 deadline ends at end of day in the user's timezone", () => {
    const r = computeDeadlines(input());
    // 2026-03-14 23:59:59.999 IST = 18:29:59.999 UTC
    expect(r.returnDeadlineEndsAt?.toISOString()).toBe(
      "2026-03-14T18:29:59.999Z",
    );
  });

  it("EC-DATE-08 changing timezone changes the deadline instant, not the date", () => {
    const ist = computeDeadlines(input());
    const ny = computeDeadlines(input({ timeZone: "America/New_York" }));
    expect(ny.returnDeadline).toBe(ist.returnDeadline);
    expect(ny.returnDeadlineEndsAt?.toISOString()).toBe(
      "2026-03-15T03:59:59.999Z",
    );
  });

  it("EC-DATE-09 DST: deadline right after a spring-forward is end of local day", () => {
    // US DST starts 2026-03-08; New York is UTC-4 afterwards.
    const r = computeDeadlines(
      input({
        timeZone: "America/New_York",
        orderDate: "2026-03-01",
        deliveryDate: "2026-03-01",
        explicitReturnWindow: { days: 8, source: "user" },
      }),
    );
    expect(r.returnDeadline).toBe("2026-03-09");
    expect(r.returnDeadlineEndsAt?.toISOString()).toBe(
      "2026-03-10T03:59:59.999Z",
    );
  });

  it("EC-DATE-09 DST: deadline before the switch uses standard time", () => {
    const r = computeDeadlines(
      input({
        timeZone: "America/New_York",
        orderDate: "2026-03-01",
        deliveryDate: "2026-03-01",
        explicitReturnWindow: { days: 6, source: "user" },
      }),
    );
    expect(r.returnDeadlineEndsAt?.toISOString()).toBe(
      "2026-03-08T04:59:59.999Z",
    );
  });
});
