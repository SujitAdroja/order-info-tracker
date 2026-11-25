"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * EC-PWA-01: keeps the service worker's offline copy of the dashboard fresh.
 * Fetches `/api/purchases` (the worker stores it) when app pages are opened
 * and when the tab becomes visible again.
 */
export function OfflineDataSync() {
  const pathname = usePathname();
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !navigator.onLine) return;
    const sync = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        fetch("/api/purchases", { cache: "no-store" }).catch(() => {});
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [pathname]);
  return null;
}
