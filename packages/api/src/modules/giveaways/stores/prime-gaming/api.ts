import { createLogger } from "../../../../utils/logger.ts";
import { isRecord, UpstreamError } from "../shared.ts";
import type { PrimeItem } from "./types.ts";

const log = createLogger("prime gaming store");

// Prime Gaming has no public API. Its home page (served under the Luna domain since the two
// merged) hands out anonymous session cookies and embeds a CSRF token that together unlock the
// same GraphQL endpoint the web app uses — no Amazon account needed to list offers.
const PRIME_HOME_URL = "https://luna.amazon.com/claims/home";
const PRIME_GRAPHQL_URL = "https://luna.amazon.com/graphql";
const STORE = "prime-gaming";
// A browser-like User-Agent is required; default fetch UAs get blocked upstream.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const INPUT_PATTERN = /<input\b[^>]*>/gi;
const CSRF_NAME_PATTERN = /\bname\s*=\s*["']csrf-key["']/i;
const VALUE_PATTERN = /\bvalue\s*=\s*["']([^"']+)["']/i;

function extractCsrfToken(html: string): string | undefined {
  for (const [input] of html.matchAll(INPUT_PATTERN)) {
    if (CSRF_NAME_PATTERN.test(input)) return VALUE_PATTERN.exec(input)?.[1];
  }
  return undefined;
}

function isMedia(value: unknown): boolean {
  if (value == null) return true;
  if (!isRecord(value)) return false;
  const media = value["defaultMedia"];
  return (
    media == null ||
    (isRecord(media) && (media["src1x"] === undefined || typeof media["src1x"] === "string"))
  );
}

function isPrimeItem(value: unknown): value is PrimeItem {
  if (!isRecord(value) || typeof value["id"] !== "string") return false;
  if (value["isFGWP"] !== undefined && typeof value["isFGWP"] !== "boolean") return false;
  if (value["category"] !== undefined && typeof value["category"] !== "string") return false;
  const assets = value["assets"];
  if (assets !== undefined) {
    if (!isRecord(assets)) return false;
    if (assets["title"] !== undefined && typeof assets["title"] !== "string") return false;
    if (assets["externalClaimLink"] != null && typeof assets["externalClaimLink"] !== "string") {
      return false;
    }
    if (
      assets["shortformDescription"] != null &&
      typeof assets["shortformDescription"] !== "string"
    ) {
      return false;
    }
    if (!isMedia(assets["cardMedia"]) || !isMedia(assets["heroMedia"])) return false;
  }
  const game = value["game"];
  if (game != null) {
    if (!isRecord(game)) return false;
    const gameAssets = game["assets"];
    if (gameAssets != null) {
      if (!isRecord(gameAssets)) return false;
      if (gameAssets["title"] !== undefined && typeof gameAssets["title"] !== "string") {
        return false;
      }
      if (gameAssets["publisher"] != null && typeof gameAssets["publisher"] !== "string") {
        return false;
      }
    }
  }
  const offers = value["offers"];
  return (
    offers == null ||
    (Array.isArray(offers) &&
      offers.every(
        (offer) =>
          isRecord(offer) &&
          (offer["startTime"] == null || typeof offer["startTime"] === "string") &&
          (offer["endTime"] == null || typeof offer["endTime"] === "string"),
      ))
  );
}

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
  const csrfToken = extractCsrfToken(await response.text());
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
  log.debug({ locale: options.locale, country: options.country }, "fetching free games");
  let body: unknown;
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
    body = await response.json();
  } catch (cause) {
    if (cause instanceof UpstreamError) throw cause;
    throw new UpstreamError(STORE, "upstream request failed", { cause });
  }

  // GraphQL errors come back as 200s with no data; surface the first message so a broken
  // query (e.g. an unknown field) is diagnosable in logs instead of a generic shape error.
  const errors = isRecord(body) ? body["errors"] : undefined;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    const message =
      isRecord(first) && typeof first["message"] === "string" ? first["message"] : "unknown error";
    throw new UpstreamError(STORE, `upstream graphql error: ${message}`);
  }
  const data = isRecord(body) ? body["data"] : undefined;
  const games = isRecord(data) ? data["games"] : undefined;
  const items = isRecord(games) ? games["items"] : undefined;
  if (!Array.isArray(items) || !items.every(isPrimeItem)) {
    throw new UpstreamError(STORE, "unexpected upstream response shape");
  }

  log.debug({ count: items.length }, "received items");
  return items;
}
