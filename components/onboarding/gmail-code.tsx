"use client";

import { CheckCircle2Icon, LoaderIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";

type State = { code: string | null; verified: boolean };

/** F2 step 2: shows the Gmail confirmation code as soon as it arrives (3 s polling). */
export function GmailCode({ initial }: { initial: State }) {
  const [state, setState] = useState(initial);

  useEffect(() => {
    if (state.verified) return;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/me/gmail-code", { cache: "no-store" });
        if (res.ok && !stopped) setState(await res.json());
      } catch {
        // Offline or transient: try again on the next tick.
      }
    };
    void tick(); // don't make the user wait for the first interval
    const timer = setInterval(tick, 3000);
    // Coming back from the Gmail tab: check right away.
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [state.verified]);

  if (state.verified) {
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
      >
        <CheckCircle2Icon aria-hidden className="size-4" />
        Gmail forwarding is working. We received an auto-forwarded email.
      </p>
    );
  }

  if (state.code) {
    return (
      <div
        role="status"
        className="grid gap-2 rounded-lg border bg-muted/40 p-4"
      >
        <span className="text-sm text-muted-foreground">
          Your Gmail confirmation code
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <code
            data-testid="gmail-code"
            className="font-mono text-2xl tracking-widest"
          >
            {state.code}
          </code>
          <CopyButton value={state.code} label="Copy code" />
        </div>
        <span className="text-xs text-muted-foreground">
          Paste it into Gmail&apos;s &ldquo;Confirmation code&rdquo; box and
          click Verify. We never click Gmail&apos;s link for you.
        </span>
      </div>
    );
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground"
    >
      <LoaderIcon aria-hidden className="size-4 animate-spin" />
      Waiting for Gmail&apos;s confirmation email… The code will appear here.
    </p>
  );
}
