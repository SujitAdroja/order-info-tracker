import { InboxIcon, BellRingIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    icon: InboxIcon,
    title: "Forward the order emails you choose",
    body: "Each account gets a private forwarding address. Send it an order confirmation, or upload a receipt.",
  },
  {
    icon: BellRingIcon,
    title: "We work out the deadlines",
    body: "Return windows and warranty end dates are calculated from the store's policy and your delivery date.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Get reminded before it's too late",
    body: "A nudge a week before a return window closes, and again before a warranty runs out.",
  },
] as const;

export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-10 sm:py-16">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">KeepTrack</span>
        <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
          Log in
        </Link>
      </header>

      <section className="mt-14 sm:mt-20">
        <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
          Never miss a return window. Never lose warranty proof.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
          Forward your order emails and KeepTrack reminds you before every
          deadline. We never ask for access to your inbox.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
            Get started free
          </Link>
        </div>
      </section>

      <section aria-labelledby="how" className="mt-16 sm:mt-24">
        <h2 id="how" className="text-sm font-medium text-muted-foreground">
          How it works
        </h2>
        <ol className="mt-5 grid gap-6 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="grid content-start gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary">
                  <Icon aria-hidden className="size-4" />
                </span>
                <span className="text-sm text-muted-foreground">
                  Step {i + 1}
                </span>
              </div>
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="privacy"
        className="mt-16 rounded-xl border bg-muted/50 p-6 sm:mt-24"
      >
        <h2 id="privacy" className="font-medium">
          Privacy, by design
        </h2>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
          <li>
            No Gmail or Outlook access. You forward only the emails you pick.
          </li>
          <li>Raw emails are deleted right after we read the order details.</li>
          <li>See everything we stored, and delete it all in one tap.</li>
        </ul>
      </section>
    </main>
  );
}
