import { extractText } from "unpdf";
import { normalizeText } from "@/lib/ingest/html-to-text";

const MAX_PDF_TEXT = 15_000;

/**
 * EC-ING-08: order details only in a PDF invoice. Returns extracted text, or
 * null for scanned/encrypted/broken PDFs. Never throws.
 */
export async function pdfToText(base64: string): Promise<string | null> {
  try {
    const bytes = new Uint8Array(Buffer.from(base64, "base64"));
    if (
      bytes.length < 5 ||
      Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-"
    ) {
      return null; // not actually a PDF (EC-SEC-02: sniff, don't trust the type)
    }
    const { text } = await extractText(bytes, { mergePages: true });
    const cleaned = normalizeText(text);
    return cleaned ? cleaned.slice(0, MAX_PDF_TEXT) : null;
  } catch {
    return null;
  }
}
