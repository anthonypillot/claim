import { describe, expect, it } from "bun:test";

import {
  normalizeExternalUrl,
  readUpstreamJson,
  readUpstreamText,
  UpstreamError,
} from "./shared.ts";

function streamedResponse(chunks: string[], headers?: Record<string, string>): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers },
  );
}

describe("normalizeExternalUrl", () => {
  it("accepts and canonicalizes HTTP(S) URLs", () => {
    expect(normalizeExternalUrl("https://example.com/a path")).toBe("https://example.com/a%20path");
    expect(normalizeExternalUrl("http://example.com")).toBe("http://example.com/");
  });

  it("rejects malformed, relative, credentialed, and unsafe URLs", () => {
    for (const value of [
      "",
      "not a url",
      "/relative",
      "//example.com/path",
      "https://user:password@example.com/path",
      "javascript:alert(1)",
      "data:text/html,unsafe",
      "file:///etc/passwd",
      "ftp://example.com/file",
    ]) {
      expect(normalizeExternalUrl(value)).toBeNull();
    }
  });
});

describe("bounded upstream response readers", () => {
  it("rejects a declared oversized body before reading it", async () => {
    const response = new Response("small", { headers: { "content-length": "9" } });

    await expect(readUpstreamText(response, "test", 8)).rejects.toEqual(
      new UpstreamError("test", "upstream response too large"),
    );
    expect(response.bodyUsed).toBe(true);
  });

  it("accepts a body exactly at the byte limit", async () => {
    await expect(readUpstreamText(streamedResponse(["1234", "5678"]), "test", 8)).resolves.toBe(
      "12345678",
    );
  });

  it("rejects an undeclared streamed body over the limit", async () => {
    await expect(readUpstreamText(streamedResponse(["1234", "56789"]), "test", 8)).rejects.toThrow(
      "upstream response too large",
    );
  });

  it("does not trust an understated Content-Length", async () => {
    const response = streamedResponse(["1234", "56789"], { "content-length": "4" });

    await expect(readUpstreamText(response, "test", 8)).rejects.toThrow(
      "upstream response too large",
    );
  });

  it("counts encoded bytes rather than characters", async () => {
    await expect(readUpstreamText(streamedResponse(["éé"]), "test", 3)).rejects.toThrow(
      "upstream response too large",
    );
  });

  it("parses JSON only after the bounded read succeeds", async () => {
    await expect(readUpstreamJson(streamedResponse(['{"ok":true}']), "test", 11)).resolves.toEqual({
      ok: true,
    });
    await expect(
      readUpstreamJson(streamedResponse(["not-json-too-large"]), "test", 4),
    ).rejects.toThrow("upstream response too large");
  });
});
