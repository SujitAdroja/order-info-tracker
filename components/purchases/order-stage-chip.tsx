import { TruckIcon } from "lucide-react";
import { formatISODate, type ISODate } from "@/lib/dates";
import {
  ORDER_STAGE_LABELS,
  expectedDelivery,
  orderStage,
  type StageInput,
} from "@/lib/purchases/order-stage";
import { cn } from "@/lib/utils";

/** Orders tab chip: "Shipped · arriving ~28 Nov", or "late" once overdue. */
export function OrderStageChip({
  p,
  today,
}: {
  p: StageInput;
  today: ISODate;
}) {
  const stage = orderStage(p);
  const expected = expectedDelivery(p);
  const late = expected !== null && expected < today;
  const eta = expected
    ? late
      ? `expected ${formatISODate(expected, "d MMM")} — late?`
      : expected === today
        ? "arriving today"
        : `arriving ~${formatISODate(expected, "d MMM")}`
    : null;
  return (
    <span
      data-testid="order-stage"
      data-stage={stage}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        late
          ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          : "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
      )}
    >
      <TruckIcon aria-hidden className="size-3.5" />
      {ORDER_STAGE_LABELS[stage]}
      {eta ? ` · ${eta}` : ""}
    </span>
  );
}
