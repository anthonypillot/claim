CREATE TABLE "giveaways" (
	"store" text NOT NULL,
	"id" text NOT NULL,
	"locale" text NOT NULL,
	"country" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"url" text,
	"image_wide" text,
	"image_tall" text,
	"image_thumbnail" text,
	"seller" text NOT NULL,
	"price_original" integer,
	"price_formatted" text,
	"price_currency" text,
	"free_until" timestamp with time zone NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "giveaways_store_id_locale_country_pk" PRIMARY KEY("store","id","locale","country"),
	CONSTRAINT "giveaways_price_all_or_none" CHECK ((
        ("price_original" is null and "price_formatted" is null and "price_currency" is null)
        or ("price_original" is not null and "price_formatted" is not null and "price_currency" is not null)
      ))
);
--> statement-breakpoint
CREATE INDEX "giveaways_locale_country_free_until_idx" ON "giveaways" USING btree ("locale","country","free_until");