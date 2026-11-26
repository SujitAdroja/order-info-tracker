import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
// Relative import: drizzle-kit loads this file outside Next's path aliases.
import {
  CATEGORIES,
  RETURN_WINDOW_SOURCES,
  SHIPPING_STATUSES,
} from "../purchases/constants";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Builds a `col IN ('a','b')` check from a readonly tuple. */
const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(", ")})`);

// ---------------------------------------------------------------------------
// Enumerations (kept as text + CHECK so adding values is a cheap migration)
// ---------------------------------------------------------------------------

export const INBOUND_STATUSES = [
  "pending",
  "processing",
  "parsed",
  "needs_review",
  "ignored",
  "failed",
] as const;
export const RETURN_FROM = ["delivery", "order"] as const;

export const PURCHASE_SOURCES = [
  "email",
  "receipt_image",
  "receipt_pdf",
  "manual",
] as const;
export const PURCHASE_STATUSES = [
  "active",
  "returned",
  "kept",
  "cancelled",
  "expired",
] as const;
export const ITEM_STATUSES = [
  "active",
  "returned",
  "kept",
  "cancelled",
] as const;
export const DOCUMENT_KINDS = [
  "receipt",
  "invoice",
  "warranty_card",
  "other",
] as const;
export const REMINDER_KINDS = [
  "return",
  "warranty",
  "claim_followup",
  "review_needed",
  "delivery_check",
] as const;
export const CLAIM_STATUSES = [
  "draft",
  "sent",
  "in_progress",
  "resolved",
  "rejected",
] as const;

// ---------------------------------------------------------------------------
// Users + Auth.js tables
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  // Auth.js adapter fields
  name: text("name"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  // App fields
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  /** False until the browser reports its timezone after first login. */
  timezoneDetected: boolean("timezone_detected").notNull().default(false),
  country: text("country"),
  defaultCurrency: text("default_currency").notNull().default("INR"),
  reminderHour: smallint("reminder_hour").notNull().default(10),
  emailRemindersEnabled: boolean("email_reminders_enabled")
    .notNull()
    .default(true),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  gmailForwardingVerified: boolean("gmail_forwarding_verified")
    .notNull()
    .default(false),
  /** Section 6.2 step 1: Gmail forwarding confirmation code, expires in 7 days. */
  pendingGmailCode: text("pending_gmail_code"),
  pendingGmailCodeExpiresAt: timestamp("pending_gmail_code_expires_at", {
    withTimezone: true,
  }),
  createdAt: createdAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("accounts_user_id_idx").on(t.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// Forwarding
// ---------------------------------------------------------------------------

export const forwardingAddresses = pgTable(
  "forwarding_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Null once the account is deleted: the row stays as a tombstone so the
    // local part is never reassigned (EC-ACC-04), with no link to the person.
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Unique forever: local parts are never reassigned (EC-ACC-04).
    localPart: text("local_part").notNull().unique(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  },
  (t) => [
    index("forwarding_addresses_user_id_idx").on(t.userId),
    // At most one active address per user.
    uniqueIndex("forwarding_addresses_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.active}`),
  ],
);

export const trustedSenders = pgTable(
  "trusted_senders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    verified: boolean("verified").notNull().default(false),
  },
  (t) => [uniqueIndex("trusted_senders_user_email").on(t.userId, t.email)],
);

