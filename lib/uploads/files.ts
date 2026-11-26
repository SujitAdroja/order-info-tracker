import "server-only";
import convert from "heic-convert";

/**
 * EC-SEC-02: trust the bytes, not the declared type. Returns what the file
 * really is, or null for anything we don't accept.
 */
export type SniffedType =
  "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "application/pdf";

export function sniffType(bytes: Uint8Array): SniffedType | null {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (
    ascii(4, 8) === "ftyp" &&
    /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(8, 12))
  )
    return "image/heic";
  return null;
}

/** HEIC/HEIF → JPEG (EC-SHR-14). Null when the file can't be decoded. */
export async function heicToJpeg(bytes: Uint8Array): Promise<Buffer | null> {
  try {
    const out = await convert({ buffer: bytes, format: "JPEG", quality: 0.75 });
    return Buffer.from(out);
  } catch {
    return null;
  }
}
