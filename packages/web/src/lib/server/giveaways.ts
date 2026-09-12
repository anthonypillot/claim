import { getApiUrl } from "$lib/config";
import { isGiveawaysResponse, type GiveawaysResponse } from "$lib/giveaways/model";
import { LOCALE_MARKETS } from "$lib/i18n/locale";
import type { Locale } from "$lib/paraglide/runtime";
import { error } from "@sveltejs/kit";

export const GIVEAWAYS_REQUEST_TIMEOUT_MS = 30_000;

export async function fetchGiveaways(
  fetch: typeof globalThis.fetch,
  locale: Locale,
  timeoutMs = GIVEAWAYS_REQUEST_TIMEOUT_MS,
): Promise<GiveawaysResponse> {
  let response: Response;
  try {
    const query = new URLSearchParams(LOCALE_MARKETS[locale]);
    response = await fetch(getApiUrl(`/giveaways?${query}`), {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "TimeoutError") {
      error(504, "The giveaway request timed out");
    }
    error(502, "Unable to fetch giveaways");
  }

  if (!response.ok) {
    error(502, "Unable to fetch giveaways");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    error(502, "The giveaway service returned invalid JSON");
  }

  if (!isGiveawaysResponse(body)) {
    error(502, "The giveaway service returned an invalid response");
  }

  return body;
}
