import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";

import { createGiveaways } from "./modules/giveaways/index.ts";
import { logger } from "./utils/logger.ts";

export type AppMetadata = {
  name: string;
  version: string;
  description: string;
};

// Capitalize the raw package name and suffix it, e.g. "claim" -> "Claim API".
export function formatApiName(rawName: string): string {
  return rawName.charAt(0).toUpperCase() + rawName.slice(1) + " API";
}

// Compose the Elysia application without binding a port, so it can be exercised via
// `buildApp(...).handle(new Request(...))` in tests. The server bootstrap (`.listen()`)
// lives in `index.ts`.
export function buildApp(metadata: AppMetadata) {
  const displayName = formatApiName(metadata.name);

  return new Elysia()
    .use(cors())
    .use(
      openapi({
        documentation: {
          info: {
            title: displayName,
            version: metadata.version,
            description: "Read-only JSON API aggregating free game giveaways across storefronts.",
          },
          tags: [{ name: "giveaways", description: "Currently-free games, per store" }],
        },
      }),
    )
    .onAfterResponse(({ request, set }) => {
      logger.info(
        { method: request.method, path: new URL(request.url).pathname, status: set.status },
        "request completed",
      );
    })
    .get("/", () => ({
      name: displayName,
      version: metadata.version,
      description: metadata.description,
    }))
    .use(createGiveaways());
}
