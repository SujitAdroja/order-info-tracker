CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forwarding_addresses" DROP CONSTRAINT "forwarding_addresses_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "forwarding_addresses" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "forwarding_addresses" ADD CONSTRAINT "forwarding_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;