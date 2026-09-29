import type { Locale } from "$lib/paraglide/runtime";

export const LOCALE_MARKETS = {
  en: { locale: "en-US", country: "US" },
  fr: { locale: "fr-FR", country: "FR" },
} satisfies Record<Locale, { locale: string; country: string }>;
