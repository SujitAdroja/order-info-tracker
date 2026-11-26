"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { deleteAccount, regenerateForwardingAddress } from "@/lib/account";
import { audit } from "@/lib/audit";
import { consume, LIMITS, minutesText, rateKey } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";

export type AccountActionResult =
  { ok: true; address?: string } | { ok: false; error: string };

/** EC-ACC-06: new forwarding address; the old one keeps working for 7 days. */
export async function regenerateAddressAction(): Promise<AccountActionResult> {
  const user = await getCurrentUser();
  const limit = await consume(
    rateKey("regen", user.id),
    LIMITS.regenerateAddress,
  );
  if (!limit.ok) {
    return {
      ok: false,
      error: `You've changed your address a few times today. Try again in ${minutesText(limit.retryAfterSeconds)}.`,
    };
  }
  const address = await regenerateForwardingAddress(user.id);
  await audit(user.id, "forwarding.regenerate");
  refresh();
  return { ok: true, address };
}

/**
 * EC-ACC-04: permanent deletion. The user must type their email address to
 * confirm. Signs the browser out (the session row is already gone).
 */
export async function deleteAccountAction(
  confirmEmail: unknown,
): Promise<AccountActionResult> {
  const user = await getCurrentUser();
  if (
    typeof confirmEmail !== "string" ||
    confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()
  ) {
    return { ok: false, error: "Type your email address exactly to confirm." };
  }
  await deleteAccount(user.id);
  const jar = await cookies();
  for (const name of [
    "authjs.session-token",
    "__Secure-authjs.session-token",
  ]) {
    jar.delete(name);
  }
  redirect("/?account=deleted");
}
