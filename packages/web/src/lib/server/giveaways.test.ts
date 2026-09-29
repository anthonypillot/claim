import { describe, expect, it, vi } from "vitest";
import { fetchGiveaways } from "./giveaways.ts";

const validResponse = {
  count: 0,
  giveaways: [],
  errors: [],
};

describe("fetchGiveaways", () => {
  it("returns a validated response with a request deadline", async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json(validResponse)));

    await expect(fetchGiveaways(fetch, "en")).resolves.toEqual(validResponse);
    expect(fetch).toHaveBeenCalledWith("/api/giveaways?locale=en-US&country=US", {
      signal: expect.any(AbortSignal),
    });
  });

  it("requests the French market for French readers", async () => {
    const fetch = vi.fn(async () => Response.json(validResponse));

    await expect(fetchGiveaways(fetch, "fr")).resolves.toEqual(validResponse);
    expect(fetch).toHaveBeenCalledWith("/api/giveaways?locale=fr-FR&country=FR", {
      signal: expect.any(AbortSignal),
    });
  });

  it("converts unsuccessful HTTP responses to a controlled gateway error", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 502 })));

    await expect(fetchGiveaways(fetch, "en")).rejects.toMatchObject({
      status: 502,
      body: { message: "Unable to fetch giveaways" },
    });
  });

  it("converts network failures to a controlled gateway error", async () => {
    async function failingFetch(): Promise<Response> {
      throw new TypeError("network down");
    }

    await expect(fetchGiveaways(failingFetch, "en")).rejects.toMatchObject({
      status: 502,
      body: { message: "Unable to fetch giveaways" },
    });
  });

  it("converts request timeouts to a controlled timeout error", async () => {
    function timedOutFetch(_input: string | URL | Request, init?: RequestInit): Promise<Response> {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    }

    await expect(fetchGiveaways(timedOutFetch, "en", 1)).rejects.toMatchObject({
      status: 504,
      body: { message: "The giveaway request timed out" },
    });
  });

  it("rejects malformed JSON and invalid response schemas", async () => {
    const malformedJsonFetch = vi.fn(() =>
      Promise.resolve(new Response("{", { headers: { "content-type": "application/json" } })),
    );
    const invalidSchemaFetch = vi.fn(() =>
      Promise.resolve(Response.json({ count: 0, giveaways: [] })),
    );

    await expect(fetchGiveaways(malformedJsonFetch, "en")).rejects.toMatchObject({
      status: 502,
      body: { message: "The giveaway service returned invalid JSON" },
    });
    await expect(fetchGiveaways(invalidSchemaFetch, "en")).rejects.toMatchObject({
      status: 502,
      body: { message: "The giveaway service returned an invalid response" },
    });
  });
});
