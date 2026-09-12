import type { Handle } from "@sveltejs/kit";
import { describe, expect, test } from "vitest";
import { m } from "$lib/paraglide/messages";
import { getLocale } from "$lib/paraglide/runtime";
import { handle, handleFetch } from "./hooks.server";

async function renderDocument(headers: HeadersInit = {}): Promise<Response> {
  const request = new Request("http://localhost/", { headers });
  const event = { request, isDataRequest: false } as Parameters<Handle>[0]["event"];

  return handle({
    event,
    resolve: async (_event, options) => {
      // Interleave renders to exercise the request-scoped locale across awaits.
      await new Promise((resolve) => setTimeout(resolve, 5));
      const html = `<html lang="%lang%"><title>${m.page_title()}</title>${getLocale()}</html>`;
      const transformed = await options?.transformPageChunk?.({ html, done: true });
      return new Response(transformed ?? html, {
        headers: { "Content-Type": "text/html", Vary: "Accept-Encoding" },
      });
    },
  });
}

describe("localized server rendering", () => {
  test.each([
    { language: "fr-FR,fr;q=0.9,en;q=0.8", locale: "fr", title: "Jeux offerts | Claim" },
    { language: "fr-CA", locale: "fr", title: "Jeux offerts | Claim" },
    { language: "FR-fr; q=0.8, en; q=0.2", locale: "fr", title: "Jeux offerts | Claim" },
    { language: "fr;q=0.5,en-GB;q=0.9", locale: "en", title: "Giveaways | Claim" },
    { language: "de-DE", locale: "en", title: "Giveaways | Claim" },
    { language: "de;q=1,fr;q=0", locale: "en", title: "Giveaways | Claim" },
    { language: "fr;q=invalid,en", locale: "en", title: "Giveaways | Claim" },
    { language: "fr;q=2,en", locale: "en", title: "Giveaways | Claim" },
    { language: "", locale: "en", title: "Giveaways | Claim" },
  ])("renders $language as $locale on the first request", async ({ language, locale, title }) => {
    const response = await renderDocument({ "Accept-Language": language });
    const html = await response.text();

    expect(html).toContain(`<html lang="${locale}">`);
    expect(html).toContain(`<title>${title}</title>`);
    expect(response.headers.get("Content-Language")).toBe(locale);
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(response.headers.get("Vary")).toBe("Accept-Encoding, Cookie, Accept-Language");
  });

  test("a saved choice overrides browser preferences", async () => {
    const response = await renderDocument({ Cookie: "claim_locale=en", "Accept-Language": "fr" });
    expect(await response.text()).toContain("Giveaways | Claim");
  });

  test("ignores an unsupported cookie and uses browser preferences", async () => {
    const response = await renderDocument({ Cookie: "claim_locale=de", "Accept-Language": "fr" });
    expect(await response.text()).toContain("Jeux offerts | Claim");
  });

  test("isolates English and French requests rendered concurrently", async () => {
    const [english, french] = await Promise.all([
      renderDocument({ Cookie: "claim_locale=en" }),
      renderDocument({ Cookie: "claim_locale=fr" }),
    ]);
    expect(await english.text()).toContain("Giveaways | Claim</title>en</html>");
    expect(await french.text()).toContain("Jeux offerts | Claim</title>fr</html>");
  });

  test("keeps non-HTML health responses independent of the locale", async () => {
    const event = {
      request: new Request("http://localhost/health", { headers: { "Accept-Language": "fr" } }),
      isDataRequest: false,
    } as Parameters<Handle>[0]["event"];
    const response = await handle({ event, resolve: async () => Response.json({ status: "ok" }) });
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.has("Content-Language")).toBe(false);
  });
});

test("the development API rewrite preserves the requested market", async () => {
  const request = new Request("http://localhost:5173/api/giveaways?locale=fr-FR&country=FR");
  const fetch = async (input: RequestInfo | URL) => {
    expect(input).toBeInstanceOf(Request);
    expect((input as Request).url).toBe("http://localhost:3000/giveaways?locale=fr-FR&country=FR");
    return new Response();
  };
  await handleFetch({ request, fetch } as Parameters<typeof handleFetch>[0]);
});
