import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CopyButton } from "@/components/copy-button";
import {
  ForwardingAddressCard,
  ForwardingAddressSkeleton,
} from "@/components/forwarding-address-card";
import { GmailCode } from "@/components/onboarding/gmail-code";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/session";
import { ensureForwardingAddress } from "@/lib/users";

export const metadata: Metadata = { title: "Set up forwarding" };

/** F2 step 3: suggested Gmail filter for order emails. */
const GMAIL_FILTER =
  "from:(amazon.in OR flipkart.com OR myntra.com OR ajio.com OR nykaa.com OR croma.com OR amazon.com OR apple.com OR bestbuy.com OR ikea.com) subject:(order OR invoice OR delivered OR shipped OR cancelled OR refund)";

export default function OnboardingPage() {
  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Get your orders into KeepTrack
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We never ask for access to your inbox. Forward only the emails you
          choose, by hand or with a Gmail filter.
        </p>
      </div>

      <section aria-labelledby="forward" className="grid gap-3">
        <h2 id="forward" className="font-medium">
          1. Forward an order email now
        </h2>
        <Suspense fallback={<ForwardingAddressSkeleton />}>
          <OnboardingAddress />
        </Suspense>
      </section>

      <section aria-labelledby="gmail" className="grid gap-4">
        <h2 id="gmail" className="font-medium">
          2. Or set up auto-forwarding in Gmail
        </h2>
        <ol className="grid list-decimal gap-3 pl-5 text-sm">
          <li>
            In Gmail on a computer, open{" "}
            <strong>
              Settings → See all settings → Forwarding and POP/IMAP
            </strong>
            .
          </li>
          <li>
            Click <strong>Add a forwarding address</strong> and paste your
            KeepTrack address from step 1.
          </li>
          <li>
            Gmail sends us a confirmation email. Its code shows up below within
            a few seconds:
            <div className="mt-3">
              <Suspense fallback={null}>
                <OnboardingGmailCode />
              </Suspense>
            </div>
          </li>
          <li>
            Back in Gmail, create a filter (search box →{" "}
            <strong>Show search options</strong> →{" "}
            <strong>Create filter</strong>) with this search, and choose{" "}
            <strong>Forward it to</strong> your KeepTrack address:
            <div className="mt-3 grid gap-2 rounded-lg border bg-muted/40 p-3">
              <code className="font-mono text-xs break-all">
                {GMAIL_FILTER}
              </code>
              <CopyButton value={GMAIL_FILTER} label="Copy filter" />
            </div>
          </li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Gmail only forwards new emails. Forward older order emails by hand.
        </p>
      </section>

      <section aria-labelledby="manual" className="grid gap-3">
        <h2 id="manual" className="font-medium">
          3. Or add a purchase by hand
        </h2>
        <Link
          href="/add"
          className={buttonVariants({
            variant: "outline",
            className: "justify-self-start",
          })}
        >
          Add a purchase
        </Link>
      </section>
    </div>
  );
}

async function OnboardingAddress() {
  const user = await getCurrentUser();
  const address = await ensureForwardingAddress(user.id);
  return <ForwardingAddressCard address={address} />;
}

async function OnboardingGmailCode() {
  const user = await getCurrentUser();
  const row = await getDb().query.users.findFirst({
    where: eq(users.id, user.id),
    columns: {
      pendingGmailCode: true,
      pendingGmailCodeExpiresAt: true,
      gmailForwardingVerified: true,
    },
  });
  const live =
    row?.pendingGmailCode &&
    row.pendingGmailCodeExpiresAt &&
    row.pendingGmailCodeExpiresAt > new Date();
  return (
    <GmailCode
      initial={{
        code: live ? row!.pendingGmailCode : null,
        verified: row?.gmailForwardingVerified ?? false,
      }}
    />
  );
}
