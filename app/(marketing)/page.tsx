import {
  BellRingIcon,
  CheckIcon,
  ChevronDownIcon,
  ImageIcon,
  MailIcon,
  PencilLineIcon,
  PackageIcon,
  TruckIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CopyButton } from "@/components/copy-button";
import { InstallSteps } from "@/components/marketing/install-steps";
import { SiteFooter } from "@/components/marketing/site-footer";
import { buttonVariants } from "@/components/ui/button";
import {
  GMAIL_FILTER,
  GMAIL_FILTER_FROM,
  GMAIL_FILTER_SUBJECT,
} from "@/lib/gmail-filter";
import { cn } from "@/lib/utils";
import "./landing.css";

export const metadata: Metadata = {
  title: { absolute: "KeepTrack: never miss a return window" },
};

/** Stores whose return rules are built in (lib/db/seed/stores.ts). */
const STORES = [
  "Amazon.in",
  "Flipkart",
  "Myntra",
  "AJIO",
  "Nykaa",
  "Croma",
  "Amazon.com",
  "Apple",
  "Best Buy",
  "IKEA",
];

const WAYS = [
  {
    icon: MailIcon,
    title: "Forward the email",
    body: "Your account gets a private address. Forward order confirmations to it, or set up a Gmail filter once and they arrive on their own. Save the address as a contact and it fills in when you type “Keep”.",
  },
  {
    icon: ImageIcon,
    title: "Share a screenshot",
    body: "On Android, share a screenshot or PDF invoice straight to KeepTrack from any app. On iPhone, upload it from the Add page. We read the order details and you check them before saving.",
  },
  {
    icon: PencilLineIcon,
    title: "Type it in",
    body: "Store, item, price and order date. That’s all it takes to work out the deadline.",
  },
] as const;

const STEPS = [
  {
    title: "Add the order",
    body: "Forward the email, share a screenshot or type it in.",
  },
  {
    title: "We follow it until it arrives",
    body: "Shipping and delivery emails update the order. If no delivery email shows up, we ask whether it arrived, because most return windows start on the day of delivery.",
  },
  {
    title: "You get reminded in time",
    body: "7 days, 3 days and 1 day before the window closes, and on the last day. Never between 10 pm and 8 am. Tap Returned or Keeping it right from the notification.",
  },
] as const;

const FORWARD_STEPS = [
  {
    title: "Copy your KeepTrack address",
    body: "Sign up and it’s waiting on the setup page and in Settings.",
  },
  {
    title: "Add it as a forwarding address in Gmail",
    body: "On a computer, open Settings, See all settings, Forwarding and POP/IMAP, then Add a forwarding address.",
  },
  {
    title: "Confirm it",
    body: "Gmail emails us a confirmation link. It shows up on KeepTrack’s setup page within seconds; tap it to confirm. Leave Gmail’s own Forwarding setting on Disable forwarding.",
  },
  {
    title: "Create the filter",
    body: "Open Show search options in Gmail’s search box, paste the filter into Has the words, click Create filter, tick Forward it to and pick your KeepTrack address. Only order emails are forwarded.",
  },
] as const;

const PRIVACY = [
  "We never ask you to sign in to Gmail or Outlook. We only see the emails you forward.",
  "Each email is deleted as soon as the order details are read.",
  "Screenshots are read, then thrown away. We don’t store them.",
  "Getting emails you didn’t forward? Get a new address in Settings.",
  "Download everything we keep, or delete your account and all of it, any time.",
];

