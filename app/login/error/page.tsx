import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { EmailSignInForm } from "@/components/auth/email-sign-in-form";

export const metadata: Metadata = { title: "Sign-in problem" };

// Auth.js error codes → plain language. EC-ACC-01: expired/used magic link.
const MESSAGES: Record<string, { title: string; body: string }> = {
  Verification: {
    title: "That link has expired",
    body: "Sign-in links work once and expire after 24 hours. Enter your email and we'll send a fresh one.",
  },
  AccessDenied: {
    title: "Sign-in was cancelled",
    body: "You can try again below.",
  },
  Configuration: {
    title: "We couldn't sign you in",
    body: "Something went wrong on our side. Please try again in a minute.",
  },
};
const FALLBACK = {
  title: "We couldn't sign you in",
  body: "Please request a new sign-in link.",
};

export default function AuthErrorPage({
  searchParams,
}: PageProps<"/login/error">) {
  return (
    <Suspense fallback={<AuthCard title={FALLBACK.title} />}>
      <AuthErrorContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AuthErrorContent({
  searchParams,
}: {
  searchParams: PageProps<"/login/error">["searchParams"];
}) {
  const { error } = await searchParams;
  const message = (typeof error === "string" && MESSAGES[error]) || FALLBACK;

  return (
    <AuthCard title={message.title} description={message.body}>
      <EmailSignInForm submitLabel="Send new link" />
    </AuthCard>
  );
}
