import { defineConfig } from "drizzle-kit";

// drizzle-kit is a dev-only CLI (schema diffing + SQL generation) and is never imported by the runtime
// bundle. `schema` globs each feature's own `schema.ts`, so the shared database layer never aggregates
// feature tables. `generate` needs no live connection; `migrate`/`push`/`studio` read DATABASE_URL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/**/schema.ts",
  out: "./src/database/migrations",
  dbCredentials: { url: process.env["DATABASE_URL"] ?? "" },
});
