"use client";

import { DownloadIcon, ShareIcon, SquarePlusIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { isIOS, isStandalone } from "@/components/pwa/platform";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Mode = "checking" | "installed" | "prompt" | "ios" | "manual";

const noSubscribe = () => () => {};

/**
 * Install guidance (Phase 5): Android/desktop Chrome get a real install button
 * via `beforeinstallprompt`; iOS and other browsers get instructions
 * (EC-PWA-03).
 */
export function InstallPrompt() {
  // Platform facts don't change while the page is open; "checking" on the server.
  const platform = useSyncExternalStore<Mode>(
    noSubscribe,
    () => (isStandalone() ? "installed" : isIOS() ? "ios" : "manual"),
    () => "checking",
  );
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [outcome, setOutcome] = useState<"installed" | "manual" | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setOutcome("installed");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const mode: Mode =
    outcome ?? (platform !== "installed" && deferred ? "prompt" : platform);

  if (mode === "checking") return null;

  return (
    <div
      className="grid gap-3 text-sm"
      data-testid="install-prompt"
      data-mode={mode}
    >
      {mode === "installed" && <p>KeepTrack is installed on this device.</p>}

      {mode === "prompt" && (
        <>
          <p className="text-muted-foreground">
            Install KeepTrack for one-tap access and reliable reminders.
          </p>
          <Button
            className="justify-self-start"
            onClick={async () => {
              if (!deferred) return;
              await deferred.prompt();
              const choice = await deferred.userChoice;
              setDeferred(null);
              setOutcome(
                choice.outcome === "accepted" ? "installed" : "manual",
              );
            }}
          >
            <DownloadIcon aria-hidden />
            Install app
          </Button>
        </>
      )}

      {mode === "ios" && (
        <ol className="grid list-decimal gap-1 pl-5 text-muted-foreground">
          <li>
            Open this page in{" "}
            <strong className="text-foreground">Safari</strong>.
          </li>
          <li>
            Tap{" "}
            <ShareIcon
              aria-label="Share"
              className="inline size-4 align-text-bottom"
            />{" "}
            <strong className="text-foreground">Share</strong>.
          </li>
          <li>
            Choose{" "}
            <SquarePlusIcon
              aria-hidden
              className="inline size-4 align-text-bottom"
            />{" "}
            <strong className="text-foreground">Add to Home Screen</strong>,
            then open KeepTrack from your Home Screen.
          </li>
        </ol>
      )}

      {mode === "manual" && (
        <p className="text-muted-foreground">
          To install, use your browser&apos;s menu:{" "}
          <strong className="text-foreground">Install app</strong> or{" "}
          <strong className="text-foreground">Add to Home screen</strong>. On
          Firefox desktop, install isn&apos;t available — notifications and
          email reminders still work.
        </p>
      )}
    </div>
  );
}
