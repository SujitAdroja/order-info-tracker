"use client";

import { signOutAction } from "@/app/actions/auth";
import { clearOfflineData } from "@/components/pwa/service-worker";
import { Button } from "@/components/ui/button";

/** Logs out and removes this device's saved offline dashboard (shared devices). */
export function LogoutButton() {
  return (
    <form action={signOutAction} onSubmit={() => void clearOfflineData()}>
      <Button type="submit" variant="outline">
        Log out
      </Button>
    </form>
  );
}
