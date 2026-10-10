CREATE TABLE "discord_follows" (
	"guild_id" text,
	"store" text,
	"baseline_at" timestamp with time zone,
	CONSTRAINT "discord_follows_pkey" PRIMARY KEY("guild_id","store")
);
--> statement-breakpoint
CREATE TABLE "discord_interactions" (
	"hash" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_subscriptions" (
	"guild_id" text PRIMARY KEY,
	"channel_id" text NOT NULL,
	"locale" text NOT NULL,
	"country" text NOT NULL,
	"stores" text[],
	"revision" text NOT NULL,
	"disabled_at" timestamp with time zone,
	"disabled_reason" text,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"check_token" text,
	"check_expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "discord_follows" ADD CONSTRAINT "discord_follows_guild_id_discord_subscriptions_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "discord_subscriptions"("guild_id") ON DELETE CASCADE;