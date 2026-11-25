"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";
import { googleAuthEnabled } from "@/lib/env";
import { safeCallbackUrl } from "@/lib/safe-redirect";

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
  try {
    // redirect: false — otherwise Auth.js sends the browser to
    // /api/auth/verify-request, a route handler redirect that the client
    // router doesn't follow after a server action.
    await signIn("resend", {
      email: parsed.data.email,
      redirectTo: safeCallbackUrl(parsed.data.callbackUrl),
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
  redirect("/login/check-email");
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
