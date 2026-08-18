import { t } from "elysia";

/** Defaults applied when a request omits the query params; the single source of truth for both the schema and the resolver. */
export const DEFAULT_LOCALE = "en-US";
export const DEFAULT_COUNTRY = "US";
export const SUPPORTED_LOCALES = ["en-US", "fr-FR"] as const;
export const SUPPORTED_COUNTRIES = ["US", "FR"] as const;

export const GiveawaysQuerySchema = t.Object({
  locale: t.Optional(
    t.String({
      pattern: "^[A-Za-z]{2}-[A-Za-z]{2}$",
      default: DEFAULT_LOCALE,
      description: `Supported locale (${SUPPORTED_LOCALES.join(", ")}); case-insensitive`,
      examples: ["en-US", "fr-FR"],
    }),
  ),
  country: t.Optional(
    t.String({
      pattern: "^[A-Za-z]{2}$",
      default: DEFAULT_COUNTRY,
      description: `Supported country (${SUPPORTED_COUNTRIES.join(", ")}); case-insensitive`,
      examples: ["FR", "US"],
    }),
  ),
});

/** A fully-resolved market (locale + country), both guaranteed present. */
export type Market = { locale: string; country: string };

export class UnsupportedMarketError extends Error {
  constructor(readonly field: "locale" | "country") {
    super(`Unsupported ${field}`);
    this.name = "UnsupportedMarketError";
  }
}

function isSupported<const Values extends readonly string[]>(
  value: string,
  values: Values,
): value is Values[number] {
  return values.includes(value);
}

/** Fills omitted query params with the documented defaults, yielding a fully-resolved market. */
export function resolveMarket(query: typeof GiveawaysQuerySchema.static): Market {
  let locale: string;
  try {
    [locale = DEFAULT_LOCALE] = Intl.getCanonicalLocales(query.locale ?? DEFAULT_LOCALE);
  } catch {
    throw new UnsupportedMarketError("locale");
  }
  const country = (query.country ?? DEFAULT_COUNTRY).toUpperCase();
  if (!isSupported(locale, SUPPORTED_LOCALES)) throw new UnsupportedMarketError("locale");
  if (!isSupported(country, SUPPORTED_COUNTRIES)) throw new UnsupportedMarketError("country");
  return {
    locale,
    country,
  };
}

const HTTP_URL_OPTIONS = {
  format: "uri",
  pattern: "^https?://",
} as const;

export const GiveawayImagesSchema = t.Object(
  {
    wide: t.Nullable(t.String({ ...HTTP_URL_OPTIONS, description: "Landscape/hero artwork URL" })),
    tall: t.Nullable(t.String({ ...HTTP_URL_OPTIONS, description: "Portrait/box artwork URL" })),
    thumbnail: t.Nullable(
      t.String({ ...HTTP_URL_OPTIONS, description: "Small preview artwork URL" }),
    ),
  },
  {
    description:
      "Store artwork by semantic slot; a slot is null when the store exposes no image for it",
  },
);

export const GiveawaySchema = t.Object({
  id: t.String({ description: "Store offer identifier" }),
  title: t.String(),
  description: t.String(),
  url: t.Nullable(t.String({ ...HTTP_URL_OPTIONS, description: "Store page URL" })),
  images: GiveawayImagesSchema,
  seller: t.String(),
  price: t.Nullable(
    t.Object(
      {
        original: t.Integer({
          description: "Original price in the smallest currency unit (cents)",
        }),
        formatted: t.String({ description: "Human-readable original price, e.g. €35.99" }),
        currency: t.String({ description: "ISO 4217 currency code" }),
      },
      { description: "Original price before the giveaway; null when the store exposes no price" },
    ),
  ),
  freeUntil: t.String({ description: "End of the giveaway window, ISO 8601" }),
});

/** Response envelope factory: each store keeps a precise `store` literal in its OpenAPI spec. */
export function createGiveawaysResponseSchema<const Store extends string>(store: Store) {
  return t.Object({
    store: t.Literal(store),
    count: t.Integer(),
    giveaways: t.Array(GiveawaySchema),
  });
}

export const EpicGamesGiveawaysResponseSchema = createGiveawaysResponseSchema("epic-games");
export const PrimeGamingGiveawaysResponseSchema = createGiveawaysResponseSchema("prime-gaming");
export const GogGiveawaysResponseSchema = createGiveawaysResponseSchema("gog");
export const SteamGiveawaysResponseSchema = createGiveawaysResponseSchema("steam");

/** Store ids the aggregate endpoint fans out to, in response order. */
export const STORE_IDS = ["epic-games", "prime-gaming", "gog", "steam"] as const;
export type StoreId = (typeof STORE_IDS)[number];

/** A giveaway tagged with its source store; only the aggregate endpoint adds the tag. */
export const StoreGiveawaySchema = t.Composite([
  GiveawaySchema,
  t.Object({ store: t.UnionEnum(STORE_IDS, { description: "Source store" }) }),
]);

export const AllGiveawaysResponseSchema = t.Object({
  count: t.Integer(),
  giveaways: t.Array(StoreGiveawaySchema),
  errors: t.Array(t.Object({ store: t.UnionEnum(STORE_IDS), error: t.String() }), {
    description:
      "Stores that could not be refreshed; their last successful snapshot is served when available",
  }),
});

export const ErrorResponseSchema = t.Object({
  error: t.String(),
});

export type Giveaway = typeof GiveawaySchema.static;
export type GiveawayImages = typeof GiveawayImagesSchema.static;
export type StoreGiveaway = typeof StoreGiveawaySchema.static;
export type AllGiveawaysResponse = typeof AllGiveawaysResponseSchema.static;
