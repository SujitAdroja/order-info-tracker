"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  purchaseInputSchema,
  toFieldErrors,
  type FieldErrors,
} from "@/lib/purchases/input";
import {
  confirmPurchaseReview,
  createManualPurchase,
  setPurchaseStatus,
  softDeletePurchase,
  updatePurchase,
} from "@/lib/purchases/service";
import { STATUS_ACTIONS, type StatusAction } from "@/lib/purchases/status";
import { getCurrentUser } from "@/lib/session";

export type SavePurchaseResult = { ok: false; errors: FieldErrors } | undefined;

const idSchema = z.uuid();

/** Manual add (F5). Redirects to the new purchase on success. */
export async function createPurchaseAction(
  payload: unknown,
): Promise<SavePurchaseResult> {
  const user = await getCurrentUser();
  const parsed = purchaseInputSchema.safeParse(payload);
  if (!parsed.success)
    return { ok: false, errors: toFieldErrors(parsed.error) };

  const result = await createManualPurchase(user, parsed.data);
  if (!result.ok) return result;
  redirect(`/purchases/${result.id}`);
}

export async function updatePurchaseAction(
  purchaseId: string,
  payload: unknown,
): Promise<SavePurchaseResult> {
  const user = await getCurrentUser();
  if (!idSchema.safeParse(purchaseId).success) redirect("/dashboard");
  const parsed = purchaseInputSchema.safeParse(payload);
  if (!parsed.success)
    return { ok: false, errors: toFieldErrors(parsed.error) };

  const result = await updatePurchase(user, purchaseId, parsed.data);
  if (!result) redirect("/dashboard"); // not found / not yours (EC-SEC-03)
  if (!result.ok) return result;
  redirect(`/purchases/${purchaseId}`);
}

/** F7 status buttons. Bound with (purchaseId, action) in the form. */
export async function setPurchaseStatusAction(
  purchaseId: string,
  action: StatusAction,
) {
  const user = await getCurrentUser();
  if (
    !idSchema.safeParse(purchaseId).success ||
    !STATUS_ACTIONS.includes(action)
  ) {
    return;
  }
  await setPurchaseStatus(user, purchaseId, action);
  redirect(`/purchases/${purchaseId}`);
}

export async function deletePurchaseAction(purchaseId: string) {
  const user = await getCurrentUser();
  if (idSchema.safeParse(purchaseId).success) {
    await softDeletePurchase(user, purchaseId);
  }
  redirect("/dashboard?deleted=1");
}

/** Review screen "Looks right": clears email-parsing review flags. */
export async function confirmPurchaseAction(purchaseId: string) {
  const user = await getCurrentUser();
  if (idSchema.safeParse(purchaseId).success) {
    await confirmPurchaseReview(user, purchaseId);
  }
  redirect(`/purchases/${purchaseId}`);
}
