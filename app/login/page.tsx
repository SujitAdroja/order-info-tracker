import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { EmailSignInForm } from "@/components/auth/email-sign-in-form";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Separator } from "@/components/ui/separator";
import { googleAuthEnabled } from "@/lib/env";
import { safeCallbackUrl } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthCard
      title="Log in or sign up"
      description="We'll email you a link to sign in. No password needed."
    >
      <Suspense fallback={<EmailSignInForm />}>
        <SignInOptions searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function SignInOptions({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);

  return (
    <>
      <EmailSignInForm callbackUrl={callbackUrl} />
      {googleAuthEnabled() ? (
        <>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>
          <GoogleSignInButton callbackUrl={callbackUrl} />
        </>
      ) : null}
    </>
  );
}
