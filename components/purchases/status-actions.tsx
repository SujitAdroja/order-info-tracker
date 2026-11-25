import { setPurchaseStatusAction } from "@/app/actions/purchases";
import { Button } from "@/components/ui/button";
import type { PurchaseStatus, StatusAction } from "@/lib/purchases/status";

/** F7 lifecycle buttons. Plain forms, so they work before hydration too. */
export function StatusActions({
  purchaseId,
  status,
}: {
  purchaseId: string;
  status: PurchaseStatus;
}) {
  const open = status === "active" || status === "expired";
  const actions: { action: StatusAction; label: string; primary?: boolean }[] =
    open
      ? [
          { action: "returned", label: "Returned", primary: true },
          { action: "kept", label: "Keeping it" },
          { action: "cancelled", label: "Order cancelled" },
        ]
      : [{ action: "reopen", label: "Mark as active again" }];

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map(({ action, label, primary }) => (
        <form
          key={action}
          action={setPurchaseStatusAction.bind(null, purchaseId, action)}
        >
          <Button type="submit" variant={primary ? "default" : "outline"}>
            {label}
          </Button>
        </form>
      ))}
    </div>
  );
}
