import { env } from "$env/dynamic/private";

const RESTRICTED_ROBOTS_HEADER = "noindex, nofollow, noarchive";

export function isRobotIndexingAllowed(value: string | undefined): boolean {
  return value === "true";
}

function isConfiguredRobotIndexingAllowed(): boolean {
  return isRobotIndexingAllowed(env["ROBOTS_ALLOW_INDEXING"]);
}

export function getRobotsTxt(indexingAllowed = isConfiguredRobotIndexingAllowed()): string {
  return `User-agent: *\nDisallow:${indexingAllowed ? "" : " /"}\n`;
}

export function applyRobotsPolicy(
  response: Response,
  indexingAllowed = isConfiguredRobotIndexingAllowed(),
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
