import { getRobotsTxt } from "$lib/server/robots";

export function GET(): Response {
  return new Response(getRobotsTxt(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
