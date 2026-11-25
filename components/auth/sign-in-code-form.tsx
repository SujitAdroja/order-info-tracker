"use client";

import { useActionState, useEffect } from "react";
import { verifySignInCode, type CodeState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Type the emailed code here — signs in on this device (incl. the installed app). */
export function SignInCodeForm() {
  const [state, action, pending] = useActionState<CodeState, FormData>(
    verifySignInCode,
    {},
  );
  useEffect(() => {
    if (state.redirectTo) window.location.assign(state.redirectTo);
  }, [state.redirectTo]);
  return (
    <form action={action} className="grid gap-3">
      <Label htmlFor="code">Sign-in code</Label>
      <Input
        id="code"
        name="code"
        required
        autoComplete="one-time-code"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        placeholder="ABCD-EFGH"
        maxLength={12}
        className="font-mono text-lg tracking-widest uppercase"
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "code-error" : undefined}
      />
      {state.error ? (
        <p id="code-error" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending || state.redirectTo ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
