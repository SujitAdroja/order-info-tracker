import type { ISODate } from "@/lib/dates";
import { daysUntil, type ReminderKind } from "@/lib/reminders/schedule";

/** Section 9 "Notification content". Plain text only; never HTML from emails. */

export type ReminderContext = {
  kind: ReminderKind | "claim_followup";
  purchaseId: string;
  storeName: string;
  itemName: string | null;
  totalAmount: string | null;
  currency: string | null;
  returnDeadline: ISODate | null;
  warrantyEnd: ISODate | null;
};

export type NotificationMessage = {
  title: string;
  body: string;
  url: string;
  tag: string;
  /** Lock-screen buttons (where supported): only for return reminders. */
  actions: { action: "returned" | "kept"; title: string }[];
  purchaseId: string | null;
};

export function formatMoney(
  amount: string | null,
  currency: string | null,
): string | null {
  if (amount === null || amount === "") return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", {
      style: "currency",
      currency: currency ?? "INR",
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  } catch {
    return `${currency ?? ""} ${n}`.trim();
  }
}

function inDays(days: number, what: string): string {
  if (days <= 0) return `${what} today`;
  if (days === 1) return `${what} tomorrow`;
  return `${what} in ${days} days`;
}

export function reminderMessage(
  ctx: ReminderContext,
  timeZone: string,
  now: Date,
): NotificationMessage {
  const parts = [
    ctx.itemName,
    ctx.storeName,
    formatMoney(ctx.totalAmount, ctx.currency),
  ];
  const body = parts.filter(Boolean).join(" · ");
  const url = `/purchases/${ctx.purchaseId}`;
  const base = {
    body,
    url,
    purchaseId: ctx.purchaseId,
    actions: [] as NotificationMessage["actions"],
  };

  switch (ctx.kind) {
    case "return": {
      const days = ctx.returnDeadline
        ? daysUntil(ctx.returnDeadline, timeZone, now)
        : 0;
      return {
        ...base,
        title: inDays(days, "Return window closes"),
        tag: `return-${ctx.purchaseId}`,
        actions: [
          { action: "returned", title: "Returned" },
          { action: "kept", title: "Keeping it" },
        ],
      };
    }
    case "warranty": {
      const days = ctx.warrantyEnd
        ? daysUntil(ctx.warrantyEnd, timeZone, now)
        : 0;
      return {
        ...base,
        title: inDays(days, "Warranty ends"),
        tag: `warranty-${ctx.purchaseId}`,
      };
    }
    case "review_needed":
      return {
        ...base,
        title: "Please check this purchase",
        body: body
          ? `${body} — confirm the details so we can remind you on time`
          : "Confirm the details so we can remind you on time",
        tag: `review-${ctx.purchaseId}`,
      };
    case "claim_followup":
      return {
        ...base,
        title: "Did they respond to your claim?",
        tag: `claim-${ctx.purchaseId}`,
      };
  }
}

/** EC-PUSH-05: several reminders due in one run → one digest notification. */
export function digestMessage(
  messages: NotificationMessage[],
): NotificationMessage {
  const returns = messages.filter((m) => m.tag.startsWith("return-")).length;
  const title =
    returns === messages.length
      ? `${returns} return windows close soon`
      : `You have ${messages.length} reminders`;
  // "Airdopes 141: return closes tomorrow; Kettle: warranty ends in 7 days +2 more"
  const shown = messages.slice(0, 3).map((m) => {
    const what = m.body.split(" · ")[0] || "Purchase";
    const when = m.title
      .replace(/^Return window closes/, "return closes")
      .replace(/^Warranty ends/, "warranty ends")
      .replace(/^Please check this purchase$/, "needs a check");
    return `${what}: ${when}`;
  });
  const more = messages.length > 3 ? ` +${messages.length - 3} more` : "";
  return {
    title,
    body: shown.join("; ") + more,
    url: "/dashboard",
    tag: "digest",
    actions: [],
    purchaseId: null,
  };
}
