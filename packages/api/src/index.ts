import { buildApp, formatApiName } from "./app.ts";
import { createLogger } from "./utils/logger.ts";

const log = createLogger("server");

const applicationPackageJson = await Bun.file("../../package.json").json();
const apiPackageJson = await Bun.file("package.json").json();

const port = Number(process.env["PORT"] ?? 3000);
log.debug({ port, nodeEnv: process.env["NODE_ENV"] }, "starting server");

const app = buildApp({
  name: applicationPackageJson.name,
  version: applicationPackageJson.version,
  description: apiPackageJson.description,
}).listen(port);

log.info(
  `${formatApiName(applicationPackageJson.name)} listening on ${app.server?.hostname}:${app.server?.port}`,
);
