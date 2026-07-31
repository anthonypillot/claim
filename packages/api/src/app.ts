import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia, t } from "elysia";

import faviconSvg from "../../web/static/favicon.svg" with { type: "text" };
import { createGiveaways } from "./modules/giveaways/index.ts";
import { type CheckReadiness, createHealth } from "./modules/health/index.ts";
import { createLogger } from "./utils/logger.ts";

const log = createLogger("http");
const favicon = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;

const ApiMetadataResponseSchema = t.Object({
  name: t.String(),
  version: t.String(),
  description: t.String(),
});

export type AppMetadata = {
  name: string;
  version: string;
  description: string;
};

export type AppDependencies = {
  checkReadiness?: CheckReadiness;
  apiUrl?: string;
};

// Capitalize the raw package name and suffix it, e.g. "claim" -> "Claim API".
export function formatApiName(rawName: string): string {
  return rawName.charAt(0).toUpperCase() + rawName.slice(1) + " API";
}

// Compose the Elysia application without binding a port, so it can be exercised via
// `buildApp(...).handle(new Request(...))` in tests. The server bootstrap (`.listen()`)
// lives in `index.ts`.
export function buildApp(metadata: AppMetadata, dependencies: AppDependencies = {}) {
  const displayName = formatApiName(metadata.name);

  return new Elysia()
    .use(cors())
    .use(
      openapi({
        scalar: {
          favicon,
          metaData: {
            title: "API | Claim",
          },
        },
        documentation: {
          openapi: "3.1.0",
          ...(dependencies.apiUrl ? { servers: [{ url: dependencies.apiUrl }] } : {}),
          info: {
            title: displayName,
            version: metadata.version,
            description: "Read-only JSON API aggregating free game giveaways across storefronts.",
          },
          tags: [
            { name: "health", description: "Application liveness and readiness" },
            { name: "giveaways", description: "Currently-free games, per store" },
          ],
        },
      }),
    )
    .onAfterResponse(({ request, set }) => {
      log.info(
        { method: request.method, path: new URL(request.url).pathname, status: set.status },
        "request completed",
      );
    })
    .get(
      "/",
      () => ({
        name: displayName,
        version: metadata.version,
        description: metadata.description,
      }),
      { response: { 200: ApiMetadataResponseSchema } },
    )
    .use(createHealth(dependencies.checkReadiness))
    .use(createGiveaways());
}
