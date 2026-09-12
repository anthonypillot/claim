import type { CompilerOptions } from "@inlang/paraglide-js";

export default {
  project: "./i18n/project.inlang",
  outdir: "./src/lib/paraglide",
  strategy: ["cookie", "preferredLanguage", "baseLocale"],
  cookieName: "claim_locale",
  cookieMaxAge: 60 * 60 * 24 * 365,
  emitTsDeclarations: true,
} satisfies CompilerOptions;