export const inboundEmails = pgTable(
  "inbound_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    providerMessageId: text("provider_message_id").unique(),
    fromDomain: text("from_domain"),
    subjectHash: text("subject_hash"),
    rawEncrypted: bytea("raw_encrypted"),
    status: text("status", { enum: INBOUND_STATUSES })
      .notNull()
      .default("pending"),
    emailType: text("email_type"),
    attempts: smallint("attempts").notNull().default(0),
    errorCode: text("error_code"),
    /** Set when the LLM fallback ran; counted for the Section 6.3 cost caps. */
    llmParsedAt: timestamp("llm_parsed_at", { withTimezone: true }),
    /** Why the user must look at this email (e.g. image_only); shown on the dashboard. */
    reviewReason: text("review_reason"),
    purchaseId: uuid("purchase_id").references(() => purchases.id, {
      onDelete: "set null",
    }),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    check("inbound_emails_status_check", inList("status", INBOUND_STATUSES)),
    index("inbound_emails_user_id_idx").on(t.userId),
    index("inbound_emails_status_idx").on(t.status),
    index("inbound_emails_llm_parsed_at_idx")
      .on(t.llmParsedAt)
      .where(sql`${t.llmParsedAt} is not null`),
  ],
);

// ---------------------------------------------------------------------------
// Stores + policies
// ---------------------------------------------------------------------------

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    country: text("country"),
    senderDomains: text("sender_domains")
      .array()
      .notNull()
      .default(sql`'{}'`),
    defaultReturnDays: integer("default_return_days"),
    returnFrom: text("return_from", { enum: RETURN_FROM })
      .notNull()
      .default("delivery"),
    policyUrl: text("policy_url"),
    policyVerifiedAt: date("policy_verified_at"),
  },
  () => [check("stores_return_from_check", inList("return_from", RETURN_FROM))],
);

export const storeCategoryPolicies = pgTable(
  "store_category_policies",
  {
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    returnDays: integer("return_days"),
    nonReturnable: boolean("non_returnable").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.category] })],
);

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").references(() => stores.id, {
      onDelete: "set null",
    }),
    storeName: text("store_name").notNull(),
    externalOrderId: text("external_order_id"),
    source: text("source", { enum: PURCHASE_SOURCES }).notNull(),
    status: text("status", { enum: PURCHASE_STATUSES })
      .notNull()
      .default("active"),
    needsReview: boolean("needs_review").notNull().default(false),
    /** Why it needs review: low_confidence, no_items, unknown_return_window, … */
    reviewReasons: text("review_reasons")
      .array()
      .notNull()
      .default(sql`'{}'`),
    parseConfidence: real("parse_confidence"),
    orderDate: date("order_date").notNull(),
    deliveryDate: date("delivery_date"),
    /** Order tracking stage until delivered (then delivery_date is actual). */
    shippingStatus: text("shipping_status", { enum: SHIPPING_STATUSES })
      .notNull()
      .default("ordered"),
    deliveryDateEstimated: boolean("delivery_date_estimated")
      .notNull()
      .default(false),
    currency: text("currency"),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),
    returnWindowDays: integer("return_window_days"),
    /** Where return_window_days came from (Section 8 priority): user > email > category > store. */
    returnWindowSource: text("return_window_source", {
      enum: RETURN_WINDOW_SOURCES,
    }),
    returnDeadline: date("return_deadline"),
    returnDeadlineEstimated: boolean("return_deadline_estimated")
      .notNull()
      .default(false),
    nonReturnable: boolean("non_returnable").notNull().default(false),
    notes: text("notes"),
    /** Section 6.4 / EC-DATE-10: fields the user edited; never overwritten by email. */
    userEditedFields: text("user_edited_fields")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    check("purchases_source_check", inList("source", PURCHASE_SOURCES)),
    check("purchases_status_check", inList("status", PURCHASE_STATUSES)),
    check(
      "purchases_shipping_status_check",
      inList("shipping_status", SHIPPING_STATUSES),
    ),
    check(
      "purchases_return_window_source_check",
      sql`return_window_source is null or ${inList("return_window_source", RETURN_WINDOW_SOURCES)}`,
    ),
    index("purchases_user_id_idx").on(t.userId),
    // Section 6.4 dedupe key: (user, store_id or normalized store_name, order id).
    uniqueIndex("purchases_user_store_order_unique")
      .on(
        t.userId,
        sql`coalesce(${t.storeId}::text, lower(${t.storeName}))`,
        t.externalOrderId,
      )
      .where(sql`${t.externalOrderId} is not null and ${t.deletedAt} is null`),
  ],
);

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
    category: text("category", { enum: CATEGORIES }),
    serialNumber: text("serial_number"),
    warrantyMonths: integer("warranty_months"),
    warrantyStart: date("warranty_start"),
    warrantyEnd: date("warranty_end"),
    extendedWarrantyEnd: date("extended_warranty_end"),
    itemStatus: text("item_status", { enum: ITEM_STATUSES })
      .notNull()
      .default("active"),
  },
  (t) => [
    check("purchase_items_status_check", inList("item_status", ITEM_STATUSES)),
    check(
      "purchase_items_category_check",
      sql`category is null or ${inList("category", CATEGORIES)}`,
    ),
    index("purchase_items_purchase_id_idx").on(t.purchaseId),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purchaseId: uuid("purchase_id").references(() => purchases.id, {
      onDelete: "set null",
    }),
    kind: text("kind", { enum: DOCUMENT_KINDS }).notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("documents_kind_check", inList("kind", DOCUMENT_KINDS)),
    index("documents_user_id_idx").on(t.userId),
    index("documents_purchase_id_idx").on(t.purchaseId),
  ],
);

