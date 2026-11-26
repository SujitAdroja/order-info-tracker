ALTER TABLE "reminders" DROP CONSTRAINT "reminders_kind_check";--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "shipping_status" text DEFAULT 'ordered' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_shipping_status_check" CHECK (shipping_status in ('ordered', 'shipped', 'out_for_delivery'));--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_kind_check" CHECK (kind in ('return', 'warranty', 'claim_followup', 'review_needed', 'delivery_check'));