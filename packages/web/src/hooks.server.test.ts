import type { RequestEvent } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";
import { createHandle, createHandleError } from "./hooks.server.ts";
import type { ServerLogger } from "$lib/server/logger";

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } satisfies ServerLogger;
}

function createEvent(path: string): RequestEvent {
  const url = new URL(path, "https://claim.example.com");
  return {
    request: new Request(url),
    url,
  } as RequestEvent;
}

describe("server request hooks", () => {
  it("logs completed requests", async () => {
    const logger = createLogger();
    const handle = createHandle(logger);

    const response = await handle({
      event: createEvent("/giveaways?store=steam"),
      resolve: () => Promise.resolve(new Response(null, { status: 201 })),
    });

    expect(response.status).toBe(201);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ method: "GET", path: "/giveaways", status: 201 }),
      "request completed",
    );
  });

  it("does not log health checks", async () => {
    const logger = createLogger();
    const handle = createHandle(logger);

    await handle({
      event: createEvent("/health"),
      resolve: () => Promise.resolve(Response.json({ status: "ok" })),
    });

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs framework-handled unexpected errors once without serializing values", async () => {
    const logger = createLogger();
    const handle = createHandle(logger);
    const event = createEvent("/giveaways");
    const failure = new Error("sensitive detail");

    await expect(
      handle({
        event,
        resolve: () => Promise.reject(failure),
      }),
    ).rejects.toBe(failure);
    expect(logger.error).not.toHaveBeenCalled();

    const result = createHandleError(logger)({
      error: { token: "secret" },
      event,
      message: "Internal Error",
      status: 500,
    });

    expect(result).toEqual({ message: "Internal Error" });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("secret");
  });
});
