import { UpstreamError } from "../shared.ts";
import type { PrimeFreeGamesResponse, PrimeItem } from "./types.ts";

// Prime Gaming has no public API. Its home page (served under the Luna domain since the two
// merged) hands out anonymous session cookies and embeds a CSRF token that together unlock the
// same GraphQL endpoint the web app uses — no Amazon account needed to list offers.
const PRIME_HOME_URL = "https://luna.amazon.com/claims/home";
const PRIME_GRAPHQL_URL = "https://luna.amazon.com/graphql";
const STORE = "prime-gaming";
// A browser-like User-Agent is required; default fetch UAs get blocked upstream.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
// The live markup uses single-quoted attributes with `name` before `value`.
const CSRF_INPUT_PATTERN = /<input[^>]*name=["']csrf-key["'][^>]*value=["']([^"']+)["']/;

// Trimmed variant of the web app's OffersContext_Offers_And_Items query: only the FREE_GAMES
// collection (full games — in-game loot lives in a separate collection) and only mapped fields.
const OFFERS_QUERY = `query OffersContext_Offers_And_Items($pageSize: Int) {
  games: items(collectionType: FREE_GAMES, pageSize: $pageSize) {
    items {
      id
      isFGWP
      category
      assets {
        title
        externalClaimLink
        shortformDescription
        cardMedia {
          defaultMedia {
            src1x
          }
        }
        heroMedia {
          defaultMedia {
            src1x
          }
        }
      }
      offers {
        startTime
        endTime
      }
      game {
        assets {
          title
          publisher
        }
      }
    }
  }
}`;

/** Anonymous session bootstrap: the GraphQL endpoint 403s without these cookies + CSRF token. */
async function fetchSession(): Promise<{ cookie: string; csrfToken: string }> {
  const response = await fetch(PRIME_HOME_URL, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new UpstreamError(STORE, `session bootstrap returned ${response.status}`);
  }
  const cookie = response.headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";")[0] ?? setCookie)
    .join("; ");
  const csrfToken = CSRF_INPUT_PATTERN.exec(await response.text())?.[1];
  if (!csrfToken) {
    throw new UpstreamError(STORE, "missing csrf token in session response");
  }
  return { cookie, csrfToken };
}

/**
 * Raw upstream access: returns every item Prime Gaming lists in its FREE_GAMES collection.
 * `locale` drives the response language via the `prime-gaming-language` header; `country` is
 * accepted for contract parity but unused — upstream infers the region itself.
 */
export async function fetchFreeGamesItems(options: {
  locale: string;
  country: string;
}): Promise<PrimeItem[]> {
  let body: PrimeFreeGamesResponse;
  try {
    const { cookie, csrfToken } = await fetchSession();
    const response = await fetch(PRIME_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": USER_AGENT,
        "csrf-token": csrfToken,
        "client-id": "CarboniteApp",
        "prime-gaming-language": options.locale,
        cookie,
      },
      body: JSON.stringify({
        operationName: "OffersContext_Offers_And_Items",
        variables: { pageSize: 999 },
        query: OFFERS_QUERY,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new UpstreamError(STORE, `upstream returned ${response.status}`);
    }
    body = (await response.json()) as PrimeFreeGamesResponse;
  } catch (cause) {
    if (cause instanceof UpstreamError) throw cause;
    throw new UpstreamError(STORE, "upstream request failed", { cause });
  }

  // GraphQL errors come back as 200s with no data; surface the first message so a broken
  // query (e.g. an unknown field) is diagnosable in logs instead of a generic shape error.
  if (body.errors?.length) {
    const message = body.errors[0]?.message ?? "unknown error";
    throw new UpstreamError(STORE, `upstream graphql error: ${message}`);
  }
  const items = body.data?.games?.items;
  if (!Array.isArray(items)) {
    throw new UpstreamError(STORE, "unexpected upstream response shape");
  }

  return items;
}
