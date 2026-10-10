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

export type DiscordConfiguration = {
  publicKey: string;
  applicationId: string;
  token: string;
  webUrl: string;
  monitoringIntervalMs: number;
  maxAlertAgeMs: number;
  membershipCheckIntervalMs: number;
};

function requiredValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when Discord is enabled`);
  return value;
}

function seconds(name: string, fallback: number, minimum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > 86400)
    throw new Error(`${name} must be an integer between ${minimum} and 86400`);
  return value * 1000;
}

export function getDiscordConfiguration(): DiscordConfiguration | null {
  if (process.env["DISCORD_ENABLED"] !== "true") return null;
  requireDatabaseUrl();
  if (
    process.env["NODE_ENV"] === "production" &&
    new URL(getPublicApiUrl()).protocol !== "https:"
  ) {
    throw new Error("PUBLIC_API_URL must use HTTPS for production Discord interactions");
  }
  const publicKey = requiredValue("DISCORD_PUBLIC_KEY");
  const applicationId = requiredValue("DISCORD_APPLICATION_ID");
  const token = requiredValue("DISCORD_BOT_TOKEN");
  if (!/^[a-f\d]{64}$/i.test(publicKey))
    throw new Error("DISCORD_PUBLIC_KEY must be a 32-byte hexadecimal key");
  if (!/^\d{1,20}$/.test(applicationId))
    throw new Error("DISCORD_APPLICATION_ID must be a Discord snowflake");
  if (/\s/.test(token)) throw new Error("DISCORD_BOT_TOKEN must not contain whitespace");
  const web = new URL(requiredValue("PUBLIC_WEB_URL"));
  if (
    !["http:", "https:"].includes(web.protocol) ||
    web.username ||
    web.password ||
    web.pathname !== "/" ||
    web.search ||
    web.hash ||
    (process.env["NODE_ENV"] === "production" && web.protocol !== "https:")
  )
    throw new Error("PUBLIC_WEB_URL must be an HTTP(S) origin (HTTPS in production)");
  return {
    publicKey,
    applicationId,
    token,
    webUrl: web.origin,
    monitoringIntervalMs: seconds("DISCORD_MONITOR_INTERVAL_SECONDS", 3600, 60),
    maxAlertAgeMs: seconds("DISCORD_ALERT_MAX_AGE_SECONDS", 86400, 60),
    membershipCheckIntervalMs: seconds("DISCORD_MEMBERSHIP_CHECK_SECONDS", 86400, 3600),
  };
}
