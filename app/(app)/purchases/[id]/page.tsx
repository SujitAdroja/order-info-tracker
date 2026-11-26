import { PencilIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { CountdownChip } from "@/components/purchases/countdown-chip";
import { DeletePurchaseButton } from "@/components/purchases/delete-purchase-button";
import { EmailProvenance } from "@/components/purchases/email-provenance";
import { OrderProgress } from "@/components/purchases/order-progress";
import { ReviewCallout } from "@/components/purchases/review-callout";
import { StatusActions } from "@/components/purchases/status-actions";
import { StatusBadge } from "@/components/purchases/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { formatISODate } from "@/lib/dates";
import type { DeadlineResult, ReturnBase } from "@/lib/deadlines/compute";
import { formatMoney } from "@/lib/format";
import { CATEGORY_LABELS, type Category } from "@/lib/purchases/constants";
import {
  getPurchaseDetail,
  type PurchaseDetail,
} from "@/lib/purchases/service";
import { getCurrentUser } from "@/lib/session";
import { expectedDelivery, orderStage } from "@/lib/purchases/order-stage";

export const metadata: Metadata = { title: "Purchase" };

export default function PurchasePage({ params }: PageProps<"/purchases/[id]">) {
  return (
    <Suspense
      fallback={
        <div
          aria-busy="true"
          className="h-96 animate-pulse rounded-xl bg-muted"
        />
      }
    >
      <PurchaseContent params={params} />
    </Suspense>
  );
}

async function PurchaseContent({
  params,
}: {
  params: PageProps<"/purchases/[id]">["params"];
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await getCurrentUser();
  const p = await getPurchaseDetail(user, id);
  if (!p) notFound();

  const title =
    p.items.length === 1
      ? p.items[0].name
      : p.items.length > 1
        ? `${p.items[0].name} + ${p.items.length - 1} more`
        : p.storeName;
  const money = formatMoney(p.totalAmount, p.currency);

  return (
    <article className="grid gap-6">
      <header className="grid gap-2">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Dashboard
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {title}
          </h1>
          <StatusBadge status={p.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {[p.storeName, money, `Ordered ${formatISODate(p.orderDate)}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      {p.status !== "returned" && p.status !== "cancelled" ? (
        <ReviewCallout
          purchaseId={p.id}
          reasons={[
            ...new Set([...p.reviewReasons, ...p.computed.reviewReasons]),
          ]}
        />
      ) : null}

      {p.status !== "returned" && p.status !== "cancelled" ? (
        <OrderProgress
          purchaseId={p.id}
          stage={orderStage(p)}
          orderDate={p.orderDate}
          expected={expectedDelivery(p)}
          deliveredOn={
            p.deliveryDate && !p.deliveryDateEstimated ? p.deliveryDate : null
          }
          today={p.today}
        />
      ) : null}

      <section
        aria-labelledby="deadlines"
        className="grid gap-3 rounded-xl border p-4"
      >
        <h2 id="deadlines" className="font-medium">
          Deadlines
        </h2>
        <ReturnSummary p={p} />
        <WarrantySummary p={p} />
      </section>

      <StatusActions purchaseId={p.id} status={p.status} />

      <section aria-labelledby="items" className="grid gap-3">
        <h2 id="items" className="font-medium">
          {p.items.length === 1 ? "Item" : `Items (${p.items.length})`}
        </h2>
        <ul className="grid gap-3">
          {p.items.map((item, i) => (
            <ItemRow key={item.id} p={p} index={i} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="details" className="grid gap-3">
        <h2 id="details" className="font-medium">
          Details
        </h2>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Order date</dt>
          <dd>{formatISODate(p.orderDate)}</dd>
          <dt className="text-muted-foreground">
            {p.deliveryDateEstimated ? "Expected delivery" : "Delivered"}
          </dt>
          <dd>{p.deliveryDate ? formatISODate(p.deliveryDate) : "Not yet"}</dd>
          {p.externalOrderId ? (
            <>
              <dt className="text-muted-foreground">Order number</dt>
              <dd className="font-mono break-all">{p.externalOrderId}</dd>
            </>
          ) : null}
          {p.notes ? (
            <>
              <dt className="text-muted-foreground">Notes</dt>
              <dd className="whitespace-pre-wrap">{p.notes}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Added</dt>
          <dd>{p.source === "manual" ? "By you" : "From email"}</dd>
        </dl>
      </section>

      {p.source === "email" ? (
        <Suspense fallback={null}>
          <EmailProvenance userId={user.id} purchaseId={p.id} />
        </Suspense>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Link
          href={`/purchases/${p.id}/edit`}
          className={buttonVariants({ variant: "outline" })}
        >
          <PencilIcon aria-hidden />
          Edit
        </Link>
        <DeletePurchaseButton purchaseId={p.id} />
      </div>
    </article>
  );
}

const BASE_LABEL: Record<ReturnBase, string> = {
  delivery: "delivery",
  expected_delivery: "expected delivery",
  order: "order date",
};

const SOURCE_LABEL: Record<
  NonNullable<DeadlineResult["returnWindowSource"]>,
  string
> = {
  user: "you set this",
  email: "stated in the order email",
  category: "store policy for this category",
  store: "store policy",
};

function ReturnSummary({ p }: { p: PurchaseDetail }) {
  const c = p.computed;
  if (p.status === "returned") return <Line label="Return">Returned</Line>;
  if (p.status === "cancelled")
    return <Line label="Return">Order cancelled</Line>;
  if (p.status === "kept")
    return <Line label="Return">You&apos;re keeping it</Line>;
  if (c.nonReturnable)
    return <Line label="Return">Final sale, can&apos;t be returned</Line>;
  if (!c.returnDeadline)
    return <Line label="Return">Return window unknown</Line>;

  return (
    <Line label="Return">
      <span className="flex flex-wrap items-center gap-2">
        <CountdownChip
          kind="return"
          deadline={c.returnDeadline}
          today={p.today}
          estimated={c.returnDeadlineEstimated}
        />
        <span data-testid="return-deadline">
          {c.returnDeadlineEstimated ? "About " : "By "}
          {formatISODate(c.returnDeadline)}
        </span>
      </span>
      <span className="block text-xs text-muted-foreground">
        {c.returnWindowDays} days from {BASE_LABEL[c.returnBase]}
        {c.returnWindowSource ? ` (${SOURCE_LABEL[c.returnWindowSource]})` : ""}
        {c.returnDeadlineEstimated
          ? ". Estimated until the delivery date is confirmed."
          : ""}
      </span>
    </Line>
  );
}

function WarrantySummary({ p }: { p: PurchaseDetail }) {
  const end = p.computed.latestWarrantyEnd;
  if (!end) return <Line label="Warranty">None recorded</Line>;
  return (
    <Line label="Warranty">
      <span className="flex flex-wrap items-center gap-2">
        <CountdownChip kind="warranty" deadline={end} today={p.today} />
        <span data-testid="warranty-end">Until {formatISODate(end)}</span>
      </span>
    </Line>
  );
}

function ItemRow({ p, index }: { p: PurchaseDetail; index: number }) {
  const item = p.items[index];
  const c = p.computed.items[index];
  const price = formatMoney(item.unitPrice, p.currency);
  const showOwnReturn =
    p.items.length > 1 &&
    c.returnDeadline &&
    c.returnDeadline !== p.computed.returnDeadline;

  return (
    <li
      className="grid gap-1 rounded-xl border p-4 text-sm"
      data-testid="item-row"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium break-words">{item.name}</span>
        {item.itemStatus !== "active" ? (
          <span className="shrink-0 text-xs text-muted-foreground capitalize">
            {item.itemStatus === "kept" ? "Keeping" : item.itemStatus}
          </span>
        ) : null}
      </div>
      <span className="text-muted-foreground">
        {[
          item.category ? CATEGORY_LABELS[item.category as Category] : null,
          item.quantity > 1 ? `Qty ${item.quantity}` : null,
          price,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {c.warrantyMonths ? (
        <span>
          Warranty: {c.warrantyMonths} months
          {c.warrantyMonthsIsDefault ? " (typical for this category)" : ""}
          {c.warrantyEnd ? `, until ${formatISODate(c.warrantyEnd)}` : ""}
        </span>
      ) : null}
      {item.extendedWarrantyEnd ? (
        <span>
          Extended warranty until {formatISODate(item.extendedWarrantyEnd)}
        </span>
      ) : null}
      {showOwnReturn ? (
        <span>Return by {formatISODate(c.returnDeadline!)}</span>
      ) : null}
      {item.serialNumber ? (
        <span>
          Serial: <span className="font-mono">{item.serialNumber}</span>
        </span>
      ) : null}
    </li>
  );
}

function Line({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 text-sm sm:grid-cols-[6rem_1fr]">
      <span className="text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}
