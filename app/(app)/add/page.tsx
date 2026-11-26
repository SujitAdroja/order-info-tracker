import type { Metadata } from "next";
import { Suspense } from "react";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { ShareTip } from "@/components/shares/share-tip";
import { UploadReceiptButton } from "@/components/shares/upload-receipt-button";
import { todayInTimeZone } from "@/lib/dates";
import { newPurchaseValues } from "@/lib/purchases/form-values";
import { listStoreOptions } from "@/lib/purchases/service";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Add purchase" };

export default function AddPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Add a purchase
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a screenshot of the order or an invoice PDF and we&apos;ll fill
          in the details, or enter them by hand below.
        </p>
      </div>
      <section
        className="grid gap-3 rounded-xl border p-4"
        aria-label="From a screenshot"
      >
        <UploadReceiptButton />
        <ShareTip variant="add" />
      </section>
      <Suspense
        fallback={
          <div
            aria-busy="true"
            className="h-96 animate-pulse rounded-xl bg-muted"
          />
        }
      >
        <AddForm />
      </Suspense>
    </div>
  );
}

async function AddForm() {
  const [user, stores] = await Promise.all([
    getCurrentUser(),
    listStoreOptions(),
  ]);
  const today = todayInTimeZone(user.timezone);
  return (
    <PurchaseForm
      initial={newPurchaseValues(today, user.defaultCurrency)}
      stores={stores}
      submitLabel="Save purchase"
    />
  );
}
