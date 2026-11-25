import type { PurchaseStatus } from "@/lib/purchases/status";
import { cn } from "@/lib/utils";

const LABEL: Record<PurchaseStatus, string> = {
  active: "Active",
  returned: "Returned",
  kept: "Keeping",
  cancelled: "Cancelled",
  expired: "Expired",
};

const STYLE: Record<PurchaseStatus, string> = {
  active: "bg-primary/10 text-primary",
  returned: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  kept: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: PurchaseStatus }) {
  return (
    <span
      data-testid="status-badge"
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium",
        STYLE[status],
      )}
    >
      {LABEL[status]}
    </span>
  );
}
