"use client";

import { useOffline } from "next/offline";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

/**
 * EC-PWA-01: a button that changes data, disabled while offline. The
 * offline banner explains why.
 */
export function OnlineButton({
  disabled,
  ...props
}: ComponentProps<typeof Button>) {
  const offline = useOffline();
  return (
    <Button
      {...props}
      disabled={disabled || offline}
      aria-describedby={offline ? "offline-banner" : props["aria-describedby"]}
    />
  );
}
