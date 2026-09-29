import { dev } from "$app/environment";
import type { Handle, HandleFetch } from "@sveltejs/kit";
import { applyRobotsPolicy } from "$lib/server/robots";
import { paraglideMiddleware } from "$lib/paraglide/server";
import { getPreferredLocale } from "$lib/server/locale";

export const handle: Handle = async ({ event, resolve }) => {
  const localeRequest = event.request.clone();
  localeRequest.headers.set(
    "Accept-Language",
    getPreferredLocale(event.request.headers.get("Accept-Language")) ?? "",
  );

  const response = await paraglideMiddleware(localeRequest, async ({ locale }) => {
    const response = await resolve(event, {
      transformPageChunk: ({ html }) => html.replace("%lang%", locale),
    });

    if (!event.isDataRequest && !response.headers.get("Content-Type")?.includes("text/html")) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set("Content-Language", locale);
    headers.set("Cache-Control", "private, no-cache");
    headers.append("Vary", "Cookie, Accept-Language");
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  });

  return applyRobotsPolicy(response);
};

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
