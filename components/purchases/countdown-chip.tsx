import type { ISODate } from "@/lib/dates";
import { countdown, type CountdownTone } from "@/lib/deadlines/countdown";
import { cn } from "@/lib/utils";

const TONE: Record<CountdownTone, string> = {
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  neutral: "bg-muted text-foreground",
  closed: "bg-muted text-muted-foreground",
};

export function CountdownChip({
  kind,
  deadline,
  today,
  estimated = false,
}: {
  kind: "return" | "warranty";
  deadline: ISODate;
  today: ISODate;
  estimated?: boolean;
}) {
  const c = countdown(deadline, today, { estimated });
  const prefix = kind === "return" ? "Return" : "Warranty";
  return (
    <span
      data-testid={`${kind}-countdown`}
      data-tone={c.tone}
      title={
        estimated ? "Estimated: delivery date not confirmed yet" : undefined
      }
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        TONE[c.tone],
      )}
    >
      {prefix}: {c.label}
    </span>
  );
}
