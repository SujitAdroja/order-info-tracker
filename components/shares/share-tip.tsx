"use client";

import { CameraIcon, Share2Icon, SmartphoneIcon, XIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { isIOS, isStandalone } from "@/components/pwa/platform";
import { Button } from "@/components/ui/button";

type Platform = "server" | "android-app" | "android-web" | "ios" | "other";

const noSubscribe = () => () => {};
const DISMISS_KEY = "kt-share-tip-dismissed";

function platform(): Platform {
  if (isIOS()) return "ios";
  if (/Android/i.test(navigator.userAgent))
    return isStandalone() ? "android-app" : "android-web";
  return "other";
}

/**
 * Discoverability for sharing screenshots (share spec section 4).
 * - "add": one line on the Add page.
 * - "dashboard": a one-time card on phones, dismissed for good.
 */
export function ShareTip({ variant }: { variant: "add" | "dashboard" }) {
  const p = useSyncExternalStore<Platform>(
    noSubscribe,
    platform,
    () => "server",
  );
  const storedDismissed = useSyncExternalStore(
    noSubscribe,
    () => localStorage.getItem(DISMISS_KEY) === "1",
    () => true,
  );
  const [dismissed, setDismissed] = useState(false);

  if (p === "server") return null;

  if (variant === "add") {
    const text =
      p === "android-app"
        ? "Tip: you can also share screenshots or invoice PDFs to KeepTrack from any app."
        : p === "android-web"
          ? "Install KeepTrack to share screenshots directly from other apps."
          : p === "ios"
            ? "Take a screenshot of your order, then tap Upload here."
            : "Tip: upload a screenshot or invoice PDF and we'll fill in the details.";
    return (
      <div
        className="grid gap-2 text-sm text-muted-foreground"
        data-testid="share-tip"
        data-platform={p}
      >
        <p>{text}</p>
        {p === "android-web" ? <InstallPrompt /> : null}
      </div>
    );
  }

  if (p === "other" || storedDismissed || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <section
      className="relative grid gap-3 rounded-xl border bg-muted/40 p-4 pr-10"
      aria-labelledby="share-tip-title"
      data-testid="share-tip"
      data-platform={p}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2"
        aria-label="Dismiss tip"
        onClick={dismiss}
      >
        <XIcon aria-hidden />
      </Button>
      <h2 id="share-tip-title" className="font-medium">
        Add orders from any app
      </h2>
      {p === "ios" ? (
        <p className="text-sm text-muted-foreground">
          Take a screenshot of your order, then tap{" "}
          <strong>Add purchase → Upload screenshot</strong>.
        </p>
      ) : (
        <>
          <ol className="grid gap-2 text-sm sm:grid-cols-3">
            <Step icon={<CameraIcon aria-hidden className="size-4" />} n={1}>
              Take a screenshot of the order
            </Step>
            <Step icon={<Share2Icon aria-hidden className="size-4" />} n={2}>
              Tap <strong>Share</strong>
            </Step>
            <Step
              icon={<SmartphoneIcon aria-hidden className="size-4" />}
              n={3}
            >
              Choose <strong>KeepTrack</strong>
            </Step>
          </ol>
          {p === "android-app" ? (
            <p className="text-xs text-muted-foreground">
              Don&apos;t see KeepTrack in Share? Reopen the app or reinstall it.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Install KeepTrack (browser menu → <strong>Install app</strong>) to
              share screenshots directly from other apps.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Step({
  icon,
  n,
  children,
}: {
  icon: React.ReactNode;
  n: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg border bg-background p-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        {icon}
      </span>
      <span>
        <span className="sr-only">Step {n}: </span>
        {children}
      </span>
    </li>
  );
}
