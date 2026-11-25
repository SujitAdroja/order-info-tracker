import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  ForwardingAddressCard,
  ForwardingAddressSkeleton,
} from "@/components/forwarding-address-card";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { PushSettings } from "@/components/pwa/push-settings";
import { LogoutButton } from "@/components/settings/logout-button";
import { ReminderSettingsForm } from "@/components/settings/reminder-settings-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/session";
import { ensureForwardingAddress } from "@/lib/users";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <Suspense
        fallback={
          <>
            <ForwardingAddressSkeleton />
            <Card aria-busy="true">
              <CardHeader>
                <CardTitle>Account</CardTitle>
              </CardHeader>
            </Card>
          </>
        }
      >
        <SettingsContent />
      </Suspense>
    </div>
  );
}

async function SettingsContent() {
  const user = await getCurrentUser();
  const address = await ensureForwardingAddress(user.id);

  return (
    <>
      <ForwardingAddressCard address={address} />

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">Email</dt>
            <dd data-testid="account-email" className="break-all">
              {user.email}
            </dd>
            <dt className="text-muted-foreground">Timezone</dt>
            <dd data-testid="account-timezone">{user.timezone}</dd>
            <dt className="text-muted-foreground">Currency</dt>
            <dd>{user.defaultCurrency}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <PushSettings vapidPublicKey={env().VAPID_PUBLIC_KEY ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
        </CardHeader>
        <CardContent>
          <ReminderSettingsForm
            initial={{
              reminderHour: user.reminderHour,
              timezone: user.timezone,
              emailRemindersEnabled: user.emailRemindersEnabled,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Install the app</CardTitle>
        </CardHeader>
        <CardContent>
          <InstallPrompt />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gmail auto-forward</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p className="text-muted-foreground">
            Let Gmail forward order emails automatically, using a filter you
            control. We never get access to your inbox.
          </p>
          <Link
            href="/onboarding"
            className={buttonVariants({
              variant: "outline",
              className: "justify-self-start",
            })}
          >
            Set up or check Gmail forwarding
          </Link>
        </CardContent>
      </Card>

      {process.env.NODE_ENV !== "production" && (
        <Card>
          <CardHeader>
            <CardTitle>Developer tools</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p className="text-muted-foreground">
              Test the email pipeline without a mail provider: paste an
              email&apos;s text.
            </p>
            <Link
              href="/dev/inbound"
              className={buttonVariants({
                variant: "outline",
                className: "justify-self-start",
              })}
            >
              Paste an email
            </Link>
          </CardContent>
        </Card>
      )}

      <LogoutButton />
    </>
  );
}
