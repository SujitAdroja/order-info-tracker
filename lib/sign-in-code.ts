import { randomInt } from "node:crypto";

/**
 * Sign-in codes (alongside the magic link). A link in an email opens in the
 * browser, not in the installed app — and on iOS the Home Screen app has its
 * own cookies — so users can type the code into the app instead.
 *
 * 8 characters from a 31-letter alphabet (no 0/O/1/I/L) ≈ 8.5e11 values;
 * single use and valid for SIGN_IN_CODE_MINUTES.
 */
export const SIGN_IN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const SIGN_IN_CODE_LENGTH = 8;
export const SIGN_IN_CODE_MINUTES = 15;

export function generateSignInCode(): string {
  let out = "";
  for (let i = 0; i < SIGN_IN_CODE_LENGTH; i++) {
    out += SIGN_IN_CODE_ALPHABET[randomInt(SIGN_IN_CODE_ALPHABET.length)];
  }
  return out;
}

/** "ABCDEFGH" → "ABCD-EFGH" for display. */
export function formatSignInCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** What the user typed → the stored token, or null if it can't be a code. */
export function normalizeSignInCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const valid = new RegExp(
    `^[${SIGN_IN_CODE_ALPHABET}]{${SIGN_IN_CODE_LENGTH}}$`,
  );
  return valid.test(code) ? code : null;
}
