import type { PurchaseFormValues } from "@/lib/purchases/form-values";

/** Fields the review form highlights for the user to check (EC-SHR-19). */
export type DraftField = "storeName" | "orderDate" | "items";

export type DuplicateRef = {
  purchaseId: string;
  title: string;
  /** same_order: same order number; possible: same store, date ±1 day and total. */
  kind: "same_order" | "possible";
};

export type Draft = {
  key: string;
  values: PurchaseFormValues;
  /** Found but unsure: highlighted. */
  check: DraftField[];
  /** Not found at all: highlighted and prompted. */
  missing: DraftField[];
  confidence: number;
  total: number | null;
  duplicate: DuplicateRef | null;
};

export type ExtractMethod = "vision" | "ocr" | "pdf" | "text";

export type ExtractError =
  | "link_only" // EC-SHR-01
  | "not_an_order" // EC-SHR-05
  | "unreadable" // nothing readable (scanned PDF, empty OCR)
  | "unsupported" // EC-SHR-12
  | "too_large" // EC-SHR-13
  | "heic_unsupported" // EC-SHR-14
  | "vision_unavailable" // no key / limit / API down → read on the device
  | "rate_limited"
  | "extract_failed"; // EC-SHR-15

export type ExtractResponse =
  | { ok: true; method: ExtractMethod; drafts: Draft[] }
  | { ok: false; error: ExtractError; retryable: boolean; message: string };
