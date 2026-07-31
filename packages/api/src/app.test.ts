import { compileErrors, validate } from "@readme/openapi-parser";
import { describe, expect, it } from "bun:test";

import { buildApp, formatApiName } from "./app.ts";

const ROOT_URL = "http://localhost/";
const API_URL = "https://api.claim.anthonypillot.com";
const TEST_METADATA = {
  name: "claim",
  version: "1.2.3",
  description: "Test description",
};

type OpenApiOperation = {
  responses?: Record<
    string,
    {
      content?: {
        "application/json"?: {
          schema?: unknown;
        };
      };
    }
  >;
};

type OpenApiDocument = {
  info?: { title?: string };
  paths?: Record<string, { get?: OpenApiOperation }>;
  servers?: { url?: string }[];
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
    const app = buildApp(TEST_METADATA, { apiUrl: API_URL });

    const response = await app.handle(new Request(`${ROOT_URL}openapi/json`));
    const spec = (await response.json()) as OpenApiDocument;

    expect(response.status).toBe(200);
    expect(spec.info?.title).toBe("Claim API");
    expect(spec.servers).toEqual([{ url: API_URL }]);
    expect(spec.paths?.["/health"]?.get?.responses?.["200"]).toBeDefined();
    expect(spec.paths?.["/ready"]?.get?.responses?.["200"]).toBeDefined();
    expect(spec.paths?.["/ready"]?.get?.responses?.["503"]).toBeDefined();
  });

  it("publishes a valid OpenAPI contract for every giveaway route", async () => {
    const app = buildApp(TEST_METADATA, { apiUrl: API_URL });

    const response = await app.handle(new Request(`${ROOT_URL}openapi/json`));
    const document = await response.text();
    const spec = JSON.parse(document) as OpenApiDocument;
    const validation = await validate(JSON.parse(document));

    expect(response.status).toBe(200);
    if (!validation.valid) throw new Error(compileErrors(validation));
    expect(validation.valid).toBe(true);
    expect(spec.paths?.["/giveaways/"]).toBeUndefined();

    const expectedResponses = ["200", "422", "500", "502"];
    for (const path of [
      "/giveaways",
      "/giveaways/epic-games",
      "/giveaways/prime-gaming",
      "/giveaways/gog",
      "/giveaways/steam",
    ]) {
      expect(Object.keys(spec.paths?.[path]?.get?.responses ?? {}).toSorted()).toEqual(expectedResponses);
    }

    const aggregateSchema = spec.paths?.["/giveaways"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema;
    expect(JSON.stringify(aggregateSchema).match(/"format":"uri"/g)).toHaveLength(4);
  });

  it("allows arbitrary browser origins through CORS", async () => {
    const app = buildApp(TEST_METADATA);
    const response = await app.handle(
      new Request(`${ROOT_URL}giveaways`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://example.com",
          "Access-Control-Request-Method": "GET",
        },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBe("https://example.com");
  });

  it("uses Claim branding for the OpenAPI page", async () => {
    const app = buildApp(TEST_METADATA);

    const response = await app.handle(new Request(`${ROOT_URL}openapi`));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>Claim API</title>");
    expect(html).toContain('"favicon":"data:image/svg+xml,%3Csvg');
    expect(html).toContain("M42%2067L59%2084L99%2044");
    expect(html).toContain("stroke%3D%22%23FF6B00%22");
    expect(html).toContain('"metaData":{"title":"API | Claim"}');
  });
});
