import { addDays, addMonths, differenceInCalendarDays, format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Calendar dates are plain `YYYY-MM-DD` strings everywhere (EC-ING-22).
 * Arithmetic runs on local-noon Date objects, so the server's own timezone
 * and DST transitions can never shift a date by one.
 */
export type ISODate = string;

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

function toDate(iso: ISODate): Date {
  if (!isISODate(iso)) throw new Error(`Invalid ISO date: ${iso}`);
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

function fromDate(date: Date): ISODate {
  return format(date, "yyyy-MM-dd");
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  return fromDate(addDays(toDate(iso), days));
}

/** Month-end safe (EC-DATE-06): Jan 31 + 1 month = Feb 28 (or 29). */
export function addMonthsISO(iso: ISODate, months: number): ISODate {
  return fromDate(addMonths(toDate(iso), months));
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function diffDaysISO(to: ISODate, from: ISODate): number {
  return differenceInCalendarDays(toDate(to), toDate(from));
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/** Today's calendar date for someone in `timeZone`. */
export function todayInTimeZone(
  timeZone: string,
  now: Date = new Date(),
): ISODate {
  return formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}

/** The last millisecond of `iso` in `timeZone`, as a UTC instant (EC-DATE-09). */
export function endOfDayInTimeZone(iso: ISODate, timeZone: string): Date {
  if (!isISODate(iso)) throw new Error(`Invalid ISO date: ${iso}`);
  return fromZonedTime(`${iso}T23:59:59.999`, timeZone);
}

export function formatISODate(iso: ISODate, pattern = "d MMM yyyy"): string {
  return format(toDate(iso), pattern);
}
