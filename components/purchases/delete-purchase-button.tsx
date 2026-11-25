"use client";

import { Trash2Icon } from "lucide-react";
import { useTransition } from "react";
import { deletePurchaseAction } from "@/app/actions/purchases";
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

export function DeletePurchaseButton({ purchaseId }: { purchaseId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
          />
        }
      >
        <Trash2Icon aria-hidden />
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this purchase?</AlertDialogTitle>
          <AlertDialogDescription>
            It will disappear from your dashboard and you won&apos;t get any
            more reminders for it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(() => deletePurchaseAction(purchaseId))
            }
          >
            {pending ? "Deleting…" : "Delete purchase"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
