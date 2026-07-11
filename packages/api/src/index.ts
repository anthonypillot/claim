import { name, version } from "../../../package.json" with { type: "json" };
import { description } from "../package.json" with { type: "json" };

import { buildApp, formatApiName } from "./app.ts";
import { createLogger } from "./utils/logger.ts";

const log = createLogger("server");

const port = Number(process.env["PORT"] ?? 3000);
log.debug({ port, nodeEnv: process.env["NODE_ENV"] }, "starting server");

const app = buildApp({
  name,
  version,
  description,
}).listen(port);

log.info(`${formatApiName(name)} listening on ${app.server?.hostname}:${app.server?.port}`);
