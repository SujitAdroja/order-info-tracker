import type { Metadata } from "next";
import { Suspense } from "react";
import { PurchaseForm } from "@/components/purchases/purchase-form";
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
          Receipt upload is coming soon. For now, enter the details by hand.
        </p>
      </div>
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
