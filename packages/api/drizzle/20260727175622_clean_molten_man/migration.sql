ALTER TABLE "giveaway_fetches" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "giveaway_fetches" ADD COLUMN "lease_token" text;--> statement-breakpoint
ALTER TABLE "giveaway_fetches" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "giveaway_fetches" ALTER COLUMN "fetched_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "giveaway_fetches" ALTER COLUMN "fetched_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "giveaway_fetches" ADD CONSTRAINT "giveaway_fetches_lease_all_or_none" CHECK ((
        ("lease_token" is null and "lease_expires_at" is null)
        or ("lease_token" is not null and "lease_expires_at" is not null)
      ));