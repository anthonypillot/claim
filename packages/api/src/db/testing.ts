import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "./client.ts";

// Test-only helper: an in-memory Postgres (PGlite/WASM) with the real migrations applied, so repository SQL
// (composite-PK upserts, the price CHECK, `now()`) runs for real without an external database. Imported only
// by `*.test.ts`, so PGlite never reaches the production bundle.
export async function createTestDatabase(): Promise<Database> {
  const db = drizzle({ client: new PGlite() });
  await migrate(db, { migrationsFolder: `${import.meta.dir}/../../drizzle` });
  // The PGlite and Bun-SQL handles expose the same PgDatabase query surface; bridge the driver-specific types.
  return db as unknown as Database;
}
