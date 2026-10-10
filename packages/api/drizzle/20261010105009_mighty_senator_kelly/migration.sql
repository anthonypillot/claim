CREATE TABLE "discord_deliveries" (
	"id" text PRIMARY KEY,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"revision" text NOT NULL,
	"store" text NOT NULL,
	"listing_id" text NOT NULL,
	"locale" text NOT NULL,
	"country" text NOT NULL,
	"occurrence_id" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"attempt_token" text,
	"attempt_expires_at" timestamp with time zone,
	"message_id" text
);
--> statement-breakpoint
CREATE TABLE "giveaway_occurrences" (
	"store" text,
	"id" text,
	"locale" text,
	"country" text,
	"occurrence_id" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"free_until" timestamp with time zone NOT NULL,
	"active" boolean NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "giveaway_occurrences_pkey" PRIMARY KEY("store","id","locale","country")
);
--> statement-breakpoint
CREATE INDEX "discord_deliveries_due_idx" ON "discord_deliveries" ("state","available_at");--> statement-breakpoint
CREATE INDEX "discord_deliveries_guild_idx" ON "discord_deliveries" ("guild_id");--> statement-breakpoint
ALTER TABLE "discord_deliveries" ADD CONSTRAINT "discord_deliveries_guild_id_discord_subscriptions_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "discord_subscriptions"("guild_id") ON DELETE CASCADE;