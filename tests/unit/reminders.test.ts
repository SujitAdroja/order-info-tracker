import { describe, expect, it } from "vitest";
import {
  digestMessage,
  formatMoney,
  reminderMessage,
  type ReminderContext,
} from "@/lib/reminders/content";
import {
  clampReminderHour,
  isQuietHour,
  planReminders,
  shiftOutOfQuietHours,
  type PlanInput,
} from "@/lib/reminders/schedule";

const IST = "Asia/Kolkata"; // UTC+5:30, no DST

/** 10:00 IST on a date → UTC ISO string. */
const ist = (date: string, time = "10:00") =>
  new Date(`${date}T${time}:00+05:30`).toISOString();

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    status: "active",
    needsReview: false,
    createdAt: new Date("2026-11-20T00:00:00Z"),
    returnDeadline: "2026-12-10",
    nonReturnable: false,
    items: [],
    timeZone: IST,
    reminderHour: 10,
    now: new Date(ist("2026-11-25", "05:30")),
    ...over,
  };
}

const summary = (rs: ReturnType<typeof planReminders>) =>
  rs.map((r) => `${r.kind}:${r.offsetLabel}@${r.sendAt.toISOString()}`);

describe("planReminders — return window (Section 9)", () => {
  it("schedules T-7/T-3/T-1/T-0 at the user's hour in their timezone", () => {
    expect(summary(planReminders(input()))).toEqual([
      `return:T-7@${ist("2026-12-03")}`,
      `return:T-3@${ist("2026-12-07")}`,
      `return:T-1@${ist("2026-12-09")}`,
      `return:T-0@${ist("2026-12-10")}`,
    ]);
  });

  it("skips offsets already in the past", () => {
    const rs = planReminders(
      input({ now: new Date(ist("2026-12-08", "06:00")) }),
    );
    expect(rs.map((r) => r.offsetLabel)).toEqual(["T-1", "T-0"]);
  });

  it("sends today's offset at the next run if the hour already passed", () => {
    const now = new Date(ist("2026-12-10", "15:00"));
    const rs = planReminders(input({ now }));
    expect(summary(rs)).toEqual([`return:T-0@${now.toISOString()}`]);
  });

  it("imported a day before the deadline: one reminder now, then the last-day one", () => {
    const now = new Date(ist("2026-12-09", "15:00"));
    expect(summary(planReminders(input({ now })))).toEqual([
      `return:T-1@${now.toISOString()}`,
      `return:T-0@${ist("2026-12-10")}`,
    ]);
  });

  it("nothing once the deadline has passed", () => {
    expect(
      planReminders(input({ now: new Date(ist("2026-12-11", "09:00")) })),
    ).toEqual([]);
  });

  it("quiet hours: a reminder due at night moves to 08:00, but never past the deadline", () => {
    const night = new Date(ist("2026-12-09", "23:00"));
    expect(summary(planReminders(input({ now: night })))).toEqual([
      `return:T-1@${ist("2026-12-10", "08:00")}`,
      `return:T-0@${ist("2026-12-10")}`,
    ]);
    // Last day, 23:00: 08:00 tomorrow is after the deadline → dropped.
    expect(
      planReminders(input({ now: new Date(ist("2026-12-10", "23:00")) })),
    ).toEqual([]);
  });

  it("only for active, returnable purchases (EC-PUSH-06)", () => {
    for (const status of ["kept", "returned", "cancelled", "expired"]) {
      expect(
        planReminders(input({ status })).filter((r) => r.kind === "return"),
      ).toEqual([]);
    }
    expect(planReminders(input({ nonReturnable: true }))).toEqual([]);
    expect(planReminders(input({ returnDeadline: null }))).toEqual([]);
  });

  it("respects DST (EC-DATE-09): New York 10:00 is 14:00Z before and 15:00Z after Nov 1", () => {
    const rs = planReminders(
      input({
        timeZone: "America/New_York",
        returnDeadline: "2026-11-03",
        now: new Date("2026-10-20T12:00:00Z"),
      }),
    );
    expect(summary(rs)).toEqual([
      "return:T-7@2026-10-27T14:00:00.000Z",
      "return:T-3@2026-10-31T14:00:00.000Z",
      "return:T-1@2026-11-02T15:00:00.000Z",
      "return:T-0@2026-11-03T15:00:00.000Z",
    ]);
  });

  it("works at UTC+14 (Kiritimati), where the local date is ahead of UTC", () => {
    const rs = planReminders(
      input({
        timeZone: "Pacific/Kiritimati",
        returnDeadline: "2026-12-10",
        now: new Date("2026-12-09T12:00:00Z"), // already 02:00 on Dec 10 there
      }),
    );
    // T-1 (Dec 9) is in the past locally; T-0 at 10:00 on Dec 10 (= 20:00Z Dec 9).
    expect(summary(rs)).toEqual(["return:T-0@2026-12-09T20:00:00.000Z"]);
  });
});

describe("planReminders — warranty", () => {
  const item = (over = {}) => ({
    id: "item-1",
    itemStatus: "active",
    warrantyEnd: "2027-06-30",
    extendedWarrantyEnd: null as string | null,
    ...over,
  });

  it("W-30 and W-7 per owned item, for active or kept purchases", () => {
    const rs = planReminders(
      input({ status: "kept", returnDeadline: null, items: [item()] }),
    );
    expect(summary(rs)).toEqual([
      `warranty:W-30@${ist("2027-05-31")}`,
      `warranty:W-7@${ist("2027-06-23")}`,
    ]);
    expect(rs.every((r) => r.itemId === "item-1")).toBe(true);
  });

  it("uses the later of warranty and extended warranty (EC-DATE-12)", () => {
    const rs = planReminders(
      input({
        returnDeadline: null,
        items: [item({ extendedWarrantyEnd: "2028-06-30" })],
      }),
    );
    expect(rs[0].sendAt.toISOString()).toBe(ist("2028-05-31"));
  });

  it("skips returned items and purchases", () => {
    expect(
      planReminders(
        input({
          returnDeadline: null,
          items: [item({ itemStatus: "returned" })],
        }),
      ),
    ).toEqual([]);
    expect(
      planReminders(
        input({ status: "returned", returnDeadline: null, items: [item()] }),
      ),
    ).toEqual([]);
  });
});

