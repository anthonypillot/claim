import { dev } from "$app/environment";
import type { Handle, HandleFetch, HandleServerError } from "@sveltejs/kit";
import { logger, type ServerLogger } from "$lib/server/logger";
import { applyRobotsPolicy } from "$lib/server/robots";

function getErrorType(error: unknown): string {
  return error instanceof Error ? error.name : "NonErrorException";
}

export function createHandle(requestLogger: ServerLogger = logger): Handle {
  return async ({ event, resolve }) => {
    const startedAt = performance.now();
    const fields = {
      method: event.request.method,
      path: event.url.pathname,
    };

    const response = applyRobotsPolicy(await resolve(event));

    if (event.url.pathname !== "/health") {
      requestLogger.info(
        {
          ...fields,
          status: response.status,
          duration_ms: Math.round(performance.now() - startedAt),
        },
        "request completed",
      );
    }

    return response;
  };
}

export function createHandleError(requestLogger: ServerLogger = logger): HandleServerError {
  return ({ error, event, message, status }) => {
    if (event.url.pathname !== "/health") {
      requestLogger.error(
        {
          method: event.request.method,
          path: event.url.pathname,
          status,
          error_type: getErrorType(error),
        },
        "request failed unexpectedly",
      );
    }

    return { message };
  };
}

export const handle = createHandle();
export const handleError = createHandleError();

export const handleFetch: HandleFetch = ({ request, fetch }) => {
  const url = new URL(request.url);

  if (dev && url.pathname.startsWith("/api/")) {
    url.protocol = "http:";
    url.host = "localhost:3000";
    url.pathname = url.pathname.slice(4);

    return fetch(new Request(url.toString(), request));
  }

  return fetch(request);
};