const FAQ = [
  {
    q: "Is KeepTrack free?",
    a: "Yes. Sign up with your email and start adding orders.",
  },
  {
    q: "Do you read my inbox?",
    a: "No. KeepTrack never connects to your email account. It only sees the emails you forward to your private address, and deletes each one once the order details are read.",
  },
  {
    q: "What if I forget to forward the shipping or delivery email?",
    a: "We ask instead. When an order should have arrived, you get a “Did your order arrive?” reminder so the return window counts from the right day. To skip forwarding altogether, set up auto-forwarding once (see “Set it up once” above): every order, shipping and delivery email then reaches us by itself.",
  },
  {
    q: "My store isn’t on the list.",
    a: "Add the purchase anyway and enter how many days you have to return it. The built-in stores just save you that step.",
  },
  {
    q: "Does it work on iPhone?",
    a: "Yes. Add it to your Home Screen from Safari to get reminders as notifications. Sharing straight from other apps works on Android; on iPhone, upload the screenshot from the Add page.",
  },
  {
    q: "Do I need to install anything?",
    a: "No app store download. KeepTrack runs in the browser, and adding it to your home screen makes it open like an app and lets reminders arrive as notifications. Without that, we email your reminders.",
  },
];

export default function LandingPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-5">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          KeepTrack
        </Link>
        <nav aria-label="Page" className="flex items-center gap-1">
          <a
            href="#how"
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:block"
          >
            How it works
          </a>
          <a
            href="#auto-forward"
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:block"
          >
            Auto-forward
          </a>
          <a
            href="#install"
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:block"
          >
            Install
          </a>
          <a
            href="#faq"
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:block"
          >
            FAQ
          </a>
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
            Log in
          </Link>
        </nav>
      </header>

      <main className="flex-1 overflow-x-clip">
        <div className="mx-auto w-full max-w-5xl px-5">
          <Suspense fallback={null}>
            <AccountDeletedNotice searchParams={searchParams} />
          </Suspense>
        </div>

        {/* Hero */}
        <section className="mx-auto grid w-full max-w-5xl items-center gap-12 px-5 pt-8 pb-16 sm:pt-14 md:grid-cols-[1.1fr_1fr] md:pb-24">
          <div>
            <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
              Know exactly when every return window closes.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-pretty text-muted-foreground">
              Forward an order email, share a screenshot or type it in.
              KeepTrack follows the order until it’s delivered and reminds you
              before the last day to return it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className={buttonVariants({ size: "lg" })}>
                Get started free
              </Link>
              <a
                href="#how"
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                See how it works
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {[
                "Free to use",
                "No access to your inbox",
                "Android and iPhone",
              ].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <CheckIcon aria-hidden className="size-4 text-primary" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <HeroPhone />
        </section>

        {/* Stores */}
        <section aria-labelledby="stores" className="border-y bg-muted/40 py-6">
          <div className="mx-auto w-full max-w-5xl px-5">
            <h2 id="stores" className="text-sm text-muted-foreground">
              Return rules built in for
            </h2>
          </div>
          <div className={cn("mt-3 overflow-hidden", "lp-strip")}>
            <ul className={"lp-stripTrack"}>
              {[...STORES, ...STORES].map((name, i) => (
                <li
                  key={`${name}-${i}`}
                  aria-hidden={i >= STORES.length ? true : undefined}
                  className={cn(
                    "px-6 text-xl font-semibold tracking-tight whitespace-nowrap text-foreground/80 sm:text-2xl",
                    i >= STORES.length && "lp-stripCopy",
                  )}
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
          <p className="mx-auto mt-3 w-full max-w-5xl px-5 text-sm text-muted-foreground">
            Shopping somewhere else? Enter the return days once.
          </p>
        </section>

        {/* Ways to add */}
        <section
          aria-labelledby="ways"
          className="mx-auto w-full max-w-5xl px-5 py-16 md:py-24"
        >
          <h2
            id="ways"
            className="max-w-xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            Add an order the way that suits you
          </h2>
          <ul className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
            {WAYS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="grid content-start gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon aria-hidden className="size-5" />
                </span>
                <h3 className="text-lg font-medium">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Auto-forward */}
        <section
          id="auto-forward"
          aria-labelledby="auto-forward-title"
          className="mx-auto grid w-full max-w-5xl scroll-mt-6 gap-12 px-5 pb-16 md:grid-cols-[1fr_1fr] md:pb-24"
        >
          <div>
            <h2
              id="auto-forward-title"
              className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              Set it up once. Never forward again.
            </h2>
            <p className="mt-4 text-muted-foreground">
              A Gmail filter sends every order, shipping and delivery email to
              KeepTrack the moment it arrives, so status updates reach us
              without you lifting a finger. It takes about three minutes on a
              computer.
            </p>
            <ol className="mt-8 grid gap-6">
              {FORWARD_STEPS.map(({ title, body }, i) => (
                <li key={title} className="grid grid-cols-[2.25rem_1fr] gap-4">
                  <span className="grid size-9 place-items-center rounded-full border-2 border-primary text-sm font-semibold text-primary">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-medium">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid content-start gap-6">
            <GmailFilterCard />
            <div className="grid gap-3 text-sm">
              <p className="font-medium">Not on Gmail?</p>
              <p className="text-muted-foreground">
                <strong className="font-medium text-foreground">
                  Outlook:
                </strong>{" "}
                Settings, Mail, Rules, Add new rule. Pick the stores as senders
                and choose Forward to your KeepTrack address.
              </p>
              <p className="text-muted-foreground">
                <strong className="font-medium text-foreground">
                  iCloud Mail:
                </strong>{" "}
                On icloud.com, open Mail settings, then Rules, and add a rule
                that forwards those senders to your KeepTrack address.
              </p>
              <p className="text-muted-foreground">
                Mail rules forward new emails only. Forward older orders by
                hand, or save your address as a contact so it fills in when you
                type “Keep”.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how"
          aria-labelledby="how-title"
          className="scroll-mt-6 bg-[#e8f3f0] py-16 md:py-24 dark:bg-muted/40"
        >
          <div className="mx-auto grid w-full max-w-5xl items-center gap-12 px-5 md:grid-cols-2">
            <div>
              <h2
                id="how-title"
                className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
              >
                From checkout to the last return day
              </h2>
              <ol className="mt-10 grid gap-8">
                {STEPS.map(({ title, body }, i) => (
                  <li
                    key={title}
                    className="grid grid-cols-[2.25rem_1fr] gap-4"
                  >
                    <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="font-medium">{title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-foreground/75">
                        {body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <ReminderTimeline />
          </div>
        </section>

        {/* Privacy */}
        <section
          aria-labelledby="privacy"
          className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-16 md:grid-cols-[1fr_1.4fr] md:py-24"
        >
          <div>
            <h2
              id="privacy"
              className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              Your inbox stays yours
            </h2>
            <p className="mt-4 text-muted-foreground">
              KeepTrack works from what you choose to send it, and keeps as
              little as it can.
            </p>
          </div>
          <ul className="grid gap-4">
            {PRIVACY.map((t) => (
              <li key={t} className="flex gap-3 border-b pb-4 last:border-0">
                <CheckIcon
                  aria-hidden
                  className="mt-0.5 size-5 shrink-0 text-primary"
                />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Install */}
        <section
          id="install"
          aria-labelledby="install-title"
          className="scroll-mt-6 bg-[#bfe6da] py-16 text-[#0e2f2a] md:py-24"
        >
          <div className="mx-auto w-full max-w-5xl px-5">
            <div className="grid items-end gap-6 md:grid-cols-[1.4fr_1fr]">
              <h2
                id="install-title"
                className="text-5xl leading-[0.95] font-semibold tracking-tighter sm:text-7xl"
              >
                No app store.
                <br />
                No download.
              </h2>
              <p className="text-[#24453f] md:pb-2">
                KeepTrack is a web app that installs like a real one: its own
                icon, full screen, and reminders as notifications.
              </p>
            </div>
            <div className="mt-10">
              <InstallSteps />
            </div>
            <p className="mt-6 text-sm text-[#24453f]">
              Until you turn on notifications, we email your reminders.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section
          id="faq"
          aria-labelledby="faq-title"
          className="mx-auto w-full max-w-3xl scroll-mt-6 px-5 pb-16 md:pb-24"
        >
          <h2
            id="faq-title"
            className="text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Questions
          </h2>
          <div className="mt-8 divide-y border-y">
            {FAQ.map(({ q, a }) => (
              <details key={q} className={cn("group", "lp-faq")}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  {q}
                  <ChevronDownIcon
                    aria-hidden
                    className={cn(
                      "size-5 shrink-0 text-muted-foreground",
                      "lp-chevron",
                    )}
                  />
                </summary>
                <p className="pb-5 leading-relaxed text-muted-foreground">
                  {a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Closing */}
        <section className="bg-[#0f4d44] text-white">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-6 px-5 py-16 md:flex-row md:items-center md:justify-between md:py-20">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                Stop finding out a day too late.
              </h2>
              <p className="mt-3 text-white/80">
                Free, private, and ready in a minute.
              </p>
            </div>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-white text-[#0f4d44] hover:bg-white/90",
              )}
            >
              Get started free
            </Link>
          </div>
        </section>
      </main>

      <div className="mx-auto w-full max-w-5xl px-5 pb-10">
        <SiteFooter />
      </div>
    </div>
  );
}

/** Concentric circles behind the hero phone, lightest on the outside. */
const RINGS = [
  { size: "150%", color: "#ecf6f3" },
  { size: "118%", color: "#d9eee8" },
  { size: "86%", color: "#c3e5db" },
];

/** A phone showing an order go from Ordered to a return reminder. */
function HeroPhone() {
  const steps = [
    { icon: PackageIcon, label: "Ordered", cls: "" },
    { icon: TruckIcon, label: "Shipped", cls: "lp-dotShipped" },
    { icon: CheckIcon, label: "Delivered", cls: "lp-dotDelivered" },
  ];
  return (
    <div
      role="img"
      aria-label="An order for wireless earbuds moves from ordered to shipped to delivered, then a reminder says the return window closes in 3 days."
      className="lp-phone relative mx-auto grid w-full max-w-[22rem] place-items-center py-8"
    >
      <div aria-hidden className="absolute inset-0 grid place-items-center">
        {RINGS.map((ring, i) => (
          <span
            key={ring.size}
            className="lp-ring absolute aspect-square rounded-full"
            style={{
              width: ring.size,
              background: ring.color,
              animationDelay: `${i * 0.6}s`,
            }}
          />
        ))}
      </div>
      <div className="relative w-full max-w-[17.5rem] overflow-hidden rounded-[2rem] border-[6px] border-foreground/90 bg-background px-4 pt-16 pb-6">
        {/* Notification */}
        <div
          className={cn(
            "absolute inset-x-2 top-2 rounded-2xl border bg-background/95 p-3 shadow-md backdrop-blur",
            "lp-notice",
          )}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BellRingIcon aria-hidden className="size-3.5 text-primary" />
            KeepTrack
          </div>
          <p className="mt-1 text-[13px] leading-tight font-semibold whitespace-nowrap">
            Return window closes in 3 days
          </p>
          <p className="text-xs text-muted-foreground">boAt Airdopes 141</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-medium">
            <span className="rounded-lg bg-muted py-1.5 text-center">
              Returned
            </span>
            <span className="rounded-lg bg-muted py-1.5 text-center">
              Keeping it
            </span>
          </div>
        </div>

        <p className="text-lg font-semibold tracking-tight">Orders</p>
        <p className="text-xs text-muted-foreground">2 to keep an eye on</p>
        <div className="mt-4 rounded-2xl border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">boAt Airdopes 141</p>
              <p className="text-xs text-muted-foreground">Amazon.in</p>
            </div>
            <p className="text-sm font-medium">₹1,299</p>
          </div>

          <div className="relative mt-5">
            <div className="absolute inset-x-4 top-4 h-0.5 bg-muted" />
            <div
              className={cn(
                "absolute inset-x-4 top-4 h-0.5 bg-[#14665a]",
                "lp-track",
              )}
            />
            <ol className="relative flex justify-between">
              {steps.map(({ icon: Icon, label, cls }) => (
                <li key={label} className="grid justify-items-center gap-1">
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full",
                      "lp-dot",
                      cls,
                    )}
                  >
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {label}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <p
            className={cn(
              "mt-5 inline-flex rounded-full px-3 py-1 text-xs font-medium",
              "lp-chip",
              "lp-chipColor",
            )}
          >
            Return by 15 Dec
          </p>
        </div>

        <div className="mt-3 rounded-2xl border p-4">
          <p className="font-medium">Cotton kurta</p>
          <p className="text-xs text-muted-foreground">Myntra</p>
        </div>
      </div>
    </div>
  );
}

/** When reminders go out across a return window. */
function ReminderTimeline() {
  // A 10-day window: 5 Dec to 15 Dec.
  const marks = [
    { at: "30%", date: "8 Dec", label: "7 days left" },
    { at: "70%", date: "12 Dec", label: "3 days left" },
    { at: "90%", date: "14 Dec", label: "1 day left" },
    { at: "100%", date: "15 Dec", label: "Last day" },
  ];
  return (
    <figure className="rounded-3xl bg-background p-6 shadow-sm sm:p-8">
      <figcaption className="text-sm text-muted-foreground">
        When your reminders arrive
      </figcaption>
      <div className="mt-6 flex justify-between text-sm">
        <span>
          <span className="block text-muted-foreground">Delivered</span>
          <span className="font-medium">5 Dec</span>
        </span>
        <span className="text-right">
          <span className="block text-muted-foreground">Return by</span>
          <span className="font-medium">15 Dec</span>
        </span>
      </div>
      <div className="relative mt-4 h-2 rounded-full bg-muted">
        <div
          className={cn(
            "absolute inset-0 rounded-full bg-gradient-to-r from-primary to-[#d98a12]",
            "lp-fill",
          )}
        />
        {marks.map(({ at, label }) => (
          <span
            key={label}
            aria-hidden
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-primary bg-background"
            style={{ left: at }}
          />
        ))}
      </div>
      <ol className="mt-6 grid grid-cols-2 gap-3">
        {marks.map(({ date, label }) => (
          <li
            key={label}
            className="lp-mark flex items-center gap-3 rounded-xl bg-muted/60 p-3"
          >
            <BellRingIcon
              aria-hidden
              className="size-4 shrink-0 text-primary"
            />
            <span className="text-sm">
              <span className="block font-medium">{label}</span>
              <span className="text-muted-foreground">{date}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-sm text-muted-foreground">
        Bought it, kept it? Tap Keeping it and the rest stop.
      </p>
    </figure>
  );
}

/** The Gmail filter, laid out like Gmail's own filter form, with Copy. */
function GmailFilterCard() {
  return (
    <figure className="rounded-3xl border bg-background p-6">
      <figcaption className="flex items-center gap-2 text-sm font-medium">
        <MailIcon aria-hidden className="size-4 text-primary" />
        Your Gmail filter
      </figcaption>
      <dl className="mt-5 grid gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">From</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {GMAIL_FILTER_FROM.map((d) => (
              <span key={d} className="rounded-md bg-muted px-2 py-0.5">
                {d}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Subject has any of</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {GMAIL_FILTER_SUBJECT.map((w) => (
              <span key={w} className="rounded-md bg-muted px-2 py-0.5">
                {w}
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Then</dt>
          <dd className="mt-1 flex items-center gap-2">
            <span className="grid size-4 place-items-center rounded-sm bg-primary text-primary-foreground">
              <CheckIcon aria-hidden className="size-3" />
            </span>
            Forward it to your KeepTrack address
          </dd>
        </div>
      </dl>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <CopyButton value={GMAIL_FILTER} label="Copy filter" />
        <span className="text-xs text-muted-foreground">
          Paste it into Has the words.
        </span>
      </div>
    </figure>
  );
}

async function AccountDeletedNotice({
  searchParams,
}: {
  searchParams: PageProps<"/">["searchParams"];
}) {
  const { account } = await searchParams;
  if (account !== "deleted") return null;
  return (
    <p
      role="status"
      className="mt-2 rounded-lg border bg-muted/50 px-4 py-3 text-sm"
    >
      Your account and all its data have been deleted.
    </p>
  );
}
