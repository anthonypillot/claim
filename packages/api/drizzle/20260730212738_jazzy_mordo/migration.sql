ALTER TABLE "giveaway_fetches" ADD COLUMN "fresh_until" timestamp with time zone;--> statement-breakpoint
UPDATE "giveaway_fetches"
SET "fresh_until" = "fetched_at" + interval '24 hours'
WHERE "fetched_at" IS NOT NULL;
