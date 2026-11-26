import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { getDb } from "@/lib/db";
import {
  auditLog,
  forwardingAddresses,
  inboundEmails,
  purchaseItems,
  purchases,
  pushSubscriptions,
  reminders,
  users,
  verificationTokens,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { toCsv } from "@/lib/csv";
import { formatForwardingAddress } from "@/lib/forwarding";
import { ensureForwardingAddress } from "@/lib/users";

// ---------------------------------------------------------------------------
// EC-ACC-05: export
// ---------------------------------------------------------------------------

/**
 * Everything we hold about the user, as JSON + CSV in a zip. Raw emails are
 * never kept, so the email history lists metadata only.
 */
export async function exportUserData(userId: string): Promise<Uint8Array> {
  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error("user_not_found");
  const domain = env().INBOUND_DOMAIN;

  const addresses = await db
    .select()
    .from(forwardingAddresses)
    .where(eq(forwardingAddresses.userId, userId))
    .orderBy(asc(forwardingAddresses.createdAt));
  const purchaseRows = await db
    .select()
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .orderBy(desc(purchases.orderDate));
  const itemRows = purchaseRows.length
    ? await db
        .select()
        .from(purchaseItems)
        .where(
          inArray(
            purchaseItems.purchaseId,
            purchaseRows.map((p) => p.id),
          ),
        )
        .orderBy(asc(purchaseItems.name))
    : [];
  const reminderRows = await db
    .select()
    .from(reminders)
    .where(eq(reminders.userId, userId))
    .orderBy(asc(reminders.sendAt));
  const emailRows = await db
    .select({
      receivedAt: inboundEmails.receivedAt,
      fromDomain: inboundEmails.fromDomain,
      emailType: inboundEmails.emailType,
      status: inboundEmails.status,
      purchaseId: inboundEmails.purchaseId,
    })
    .from(inboundEmails)
    .where(eq(inboundEmails.userId, userId))
    .orderBy(desc(inboundEmails.receivedAt));
  const devices = await db.$count(
    pushSubscriptions,
    eq(pushSubscriptions.userId, userId),
  );

  const account = {
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    defaultCurrency: user.defaultCurrency,
    reminderHour: user.reminderHour,
    emailRemindersEnabled: user.emailRemindersEnabled,
    gmailForwardingVerified: user.gmailForwardingVerified,
    pushDevices: devices,
    createdAt: user.createdAt,
    forwardingAddresses: addresses.map((a) => ({
      address: formatForwardingAddress(a.localPart, domain),
      active: a.active,
      createdAt: a.createdAt,
      deactivatedAt: a.deactivatedAt,
    })),
  };
  const purchasesJson = purchaseRows.map((p) => ({
    ...p,
    items: itemRows.filter((i) => i.purchaseId === p.id),
  }));
  const generatedAt = new Date().toISOString();

  const files: Record<string, Uint8Array> = {
    "README.txt": strToU8(
      [
        "KeepTrack data export",
        `Generated: ${generatedAt}`,
        "",
        "account.json        Your profile, settings and forwarding addresses",
        "purchases.json      Every purchase with its items (deleted ones have deletedAt set)",
        "purchases.csv       One row per purchase",
        "items.csv           One row per item",
        "reminders.csv       Scheduled and sent reminders",
        "email_history.csv   Emails we received for you (metadata only; we never keep email content)",
        "",
        "Dates are YYYY-MM-DD; times are UTC (ISO 8601).",
      ].join("\r\n"),
    ),
    "account.json": strToU8(JSON.stringify(account, null, 2)),
    "purchases.json": strToU8(JSON.stringify(purchasesJson, null, 2)),
    "purchases.csv": strToU8(
      toCsv(purchaseRows, [
        "id",
        "storeName",
        "externalOrderId",
        "source",
        "status",
        "needsReview",
        "orderDate",
        "deliveryDate",
        "currency",
        "totalAmount",
        "returnWindowDays",
        "returnDeadline",
        "returnDeadlineEstimated",
        "nonReturnable",
        "notes",
        "createdAt",
        "deletedAt",
      ]),
    ),
    "items.csv": strToU8(
      toCsv(itemRows, [
        "id",
        "purchaseId",
        "name",
        "quantity",
        "unitPrice",
        "category",
        "serialNumber",
        "warrantyMonths",
        "warrantyStart",
        "warrantyEnd",
        "extendedWarrantyEnd",
        "itemStatus",
      ]),
    ),
    "reminders.csv": strToU8(
      toCsv(reminderRows, [
        "purchaseId",
        "itemId",
        "kind",
        "offsetLabel",
        "sendAt",
        "sentAt",
        "channelUsed",
        "cancelledAt",
      ]),
    ),
    "email_history.csv": strToU8(
      toCsv(emailRows, [
        "receivedAt",
        "fromDomain",
        "emailType",
        "status",
        "purchaseId",
      ]),
    ),
  };
  return zipSync(files, { level: 6 });
}

// ---------------------------------------------------------------------------
// EC-ACC-04: delete account
// ---------------------------------------------------------------------------

/**
 * Hard-deletes the user and everything that cascades from them (purchases,
 * items, reminders, emails, push devices, sessions). Forwarding addresses
 * stay as unlinked tombstones so their local parts are never reassigned.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const user = await tx.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { email: true },
    });
    if (!user) return;
    await tx
      .update(forwardingAddresses)
      .set({ active: false, deactivatedAt: new Date() })
      .where(eq(forwardingAddresses.userId, userId));
    await tx
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, user.email));
    await tx.delete(users).where(eq(users.id, userId)); // cascades; addresses → user_id null
    await tx
      .insert(auditLog)
      .values({ userId: null, action: "account.delete", meta: null });
  });
}

// ---------------------------------------------------------------------------
// EC-ACC-06: new forwarding address
// ---------------------------------------------------------------------------

/**
 * Retires the current address (it keeps working for 7 days, see
 * receive.ts) and issues a new one. Gmail forwarding must be set up again.
 */
export async function regenerateForwardingAddress(
  userId: string,
): Promise<string> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(forwardingAddresses)
      .set({ active: false, deactivatedAt: new Date() })
      .where(
        and(
          eq(forwardingAddresses.userId, userId),
          eq(forwardingAddresses.active, true),
        ),
      );
    await tx
      .update(users)
      .set({
        gmailForwardingVerified: false,
        pendingGmailCode: null,
        pendingGmailCodeExpiresAt: null,
      })
      .where(eq(users.id, userId));
  });
  return ensureForwardingAddress(userId);
}
