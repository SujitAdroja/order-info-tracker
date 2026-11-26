/**
 * On-device OCR with Tesseract.js (no API key needed). Every file comes from
 * our own site (public/ocr, copied by scripts/copy-ocr-assets.mjs), so the
 * screenshot never leaves the phone and nothing loads from a CDN. The English
 * data (~3 MB) is cached in IndexedDB by Tesseract after the first use.
 */
export async function readTextOnDevice(
  images: Blob[],
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const { createWorker, OEM } = await import("tesseract.js");
  const origin = window.location.origin;
  let done = 0;
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${origin}/ocr/worker.min.js`,
    corePath: `${origin}/ocr/core`,
    langPath: `${origin}/ocr/lang`,
    logger: (m) => {
      if (m.status === "recognizing text") {
        onProgress?.((done + m.progress) / images.length);
      }
    },
  });
  try {
    const texts: string[] = [];
    for (const image of images) {
      const { data } = await worker.recognize(image);
      texts.push(data.text.trim());
      done++;
      onProgress?.(done / images.length);
    }
    return texts.filter(Boolean).join("\n\n");
  } finally {
    await worker.terminate();
  }
}