describe("planReminders — needs review", () => {
  it("1 hour after creation, then after 2 days", () => {
    const created = new Date(ist("2026-11-25", "11:00"));
    const rs = planReminders(
      input({
        needsReview: true,
        returnDeadline: null,
        createdAt: created,
        now: created,
      }),
    );
    expect(summary(rs)).toEqual([
      `review_needed:R+1h@${ist("2026-11-25", "12:00")}`,
      `review_needed:R+2d@${ist("2026-11-27", "11:00")}`,
    ]);
  });

  it("at night, waits for 08:00; long-overdue ones are dropped", () => {
    const created = new Date(ist("2026-11-25", "21:30"));
    const rs = planReminders(
      input({
        needsReview: true,
        returnDeadline: null,
        createdAt: created,
        now: created,
      }),
    );
    expect(rs[0].sendAt.toISOString()).toBe(ist("2026-11-26", "08:00"));

    const later = planReminders(
      input({
        needsReview: true,
        returnDeadline: null,
        createdAt: created,
        now: new Date(ist("2026-11-27", "12:00")),
      }),
    );
    expect(later.map((r) => r.offsetLabel)).toEqual(["R+2d"]);
  });
});

describe("quiet hours and reminder hour", () => {
  it("clamps the reminder hour outside 22:00–08:00", () => {
    expect(clampReminderHour(23)).toBe(21);
    expect(clampReminderHour(5)).toBe(8);
    expect(clampReminderHour(10)).toBe(10);
    expect(clampReminderHour(Number.NaN)).toBe(10);
    expect(summary(planReminders(input({ reminderHour: 3 })))[0]).toBe(
      `return:T-7@${ist("2026-12-03", "08:00")}`,
    );
  });

  it("detects and shifts quiet hours in the user's timezone", () => {
    expect(isQuietHour(new Date(ist("2026-11-25", "22:00")), IST)).toBe(true);
    expect(isQuietHour(new Date(ist("2026-11-25", "07:59")), IST)).toBe(true);
    expect(isQuietHour(new Date(ist("2026-11-25", "08:00")), IST)).toBe(false);
    expect(
      shiftOutOfQuietHours(
        new Date(ist("2026-11-25", "02:00")),
        IST,
      ).toISOString(),
    ).toBe(ist("2026-11-25", "08:00"));
    expect(
      shiftOutOfQuietHours(
        new Date(ist("2026-11-25", "22:30")),
        IST,
      ).toISOString(),
    ).toBe(ist("2026-11-26", "08:00"));
  });
});

describe("notification content", () => {
  const ctx = (over: Partial<ReminderContext> = {}): ReminderContext => ({
    kind: "return",
    purchaseId: "p1",
    storeName: "Amazon.in",
    itemName: "Boat Airdopes 141",
    totalAmount: "1299.00",
    currency: "INR",
    returnDeadline: "2026-12-10",
    warrantyEnd: null,
    ...over,
  });
  const now = new Date(ist("2026-12-07", "10:00"));

  it("matches the plan's example and links to the purchase", () => {
    const m = reminderMessage(ctx(), IST, now);
    expect(m.title).toBe("Return window closes in 3 days");
    expect(m.body).toBe("Boat Airdopes 141 · Amazon.in · ₹1,299");
    expect(m.url).toBe("/purchases/p1");
    expect(m.actions.map((a) => a.title)).toEqual(["Returned", "Keeping it"]);
  });

  it("says today / tomorrow, and warranty has no action buttons", () => {
    expect(
      reminderMessage(ctx({ returnDeadline: "2026-12-07" }), IST, now).title,
    ).toBe("Return window closes today");
    expect(
      reminderMessage(ctx({ returnDeadline: "2026-12-08" }), IST, now).title,
    ).toBe("Return window closes tomorrow");
    const w = reminderMessage(
      ctx({ kind: "warranty", warrantyEnd: "2027-01-06" }),
      IST,
      now,
    );
    expect(w.title).toBe("Warranty ends in 30 days");
    expect(w.actions).toEqual([]);
  });

  it("digests several reminders into one (EC-PUSH-05)", () => {
    const a = reminderMessage(ctx(), IST, now);
    const b = reminderMessage(
      ctx({
        purchaseId: "p2",
        itemName: "Kettle",
        returnDeadline: "2026-12-08",
      }),
      IST,
      now,
    );
    const d = digestMessage([a, b]);
    expect(d.title).toBe("2 return windows close soon");
    expect(d.body).toBe(
      "Boat Airdopes 141: return closes in 3 days; Kettle: return closes tomorrow",
    );
    expect(d.url).toBe("/dashboard");

    const w = reminderMessage(
      ctx({ kind: "warranty", purchaseId: "p3", warrantyEnd: "2027-01-06" }),
      IST,
      now,
    );
    expect(digestMessage([a, w]).title).toBe("You have 2 reminders");
  });

  it("formats money without trailing zeros", () => {
    expect(formatMoney("1299.00", "INR")).toBe("₹1,299");
    expect(formatMoney("19.99", "USD")).toBe("$19.99");
    expect(formatMoney(null, "INR")).toBeNull();
  });
});
