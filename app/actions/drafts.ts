"use server";

import { z } from "zod";
import {
  purchaseToFormValues,
  type PurchaseFormValues,
} from "@/lib/purchases/form-values";
import {
  purchaseInputSchema,
  toFieldErrors,
  type FieldErrors,
} from "@/lib/purchases/input";
import {
  createManualPurchase,
  getPurchaseDetail,
  updatePurchase,
} from "@/lib/purchases/service";
import { getCurrentUser } from "@/lib/session";
import { mergeDraftIntoExisting } from "@/lib/uploads/merge-draft";

/**
 * Saving a reviewed screenshot/receipt draft. Unlike the manual form these
 * return the id instead of redirecting, so the device can delete the shared
 * files first (share spec 3.3 step 7).
 */
export type SaveDraftResult =
  { ok: true; id: string } | { ok: false; errors: FieldErrors };

const sourceSchema = z.enum(["manual", "receipt_image", "receipt_pdf"]);
const idSchema = z.uuid();

export async function saveDraftAction(
  payload: unknown,
  source: unknown,
): Promise<SaveDraftResult> {
  const user = await getCurrentUser();
  const parsed = purchaseInputSchema.safeParse(payload);
  if (!parsed.success)
    return { ok: false, errors: toFieldErrors(parsed.error) };
  return createManualPurchase(user, parsed.data, {
    source: sourceSchema.catch("manual").parse(source),
  });
}

/** "Update existing" (share spec 3.5): saves the merged form over the old purchase. */
export async function updateFromDraftAction(
  purchaseId: string,
  payload: unknown,
): Promise<SaveDraftResult> {
  const user = await getCurrentUser();
  if (!idSchema.safeParse(purchaseId).success) {
    return { ok: false, errors: { _form: "That purchase no longer exists." } };
  }
  const parsed = purchaseInputSchema.safeParse(payload);
  if (!parsed.success)
    return { ok: false, errors: toFieldErrors(parsed.error) };
  const result = await updatePurchase(user, purchaseId, parsed.data);
  if (!result)
    return { ok: false, errors: { _form: "That purchase no longer exists." } };
  return result;
}

/** The existing purchase's form, with blanks filled from the draft. */
export async function loadMergedDraftAction(
  purchaseId: string,
  draft: PurchaseFormValues,
): Promise<PurchaseFormValues | null> {
  const user = await getCurrentUser();
  if (!idSchema.safeParse(purchaseId).success) return null;
  const purchase = await getPurchaseDetail(user, purchaseId);
  if (!purchase) return null;
  return mergeDraftIntoExisting(
    purchaseToFormValues(purchase, user.defaultCurrency),
    draft,
    purchase.today,
  );
}
