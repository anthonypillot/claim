import { migrate } from "drizzle-orm/bun-sql/migrator";

import { getDb } from "./client.ts";

// Standalone migration runner (the `db:migrate` script). Uses drizzle-orm only — never drizzle-kit — so it
// is safe to run in production. `import.meta.dir` resolves the committed SQL relative to this source file,
// independent of the process cwd. Run this from source at deploy time (the SQL is not copied into the
// `bun build` bundle).
await migrate(getDb(), { migrationsFolder: `${import.meta.dir}/migrations` });
