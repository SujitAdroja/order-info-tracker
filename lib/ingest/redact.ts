/**
 * Section 6.3: strip personal data before any text leaves for the LLM.
 * Removes delivery addresses, phone numbers, email addresses (except the
 * store's), card digits, OTPs and UPI IDs. Order numbers, item names, prices
 * and dates are kept: they're what we need to extract.
 */

const ADDRESS_HEADINGS =
  /^\s*(shipping address|delivery address|deliver(ing|ed)? to|ship(ping|ped)? to|billing address|address)\s*:?\s*(.*)$/i;

function redactAddressBlocks(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ADDRESS_HEADINGS);
    if (!m) {
      out.push(lines[i]);
      continue;
    }
    out.push(`${m[1]}: [address removed]`);
    // Skip the address lines that follow, up to a blank line (max 8 lines).
    let j = i + 1;
    while (j < lines.length && j <= i + 8 && lines[j].trim() !== "") j++;
    i = j - 1;
  }
  return out.join("\n");
}

export function redact(text: string, keepDomain: string | null = null): string {
  let out = redactAddressBlocks(text);

  // Email addresses, except the store's own domain.
  out = out.replace(
    /[A-Za-z0-9._%+'-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    (addr, domain: string) =>
      keepDomain && (domain === keepDomain || domain.endsWith(`.${keepDomain}`))
        ? addr
        : "[email removed]",
  );

  // UPI IDs (name@bank, no TLD).
  out = out.replace(/\b[\w.-]{2,}@(?:ok)?[a-z]{2,}\b(?!\.)/gi, "[upi removed]");

  // OTPs / PINs with their label.
  out = out.replace(
    /\b(otp|one[- ]time password|pin|verification code|security code)\b([^0-9\n]{0,20})\d{4,8}\b/gi,
    "$1$2[code removed]",
  );

  // Card numbers: 4-digit groups (4242 4242 4242 4242) or a Luhn-valid run.
  // Order numbers like 403-1234567-1234567 don't fit either shape.
  out = out.replace(/\b\d{4}([ -])\d{4}\1\d{4}\1\d{1,7}\b/g, "[card removed]");
  out = out.replace(/\b\d{13,19}\b/g, (m) =>
    luhnValid(m) ? "[card removed]" : m,
  );
  out = out.replace(
    /\b(card|visa|mastercard|amex|rupay|debit|credit)\b([^\n]{0,30}?)(ending( in| with)?|xx+|\*{2,})\s*\d{4}\b/gi,
    "$1$2[card removed]",
  );

  // Phone numbers: +91 98765 43210, (555) 123-4567, 9876543210.
  out = out.replace(
    /(?<![\w#-])(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{3,5}[\s-]?\d{3,4}[\s-]?\d{0,4}(?![\w-])/g,
    (m) => {
      const digits = m.replace(/\D/g, "");
      // Leave prices, order ids and dates alone: only 10–13 digit phone-like runs.
      return digits.length >= 10 && digits.length <= 13 && !/[.,]\d{2}$/.test(m)
        ? "[phone removed]"
        : m;
    },
  );

  return out;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
