"use client";

import { DownloadIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { deleteAccountAction } from "@/app/actions/account";
import { clearOfflineData } from "@/components/pwa/service-worker";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Settings → Your data: export (EC-ACC-05) and delete account (EC-ACC-04). */
export function YourData({ email }: { email: string }) {
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = confirm.trim().toLowerCase() === email.toLowerCase();

  return (
    <div className="grid gap-5 text-sm">
      <div className="grid gap-2">
        <p className="text-muted-foreground">
          Download everything we store about you: purchases, items, reminders
          and the list of emails we received (we never keep email content). JSON
          and CSV in a zip.
        </p>
        <a
          href="/api/me/export"
          download
          className={buttonVariants({
            variant: "outline",
            className: "justify-self-start",
          })}
        >
          <DownloadIcon aria-hidden />
          Download my data
        </a>
      </div>

      <div className="grid gap-2 border-t pt-5">
        <p className="text-muted-foreground">
          Deleting your account permanently removes your purchases, reminders
          and settings right away. Your forwarding address stops working and is
          never given to anyone else.
        </p>
        <AlertDialog
          onOpenChange={(open) => {
            if (!open) {
              setConfirm("");
              setError(null);
            }
          }}
        >
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                className="justify-self-start text-destructive hover:text-destructive"
              />
            }
          >
            <Trash2Icon aria-hidden />
            Delete my account
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete your account permanently?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This can&apos;t be undone. Download your data first if you want
                a copy.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="confirm-email">
                Type your email address to confirm
              </Label>
              <Input
                id="confirm-email"
                autoComplete="off"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={email}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "confirm-error" : undefined}
              />
              {error ? (
                <p id="confirm-error" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <OnlineButton
                variant="destructive"
                disabled={!matches || pending}
                onClick={() =>
                  startTransition(async () => {
                    await clearOfflineData();
                    const res = await deleteAccountAction(confirm);
                    if (res && !res.ok) setError(res.error);
                  })
                }
              >
                {pending ? "Deleting…" : "Delete account"}
              </OnlineButton>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
