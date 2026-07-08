import { buildApp, formatApiName } from "./app.ts";
import { logger } from "./utils/logger.ts";

const applicationPackageJson = await Bun.file("../../package.json").json();
const apiPackageJson = await Bun.file("package.json").json();

const app = buildApp({
  name: applicationPackageJson.name,
  version: applicationPackageJson.version,
  description: apiPackageJson.description,
}).listen(Number(process.env["PORT"] ?? 3000));

logger.info(
  `${formatApiName(applicationPackageJson.name)} listening on ${app.server?.hostname}:${app.server?.port}`,
);
