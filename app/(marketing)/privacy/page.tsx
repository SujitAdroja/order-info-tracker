import type { Metadata } from "next";
import { ContactLine, LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="25 November 2026">
      <p>
        KeepTrack tracks your orders and reminds you about return windows. This
        page explains, in plain words, what we store, why, who helps us run the
        service, and how to get your data or delete it.
      </p>

      <h2>We never get access to your inbox</h2>
      <p>
        You forward only the emails you choose to your private KeepTrack
        address, or set up a Gmail filter that forwards matching emails. We
        never ask for Gmail or Outlook permissions. Google sign-in, if offered,
        only shares your name and email address.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          Your account: email address, name (if Google provides it), timezone,
          currency and reminder settings.
        </li>
        <li>Your private forwarding address.</li>
        <li>
          Purchases: store, order number, dates, prices, item names, serial
          numbers and notes — whether you typed them or we read them from an
          email.
        </li>
        <li>
          For each email you send us: when it arrived, the sender&apos;s domain
          (for example amazon.in), what kind of email it was and which purchase
          it updated. We keep a one-way fingerprint of the subject line, not the
          subject itself.
        </li>
        <li>Reminders we scheduled and whether they were sent.</li>
        <li>
          For notifications: the push address your browser gives us for each
          device you turn them on for.
        </li>
        <li>
          A security log of account events (sign-ins, exports, settings changes,
          deletion) without email content.
        </li>
      </ul>

      <h2>Emails you forward</h2>
      <ul>
        <li>
          The full email is stored encrypted only while we read it, then
          deleted. A daily job removes any copy older than 24 hours, whatever
          happened.
        </li>
        <li>
          We never show the original email&apos;s HTML and never follow its
          links.
        </li>
        <li>
          Your purchase page lists exactly what we kept from each email
          (&ldquo;What we stored from your emails&rdquo;).
        </li>
      </ul>

      <h2>Services that help us run KeepTrack</h2>
      <ul>
        <li>
          <strong>Vercel</strong> hosts the app. Its request logs include IP
          addresses.
        </li>
        <li>
          <strong>Neon</strong> hosts the database (Singapore region).
        </li>
        <li>
          <strong>Resend</strong> sends sign-in and reminder emails and receives
          the emails you forward. Resend keeps its own copy of received emails
          for its retention period (up to 30 days on our current plan).
        </li>
        <li>
          <strong>Push services</strong> from Google, Apple or Mozilla deliver
          notifications to your devices. The content is encrypted end to end.
        </li>
        <li>
          <strong>Anthropic</strong> (only if automatic reading is turned on —
          it is currently off): emails no built-in reader understands may be
          sent to Anthropic&apos;s Claude API to extract order details. Before
          sending, we remove addresses, phone numbers, card numbers and one-time
          codes. Under Anthropic&apos;s commercial terms, API data isn&apos;t
          used to train models.
        </li>
      </ul>
      <p>
        We don&apos;t sell your data, show ads, or use analytics or tracking
        cookies.
      </p>

      <h2>Cookies</h2>
      <p>
        Only what sign-in needs: a session cookie, and a short-lived cookie that
        remembers which address we sent your sign-in code to. On your device,
        the app may keep a copy of your dashboard so you can see it offline;
        logging out deletes it.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          <strong>Download your data</strong> any time from Settings (JSON and
          CSV).
        </li>
        <li>
          <strong>Delete your account</strong> from Settings. Your purchases,
          reminders, settings, devices and email history are deleted
          immediately. Your forwarding address stops working and is never given
          to anyone else. Security log entries stay without any link to you.
        </li>
        <li>
          <strong>Get a new forwarding address</strong> if yours leaked; the old
          one stops after 7 days.
        </li>
        <li>
          <strong>Turn notifications or reminder emails off</strong> in
          Settings.
        </li>
      </ul>

      <ContactLine />
    </LegalPage>
  );
}
