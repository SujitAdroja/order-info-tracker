import { diffDaysISO, formatISODate, type ISODate } from "@/lib/dates";

export type CountdownTone = "danger" | "warning" | "neutral" | "closed";

export type Countdown = {
  daysLeft: number;
  tone: CountdownTone;
  label: string;
};

/** Beyond this many days, show the date instead of a day count. */
const SHOW_DATE_AFTER_DAYS = 60;

/**
 * Countdown chip for a deadline (Section 11, screen 3):
 * red ≤ 3 days, amber ≤ 7, neutral otherwise. "~" marks an estimate.
 */
export function countdown(
  deadline: ISODate,
  today: ISODate,
  { estimated = false }: { estimated?: boolean } = {},
): Countdown {
  const daysLeft = diffDaysISO(deadline, today);
  const approx = estimated ? "~" : "";

  if (daysLeft < 0) {
    return {
      daysLeft,
      tone: "closed",
      label: `Closed ${formatISODate(deadline)}`,
    };
  }
  const tone: CountdownTone =
    daysLeft <= 3 ? "danger" : daysLeft <= 7 ? "warning" : "neutral";

  let label: string;
  if (daysLeft === 0) label = "Last day today";
  else if (daysLeft === 1) label = "1 day left";
  else if (daysLeft > SHOW_DATE_AFTER_DAYS)
    label = `Until ${formatISODate(deadline)}`;
  else label = `${daysLeft} days left`;

  return { daysLeft, tone, label: approx + label };
}
