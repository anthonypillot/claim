// Environment access lives behind lazy, fail-fast functions (never top-level consts) so importing this
// module never throws — keeping `buildApp` and tests runnable without a database.

import { createLogger } from "./utils/logger.ts";

const log = createLogger("config");

/** The Postgres connection string; required wherever the database is actually used. */
export function requireDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    log.error("DATABASE_URL is not set");
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}
