import type { Metadata } from "next";
import { Suspense } from "react";
import { ShareReview } from "@/components/shares/share-review";
import { todayInTimeZone } from "@/lib/dates";
import { listStoreOptions } from "@/lib/purchases/service";
import { getCurrentUser } from "@/lib/session";
import { visionAvailable } from "@/lib/uploads/extract";

export const metadata: Metadata = { title: "Review shared order" };

/**
 * Where shared screenshots/PDFs land (Web Share Target → service worker →
 * here) and where the Upload button goes. The files themselves stay on the
 * device (IndexedDB) until saved or discarded.
 */
export default function ReviewSharePage({
  searchParams,
}: PageProps<"/add/review">) {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Review order</h1>
      <Suspense
        fallback={
          <div
            aria-busy="true"
            className="h-96 animate-pulse rounded-xl bg-muted"
          />
        }
      >
        <ReviewContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ReviewContent({
  searchParams,
}: {
  searchParams: PageProps<"/add/review">["searchParams"];
}) {
  const [{ share, share_error }, user, stores] = await Promise.all([
    searchParams,
    getCurrentUser(),
    listStoreOptions(),
  ]);
  const shareId =
    typeof share === "string" && /^[\w-]{1,64}$/.test(share) ? share : null;
  return (
    <ShareReview
      key={shareId ?? "none"}
      shareId={shareId}
      shareError={share_error === "1"}
      visionEnabled={visionAvailable()}
      stores={stores}
      today={todayInTimeZone(user.timezone)}
      defaultCurrency={user.defaultCurrency}
    />
  );
}
