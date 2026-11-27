"use client";

import {
  CompassIcon,
  DownloadIcon,
  GlobeIcon,
  ShareIcon,
  SmartphoneIcon,
  SquarePlusIcon,
  type LucideIcon,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { isIOS } from "@/components/pwa/platform";
import { cn } from "@/lib/utils";

type Platform = "iphone" | "android";

const STEPS: Record<
  Platform,
  { icon: LucideIcon; title: string; body: string }[]
> = {
  iphone: [
    {
      icon: CompassIcon,
      title: "Open in Safari",
      body: "Go to this site in Safari on your iPhone.",
    },
    {
      icon: ShareIcon,
      title: "Tap Share",
      body: "The square with the arrow, at the bottom of the screen.",
    },
    {
      icon: SquarePlusIcon,
      title: "Add to Home Screen",
      body: "Then open KeepTrack from the new icon and sign in.",
    },
  ],
  android: [
    {
      icon: GlobeIcon,
      title: "Open in Chrome",
      body: "Go to this site in Chrome on your phone.",
    },
    {
      icon: DownloadIcon,
      title: "Tap Install app",
      body: "Or open the ⋮ menu and choose Add to Home screen.",
    },
    {
      icon: SmartphoneIcon,
      title: "Open it from your home screen",
      body: "Sign in, then turn on notifications in Settings.",
    },
  ],
};

const LABEL: Record<Platform, string> = {
  iphone: "iPhone",
  android: "Android",
};

const noop = () => () => {};

/** Install steps for iPhone or Android, starting with the visitor's phone. */
export function InstallSteps() {
  const detected = useSyncExternalStore<Platform | null>(
    noop,
    () => (isIOS() ? "iphone" : "android"),
    () => null,
  );
  const [chosen, setChosen] = useState<Platform | null>(null);
  const platform = chosen ?? detected ?? "android";

  return (
    <div>
      <div
        role="tablist"
        aria-label="Your phone"
        className="inline-flex rounded-full bg-[#0e2f2a]/10 p-1"
      >
        {(["iphone", "android"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            id={`install-tab-${p}`}
            aria-selected={platform === p}
            aria-controls="install-panel"
            onClick={() => setChosen(p)}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e2f2a]",
              platform === p
                ? "bg-[#0e2f2a] text-white"
                : "text-[#0e2f2a] hover:bg-[#0e2f2a]/10",
            )}
          >
            {LABEL[p]}
          </button>
        ))}
      </div>

      <div
        id="install-panel"
        role="tabpanel"
        aria-labelledby={`install-tab-${platform}`}
        className="mt-8"
      >
        <ol key={platform} className="grid gap-4 md:grid-cols-3">
          {STEPS[platform].map(({ icon: Icon, title, body }, i) => (
            <li
              key={title}
              className="lp-card-in relative flex min-h-52 flex-col rounded-[1.75rem] bg-[#0e2f2a] p-7 text-white md:min-h-64"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span
                aria-hidden
                className="text-8xl leading-none font-semibold tracking-tighter text-[#6fdcbf]"
              >
                {i + 1}
              </span>
              <span className="absolute top-7 right-7 grid size-12 place-items-center rounded-2xl bg-white/10">
                <Icon aria-hidden className="size-5" />
              </span>
              <h3 className="mt-auto pt-8 text-xl font-semibold tracking-tight">
                <span className="sr-only">Step {i + 1}: </span>
                {title}
              </h3>
              <p className="mt-2 text-sm text-[#b5d3cb]">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
