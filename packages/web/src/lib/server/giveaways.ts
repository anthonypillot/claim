import { getApiUrl } from "$lib/config";
import { isGiveawaysResponse, type GiveawaysResponse } from "$lib/giveaways/model";
import { logger, type ServerLogger } from "$lib/server/logger";
import { error } from "@sveltejs/kit";

export const GIVEAWAYS_REQUEST_TIMEOUT_MS = 30_000;
type GiveawaysLogger = Pick<ServerLogger, "warn">;

export async function fetchGiveaways(
  fetch: typeof globalThis.fetch,
  timeoutMs = GIVEAWAYS_REQUEST_TIMEOUT_MS,
  requestLogger: GiveawaysLogger = logger,
): Promise<GiveawaysResponse> {
  let response: Response;
  try {
    response = await fetch(getApiUrl("/giveaways"), {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "TimeoutError") {
      requestLogger.warn(
        { upstream: "claim-api", timeout_ms: timeoutMs },
        "giveaway request timed out",
      );
      error(504, "The giveaway request timed out");
    }
    requestLogger.warn(
      {
        upstream: "claim-api",
        error_type: cause instanceof Error ? cause.name : "NonErrorException",
      },
      "giveaway request failed",
    );
    error(502, "Unable to fetch giveaways");
  }

  if (!response.ok) {
    requestLogger.warn(
      { upstream: "claim-api", status: response.status },
      "giveaway request returned an unsuccessful response",
    );
    error(502, "Unable to fetch giveaways");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    requestLogger.warn(
      { upstream: "claim-api", status: response.status },
      "giveaway response contained invalid JSON",
    );
    error(502, "The giveaway service returned invalid JSON");
  }

  if (!isGiveawaysResponse(body)) {
    requestLogger.warn(
      { upstream: "claim-api", status: response.status },
      "giveaway response failed validation",
    );
    error(502, "The giveaway service returned an invalid response");
  }

  return body;
}
