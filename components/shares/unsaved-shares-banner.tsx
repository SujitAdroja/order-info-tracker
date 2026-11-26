"use client";

import { InboxIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listShares } from "@/lib/shares/idb";

/** EC-SHR-10: shares opened but not saved; older than 7 days are deleted. */
export function UnsavedSharesBanner() {
  const [shares, setShares] = useState<{
    count: number;
    newest: string;
  } | null>(null);

  useEffect(() => {
    if (!("indexedDB" in window)) return;
    let cancelled = false;
    listShares()
      .then((list) => {
        // Also clears it: a kept-alive dashboard re-runs this when shown again.
        if (!cancelled)
          setShares(
            list.length ? { count: list.length, newest: list[0].id } : null,
          );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!shares) return null;
  return (
    <div
      role="status"
      data-testid="unsaved-shares"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <span className="flex items-center gap-2">
        <InboxIcon aria-hidden className="size-4" />
        You have{" "}
        {shares.count === 1
          ? "1 unsaved share"
          : `${shares.count} unsaved shares`}
      </span>
      <Link
        href={`/add/review?share=${shares.newest}`}
        className="font-medium underline underline-offset-2"
      >
        Review
      </Link>
    </div>
  );
}
