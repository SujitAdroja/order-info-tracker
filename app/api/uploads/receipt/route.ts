import { consume, LIMITS, minutesText, rateKey } from "@/lib/rate-limit";
import { getCurrentUserOrNull } from "@/lib/session";
import {
  MAX_SHARE_FILES,
  MAX_SHARED_TEXT,
  MAX_UPLOAD_BYTES,
} from "@/lib/shares/rules";
import { extractUpload, visionAvailable } from "@/lib/uploads/extract";
import { heicToJpeg, sniffType } from "@/lib/uploads/files";
import type { ExtractResponse } from "@/lib/uploads/types";
import type { VisionImage } from "@/lib/uploads/vision";

/**
 * Shared screenshots / PDFs / text → drafts (share spec 3.4). Multipart:
 * `files` (≤5), `text` (from the share sheet), `ocrText` (read on the
 * device), `source` (upload | share_target). Nothing is stored.
 */
export const maxDuration = 60;

const MAX_OCR_TEXT = 20_000;

function reply(body: ExtractResponse, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUserOrNull();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return reply(
      {
        ok: false,
        error: "too_large",
        retryable: false,
        message: "That's too big to read. Try a smaller screenshot.",
      },
      413,
    );
  }

  const limit = await consume(
    rateKey("receipt-upload", user.id),
    LIMITS.receiptUpload,
  );
  if (!limit.ok) {
    return reply(
      {
        ok: false,
        error: "rate_limited",
        retryable: false,
        message: `You've added a lot today. Try again in ${minutesText(limit.retryAfterSeconds)}, or enter it by hand.`,
      },
      429,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(
      {
        ok: false,
        error: "extract_failed",
        retryable: true,
        message: "The upload didn't arrive. Please try again.",
      },
      400,
    );
  }
  const field = (name: string, max: number) => {
    const v = form.get(name);
    return typeof v === "string" ? v.slice(0, max) : "";
  };
  const source =
    field("source", 20) === "share_target" ? "share_target" : "upload";
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_SHARE_FILES);

  const images: VisionImage[] = [];
  const pdfs: Buffer[] = [];
  let heicFailed = false;
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffType(bytes);
    if (type === "application/pdf") pdfs.push(Buffer.from(bytes));
    else if (type === "image/heic") {
      // Only converted when it'll be read here (the device can't decode it).
      const jpeg = visionAvailable() ? await heicToJpeg(bytes) : null;
      if (jpeg)
        images.push({
          mediaType: "image/jpeg",
          base64: jpeg.toString("base64"),
        });
      else heicFailed = true;
    } else if (type) {
      images.push({
        mediaType: type,
        base64: Buffer.from(bytes).toString("base64"),
      });
    }
  }
  if (files.length && !images.length && !pdfs.length) {
    return reply(
      heicFailed
        ? {
            ok: false,
            error: "heic_unsupported",
            retryable: false,
            message:
              "We couldn't open that photo format. Please share it as a JPG or PNG.",
          }
        : {
            ok: false,
            error: "unsupported",
            retryable: false,
            message: "Only screenshots, photos and PDF invoices are supported.",
          },
      415,
    );
  }

  const result = await extractUpload(user, {
    images,
    pdfs,
    sharedText: field("text", MAX_SHARED_TEXT),
    ocrText: field("ocrText", MAX_OCR_TEXT),
  });
  // Metrics only: no content, no extracted personal data.
  console.info(
    `[upload] source=${source} images=${images.length} pdfs=${pdfs.length} ${
      result.ok
        ? `method=${result.method} drafts=${result.drafts.length}`
        : `error=${result.error}`
    }`,
  );
  return reply(result);
}
