import { name, version } from "../../../package.json" with { type: "json" };
import { opentelemetry } from "@elysia/opentelemetry";
import { description } from "../package.json" with { type: "json" };
import { Elysia } from "elysia";

import { buildApp, formatApiName } from "./app.ts";
import { getPublicApiUrl } from "./config.ts";
import { createLogger } from "./utils/logger.ts";

const log = createLogger("server");
const probePaths = new Set(["/health", "/ready"]);

const port = Number(process.env["PORT"] ?? 3000);
log.debug({ port, nodeEnv: process.env["NODE_ENV"] }, "starting server");

const server = new Elysia();
if (process.env["OTEL_EXPORTER_OTLP_ENDPOINT"]?.trim()) {
  server.use(
    opentelemetry({
      serviceName: "claim-api",
      checkIfShouldTrace: (request) => !probePaths.has(new URL(request.url).pathname),
    }),
  );
}

const app = server
  .use(
    buildApp(
      {
        name,
        version,
        description,
      },
      { apiUrl: getPublicApiUrl() },
    ),
  )
  .listen(port);

log.info(`${formatApiName(name)} listening on ${app.server?.hostname}:${app.server?.port}`);
