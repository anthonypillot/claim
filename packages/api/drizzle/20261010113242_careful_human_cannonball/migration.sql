CREATE TABLE "discord_rate_limits" (
	"bucket_hash" text PRIMARY KEY,
	"blocked_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "discord_rate_limits_expiry_idx" ON "discord_rate_limits" ("blocked_until");