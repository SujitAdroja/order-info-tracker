import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInCodeForm } from "@/components/auth/sign-in-code-form";
import { readPendingSignIn } from "@/lib/sign-in-pending";
import { SIGN_IN_CODE_MINUTES } from "@/lib/sign-in-code";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <AuthCard
      title="Check your email"
      description={
        <Suspense fallback={<p>We sent you a sign-in code and link.</p>}>
          <SentTo />
        </Suspense>
      }
    >
      <SignInCodeForm />
      <p className="text-sm text-muted-foreground">
        On a computer you can also just click the link in the email. Didn&apos;t
        get it? Check spam, or{" "}
        <Link
          href="/login"
          className="text-foreground underline underline-offset-4"
        >
          send a new code
        </Link>
        .
      </p>
    </AuthCard>
  );
}

async function SentTo() {
  const pending = await readPendingSignIn();
  return (
    <p>
      We sent a code{" "}
      {pending ? (
        <>
          to <strong className="text-foreground">{pending.email}</strong>
        </>
      ) : null}
      . Enter it below to sign in on this device — this works in the installed
      app too. It expires in {SIGN_IN_CODE_MINUTES} minutes.
    </p>
  );
}
