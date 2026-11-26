/**
 * Shared rules for shared/uploaded receipts (share target + Upload button).
 * Used on the device and on the server, so keep this file dependency-free.
 */

export const MAX_SHARE_FILES = 5; // EC-SHR-03
export const SHARE_TTL_DAYS = 7; // EC-SHR-10
export const MAX_IMAGE_EDGE = 1600;
export const JPEG_QUALITY = 0.8;
/** Per file after compression (EC-SHR-13). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/**
 * Whole request. Vercel functions accept at most 4.5 MB per request, so a
 * share must fit under that once images are compressed.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_SHARED_TEXT = 5_000;

export const IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
export const PDF_TYPE = "application/pdf";
export const ACCEPTED_TYPES = [...IMAGE_TYPES, PDF_TYPE] as const;

export type FileKind = "image" | "heic" | "pdf";

/** By MIME type, falling back to the extension (some galleries send none). */
export function fileKind(file: {
  type: string;
  name: string;
}): FileKind | null {
  const type = file.type.toLowerCase();
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (type === "image/heic" || type === "image/heif") return "heic";
  if (
    ["heic", "heif"].includes(ext) &&
    (!type || type === "application/octet-stream")
  )
    return "heic";
  if ((IMAGE_TYPES as readonly string[]).includes(type)) return "image";
  if (type === PDF_TYPE) return "pdf";
  if (!type || type === "application/octet-stream") {
    if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";
    if (ext === "pdf") return "pdf";
  }
  return null;
}

/**
 * Keeps supported, non-empty files, first 5 only. Reports what was dropped so
 * the review screen can say so (EC-SHR-03, EC-SHR-12).
 */
export function pickShareFiles<
  T extends { type: string; name: string; size: number },
>(files: T[]): { files: T[]; unsupported: number; overLimit: number } {
  const supported = files.filter((f) => f.size > 0 && fileKind(f) !== null);
  return {
    files: supported.slice(0, MAX_SHARE_FILES),
    unsupported: files.length - supported.length,
    overLimit: Math.max(0, supported.length - MAX_SHARE_FILES),
  };
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

/**
 * EC-SHR-01: shopping apps' Share button sends just a product link (often with
 * the product title). That's not an order, and we never fetch the link.
 * "Link only" = the text has a URL and, without it, nothing that looks like
 * order data (no order number, price or date words).
 */
export function isLinkOnly(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || !URL_RE.test(trimmed)) return false;
  URL_RE.lastIndex = 0;
  const rest = trimmed.replace(URL_RE, " ").trim();
  if (!rest) return true;
  const looksLikeOrder =
    /\border\b[^\n]{0,20}(?:id|#|no\.?|number|placed|date)|\b(?:total|amount paid|grand total|delivered|invoice)\b/i.test(
      rest,
    );
  return !looksLikeOrder && rest.length <= 300;
}

/**
 * Joins the shared title/text/url fields. Many apps repeat the title or URL
 * inside the text, so a part contained in another part is dropped.
 * public/sw.js does the same when it receives a share.
 */
export function joinSharedText(parts: (string | null | undefined)[]): string {
  const vals = parts.map((p) => p?.trim() ?? "").filter(Boolean);
  return vals
    .filter(
      (v, i) =>
        !vals.some((o, j) => j !== i && o.includes(v) && (o !== v || j < i)),
    )
    .join("\n")
    .slice(0, MAX_SHARED_TEXT);
}

/** Fits w×h inside a max edge, never upscaling. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_IMAGE_EDGE,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
