"use client";

import { useActionState } from "react";
import { signInWithEmail, type EmailSignInState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmailSignInForm({
  callbackUrl,
  submitLabel = "Email me a sign-in link",
}: {
  callbackUrl?: string;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState<EmailSignInState, FormData>(
    signInWithEmail,
    {},
  );

  return (
    <form action={action} className="grid gap-3" noValidate>
      {callbackUrl ? (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={state.email}
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "email-error" : undefined}
        />
        {state.error ? (
          <p id="email-error" role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending link…" : submitLabel}
      </Button>
    </form>
  );
}
