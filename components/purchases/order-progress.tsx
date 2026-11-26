"use client";

import { CheckIcon, PackageCheckIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setOrderStageAction } from "@/app/actions/purchases";
import { OnlineButton } from "@/components/pwa/online-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatISODate, type ISODate } from "@/lib/dates";
import {
  ORDER_STAGE_LABELS,
  ORDER_STAGES,
  type OrderStage,
} from "@/lib/purchases/order-stage";
import { cn } from "@/lib/utils";

/**
 * Order tracking on the purchase page: Ordered → Shipped → Out for delivery
 * → Delivered. Emails move it forward automatically; these buttons let you
 * do it by hand. Marking delivered asks for the date (return windows count
 * from it).
 */
export function OrderProgress({
  purchaseId,
  stage,
  orderDate,
  expected,
  deliveredOn,
  today,
}: {
  purchaseId: string;
  stage: OrderStage;
  orderDate: ISODate;
  expected: ISODate | null;
  deliveredOn: ISODate | null;
  today: ISODate;
}) {
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(
    expected && expected < today && expected >= orderDate ? expected : today,
  );
  const current = ORDER_STAGES.indexOf(stage);
  const late = stage !== "delivered" && expected !== null && expected < today;

  const go = (next: OrderStage, deliveredDate: ISODate | null = null) =>
    startTransition(async () => {
      const res = await setOrderStageAction({
        purchaseId,
        stage: next,
        deliveredOn: deliveredDate,
      });
      if (res.ok) {
        setPicking(false);
        toast.success(
          next === "delivered"
            ? "Marked as delivered. Return window updated."
            : `Marked as ${ORDER_STAGE_LABELS[next].toLowerCase()}`,
        );
      } else {
        toast.error(res.error);
      }
    });

  return (
    <section
      aria-labelledby="order-progress"
      data-testid="order-progress"
      data-stage={stage}
      className="grid gap-4 rounded-xl border p-4"
    >
      <h2 id="order-progress" className="font-medium">
        Order progress
      </h2>

      <ol className="grid grid-cols-4 gap-1 text-center text-xs">
        {ORDER_STAGES.map((s, i) => {
          const done = i <= current;
          return (
            <li key={s} className="grid justify-items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-[11px]",
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground",
                )}
              >
                {done ? <CheckIcon className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(done ? "font-medium" : "text-muted-foreground")}
                aria-current={i === current ? "step" : undefined}
              >
                {ORDER_STAGE_LABELS[s]}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="text-sm text-muted-foreground" data-testid="order-eta">
        {stage === "delivered" && deliveredOn
          ? `Delivered ${formatISODate(deliveredOn)}.`
          : late
            ? `Expected ${formatISODate(expected!)} — running late? If it arrived, mark it delivered.`
            : expected
              ? `Expected around ${formatISODate(expected)}.`
              : "No delivery date yet. We'll ask you a week after ordering."}
      </p>

      {stage === "delivered" ? (
        <OnlineButton
          variant="ghost"
          size="sm"
          className="-ml-2 justify-self-start"
          disabled={pending}
          onClick={() => go("out_for_delivery")}
        >
          Not delivered yet?
        </OnlineButton>
      ) : picking ? (
        <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="delivered-on">Delivered on</Label>
            <Input
              id="delivered-on"
              type="date"
              value={date}
              min={orderDate}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <OnlineButton
              disabled={pending || !date}
              onClick={() => go("delivered", date)}
            >
              Save
            </OnlineButton>
            <OnlineButton
              variant="ghost"
              disabled={pending}
              onClick={() => setPicking(false)}
            >
              Cancel
            </OnlineButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <OnlineButton disabled={pending} onClick={() => setPicking(true)}>
            <PackageCheckIcon aria-hidden />
            Mark as delivered
          </OnlineButton>
          {stage === "ordered" ? (
            <OnlineButton
              variant="outline"
              disabled={pending}
              onClick={() => go("shipped")}
            >
              Mark as shipped
            </OnlineButton>
          ) : null}
          {stage === "ordered" || stage === "shipped" ? (
            <OnlineButton
              variant="outline"
              disabled={pending}
              onClick={() => go("out_for_delivery")}
            >
              Out for delivery
            </OnlineButton>
          ) : null}
        </div>
      )}
    </section>
  );
}
