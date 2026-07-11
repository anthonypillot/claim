CREATE TABLE "giveaway_refreshes" (
	"store" text NOT NULL,
	"locale" text NOT NULL,
	"country" text NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "giveaway_refreshes_store_locale_country_pk" PRIMARY KEY("store","locale","country")
);
