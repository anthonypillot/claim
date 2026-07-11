import { afterEach, describe, expect, it } from "bun:test";

import { requireDatabaseUrl } from "../config.ts";
import { getDb } from "./client.ts";

describe("database configuration", () => {
  const originalDatabaseUrl = process.env["DATABASE_URL"];

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = originalDatabaseUrl;
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
});
