// Copies the on-device OCR files (Tesseract.js worker, WASM core, English
// data) into public/ocr so they're served by the app itself, never a CDN.
// Runs on `npm install` (postinstall), including on Vercel.
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public", "ocr");
const nm = (...p) => path.join(root, "node_modules", ...p);

const files = [
  [nm("tesseract.js", "dist", "worker.min.js"), "worker.min.js"],
  // LSTM-only builds; the worker picks one by the device's WASM support.
  ...[
    "tesseract-core-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm.js",
    "tesseract-core-relaxedsimd-lstm.wasm.js",
  ].map((f) => [nm("tesseract.js-core", f), path.join("core", f)]),
  // "best_int": accurate and ~3 MB (the float model is ~11 MB).
  [
    nm("@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"),
    path.join("lang", "eng.traineddata.gz"),
  ],
];

for (const [from, to] of files) {
  const dest = path.join(out, to);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(from, dest);
}
console.log(`OCR assets copied to ${path.relative(root, out)}`);
