ALTER TABLE "giveaway_fetches" ADD COLUMN "fresh_until" timestamp with time zone;--> statement-breakpoint
UPDATE "giveaway_fetches"
SET "fresh_until" = LEAST(
	"fetched_at" + interval '24 hours',
	COALESCE(
		(
			SELECT MIN("giveaways"."free_until")
			FROM "giveaways"
			WHERE "giveaways"."store" = "giveaway_fetches"."store"
				AND "giveaways"."locale" = "giveaway_fetches"."locale"
				AND "giveaways"."country" = "giveaway_fetches"."country"
				AND "giveaways"."is_active" = true
		),
		"fetched_at" + interval '24 hours'
	)
)
WHERE "fetched_at" IS NOT NULL;
