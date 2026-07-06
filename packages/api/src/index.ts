import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";

import { giveaways } from "./modules/giveaways/index.ts";
import { logger } from "./utils/logger.ts";

const applicationPackageJson = await Bun.file("../../package.json").json();
const name = applicationPackageJson.name.charAt(0).toUpperCase() + applicationPackageJson.name.slice(1) + " API";

const apiPackageJson = await Bun.file("package.json").json();

const app = new Elysia()
  .use(cors())
  .use(
    openapi({
      documentation: {
        info: {
          title: name,
          version: applicationPackageJson.version,
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
    name,
    version: applicationPackageJson.version,
    description: apiPackageJson.description,
  }))
  .use(giveaways)
  .listen(Number(process.env["PORT"] ?? 3000));

logger.info(`${name} listening on ${app.server?.hostname}:${app.server?.port}`);
