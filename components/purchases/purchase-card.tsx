import Link from "next/link";
import { CountdownChip } from "@/components/purchases/countdown-chip";
import { OrderStageChip } from "@/components/purchases/order-stage-chip";
import { StatusBadge } from "@/components/purchases/status-badge";
import { formatISODate, type ISODate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { FEATURES } from "@/lib/features";
import type { DashboardTab } from "@/lib/purchases/buckets";
import type { PurchaseSummary } from "@/lib/purchases/service";

export function PurchaseCard({
  purchase: p,
  today,
  tab,
}: {
  purchase: PurchaseSummary;
  today: ISODate;
  tab: DashboardTab;
}) {
  const money = formatMoney(p.totalAmount, p.currency);
  const showReturn =
    p.returnDeadline &&
    (tab === "returns" || tab === "review" || tab === "history");
  const showWarranty =
    FEATURES.warranty &&
    p.latestWarrantyEnd &&
    (tab === "warranty" || tab === "history");

  return (
    <li>
      <Link
        href={`/purchases/${p.id}`}
        data-testid="purchase-card"
        className="grid gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="font-medium break-words">{p.title}</span>
          {p.status !== "active" ? <StatusBadge status={p.status} /> : null}
        </div>
        <span className="text-sm text-muted-foreground">
          {[p.storeName, money, `Ordered ${formatISODate(p.orderDate)}`]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <div className="flex flex-wrap gap-2">
          {tab === "orders" ? <OrderStageChip p={p} today={today} /> : null}
          {showReturn ? (
            <CountdownChip
              kind="return"
              deadline={p.returnDeadline!}
              today={today}
              estimated={p.returnDeadlineEstimated}
            />
          ) : null}
          {showWarranty ? (
            <CountdownChip
              kind="warranty"
              deadline={p.latestWarrantyEnd!}
              today={today}
            />
          ) : null}
          {p.nonReturnable ? (
            <span className="inline-flex h-6 items-center rounded-full border px-2.5 text-xs">
              Final sale
            </span>
          ) : null}
          {p.needsReview && tab !== "history" ? (
            <span className="inline-flex h-6 items-center rounded-full bg-amber-100 px-2.5 text-xs font-medium text-amber-900">
              Needs review
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
