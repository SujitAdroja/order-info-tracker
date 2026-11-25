"use client";

import { BellIcon, BellOffIcon } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  sendTestNotificationAction,
  subscribePushAction,
  unsubscribePushAction,
} from "@/app/actions/notifications";
import { OnlineButton } from "@/components/pwa/online-button";
import { SW_URL } from "@/components/pwa/service-worker";
import { isIOS, isStandalone } from "@/components/pwa/platform";

type Status =
  | "checking"
  | "unsupported" // no service worker / Push API
  | "ios-install" // EC-PUSH-01: iOS needs the Home Screen app first
  | "denied" // EC-PUSH-02: never re-prompt
  | "off"
  | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  return (
    (await navigator.serviceWorker.getRegistration("/")) ??
    navigator.serviceWorker.register(SW_URL, {
      scope: "/",
      updateViaCache: "none",
    })
  );
}

/**
 * Settings → Notifications for this device. Permission is only requested
 * when the user taps the button (never on page load).
 */
export function PushSettings({
  vapidPublicKey,
}: {
  vapidPublicKey: string | null;
}) {
  const [status, setStatus] = useState<Status>("checking");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported || !vapidPublicKey) {
        setStatus(isIOS() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setStatus("denied");
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      if (sub && Notification.permission === "granted") {
        // Keep the server's copy in sync (subscriptions can be rotated by the browser).
        void subscribePushAction({
          ...sub.toJSON(),
          userAgent: navigator.userAgent.slice(0, 300),
        });
        setStatus("on");
      } else {
        setStatus("off");
      }
    })().catch(() => setStatus("unsupported"));
  }, [vapidPublicKey]);

  const turnOn = () =>
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await registration();
        await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
          }));
        const res = await subscribePushAction({
          ...sub.toJSON(),
          userAgent: navigator.userAgent.slice(0, 300),
        });
        if (!res.ok) throw new Error(res.error);
        setStatus("on");
        toast.success("Notifications are on for this device");
      } catch {
        toast.error("Couldn't turn on notifications. Please try again.");
      }
    });

  const turnOff = () =>
    startTransition(async () => {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePushAction(sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      setStatus("off");
    });

  const test = () =>
    startTransition(async () => {
      const res = await sendTestNotificationAction();
      if (!res.ok) toast.error(res.error);
      else if (res.delivered === 0)
        toast.error(
          "The notification couldn't be delivered. Try turning notifications off and on.",
        );
      else
        toast.success(
          `Sent to ${res.delivered} device${res.delivered === 1 ? "" : "s"}`,
        );
    });

  return (
    <div
      className="grid gap-3 text-sm"
      data-testid="push-settings"
      data-status={status}
    >
      {status === "checking" && (
        <p className="text-muted-foreground">Checking this device…</p>
      )}

      {status === "unsupported" && (
        <p className="text-muted-foreground">
          This browser can&apos;t show notifications. We&apos;ll email your
          reminders instead.
        </p>
      )}

      {status === "ios-install" && (
        <p className="text-muted-foreground">
          On iPhone and iPad, notifications work once KeepTrack is on your Home
          Screen. Install it (see below), open it from the Home Screen, then
          turn notifications on here. Until then we email your reminders.
        </p>
      )}

      {status === "denied" && (
        <p className="text-muted-foreground">
          Notifications are blocked for this site. To allow them, open your
          browser&apos;s site settings (the icon next to the address), allow
          notifications, then reload. Meanwhile we email your reminders.
        </p>
      )}

      {status === "off" && (
        <>
          <p className="text-muted-foreground">
            Get reminders on this device before return windows close and
            warranties end.
          </p>
          <OnlineButton
            onClick={turnOn}
            disabled={pending}
            className="justify-self-start"
          >
            <BellIcon aria-hidden />
            Turn on notifications
          </OnlineButton>
        </>
      )}

      {status === "on" && (
        <>
          <p>Notifications are on for this device.</p>
          <div className="flex flex-wrap gap-2">
            <OnlineButton onClick={test} disabled={pending} variant="outline">
              Send a test notification
            </OnlineButton>
            <OnlineButton onClick={turnOff} disabled={pending} variant="ghost">
              <BellOffIcon aria-hidden />
              Turn off on this device
            </OnlineButton>
          </div>
        </>
      )}
    </div>
  );
}
