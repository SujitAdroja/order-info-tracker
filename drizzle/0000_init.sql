CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"item_id" uuid,
	"issue_type" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"draft_subject" text,
	"draft_body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_status_check" CHECK (status in ('draft', 'sent', 'in_progress', 'resolved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purchase_id" uuid,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_kind_check" CHECK (kind in ('receipt', 'invoice', 'warranty_card', 'other'))
);
--> statement-breakpoint
CREATE TABLE "forwarding_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_part" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone,
	CONSTRAINT "forwarding_addresses_local_part_unique" UNIQUE("local_part")
);
--> statement-breakpoint
CREATE TABLE "inbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"provider_message_id" text,
	"from_domain" text,
	"subject_hash" text,
	"raw_encrypted" "bytea",
	"status" text DEFAULT 'pending' NOT NULL,
	"email_type" text,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"error_code" text,
	"purchase_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "inbound_emails_provider_message_id_unique" UNIQUE("provider_message_id"),
	CONSTRAINT "inbound_emails_status_check" CHECK (status in ('pending', 'processing', 'parsed', 'needs_review', 'ignored', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(12, 2),
	"category" text,
	"serial_number" text,
	"warranty_months" integer,
	"warranty_start" date,
	"warranty_end" date,
	"extended_warranty_end" date,
	"item_status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "purchase_items_status_check" CHECK (item_status in ('active', 'returned', 'kept', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid,
	"store_name" text NOT NULL,
	"external_order_id" text,
	"source" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"parse_confidence" real,
	"order_date" date NOT NULL,
	"delivery_date" date,
	"delivery_date_estimated" boolean DEFAULT false NOT NULL,
	"currency" text,
	"total_amount" numeric(12, 2),
	"return_window_days" integer,
	"return_deadline" date,
	"return_deadline_estimated" boolean DEFAULT false NOT NULL,
	"non_returnable" boolean DEFAULT false NOT NULL,
	"notes" text,
	"user_edited_fields" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "purchases_source_check" CHECK (source in ('email', 'receipt_image', 'receipt_pdf', 'manual')),
	CONSTRAINT "purchases_status_check" CHECK (status in ('active', 'returned', 'kept', 'cancelled', 'expired'))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"failed_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"item_id" uuid,
	"kind" text NOT NULL,
	"offset_label" text NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"channel_used" text,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "reminders_unique" UNIQUE NULLS NOT DISTINCT("purchase_id","item_id","kind","offset_label"),
	CONSTRAINT "reminders_kind_check" CHECK (kind in ('return', 'warranty', 'claim_followup', 'review_needed')),
	CONSTRAINT "reminders_channel_check" CHECK (channel_used is null or channel_used in ('push', 'email'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_category_policies" (
	"store_id" uuid NOT NULL,
	"category" text NOT NULL,
	"return_days" integer,
	"non_returnable" boolean DEFAULT false NOT NULL,
	CONSTRAINT "store_category_policies_store_id_category_pk" PRIMARY KEY("store_id","category")
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"country" text,
	"sender_domains" text[] DEFAULT '{}' NOT NULL,
	"default_return_days" integer,
	"return_from" text DEFAULT 'delivery' NOT NULL,
	"policy_url" text,
	"policy_verified_at" date,
	CONSTRAINT "stores_slug_unique" UNIQUE("slug"),
	CONSTRAINT "stores_return_from_check" CHECK (return_from in ('delivery', 'order'))
);
--> statement-breakpoint
CREATE TABLE "trusted_senders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"timezone_detected" boolean DEFAULT false NOT NULL,
	"country" text,
	"default_currency" text DEFAULT 'INR' NOT NULL,
	"reminder_hour" smallint DEFAULT 10 NOT NULL,
	"email_reminders_enabled" boolean DEFAULT true NOT NULL,
	"push_enabled" boolean DEFAULT false NOT NULL,
	"gmail_forwarding_verified" boolean DEFAULT false NOT NULL,
	"pending_gmail_code" text,
	"pending_gmail_code_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_item_id_purchase_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."purchase_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forwarding_addresses" ADD CONSTRAINT "forwarding_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD CONSTRAINT "inbound_emails_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_item_id_purchase_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."purchase_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_category_policies" ADD CONSTRAINT "store_category_policies_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_senders" ADD CONSTRAINT "trusted_senders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_user_id_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "claim_events_claim_id_idx" ON "claim_events" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claims_user_id_idx" ON "claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "documents_user_id_idx" ON "documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "documents_purchase_id_idx" ON "documents" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "forwarding_addresses_user_id_idx" ON "forwarding_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "forwarding_addresses_one_active_per_user" ON "forwarding_addresses" USING btree ("user_id") WHERE "forwarding_addresses"."active";--> statement-breakpoint
CREATE INDEX "inbound_emails_user_id_idx" ON "inbound_emails" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inbound_emails_status_idx" ON "inbound_emails" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchases_user_id_idx" ON "purchases" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_user_store_order_unique" ON "purchases" USING btree ("user_id",coalesce("store_id"::text, lower("store_name")),"external_order_id") WHERE "purchases"."external_order_id" is not null and "purchases"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("send_at") WHERE "reminders"."sent_at" is null and "reminders"."cancelled_at" is null;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trusted_senders_user_email" ON "trusted_senders" USING btree ("user_id","email");