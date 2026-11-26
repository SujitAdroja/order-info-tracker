"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateReminderSettingsAction } from "@/app/actions/notifications";
import { OnlineButton } from "@/components/pwa/online-button";
import { Label } from "@/components/ui/label";
import { CURRENCIES } from "@/lib/purchases/constants";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 08:00–21:00 (quiet hours excluded)

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function hourLabel(h: number) {
  return new Date(2000, 0, 1, h).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Settings → Reminders & preferences (F9). Hour/timezone changes reschedule (EC-DATE-08). */
export function ReminderSettingsForm({
  initial,
}: {
  initial: {
    reminderHour: number;
    timezone: string;
    emailRemindersEnabled: boolean;
    defaultCurrency: string;
  };
}) {
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const zones = useMemo(() => {
    const all =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : [];
    return all.includes(initial.timezone) ? all : [initial.timezone, ...all];
  }, [initial.timezone]);
  const dirty =
    values.reminderHour !== initial.reminderHour ||
    values.timezone !== initial.timezone ||
    values.emailRemindersEnabled !== initial.emailRemindersEnabled ||
    values.defaultCurrency !== initial.defaultCurrency;

  return (
    <form
      className="grid gap-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateReminderSettingsAction(values);
          if (res.ok) toast.success("Settings saved");
          else toast.error(res.error);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="reminder-hour">Send reminders at</Label>
          <select
            id="reminder-hour"
            className={selectClass}
            value={values.reminderHour}
            onChange={(e) =>
              setValues({ ...values, reminderHour: Number(e.target.value) })
            }
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="timezone">Timezone</Label>
          <select
            id="timezone"
            className={selectClass}
            value={values.timezone}
            onChange={(e) => setValues({ ...values, timezone: e.target.value })}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="currency">Default currency</Label>
          <select
            id="currency"
            className={selectClass}
            value={values.defaultCurrency}
            onChange={(e) =>
              setValues({ ...values, defaultCurrency: e.target.value })
            }
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-primary"
          checked={values.emailRemindersEnabled}
          onChange={(e) =>
            setValues({ ...values, emailRemindersEnabled: e.target.checked })
          }
        />
        <span>
          Email me when a notification can&apos;t be delivered
          <span className="block text-muted-foreground">
            Used when no device has notifications turned on.
          </span>
        </span>
      </label>
      <p className="text-muted-foreground">
        We never send between 10 pm and 8 am; anything due then waits until 8
        am.
      </p>
      <OnlineButton
        type="submit"
        disabled={!dirty || pending}
        className="justify-self-start"
      >
        {pending ? "Saving…" : "Save"}
      </OnlineButton>
    </form>
  );
}
