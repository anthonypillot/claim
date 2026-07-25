import { afterEach, describe, expect, it } from "bun:test";

import { getPublicApiUrl } from "./config.ts";

describe("public URL configuration", () => {
  const originalNodeEnv = process.env["NODE_ENV"];
  const originalApiUrl = process.env["PUBLIC_API_URL"];

  afterEach(() => {
    restoreEnvironmentVariable("NODE_ENV", originalNodeEnv);
    restoreEnvironmentVariable("PUBLIC_API_URL", originalApiUrl);
  });

  it("uses localhost origins outside production", () => {
    process.env["NODE_ENV"] = "development";
    delete process.env["PUBLIC_API_URL"];

    expect(getPublicApiUrl()).toBe("http://localhost:3000");
  });

  it("normalizes configured origins", () => {
    process.env["PUBLIC_API_URL"] = "https://api.claim.anthonypillot.com/";

    expect(getPublicApiUrl()).toBe("https://api.claim.anthonypillot.com");
  });

  it("requires the API origin in production", () => {
    process.env["NODE_ENV"] = "production";
    delete process.env["PUBLIC_API_URL"];

    expect(() => getPublicApiUrl()).toThrow("PUBLIC_API_URL is not set");
  });

  it("rejects URLs containing a path", () => {
    process.env["PUBLIC_API_URL"] = "https://api.claim.anthonypillot.com/v1";

    expect(() => getPublicApiUrl()).toThrow("PUBLIC_API_URL must be a valid HTTP(S) origin");
  });
});

function restoreEnvironmentVariable(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
