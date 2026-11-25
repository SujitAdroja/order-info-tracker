/**
 * Section 6.2 step 1 / EC-ING-19: Gmail sends a confirmation email to a new
 * forwarding address. We show its code in the app; we never click the link.
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
