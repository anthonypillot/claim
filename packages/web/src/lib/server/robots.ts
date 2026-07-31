import { env } from "$env/dynamic/private";

const RESTRICTED_ROBOTS_HEADER = "noindex, nofollow, noarchive";

export function isRobotIndexingAllowed(value = env["ROBOTS_ALLOW_INDEXING"]): boolean {
  return value === "true";
}

export function getRobotsTxt(indexingAllowed = isRobotIndexingAllowed()): string {
  return `User-agent: *\nDisallow:${indexingAllowed ? "" : " /"}\n`;
}

export function applyRobotsPolicy(
  response: Response,
  indexingAllowed = isRobotIndexingAllowed(),
): Response {
  if (indexingAllowed) return response;

  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", RESTRICTED_ROBOTS_HEADER);

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}
