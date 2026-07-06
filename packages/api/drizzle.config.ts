import { defineConfig } from "drizzle-kit";

// drizzle-kit is a dev-only CLI (schema diffing + SQL generation) and is never imported by the runtime
// bundle. `schema` and `out` follow Drizzle's default layout: the tables live in `src/db/schema.ts` and
// migrations are generated into `./drizzle`. `generate` needs no live connection; `migrate`/`push`/`studio`
// read DATABASE_URL.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env["DATABASE_URL"] ?? "" },
});
