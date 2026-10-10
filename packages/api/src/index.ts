import { name, version } from "../../../package.json" with { type: "json" };
import { opentelemetry } from "@elysia/opentelemetry";
import { description } from "../package.json" with { type: "json" };
import { Elysia } from "elysia";

import { buildApp, formatApiName } from "./app.ts";
import { getDiscordConfiguration, getPublicApiUrl } from "./config.ts";
import { createDiscordRuntime } from "./modules/notifications/runtime.ts";
import { closeDb } from "./db/client.ts";
import { createLogger } from "./utils/logger.ts";

const log = createLogger("server");
const probePaths = new Set(["/health", "/ready"]);

const port = Number(process.env["PORT"] ?? 3000);
log.debug({ port, nodeEnv: process.env["NODE_ENV"] }, "starting server");

const server = new Elysia();
const discordConfiguration = getDiscordConfiguration();
const discord = discordConfiguration ? createDiscordRuntime(discordConfiguration) : null;
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
      {
        apiUrl: getPublicApiUrl(),
        ...(discord ? { discord: discord.interactions, giveawayReads: discord.reads } : {}),
      },
    ),
  )
  .listen(port);

log.info(`${formatApiName(name)} listening on ${app.server?.hostname}:${app.server?.port}`);
discord?.start();

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  // Abort background HTTP immediately, then close the listener and drain started work.
  async function stopListener(): Promise<void> {
    await app.stop();
  }
  if (discord) await discord.stop(stopListener);
  else await stopListener();
  await closeDb();
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
