import { describe, expect, test } from "vitest";
import { applyRobotsPolicy, getRobotsTxt, isRobotIndexingAllowed } from "./robots";

describe("robot policy", () => {
  test("allows indexing only when explicitly enabled", () => {
    expect(isRobotIndexingAllowed("true")).toBe(true);
    expect(isRobotIndexingAllowed("false")).toBe(false);
    expect(isRobotIndexingAllowed(undefined)).toBe(false);
  });

  test("allows compliant crawlers in production", () => {
    expect(getRobotsTxt(true)).toBe("User-agent: *\nDisallow:\n");
  });

  test("discourages compliant crawlers outside production while allowing the favicon", () => {
    expect(getRobotsTxt(false)).toBe("User-agent: *\nDisallow: /\nAllow: /favicon.ico\n");
  });

  test("adds a restrictive robots header outside production", () => {
    const response = applyRobotsPolicy(new Response("page"), false);

    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
  });

  test("does not add a restrictive robots header in production", () => {
    const response = applyRobotsPolicy(new Response("page"), true);

    expect(response.headers.has("X-Robots-Tag")).toBe(false);
  });
});
