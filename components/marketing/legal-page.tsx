import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/marketing/site-footer";

/** Shared layout for the plain-language legal pages. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10 sm:py-14">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        KeepTrack
      </Link>
      <h1 className="mt-10 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated {updated}
      </p>
      <div className="mt-8 grid gap-6 text-[15px] leading-relaxed [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:grid [&_ul]:gap-1.5">
        {children}
      </div>
      <SiteFooter />
    </main>
  );
}

/** Contact line: set CONTACT_EMAIL before inviting other people. */
export function ContactLine() {
  const email = process.env.CONTACT_EMAIL;
  return email ? (
    <p>
      Questions or requests:{" "}
      <a className="underline underline-offset-4" href={`mailto:${email}`}>
        {email}
      </a>
      .
    </p>
  ) : (
    <p>
      Questions or requests: contact the person who invited you to KeepTrack.
    </p>
  );
}
