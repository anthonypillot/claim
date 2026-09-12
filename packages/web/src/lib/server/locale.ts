import { isLocale, type Locale } from "$lib/paraglide/runtime";

// Paraglide's built-in preferredLanguage currently includes q=0 entries.
// Accept only valid, positively weighted preferences before matching a language.
export function getPreferredLocale(header: string | null): Locale | undefined {
  const preferences = (header ?? "").split(",").flatMap((preference) => {
    const match =
      /^([a-z]{2,8}(?:-[a-z0-9]{1,8})*)(?:\s*;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?$/i.exec(
        preference.trim(),
      );
    const locale = match?.[1]?.split("-")[0]?.toLowerCase();
    const quality = Number(match?.[2] ?? 1);
    return isLocale(locale) && quality > 0 ? [{ locale, quality }] : [];
  });

  return preferences.toSorted((left, right) => right.quality - left.quality)[0]?.locale;
}
