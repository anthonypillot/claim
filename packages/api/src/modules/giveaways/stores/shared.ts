import type { Giveaway } from "../model.ts";

/** Contract every store implements: currently-free base games, normalized. */
export type FetchFreeGames = (options: { locale: string; country: string }) => Promise<Giveaway[]>;

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
