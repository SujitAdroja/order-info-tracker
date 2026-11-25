import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { purchaseToFormValues } from "@/lib/purchases/form-values";
import { getPurchaseDetail, listStoreOptions } from "@/lib/purchases/service";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Edit purchase" };

export default function EditPurchasePage({
  params,
}: PageProps<"/purchases/[id]/edit">) {
  return (
    <div className="grid gap-6">
      <Suspense
        fallback={
          <div
            aria-busy="true"
            className="h-96 animate-pulse rounded-xl bg-muted"
          />
        }
      >
        <EditContent params={params} />
      </Suspense>
    </div>
  );
}

async function EditContent({
  params,
}: {
  params: PageProps<"/purchases/[id]/edit">["params"];
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await getCurrentUser();
  const [purchase, stores] = await Promise.all([
    getPurchaseDetail(user, id),
    listStoreOptions(),
  ]);
  if (!purchase) notFound();

  return (
    <>
      <div className="grid gap-2">
        <Link
          href={`/purchases/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Edit purchase</h1>
        <p className="text-sm text-muted-foreground">
          Your edits are kept even if a later email about this order arrives.
        </p>
      </div>
      <PurchaseForm
        purchaseId={id}
        initial={purchaseToFormValues(purchase, user.defaultCurrency)}
        stores={stores}
        submitLabel="Save changes"
      />
    </>
  );
}
