"use client";

import { ImageUpIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { putShare } from "@/lib/shares/idb";
import { pickShareFiles } from "@/lib/shares/rules";

/**
 * "Upload screenshot": the same flow as sharing to the app, for iPhone
 * (Safari has no share target) and desktop. Files go to this device's share
 * store first, then the review screen reads them.
 */
export function UploadReceiptButton({
  variant = "default",
  label = "Upload screenshot or PDF",
}: {
  variant?: "default" | "outline";
  label?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFiles(list: FileList | null) {
    const all = Array.from(list ?? []);
    if (!all.length) return;
    const { files, unsupported, overLimit } = pickShareFiles(all);
    if (!files.length) {
      toast.error("Only screenshots, photos and PDF invoices are supported.");
      return;
    }
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      await putShare({
        id,
        createdAt: Date.now(),
        source: "upload",
        files,
        text: "",
        dropped: { unsupported, overLimit },
      });
      router.push(`/add/review?share=${id}`);
    } catch {
      toast.error("Couldn't open those files. Please try again.");
      setBusy(false);
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        data-testid="receipt-file-input"
        onChange={(e) => void onFiles(e.target.files)}
      />
      <Button
        type="button"
        variant={variant}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <ImageUpIcon aria-hidden />
        {busy ? "Opening…" : label}
      </Button>
    </>
  );
}
