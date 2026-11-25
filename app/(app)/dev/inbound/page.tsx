import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PasteEmailForm } from "@/components/dev/paste-email-form";

export const metadata: Metadata = { title: "Paste an email (dev)" };

/**
 * Development only: test the email pipeline without a provider or tunnel.
 * The pasted text is treated exactly like a forwarded email.
 */
export default function DevInboundPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Paste an email
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Development only. Open an order email in Gmail, copy its text and
          paste it below. It goes through the same pipeline as a forwarded
          email. A forwarded copy (with the “Forwarded message” block) works
          too.
        </p>
      </div>
      <PasteEmailForm />
    </div>
  );
}
