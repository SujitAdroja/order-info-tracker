/**
 * Section 6.2 step 1 / EC-ING-19: Gmail sends a confirmation email to a new
 * forwarding address. Older emails carry a 9-digit code; newer ones (seen
 * Nov 2026) carry only a confirmation link. We show whichever it is in the
 * app for the user to use; we never open the link ourselves.
 */
export const GMAIL_VERIFICATION_SENDER = "forwarding-noreply@google.com";

export function isGmailVerification(fromAddress: string | null): boolean {
  return fromAddress?.toLowerCase() === GMAIL_VERIFICATION_SENDER;
}

/** Gmail's code is 9 digits, shown as "Confirmation code: 123456789". */
export function extractGmailCode(subject: string, body: string): string | null {
  const labelled =
    body.match(/confirmation code[:\s]*([0-9]{6,12})/i) ??
    subject.match(/\(#\s*([0-9]{6,12})\)/) ??
    subject.match(/#\s*([0-9]{6,12})/);
  return labelled ? labelled[1] : null;
}

/**
 * Only Gmail's own "confirm forwarding" page is accepted, so no other link
 * from an email can ever be shown as a button in the app.
 */
const CONFIRM_URL =
  /^https:\/\/(?:mail|mail-settings)\.google\.com\/mail\/vf-[A-Za-z0-9%_.~\-[\]]+$/;

export function isGmailConfirmUrl(value: string): boolean {
  return value.length <= 1000 && CONFIRM_URL.test(value);
}

/** The "click the link below to confirm" URL (not the cancel `uf-` link). */
export function extractGmailConfirmUrl(body: string): string | null {
  for (const match of body.matchAll(
    /https:\/\/(?:mail|mail-settings)\.google\.com\/mail\/vf-[^\s<>"')]+/g,
  )) {
    if (isGmailConfirmUrl(match[0])) return match[0];
  }
  return null;
}

/** What to keep from the email: the code when there is one, else the link. */
export function extractGmailConfirmation(
  subject: string,
  body: string,
): string | null {
  return extractGmailCode(subject, body) ?? extractGmailConfirmUrl(body);
}

/** Splits the stored value for the app: a code to type, or a link to tap. */
export function pendingGmailConfirmation(value: string | null): {
  code: string | null;
  confirmUrl: string | null;
} {
  if (!value) return { code: null, confirmUrl: null };
  return isGmailConfirmUrl(value)
    ? { code: null, confirmUrl: value }
    : { code: value, confirmUrl: null };
}
