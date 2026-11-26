import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="25 November 2026">
      <p>
        These terms explain what you can expect from KeepTrack and what we
        expect from you. By using KeepTrack you agree to them. See also our{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy page
        </Link>
        .
      </p>

      <h2>What KeepTrack does</h2>
      <p>
        KeepTrack reads the order emails you forward (or the details you enter),
        works out return and warranty deadlines, and reminds you before they
        pass. It&apos;s free to use.
      </p>

      <h2>Deadlines are estimates — check with the store</h2>
      <ul>
        <li>
          Return windows come from store policies we collected, details in your
          emails, or what you entered. Stores change their policies, and some
          items have their own rules. Deadlines marked &ldquo;~&rdquo; are
          estimates.
        </li>
        <li>
          Reminders are sent on a best-effort basis. Notifications and emails
          can be delayed or blocked by your device, browser or email provider.
        </li>
        <li>
          Always confirm a deadline with the store or manufacturer before
          relying on it. We aren&apos;t responsible for a missed return or
          warranty claim.
        </li>
      </ul>

      <h2>Your account</h2>
      <ul>
        <li>
          Keep your forwarding address private — anyone who knows it can send
          emails to your account.
        </li>
        <li>Only forward emails you&apos;re allowed to share with us.</li>
        <li>
          Don&apos;t use KeepTrack to send spam, attack the service, or access
          other people&apos;s data.
        </li>
        <li>You can delete your account at any time from Settings.</li>
      </ul>

      <h2>The service</h2>
      <p>
        KeepTrack is provided &ldquo;as is&rdquo;, without warranties. We may
        change or stop features, and we may suspend accounts that break these
        terms. If we change these terms in an important way, we&apos;ll tell you
        in the app or by email.
      </p>

      <ContactLine />
    </LegalPage>
  );
}
