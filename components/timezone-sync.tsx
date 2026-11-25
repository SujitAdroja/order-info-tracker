"use client";

import { useEffect } from "react";
import { syncDetectedTimezone } from "@/app/actions/user";

/** Reports the browser timezone once, right after first login. Renders nothing. */
export function TimezoneSync({ needed }: { needed: boolean }) {
  useEffect(() => {
    if (!needed) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Best effort: if this is interrupted (navigation, offline) it retries next visit.
    if (tz) syncDetectedTimezone(tz).catch(() => {});
  }, [needed]);
  return null;
}
