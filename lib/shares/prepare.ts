import {
  fitWithin,
  JPEG_QUALITY,
  MAX_FILE_BYTES,
  MAX_IMAGE_EDGE,
} from "@/lib/shares/rules";

/**
 * On-device image prep before upload/OCR (share spec 3.3 step 3): resize to
 * 1600 px on the long edge and re-encode as JPEG. Returns null when the
 * browser can't decode the file (typically HEIC on Android, EC-SHR-14).
 */
export async function prepareImage(file: Blob): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    const { width, height } = fitWithin(
      bitmap.width,
      bitmap.height,
      MAX_IMAGE_EDGE,
    );
    let blob: Blob | null = null;
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        whiteBackground(ctx, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        blob = await canvas.convertToBlob({
          type: "image/jpeg",
          quality: JPEG_QUALITY,
        });
      }
    }
    if (!blob) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return fallback(file);
      whiteBackground(ctx, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
      );
    }
    // EC-SHR-13: if compression fails, the original is fine when it's small enough.
    return blob ?? fallback(file);
  } catch {
    return fallback(file);
  } finally {
    bitmap.close();
  }
}

/** Transparent PNG screenshots would turn black as JPEG. */
function whiteBackground(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
}

function fallback(file: Blob): Blob | null {
  return file.size <= MAX_FILE_BYTES ? file : null;
}
