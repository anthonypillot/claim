import { describe, expect, it, vi } from "vitest";
import type { ServerLogger } from "./logger.ts";
import { fetchGiveaways, GIVEAWAYS_REQUEST_TIMEOUT_MS } from "./giveaways.ts";

const validResponse = {
  count: 0,
  giveaways: [],
  errors: [],
};

function createLogger() {
  return {
    warn: vi.fn(),
  } satisfies Pick<ServerLogger, "warn">;
}

describe("fetchGiveaways", () => {
  it("returns a validated response with a request deadline", async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json(validResponse)));

    await expect(fetchGiveaways(fetch)).resolves.toEqual(validResponse);
    expect(fetch).toHaveBeenCalledWith("/api/giveaways", {
      signal: expect.any(AbortSignal),
    });
  });

  it("converts unsuccessful HTTP responses to a controlled gateway error", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 502 })));
    const logger = createLogger();

    await expect(fetchGiveaways(fetch, GIVEAWAYS_REQUEST_TIMEOUT_MS, logger)).rejects.toMatchObject(
      {
        status: 502,
        body: { message: "Unable to fetch giveaways" },
      },
    );
    expect(logger.warn).toHaveBeenCalledWith(
      { upstream: "claim-api", status: 502 },
      "giveaway request returned an unsuccessful response",
    );
  });

  it("converts network failures to a controlled gateway error", async () => {
    const logger = createLogger();
    async function failingFetch(): Promise<Response> {
      throw new TypeError("network down at https://user:password@example.com");
    }

    await expect(
      fetchGiveaways(failingFetch, GIVEAWAYS_REQUEST_TIMEOUT_MS, logger),
    ).rejects.toMatchObject({
      status: 502,
      body: { message: "Unable to fetch giveaways" },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { upstream: "claim-api", error_type: "TypeError" },
      "giveaway request failed",
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("password");
  });

  it("converts request timeouts to a controlled timeout error", async () => {
    const logger = createLogger();
    function timedOutFetch(_input: string | URL | Request, init?: RequestInit): Promise<Response> {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    }

    await expect(fetchGiveaways(timedOutFetch, 1, logger)).rejects.toMatchObject({
      status: 504,
      body: { message: "The giveaway request timed out" },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { upstream: "claim-api", timeout_ms: 1 },
      "giveaway request timed out",
    );
  });

  it("rejects malformed JSON and invalid response schemas", async () => {
    const logger = createLogger();
    const malformedJsonFetch = vi.fn(() =>
      Promise.resolve(new Response("{", { headers: { "content-type": "application/json" } })),
    );
    const invalidSchemaFetch = vi.fn(() =>
      Promise.resolve(Response.json({ count: 0, giveaways: [] })),
    );

    await expect(
      fetchGiveaways(malformedJsonFetch, GIVEAWAYS_REQUEST_TIMEOUT_MS, logger),
    ).rejects.toMatchObject({
      status: 502,
      body: { message: "The giveaway service returned invalid JSON" },
    });
    await expect(
      fetchGiveaways(invalidSchemaFetch, GIVEAWAYS_REQUEST_TIMEOUT_MS, logger),
    ).rejects.toMatchObject({
      status: 502,
      body: { message: "The giveaway service returned an invalid response" },
    });
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
