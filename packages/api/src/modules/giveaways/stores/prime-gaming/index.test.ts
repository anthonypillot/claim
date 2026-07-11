import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import { UpstreamError } from "../shared.ts";
import { primeFreeGamesFixture, primeHomeHtmlFixture } from "./fixtures.ts";
import { fetchFreeGames } from "./index.ts";

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

function homeResponse(html: string = primeHomeHtmlFixture): Response {
  const headers = new Headers({ "content-type": "text/html" });
  headers.append("set-cookie", "session-id=test-session; Domain=.amazon.com; Path=/; Secure");
  headers.append("set-cookie", "session-id-time=123; Domain=.amazon.com; Path=/; Secure");
  return new Response(html, { headers });
}

function graphqlResponse(body: unknown = primeFreeGamesFixture): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

/** The store fetches twice (session bootstrap, then GraphQL) — dispatch the stub on the URL. */
function stubFetch(overrides: { home?: () => Response; graphql?: () => Response } = {}) {
  // Cast: the stub doesn't carry fetch's static `preconnect` property.
  fetchSpy.mockImplementation((async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/graphql")) return (overrides.graphql ?? graphqlResponse)();
    return (overrides.home ?? homeResponse)();
  }) as typeof fetch);
}

beforeEach(() => {
  fetchSpy = spyOn(globalThis, "fetch");
  stubFetch();
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe("fetchFreeGames", () => {
  it("returns only the currently-free full game, fully mapped", async () => {
    const giveaways = await fetchFreeGames({ locale: "en-US", country: "US" });

    expect(giveaways).toEqual([
      {
        id: "item-active-full-game",
        title: "Actually Free Full Game",
        description: "A free full game.",
        url: "https://gaming.amazon.com/actually-free/dp/item-active-full-game",
        images: {
          wide: "https://cdn.example.com/hero.jpg",
          tall: null,
          thumbnail: "https://cdn.example.com/card.jpg",
        },
        seller: "WayForward",
        price: null,
        freeUntil: "2099-12-31T00:00:00Z",
      },
    ]);
  });

  it("bootstraps a session and forwards it to the GraphQL request", async () => {
    await fetchFreeGames({ locale: "fr-FR", country: "FR" });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe("https://luna.amazon.com/claims/home");
    expect(String(fetchSpy.mock.calls[1]?.[0])).toBe("https://luna.amazon.com/graphql");

    const init = fetchSpy.mock.calls[1]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("csrf-token")).toBe("test-csrf-token");
    expect(headers.get("cookie")).toBe("session-id=test-session; session-id-time=123");
    expect(headers.get("prime-gaming-language")).toBe("fr-FR");
    expect(JSON.parse(String(init?.body)).operationName).toBe("OffersContext_Offers_And_Items");
  });

  it("throws UpstreamError when the request fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  it("throws UpstreamError on a non-2xx session bootstrap response", async () => {
    stubFetch({ home: () => new Response("oops", { status: 503 }) });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "session bootstrap returned 503",
    );
  });

  it("throws UpstreamError on a non-2xx GraphQL response", async () => {
    stubFetch({ graphql: () => new Response("oops", { status: 503 }) });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "upstream returned 503",
    );
  });

  it("throws UpstreamError when the session page has no csrf token", async () => {
    stubFetch({ home: () => homeResponse("<html><body>no token here</body></html>") });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "missing csrf token in session response",
    );
  });

  it("throws UpstreamError on a non-JSON GraphQL body", async () => {
    stubFetch({ graphql: () => new Response("<html></html>") });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toBeInstanceOf(
      UpstreamError,
    );
  });

  it("throws UpstreamError when items are missing", async () => {
    stubFetch({ graphql: () => graphqlResponse({ data: {} }) });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "unexpected upstream response shape",
    );
  });

  it("throws UpstreamError when an item element is malformed", async () => {
    stubFetch({ graphql: () => graphqlResponse({ data: { games: { items: [null] } } }) });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "unexpected upstream response shape",
    );
  });

  it("throws UpstreamError when a mapped nested field is malformed", async () => {
    stubFetch({
      graphql: () =>
        graphqlResponse({ data: { games: { items: [{ id: "bad", assets: { title: 123 } }] } } }),
    });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "unexpected upstream response shape",
    );
  });

  it("extracts the csrf token regardless of attribute order", async () => {
    stubFetch({
      home: () => homeResponse('<input value="reversed-token" data-extra="x" name="csrf-key">'),
    });

    await fetchFreeGames({ locale: "en-US", country: "US" });

    const headers = new Headers(fetchSpy.mock.calls[1]?.[1]?.headers);
    expect(headers.get("csrf-token")).toBe("reversed-token");
  });

  it("throws UpstreamError surfacing the graphql error message", async () => {
    stubFetch({
      graphql: () =>
        graphqlResponse({
          errors: [{ message: "Field 'heroMedia' doesn't exist on type 'Assets'" }],
        }),
    });

    await expect(fetchFreeGames({ locale: "en-US", country: "US" })).rejects.toThrow(
      "upstream graphql error: Field 'heroMedia' doesn't exist on type 'Assets'",
    );
  });

  it("falls back to the card image for the wide slot when hero media is absent", async () => {
    const body = structuredClone(primeFreeGamesFixture);
    delete body.data!.games!.items![0]!.assets!.heroMedia;
    stubFetch({ graphql: () => graphqlResponse(body) });

    const [game] = await fetchFreeGames({ locale: "en-US", country: "US" });

    expect(game?.images).toEqual({
      wide: "https://cdn.example.com/card.jpg",
      tall: null,
      thumbnail: "https://cdn.example.com/card.jpg",
    });
  });
});
