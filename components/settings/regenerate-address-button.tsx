"use client";

import { RefreshCwIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { regenerateAddressAction } from "@/app/actions/account";
import { OnlineButton } from "@/components/pwa/online-button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** EC-ACC-06: replace a leaked address. The old one works for 7 more days. */
export function RegenerateAddressButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="sm" className="-ml-2" />}
      >
        <RefreshCwIcon aria-hidden />
        Get a new address
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Get a new forwarding address?</AlertDialogTitle>
          <AlertDialogDescription>
            Do this if your address leaked or you get emails you didn&apos;t
            forward. Your current address keeps working for 7 days, then stops.
            Afterwards, update your Gmail filter with the new address, and tap
            &ldquo;Add to contacts&rdquo; again to replace the saved contact.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep current address</AlertDialogCancel>
          <OnlineButton
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await regenerateAddressAction();
                if (res.ok) {
                  setOpen(false);
                  toast.success(
                    "New address ready. Update your Gmail filter and saved contact.",
                  );
                } else {
                  toast.error(res.error);
                }
              })
            }
          >
            {pending ? "Creating…" : "Get new address"}
          </OnlineButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
