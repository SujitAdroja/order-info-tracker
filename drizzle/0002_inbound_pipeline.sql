ALTER TABLE "inbound_emails" ADD COLUMN "llm_parsed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inbound_emails" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "review_reasons" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "inbound_emails_llm_parsed_at_idx" ON "inbound_emails" USING btree ("llm_parsed_at") WHERE "inbound_emails"."llm_parsed_at" is not null;