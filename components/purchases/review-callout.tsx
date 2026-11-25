import Link from "next/link";
import { confirmPurchaseAction } from "@/app/actions/purchases";
import { Button, buttonVariants } from "@/components/ui/button";
import { REVIEW_REASON_LABELS, type ReviewReason } from "@/lib/ingest/merge";

/**
 * Section 11 screen 6 (review): explains why a purchase needs checking.
 * "Looks right" clears the email-parsing flags; an unknown return window can
 * only be cleared by setting it.
 */
export function ReviewCallout({
  purchaseId,
  reasons,
}: {
  purchaseId: string;
  reasons: string[];
}) {
  const known = reasons.filter(
    (r): r is ReviewReason => r in REVIEW_REASON_LABELS,
  );
  if (!known.length) return null;
  const onlyWindow = known.every((r) => r === "unknown_return_window");
  const fromEmail = known.some((r) => r !== "unknown_return_window");

  return (
    <div
      role="note"
      data-testid="review-callout"
      className="grid gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <p className="font-medium">
        {onlyWindow
          ? "We don't know the return window. Please set it."
          : "Please confirm these details"}
      </p>
      {onlyWindow ? (
        <p>
          Check your receipt or the store&apos;s website, then add the number of
          days so we can remind you before it closes.
        </p>
      ) : (
        <ul className="grid list-disc gap-1 pl-5">
          {known.map((r) => (
            <li key={r}>{REVIEW_REASON_LABELS[r]}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/purchases/${purchaseId}/edit`}
          className={buttonVariants({ size: "sm" })}
        >
          {onlyWindow ? "Set return window" : "Edit details"}
        </Link>
        {fromEmail ? (
          <form action={confirmPurchaseAction.bind(null, purchaseId)}>
            <Button type="submit" size="sm" variant="outline">
              Looks right
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
