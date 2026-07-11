// Environment access lives behind lazy, fail-fast functions (never top-level consts) so importing this
// module never throws — keeping `buildApp` and tests runnable without a database or refresh secret.

/** The Postgres connection string; required wherever the database is actually used. */
export function requireDatabaseUrl(): string {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

/** The shared secret guarding `POST /giveaways/refresh`; required only when that route is hit. */
export function requireRefreshToken(): string {
  const token = process.env["REFRESH_TOKEN"];
  if (!token) throw new Error("REFRESH_TOKEN is not set");
  return token;
}
