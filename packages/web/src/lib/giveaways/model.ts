import { LOCALE_MARKETS } from "$lib/i18n/locale";
import { m } from "$lib/paraglide/messages";
import { baseLocale, type Locale } from "$lib/paraglide/runtime";

export const STORE_IDS = ["epic-games", "prime-gaming", "gog", "steam"] as const;

export type StoreId = (typeof STORE_IDS)[number];

export type GiveawayImages = {
  wide: string | null;
  tall: string | null;
  thumbnail: string | null;
};

export type Giveaway = {
  id: string;
  title: string;
  description: string;
  url: string | null;
  images: GiveawayImages;
  seller: string;
  price: {
    original: number;
    formatted: string;
    currency: string;
  } | null;
  freeUntil: string;
  store: StoreId;
};

export type GiveawaysResponse = {
  count: number;
  giveaways: Giveaway[];
  errors: Array<{ store: StoreId; error: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoreId(value: unknown): value is StoreId {
  return typeof value === "string" && STORE_IDS.some((store) => store === value);
}

function isNullableHttpUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isGiveawayImages(value: unknown): value is GiveawayImages {
  return (
    isRecord(value) &&
    isNullableHttpUrl(value["wide"]) &&
    isNullableHttpUrl(value["tall"]) &&
    isNullableHttpUrl(value["thumbnail"])
  );
}

function isGiveaway(value: unknown): value is Giveaway {
  if (!isRecord(value)) return false;

  const price = value["price"];
  const hasValidPrice =
    price === null ||
    (isRecord(price) &&
      Number.isInteger(price["original"]) &&
      typeof price["formatted"] === "string" &&
      typeof price["currency"] === "string");

  return (
    typeof value["id"] === "string" &&
    typeof value["title"] === "string" &&
    typeof value["description"] === "string" &&
    isNullableHttpUrl(value["url"]) &&
    isGiveawayImages(value["images"]) &&
    typeof value["seller"] === "string" &&
    hasValidPrice &&
    typeof value["freeUntil"] === "string" &&
    isStoreId(value["store"])
  );
}

export function isGiveawaysResponse(value: unknown): value is GiveawaysResponse {
  return (
    isRecord(value) &&
    Number.isInteger(value["count"]) &&
    Array.isArray(value["giveaways"]) &&
    value["giveaways"].every(isGiveaway) &&
    Array.isArray(value["errors"]) &&
    value["errors"].every(
      (item) => isRecord(item) && isStoreId(item["store"]) && typeof item["error"] === "string",
    )
  );
}

const STORE_LABELS = {
  "epic-games": "Epic Games",
  "prime-gaming": "Prime Gaming",
  gog: "GOG",
  steam: "Steam",
} satisfies Record<StoreId, string>;

const MINUTE_IN_MS = 60_000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;

export function getGiveawayImage(images: GiveawayImages): string | null {
  return images.wide ?? images.thumbnail ?? images.tall;
}

export function formatStore(store: StoreId): string {
  return STORE_LABELS[store];
}

export function formatExpiry(value: string, locale: Locale = baseLocale): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const region = LOCALE_MARKETS[locale].locale;
  return m.expiry_datetime(
    {
      date: new Intl.DateTimeFormat(region, { dateStyle: "medium", timeZone: "UTC" }).format(date),
      time: new Intl.DateTimeFormat(region, { timeStyle: "short", timeZone: "UTC" }).format(date),
    },
    { locale },
  );
}

export function formatTimeLeft(value: string, now: number, locale: Locale = baseLocale): string {
  const expiry = Date.parse(value);
  if (Number.isNaN(expiry)) return m.time_unknown({}, { locale });

  const remaining = expiry - now;
  if (remaining <= 0) return m.time_ended({}, { locale });

  if (remaining < HOUR_IN_MS)
    return m.time_minutes({ count: Math.ceil(remaining / MINUTE_IN_MS) }, { locale });
  if (remaining < DAY_IN_MS)
    return m.time_hours({ count: Math.ceil(remaining / HOUR_IN_MS) }, { locale });
  return m.time_days({ count: Math.ceil(remaining / DAY_IN_MS) }, { locale });
}

export function formatPrice(price: NonNullable<Giveaway["price"]>, locale: Locale): string {
  try {
    const formatter = new Intl.NumberFormat(LOCALE_MARKETS[locale].locale, {
      style: "currency",
      currency: price.currency,
    });
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(price.original / 10 ** fractionDigits);
  } catch {
    return price.formatted;
  }
}
