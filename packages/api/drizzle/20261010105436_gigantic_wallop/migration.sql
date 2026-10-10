CREATE TABLE "discord_runtime" (
	"token_fingerprint" text PRIMARY KEY,
	"paused" boolean DEFAULT false NOT NULL,
	"blocked_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "discord_subscriptions" ADD COLUMN "delivery_after" timestamp with time zone;