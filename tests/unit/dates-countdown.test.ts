import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  addMonthsISO,
  diffDaysISO,
  isISODate,
  todayInTimeZone,
} from "@/lib/dates";
import { countdown } from "@/lib/deadlines/countdown";

describe("date helpers", () => {
  it("validates real calendar dates only", () => {
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("2026-1-01")).toBe(false);
  });

  it("adds days across month and year ends", () => {
    expect(addDaysISO("2026-12-25", 10)).toBe("2027-01-04");
    expect(addDaysISO("2026-03-31", -31)).toBe("2026-02-28");
  });

  it("adds months, clamping to month end", () => {
    expect(addMonthsISO("2026-08-31", 1)).toBe("2026-09-30");
    expect(addMonthsISO("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("counts calendar days regardless of DST", () => {
    expect(diffDaysISO("2026-03-09", "2026-03-07")).toBe(2);
    expect(diffDaysISO("2026-11-02", "2026-10-31")).toBe(2);
  });

  it("today depends on the user's timezone", () => {
    const now = new Date("2026-03-04T20:00:00Z");
    expect(todayInTimeZone("Asia/Kolkata", now)).toBe("2026-03-05");
    expect(todayInTimeZone("America/Los_Angeles", now)).toBe("2026-03-04");
  });
});

describe("countdown chip", () => {
  const today = "2026-03-10";

  it.each([
    ["2026-03-10", "danger", "Last day today"],
    ["2026-03-11", "danger", "1 day left"],
    ["2026-03-13", "danger", "3 days left"],
    ["2026-03-14", "warning", "4 days left"],
    ["2026-03-17", "warning", "7 days left"],
    ["2026-03-18", "neutral", "8 days left"],
    ["2026-05-09", "neutral", "60 days left"],
    ["2026-05-10", "neutral", "Until 10 May 2026"],
    ["2026-03-09", "closed", "Closed 9 Mar 2026"],
  ])("%s → %s %s", (deadline, tone, label) => {
    expect(countdown(deadline, today)).toMatchObject({ tone, label });
  });

  it("prefixes estimates with ~", () => {
    expect(countdown("2026-03-14", today, { estimated: true }).label).toBe(
      "~4 days left",
    );
  });
});
