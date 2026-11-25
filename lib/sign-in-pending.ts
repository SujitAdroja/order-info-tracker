import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { SIGN_IN_CODE_MINUTES } from "@/lib/sign-in-code";

/** Remembers which address a sign-in code went to (never the code itself). */
const COOKIE = "kt_signin";

const pendingSchema = z.object({ email: z.email(), callbackUrl: z.string() });
export type PendingSignIn = z.infer<typeof pendingSchema>;

export async function setPendingSignIn(p: PendingSignIn): Promise<void> {
  (await cookies()).set(COOKIE, JSON.stringify(p), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SIGN_IN_CODE_MINUTES * 60,
  });
}

export async function readPendingSignIn(): Promise<PendingSignIn | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = pendingSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
