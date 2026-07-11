import { drizzle } from "drizzle-orm/bun-sql";

import { requireDatabaseUrl } from "../config.ts";
import { createLogger } from "../utils/logger.ts";

const log = createLogger("database");

// Shared Postgres connection for every feature. No `schema` option is passed: the repositories use core
// queries (`db.select().from(table)`, `db.insert(table)`, `db.$count`) that reference table objects
// directly, so the relational-query registry is unneeded — and omitting it keeps this shared client from
// importing any feature code. drizzle-kit discovers tables via the `./src/modules/**/schema.ts` glob instead.

function create() {
  log.info("initializing database client");
  return drizzle(requireDatabaseUrl());
}

export type Database = ReturnType<typeof create>;

let cached: Database | undefined;

/**
 * The process-wide database handle, created lazily on first use. Construction opens no socket (Bun's SQL
 * driver connects on first query) and is only ever called inside a request handler or the migrate runner —
 * never at import — so `buildApp` and tests run without `DATABASE_URL`.
 */
export function getDb(): Database {
  return (cached ??= create());
}
