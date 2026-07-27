import type { Giveaway } from "../model.ts";

/** Contract every store implements: currently-free base games, normalized. */
export type FetchFreeGames = (options: { locale: string; country: string }) => Promise<Giveaway[]>;

export const MAX_UPSTREAM_RESPONSE_BYTES = 5 * 1024 * 1024;

export function normalizeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class UpstreamError extends Error {
  constructor(
    readonly store: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "UpstreamError";
  }
}

export async function readUpstreamText(
  response: Response,
  store: string,
  maxBytes = MAX_UPSTREAM_RESPONSE_BYTES,
): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && /^\d+$/.test(declaredLength)) {
    const bytes = Number(declaredLength);
    if (bytes > maxBytes) {
      await response.body?.cancel();
      throw new UpstreamError(store, "upstream response too large");
    }
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new UpstreamError(store, "upstream response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function readUpstreamJson(
  response: Response,
  store: string,
  maxBytes = MAX_UPSTREAM_RESPONSE_BYTES,
): Promise<unknown> {
  return JSON.parse(await readUpstreamText(response, store, maxBytes));
}
