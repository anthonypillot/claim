import { baseLocale, isLocale, overwriteGetLocale } from "$lib/paraglide/runtime";

// The server-selected document language also owns hydration. Browser preferences
// can differ from Accept-Language; a manual change loads a new document.
const locale = document.documentElement.lang;
overwriteGetLocale(() => (isLocale(locale) ? locale : baseLocale));
