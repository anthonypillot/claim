import { describe, expect, it } from "bun:test";

import { buildApp, formatApiName } from "./app.ts";

const ROOT_URL = "http://localhost/";
const TEST_METADATA = {
  name: "claim",
  version: "1.2.3",
  description: "Test description",
};

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
    const app = buildApp(TEST_METADATA);

    const response = await app.handle(new Request(ROOT_URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "Claim API",
      version: "1.2.3",
      description: "Test description",
    });
  });
});

describe("health probes", () => {
  it("reports liveness without checking dependencies", async () => {
    let readinessChecks = 0;
    const app = buildApp(TEST_METADATA, {
      async checkReadiness() {
        readinessChecks += 1;
        throw new Error("Database unavailable");
      },
    });

    const response = await app.handle(new Request(`${ROOT_URL}health`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(readinessChecks).toBe(0);
  });

  it("reports readiness when the database check succeeds", async () => {
    const app = buildApp(TEST_METADATA, { checkReadiness: async () => {} });

    const response = await app.handle(new Request(`${ROOT_URL}ready`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
  });

  it("reports unavailable when the database check fails", async () => {
    const app = buildApp(TEST_METADATA, {
      checkReadiness: async () => {
        throw new Error("Database unavailable");
      },
    });

    const response = await app.handle(new Request(`${ROOT_URL}ready`));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "not_ready" });
  });

  it("documents both probes in OpenAPI", async () => {
    const app = buildApp(TEST_METADATA);

    const response = await app.handle(new Request(`${ROOT_URL}openapi/json`));
    const spec = (await response.json()) as {
      info?: { title?: string };
      paths?: Record<string, { get?: { responses?: Record<string, unknown> } }>;
    };

    expect(response.status).toBe(200);
    expect(spec.info?.title).toBe("Claim API");
    expect(spec.paths?.["/health"]?.get?.responses?.["200"]).toBeDefined();
    expect(spec.paths?.["/ready"]?.get?.responses?.["200"]).toBeDefined();
    expect(spec.paths?.["/ready"]?.get?.responses?.["503"]).toBeDefined();
  });

  it("uses a separate browser title for the OpenAPI page", async () => {
    const app = buildApp(TEST_METADATA);

    const response = await app.handle(new Request(`${ROOT_URL}openapi`));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>Claim API</title>");
    expect(html).toContain('"metaData":{"title":"API | Claim"}');
  });
});
