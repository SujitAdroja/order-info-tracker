import type { ShareRecord } from "@/lib/shares/idb";
import { readTextOnDevice } from "@/lib/shares/ocr";
import { prepareImage } from "@/lib/shares/prepare";
import { fileKind, MAX_FILE_BYTES, MAX_UPLOAD_BYTES } from "@/lib/shares/rules";
import type { ExtractResponse } from "@/lib/uploads/types";

/**
 * The device side of reading a share (share spec 3.3):
 * - with the API key: compressed images go to the server for Claude's vision;
 * - without it, or if that's unavailable: OCR on the device, and only the
 *   text is sent. PDFs and shared text always go to the server's text parser.
 */

export class OfflineError extends Error {}

export type ReadStatus =
  | { step: "preparing" }
  | { step: "uploading" }
  | { step: "ocr"; progress: number };

const fail = (
  error: Extract<ExtractResponse, { ok: false }>["error"],
  message: string,
  retryable = false,
): ExtractResponse => ({ ok: false, error, retryable, message });

export async function readShare(
  record: ShareRecord,
  opts: { visionEnabled: boolean; onStatus: (s: ReadStatus) => void },
): Promise<ExtractResponse> {
  const images = record.files.filter((f) => {
    const k = fileKind(f);
    return k === "image" || k === "heic";
  });
  const pdfs = record.files.filter((f) => fileKind(f) === "pdf");
  if (!images.length && !pdfs.length && !record.text.trim()) {
    return fail(
      "unsupported",
      "Only screenshots, photos and PDF invoices are supported.",
    );
  }
  for (const pdf of pdfs) {
    if (pdf.size > MAX_UPLOAD_BYTES) {
      return fail(
        "too_large",
        "That PDF is too big to read here (4 MB max). Try a screenshot of it instead.",
      );
    }
  }

  opts.onStatus({ step: "preparing" });
  // Resized JPEGs; null = the browser can't open it (HEIC on most Android phones).
  const prepared = await Promise.all(images.map((f) => prepareImage(f)));
  for (const [i, p] of prepared.entries()) {
    if (
      !p &&
      images[i].size > MAX_FILE_BYTES &&
      fileKind(images[i]) !== "heic"
    ) {
      return fail(
        "too_large",
        "That image is too big. Try a smaller screenshot.",
      );
    }
  }

  if (images.length && opts.visionEnabled) {
    // HEIC the browser couldn't open goes as-is; the server converts it.
    const uploads = prepared.map((p, i) => p ?? images[i]);
    const res = await post(record, { files: [...uploads, ...pdfs] });
    if (res.ok || res.error !== "vision_unavailable") return res;
    // Fall through: read on the device instead.
  }

  let ocrText = "";
  if (images.length) {
    const readable: Blob[] = [];
    for (const [i, p] of prepared.entries()) {
      if (p) readable.push(p);
      else if (fileKind(images[i]) === "heic") {
        const jpeg = await convertHeic(images[i]);
        const again = jpeg ? await prepareImage(jpeg) : null;
        if (!again) {
          return fail(
            "heic_unsupported",
            "We couldn't open that photo format. Please share it as a JPG or PNG.",
          );
        }
        readable.push(again);
      }
    }
    opts.onStatus({ step: "ocr", progress: 0 });
    try {
      ocrText = await readTextOnDevice(readable, (progress) =>
        opts.onStatus({ step: "ocr", progress }),
      );
    } catch {
      if (!navigator.onLine) throw new OfflineError();
      return fail("extract_failed", "Couldn't read it right now.", true);
    }
    if (!ocrText.trim() && !pdfs.length && !record.text.trim()) {
      return fail(
        "not_an_order",
        "We couldn't find order details in that. You can enter it by hand.",
      );
    }
  }
  return post(record, { files: pdfs, ocrText });
}

async function post(
  record: ShareRecord,
  body: { files: Blob[]; ocrText?: string },
): Promise<ExtractResponse> {
  const total = body.files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_UPLOAD_BYTES) {
    return fail(
      "too_large",
      "Those files are too big together. Try fewer or smaller screenshots.",
    );
  }
  const form = new FormData();
  body.files.forEach((f, i) =>
    form.append("files", f, f instanceof File ? f.name : `image-${i + 1}.jpg`),
  );
  if (record.text) form.append("text", record.text);
  if (body.ocrText) form.append("ocrText", body.ocrText);
  form.append("source", record.source);

  let res: Response;
  try {
    res = await fetch("/api/uploads/receipt", { method: "POST", body: form });
  } catch {
    throw new OfflineError();
  }
  if (res.status === 401) {
    const back = window.location.pathname + window.location.search;
    window.location.assign(
      new URL(
        `/login?callbackUrl=${encodeURIComponent(back)}`,
        window.location.origin,
      ).href,
    );
    return new Promise(() => {}); // navigating away
  }
  try {
    return (await res.json()) as ExtractResponse;
  } catch {
    return fail("extract_failed", "Couldn't read it right now.", true);
  }
}

async function convertHeic(file: Blob): Promise<Blob | null> {
  try {
    const res = await fetch("/api/uploads/heic", {
      method: "POST",
      body: file,
    });
    return res.ok ? await res.blob() : null;
  } catch {
    throw new OfflineError();
  }
}
