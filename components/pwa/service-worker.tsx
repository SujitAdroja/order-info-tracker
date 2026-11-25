"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export const SW_URL = `/sw.js?v=${process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}${
  process.env.NODE_ENV === "development" ? "&dev=1" : ""
}`;

/**
 * Registers the service worker once per page load and offers an update when
 * a new version is waiting (EC-PWA-02: "Update available → Reload").
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let reloading = false;

    const offerUpdate = (worker: ServiceWorker) => {
      toast("Update available", {
        description: "A new version of KeepTrack is ready.",
        duration: Infinity,
        action: {
          label: "Reload",
          onClick: () => {
            reloading = true;
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    const onControllerChange = () => {
      if (reloading) window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    navigator.serviceWorker
      .register(SW_URL, { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        // Only an update if a worker already controls the page.
        if (reg.waiting && navigator.serviceWorker.controller)
          offerUpdate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          next?.addEventListener("statechange", () => {
            if (
              next.state === "installed" &&
              navigator.serviceWorker.controller
            )
              offerUpdate(next);
          });
        });
      })
      .catch(() => {
        // Unsupported context (e.g. http on a LAN IP): the app works without it.
      });

    return () =>
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
  }, []);

  return null;
}

/** Drops the saved offline dashboard (logout; EC-ACC privacy on shared devices). */
export async function clearOfflineData(): Promise<void> {
  try {
    if ("caches" in window) await caches.delete("keeptrack-data");
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_DATA" });
  } catch {
    // best effort
  }
}
