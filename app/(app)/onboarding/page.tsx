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
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { GMAIL_FILTER } from "@/lib/gmail-filter";
import { pendingGmailConfirmation } from "@/lib/ingest/gmail-verification";
import { getCurrentUser } from "@/lib/session";
import { ensureForwardingAddress } from "@/lib/users";

export const metadata: Metadata = { title: "Set up forwarding" };

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
            Gmail sends us a confirmation email. It shows up below within a few
            seconds. Tap <strong>Confirm forwarding in Gmail</strong> (or, if
            you see a code, type it into Gmail and click Verify):
            <div className="mt-3">
              <Suspense fallback={null}>
                <OnboardingGmailCode />
              </Suspense>
            </div>
          </li>
          <li>
            Leave Gmail&apos;s <strong>Forwarding</strong> setting on{" "}
            <strong>Disable forwarding</strong>. &ldquo;Forward a copy of
            incoming mail&rdquo; would send us every email you get; the filter
            below sends only your orders.
          </li>
          <li>
            Create a filter: click <strong>Show search options</strong> at the
            end of Gmail&apos;s search box, paste this into{" "}
            <strong>Has the words</strong>, click <strong>Create filter</strong>
            , then tick <strong>Forward it to</strong> and pick your KeepTrack
            address:
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

      <section aria-labelledby="reminders" className="grid gap-3">
        <h2 id="reminders" className="font-medium">
          4. Get reminders on your phone
        </h2>
        <InstallPrompt />
        <p className="text-sm text-muted-foreground">
          Then turn on notifications in{" "}
          <Link href="/settings" className="underline underline-offset-4">
            Settings
          </Link>
          . Until you do, we email your reminders.
        </p>
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
        ...pendingGmailConfirmation(live ? row!.pendingGmailCode : null),
        verified: row?.gmailForwardingVerified ?? false,
      }}
    />
  );
}
