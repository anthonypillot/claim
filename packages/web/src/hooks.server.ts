import { dev } from "$app/environment";
import type { Handle, HandleFetch } from "@sveltejs/kit";
import { applyRobotsPolicy } from "$lib/server/robots";

export const handle: Handle = async ({ event, resolve }) => {
  return applyRobotsPolicy(await resolve(event));
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
