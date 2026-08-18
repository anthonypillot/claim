import { name, version as rootVersion } from "../../../package.json" with { type: "json" };
import { description, version as packageVersion } from "../package.json" with { type: "json" };
import { Elysia } from "elysia";

import { buildApp, formatApiName } from "./app.ts";
import { getPublicApiUrl } from "./config.ts";
import { startTelemetry } from "./telemetry.ts";
import { createLogger } from "./utils/logger.ts";

const log = createLogger("server");

const port = Number(process.env["PORT"] ?? 3000);
const version = process.env["APP_VERSION"] || packageVersion || rootVersion;
log.debug({ port, nodeEnv: process.env["NODE_ENV"] }, "starting server");

const server = new Elysia();
const telemetryEndpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"]?.trim();
const telemetry = telemetryEndpoint ? startTelemetry(version) : undefined;
if (telemetry) server.use(telemetry.plugin);

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

let shutdownPromise: Promise<void> | undefined;
function shutdown(signal: string): Promise<void> {
  shutdownPromise ??= (async () => {
    log.info({ signal }, "stopping server");
    await app.stop();
    await telemetry?.shutdown();
  })();
  return shutdownPromise;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).catch((error: Error) => {
      log.error({ err: error }, "server shutdown failed");
      process.exitCode = 1;
    });
  });
}
