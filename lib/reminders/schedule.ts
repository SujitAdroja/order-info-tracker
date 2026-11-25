import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  addDaysISO,
  diffDaysISO,
  endOfDayInTimeZone,
  maxISO,
  todayInTimeZone,
  type ISODate,
} from "@/lib/dates";

/**
 * Section 9: which reminders a purchase should have, and when. Pure — the
 * caller supplies `now`, so every rule is unit-testable across timezones.
 */

export type ReminderKind = "return" | "warranty" | "review_needed";

export type PlannedReminder = {
  kind: ReminderKind;
  offsetLabel: string;
  itemId: string | null;
  sendAt: Date;
};

export type PlanInput = {
  status: string; // purchase status
  needsReview: boolean;
  createdAt: Date;
  returnDeadline: ISODate | null;
  nonReturnable: boolean;
  items: {
    id: string;
    itemStatus: string;
    warrantyEnd: ISODate | null;
    extendedWarrantyEnd: ISODate | null;
  }[];
  timeZone: string;
  reminderHour: number;
  now: Date;
};

export const RETURN_OFFSETS = [7, 3, 1, 0] as const;
export const WARRANTY_OFFSETS = [30, 7] as const;
export const QUIET_START_HOUR = 22; // 22:00–08:00 local: never send
export const QUIET_END_HOUR = 8;

/** Reminder hours users can pick; anything else is clamped into this range. */
export function clampReminderHour(hour: number): number {
  if (!Number.isFinite(hour)) return 10;
  return Math.min(
    QUIET_START_HOUR - 1,
    Math.max(QUIET_END_HOUR, Math.round(hour)),
  );
}

function atLocalHour(date: ISODate, hour: number, timeZone: string): Date {
  return fromZonedTime(
    `${date}T${String(hour).padStart(2, "0")}:00:00`,
    timeZone,
  );
}

function localHour(at: Date, timeZone: string): number {
  return Number(formatInTimeZone(at, timeZone, "H"));
}

/**
 * Moves a moment out of quiet hours: 22:00–23:59 → 08:00 next day,
 * 00:00–07:59 → 08:00 same day. Already-fine moments are returned as-is.
 */
export function shiftOutOfQuietHours(at: Date, timeZone: string): Date {
  const hour = localHour(at, timeZone);
  if (hour >= QUIET_END_HOUR && hour < QUIET_START_HOUR) return at;
  const day = formatInTimeZone(at, timeZone, "yyyy-MM-dd");
  const morning = hour >= QUIET_START_HOUR ? addDaysISO(day, 1) : day;
  return atLocalHour(morning, QUIET_END_HOUR, timeZone);
}

export function isQuietHour(at: Date, timeZone: string): boolean {
  const hour = localHour(at, timeZone);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * A reminder on `date` at the user's hour. If that moment already passed
 * today, it goes out at the next cron run (`now`), shifted out of quiet
 * hours. Returns null if the date is before today, or if the only possible
 * moment falls after `latest` (e.g. the deadline itself has passed).
 */
function scheduleOn(
  date: ISODate,
  input: PlanInput,
  today: ISODate,
  latest: Date | null,
): Date | null {
  if (date < today) return null;
  let at = atLocalHour(
    date,
    clampReminderHour(input.reminderHour),
    input.timeZone,
  );
  if (at < input.now) at = input.now;
  at = shiftOutOfQuietHours(at, input.timeZone);
  if (latest && at > latest) return null;
  return at;
}

export function planReminders(input: PlanInput): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const today = todayInTimeZone(input.timeZone, input.now);

  // Return: T-7/T-3/T-1/T-0, only while the purchase is still open to return.
  // A deadline ≤ 1 day away yields one "now" reminder (the earlier offsets are in the past).
  if (
    input.status === "active" &&
    input.returnDeadline &&
    !input.nonReturnable
  ) {
    const deadlineEnd = endOfDayInTimeZone(
      input.returnDeadline,
      input.timeZone,
    );
    for (const days of RETURN_OFFSETS) {
      const at = scheduleOn(
        addDaysISO(input.returnDeadline, -days),
        input,
        today,
        deadlineEnd,
      );
      if (at)
        out.push({
          kind: "return",
          offsetLabel: `T-${days}`,
          itemId: null,
          sendAt: at,
        });
    }
  }

  // Warranty: W-30/W-7 per item that's still owned (kept or active).
  if (input.status === "active" || input.status === "kept") {
    for (const item of input.items) {
      if (item.itemStatus !== "active" && item.itemStatus !== "kept") continue;
      const end =
        item.warrantyEnd && item.extendedWarrantyEnd
          ? maxISO(item.warrantyEnd, item.extendedWarrantyEnd)
          : (item.warrantyEnd ?? item.extendedWarrantyEnd);
      if (!end) continue;
      const endAt = endOfDayInTimeZone(end, input.timeZone);
      for (const days of WARRANTY_OFFSETS) {
        const at = scheduleOn(addDaysISO(end, -days), input, today, endAt);
        if (at) {
          out.push({
            kind: "warranty",
            offsetLabel: `W-${days}`,
            itemId: item.id,
            sendAt: at,
          });
        }
      }
    }
  }

  // Review needed: 1 hour after creation, then once more after 2 days.
  // Stale ones (more than a day overdue) are skipped rather than sent late.
  if (input.needsReview && input.status !== "cancelled") {
    for (const [label, ms] of [
      ["R+1h", 60 * 60 * 1000],
      ["R+2d", 2 * 24 * 60 * 60 * 1000],
    ] as const) {
      const due = new Date(input.createdAt.getTime() + ms);
      if (due.getTime() < input.now.getTime() - 24 * 60 * 60 * 1000) continue;
      const at = shiftOutOfQuietHours(
        due < input.now ? input.now : due,
        input.timeZone,
      );
      out.push({
        kind: "review_needed",
        offsetLabel: label,
        itemId: null,
        sendAt: at,
      });
    }
  }

  return out;
}

/** Whole days from today to `date` in the user's timezone (for copy like "in 3 days"). */
export function daysUntil(date: ISODate, timeZone: string, now: Date): number {
  return diffDaysISO(date, todayInTimeZone(timeZone, now));
}
