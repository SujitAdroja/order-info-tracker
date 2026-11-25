import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * AES-256-GCM with a random 12-byte IV per record (Section 5).
 * Layout: [version 1B][iv 12B][auth tag 16B][ciphertext].
 */
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("encryption_key_invalid");
  return key;
}

export function encrypt(plaintext: string | Buffer, base64Key: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  const data = Buffer.concat([
    cipher.update(
      typeof plaintext === "string"
        ? Buffer.from(plaintext, "utf8")
        : plaintext,
    ),
    cipher.final(),
  ]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), data]);
}

/** Throws if the data was tampered with or the key is wrong. */
export function decrypt(payload: Buffer, base64Key: string): Buffer {
  if (payload.length < 1 + IV_BYTES + TAG_BYTES || payload[0] !== VERSION) {
    throw new Error("ciphertext_invalid");
  }
  const iv = payload.subarray(1, 1 + IV_BYTES);
  const tag = payload.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const data = payload.subarray(1 + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time string comparison (hashing first equalises lengths). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
