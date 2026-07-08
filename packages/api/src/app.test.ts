import { describe, expect, it } from "bun:test";

import { buildApp, formatApiName } from "./app.ts";

const ROOT_URL = "http://localhost/";

describe("formatApiName", () => {
  it("capitalizes the first letter and appends ' API'", () => {
    expect(formatApiName("claim")).toBe("Claim API");
  });

  it("leaves an already-capitalized name capitalized", () => {
    expect(formatApiName("Claim")).toBe("Claim API");
  });
});

describe("GET /", () => {
  it("returns the API metadata with a formatted name", async () => {
    const app = buildApp({
      name: "claim",
      version: "1.2.3",
      description: "Test description",
    });

    const response = await app.handle(new Request(ROOT_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "Claim API",
      version: "1.2.3",
      description: "Test description",
    });
  });
});
