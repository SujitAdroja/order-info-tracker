import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ForwardingAddressCard,
  ForwardingAddressSkeleton,
} from "@/components/forwarding-address-card";
import { PurchaseCard } from "@/components/purchases/purchase-card";
import { buttonVariants } from "@/components/ui/button";
import { todayInTimeZone } from "@/lib/dates";
import {
  DASHBOARD_TAB_LABELS,
  DASHBOARD_TABS,
  bucketPurchases,
  type DashboardTab,
} from "@/lib/purchases/buckets";
import {
  listUnreadableEmails,
  type UnreadableEmail,
} from "@/lib/ingest/queries";
import { listPurchaseSummaries } from "@/lib/purchases/service";
import { getCurrentUser } from "@/lib/session";
import { ensureForwardingAddress } from "@/lib/users";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const EMPTY: Record<DashboardTab, string> = {
  returns: "No return windows open right now.",
  warranty:
    "Nothing under warranty yet. Electronics and appliances show up here.",
  review: "All caught up. Nothing needs your review.",
  history:
    "Returned, kept-and-expired and cancelled purchases will show up here.",
};

export default function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Link href="/add" className={buttonVariants({ size: "sm" })}>
          <PlusIcon aria-hidden />
          Add purchase
        </Link>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DashboardContent({
  searchParams,
}: {
  searchParams: PageProps<"/dashboard">["searchParams"];
}) {
  const [{ tab: rawTab, deleted }, user] = await Promise.all([
    searchParams,
    getCurrentUser(),
  ]);
  const [purchases, unreadable] = await Promise.all([
    listPurchaseSummaries(user),
    listUnreadableEmails(user.id),
  ]);
  const today = todayInTimeZone(user.timezone);

  if (purchases.length === 0 && unreadable.length === 0) {
    return (
      <>
        {deleted ? <DeletedNotice /> : null}
        <section className="rounded-xl border border-dashed p-6 text-center">
          <h2 className="font-medium">Nothing tracked yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Forward an order email to your address below, or add a purchase by
            hand. We&apos;ll track its return window and warranty.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/onboarding"
              className={buttonVariants({ variant: "outline" })}
            >
              Set up Gmail auto-forward
            </Link>
            <Link
              href="/add"
              className={buttonVariants({ variant: "outline" })}
            >
              Add a purchase manually
            </Link>
          </div>
        </section>
        <Suspense fallback={<ForwardingAddressSkeleton />}>
          <DashboardAddress userId={user.id} />
        </Suspense>
      </>
    );
  }

  const buckets = bucketPurchases(purchases, today);
  const count = (t: DashboardTab) =>
    buckets[t].length + (t === "review" ? unreadable.length : 0);
  const requested = DASHBOARD_TABS.find((t) => t === rawTab);
  // Default to the first tab with something in it.
  const tab: DashboardTab =
    requested ?? DASHBOARD_TABS.find((t) => count(t) > 0) ?? "returns";
  const list = buckets[tab];

  return (
    <>
      {deleted ? <DeletedNotice /> : null}
      <nav aria-label="Purchase lists" className="-mx-5 overflow-x-auto px-5">
        <ul className="flex gap-1 border-b">
          {DASHBOARD_TABS.map((t) => (
            <li key={t}>
              <Link
                href={`/dashboard?tab=${t}`}
                aria-current={t === tab ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
                  t === tab
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {DASHBOARD_TAB_LABELS[t]}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    t === "review" && count(t) > 0
                      ? "bg-amber-100 text-amber-900"
                      : "bg-muted",
                  )}
                >
                  {count(t)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "review" && unreadable.length ? (
        <UnreadableEmails emails={unreadable} />
      ) : null}

      {list.length ? (
        <ul className="grid gap-3" aria-label={DASHBOARD_TAB_LABELS[tab]}>
          {list.map((p) => (
            <PurchaseCard key={p.id} purchase={p} today={today} tab={tab} />
          ))}
        </ul>
      ) : tab === "review" && unreadable.length ? null : (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {EMPTY[tab]}
        </p>
      )}
    </>
  );
}

const UNREADABLE_REASON: Record<string, string> = {
  processing_failed: "We couldn't read this email.",
  image_only: "The details were in images.",
};

function UnreadableEmails({ emails }: { emails: UnreadableEmail[] }) {
  return (
    <section
      aria-labelledby="unreadable"
      className="grid gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <h2 id="unreadable" className="font-medium">
        Emails we couldn&apos;t read
      </h2>
      <ul className="grid gap-1" data-testid="unreadable-emails">
        {emails.map((e) => (
          <li key={e.id}>
            From {e.fromDomain ?? "unknown sender"}, received{" "}
            {e.receivedAt.toISOString().slice(0, 10)}.{" "}
            {UNREADABLE_REASON[e.reviewReason ?? ""] ??
              "We couldn't read this email."}
          </li>
        ))}
      </ul>
      <Link
        href="/add"
        className={buttonVariants({
          size: "sm",
          className: "justify-self-start",
        })}
      >
        Add the details by hand
      </Link>
    </section>
  );
}

function DeletedNotice() {
  return (
    <p role="status" className="rounded-lg bg-muted px-4 py-2 text-sm">
      Purchase deleted.
    </p>
  );
}

async function DashboardAddress({ userId }: { userId: string }) {
  const address = await ensureForwardingAddress(userId);
  return <ForwardingAddressCard address={address} />;
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-3">
      <div className="h-10 animate-pulse rounded-lg bg-muted" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
