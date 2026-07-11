import { afterEach, describe, expect, it } from "bun:test";

import { requireDatabaseUrl, requireRefreshToken } from "../config.ts";
import { getDb } from "./client.ts";

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("database configuration", () => {
  const originalDatabaseUrl = process.env["DATABASE_URL"];
  const originalRefreshToken = process.env["REFRESH_TOKEN"];

  afterEach(() => {
    restoreEnv("DATABASE_URL", originalDatabaseUrl);
    restoreEnv("REFRESH_TOKEN", originalRefreshToken);
  });

  it("getDb throws (rather than at import) when DATABASE_URL is unset", () => {
    delete process.env["DATABASE_URL"];
    // create() calls requireDatabaseUrl() before touching the driver, so it throws without caching a handle.
    expect(() => getDb()).toThrow("DATABASE_URL is not set");
  });

  it("requireDatabaseUrl returns the value when set", () => {
    process.env["DATABASE_URL"] = "postgres://user:pass@localhost:5432/db";
    expect(requireDatabaseUrl()).toBe("postgres://user:pass@localhost:5432/db");
  });

  it("requireRefreshToken throws when unset and returns the value when set", () => {
    delete process.env["REFRESH_TOKEN"];
    expect(() => requireRefreshToken()).toThrow("REFRESH_TOKEN is not set");

    process.env["REFRESH_TOKEN"] = "secret";
    expect(requireRefreshToken()).toBe("secret");
  });
});
