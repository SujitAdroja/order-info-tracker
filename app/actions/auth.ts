"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";
import { googleAuthEnabled } from "@/lib/env";
import { safeCallbackUrl } from "@/lib/safe-redirect";
import { normalizeSignInCode } from "@/lib/sign-in-code";
import { readPendingSignIn, setPendingSignIn } from "@/lib/sign-in-pending";

export type EmailSignInState = { error?: string; email?: string };

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  callbackUrl: z.string().optional(),
});

export async function signInWithEmail(
  _prev: EmailSignInState,
  formData: FormData,
): Promise<EmailSignInState> {
  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
    callbackUrl: formData.get("callbackUrl") ?? undefined,
  });
  if (!parsed.success) {
    return {
      error: "Please enter a valid email address.",
      email: String(formData.get("email") ?? ""),
    };
  }

  // TODO EC-SEC-04: rate-limit magic link requests per email/IP (Phase 6, lib/rateLimit.ts).
  const callbackUrl = safeCallbackUrl(parsed.data.callbackUrl);
  try {
    // redirect: false — otherwise Auth.js sends the browser to
    // /api/auth/verify-request, a route handler redirect that the client
    // router doesn't follow after a server action.
    await signIn("resend", {
      email: parsed.data.email,
      redirectTo: callbackUrl,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: "We couldn't send your sign-in link. Please try again.",
        email: parsed.data.email,
      };
    }
    throw error;
  }
  await setPendingSignIn({ email: parsed.data.email, callbackUrl });
  redirect("/login/check-email");
}

export type CodeState = { error?: string; redirectTo?: string };

/**
 * "Enter the code" on the check-email page. Hands the code to Auth.js's own
 * email callback (the browser navigates there), which verifies it (single
 * use, 15 minutes) and signs in
 * on this device — the installed app included.
 */
export async function verifySignInCode(
  _prev: CodeState,
  formData: FormData,
): Promise<CodeState> {
  const pending = await readPendingSignIn();
  if (!pending) {
    return { error: "This sign-in has expired. Please request a new code." };
  }
  const code = normalizeSignInCode(String(formData.get("code") ?? ""));
  if (!code) {
    return { error: "Enter the 8-character code from the email." };
  }
  // The cookie stays: a mistyped code doesn't use up the real one.
  const params = new URLSearchParams({
    callbackUrl: safeCallbackUrl(pending.callbackUrl),
    token: code,
    email: pending.email,
  });
  // A full page load, not a router redirect: the client router can't follow
  // a redirect into Auth.js's route handler (same reason as redirect:false above).
  return { redirectTo: `/api/auth/callback/resend?${params}` };
}

export async function signInWithGoogle(formData: FormData) {
  if (!googleAuthEnabled()) return;
  await signIn("google", {
    redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
  });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
