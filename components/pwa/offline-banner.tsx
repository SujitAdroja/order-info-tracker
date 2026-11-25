"use client";

import { WifiOffIcon } from "lucide-react";
import { useOffline } from "next/offline";

/** EC-PWA-01: shown on every app page while the connection is down. */
export function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <div
      id="offline-banner"
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:bg-amber-900 dark:text-amber-50"
    >
      <WifiOffIcon aria-hidden className="size-4" />
      You&apos;re offline. Changes are paused until you&apos;re back online.
    </div>
  );
}
