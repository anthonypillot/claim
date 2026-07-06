// Environment access lives behind lazy, fail-fast functions (never top-level consts) so importing this
// module never throws — keeping `buildApp` and tests runnable without a database.

import { createLogger } from "./utils/logger.ts";

const log = createLogger("config");

/** Public API origin used by generated API documentation. */
export function getPublicApiUrl(): string {
  const name = "PUBLIC_API_URL";
  const value =
    process.env[name] ||
    (process.env["NODE_ENV"] === "production" ? undefined : "http://localhost:3000");

  if (!value) {
    log.error(`${name} is not set`);
    throw new Error(`${name} is not set`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    log.error(`${name} must be a valid HTTP(S) origin`);
    throw new Error(`${name} must be a valid HTTP(S) origin`);
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    log.error(`${name} must be a valid HTTP(S) origin`);
    throw new Error(`${name} must be a valid HTTP(S) origin`);
  }

  return url.origin;
}

/** The Postgres connection string; required wherever the database is actually used. */
export function requireDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    log.error("DATABASE_URL is not set");
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}
