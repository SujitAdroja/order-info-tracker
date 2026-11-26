import { consume, LIMITS, rateKey } from "@/lib/rate-limit";
import { getCurrentUserOrNull } from "@/lib/session";
import { MAX_UPLOAD_BYTES } from "@/lib/shares/rules";
import { heicToJpeg, sniffType } from "@/lib/uploads/files";

/**
 * EC-SHR-14: most Android browsers can't open HEIC photos. The device sends
 * the photo here, gets a JPEG back and reads it on the device. Nothing is
 * stored. Body: the raw HEIC bytes.
 */
export const maxDuration = 30;

const MAX_JPEG_BYTES = 4 * 1024 * 1024; // response limit on Vercel is 4.5 MB

export async function POST(request: Request) {
  const user = await getCurrentUserOrNull();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "too_large" }, { status: 413 });
  }
  if (!(await consume(rateKey("heic", user.id), LIMITS.heicConvert)).ok) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_UPLOAD_BYTES || sniffType(bytes) !== "image/heic") {
    return Response.json({ error: "unsupported" }, { status: 415 });
  }
  const jpeg = await heicToJpeg(bytes);
  if (!jpeg || jpeg.length > MAX_JPEG_BYTES) {
    return Response.json({ error: "heic_unsupported" }, { status: 422 });
  }
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
    },
  });
}
