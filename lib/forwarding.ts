import { randomInt } from "node:crypto";

/**
 * Forwarding address helpers (pure; no DB). The address itself is the secret
 * that routes forwarded mail to a user (EC-ACC-03), so it uses a CSPRNG.
 */

// Lowercase letters + digits, minus look-alikes (0/o, 1/l/i) so users can read it aloud.
export const LOCAL_PART_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const LOCAL_PART_RANDOM_LENGTH = 8;
export const LOCAL_PART_PATTERN = new RegExp(
  `^u-[${LOCAL_PART_ALPHABET}]{${LOCAL_PART_RANDOM_LENGTH}}$`,
);

export function generateLocalPart(rand: (max: number) => number = randomInt) {
  let out = "u-";
  for (let i = 0; i < LOCAL_PART_RANDOM_LENGTH; i++) {
    out += LOCAL_PART_ALPHABET[rand(LOCAL_PART_ALPHABET.length)];
  }
  return out;
}

export function formatForwardingAddress(localPart: string, domain: string) {
  return `${localPart}@${domain.toLowerCase()}`;
}