// ---------------------------------------------------------------------------
// Reminders + push
// ---------------------------------------------------------------------------

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => purchaseItems.id, {
      onDelete: "cascade",
    }),
    kind: text("kind", { enum: REMINDER_KINDS }).notNull(),
    offsetLabel: text("offset_label").notNull(),
    sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    channelUsed: text("channel_used", { enum: ["push", "email"] }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    check("reminders_kind_check", inList("kind", REMINDER_KINDS)),
    check(
      "reminders_channel_check",
      sql`channel_used is null or channel_used in ('push', 'email')`,
    ),
    // item_id is null for purchase-level reminders; NULLS NOT DISTINCT keeps them unique.
    unique("reminders_unique")
      .on(t.purchaseId, t.itemId, t.kind, t.offsetLabel)
      .nullsNotDistinct(),
    index("reminders_due_idx")
      .on(t.sendAt)
      .where(sql`${t.sentAt} is null and ${t.cancelledAt} is null`),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    failedCount: integer("failed_count").notNull().default(0),
  },
  (t) => [index("push_subscriptions_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Claims + audit
// ---------------------------------------------------------------------------

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => purchaseItems.id, {
      onDelete: "cascade",
    }),
    issueType: text("issue_type").notNull(),
    description: text("description"),
    status: text("status", { enum: CLAIM_STATUSES }).notNull().default("draft"),
    draftSubject: text("draft_subject"),
    draftBody: text("draft_body"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("claims_status_check", inList("status", CLAIM_STATUSES)),
    index("claims_user_id_idx").on(t.userId),
  ],
);

export const claimEvents = pgTable(
  "claim_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("claim_events_claim_id_idx").on(t.claimId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Set null on account deletion: the event stays, the link to the person doesn't.
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_user_id_idx").on(t.userId)],
);

/**
 * EC-SEC-04: fixed-window counters (sign-in emails, code attempts, exports,
 * address changes). Keys never contain raw emails or IPs — they're hashed.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

// ---------------------------------------------------------------------------
// Relations (for nested `with` queries)
// ---------------------------------------------------------------------------

export const storesRelations = relations(stores, ({ many }) => ({
  categoryPolicies: many(storeCategoryPolicies),
  purchases: many(purchases),
}));

export const storeCategoryPoliciesRelations = relations(
  storeCategoryPolicies,
  ({ one }) => ({
    store: one(stores, {
      fields: [storeCategoryPolicies.storeId],
      references: [stores.id],
    }),
  }),
);

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  store: one(stores, { fields: [purchases.storeId], references: [stores.id] }),
  items: many(purchaseItems),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, {
    fields: [purchaseItems.purchaseId],
    references: [purchases.id],
  }),
}));
