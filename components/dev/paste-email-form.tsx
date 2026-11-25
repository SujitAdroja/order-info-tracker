"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  pasteEmailAction,
  type PasteEmailResult,
} from "@/app/actions/dev-inbound";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MESSAGES: Record<"accepted" | "duplicate" | "ignored", string> = {
  accepted:
    "Received. It's being processed now — check the dashboard in a few seconds.",
  duplicate: "That email was already received.",
  ignored: "Ignored (rate limit reached).",
};

export function PasteEmailForm() {
  const [result, setResult] = useState<PasteEmailResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-4"
      action={(formData) => {
        startTransition(async () => {
          const res = await pasteEmailAction({
            from: formData.get("from"),
            subject: formData.get("subject"),
            body: formData.get("body"),
          });
          setResult(res);
        });
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="from">From</Label>
        <Input
          id="from"
          name="from"
          required
          placeholder="Amazon.in <auto-confirm@amazon.in>"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          name="subject"
          placeholder="Your Amazon.in order #403-…"
          autoComplete="off"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="body">Email text</Label>
        <Textarea
          id="body"
          name="body"
          required
          rows={14}
          className="font-mono text-xs"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send to my inbox"}
        </Button>
        <Link
          href="/dashboard?tab=review"
          className={buttonVariants({ variant: "outline" })}
        >
          Open dashboard
        </Link>
      </div>
      {result && (
        <p role="status" data-testid="paste-result" className="text-sm">
          {result.ok ? MESSAGES[result.status] : result.error}
        </p>
      )}
    </form>
  );
}
