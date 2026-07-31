import { describe, expect, test } from "vitest";
import { resolvePlausibleAnalytics } from "./config";

const productionEnvironment = {
  PUBLIC_PLAUSIBLE_URL: "https://plausible.monitoring.anthonypillot.com",
  PUBLIC_WEB_URL: "https://claim.anthonypillot.com",
};

describe("resolvePlausibleAnalytics", () => {
  test("does not configure analytics during development", () => {
    expect(resolvePlausibleAnalytics(true, {})).toBeNull();
  });

  test("configures the self-hosted tracker for production", () => {
    expect(resolvePlausibleAnalytics(false, productionEnvironment)).toEqual({
      domain: "claim.anthonypillot.com",
      scriptUrl: "https://plausible.monitoring.anthonypillot.com/js/script.js",
    });
  });

  test("normalizes configured origins", () => {
    expect(
      resolvePlausibleAnalytics(false, {
        PUBLIC_PLAUSIBLE_URL: "https://plausible.monitoring.anthonypillot.com/",
        PUBLIC_WEB_URL: "https://claim.anthonypillot.com/",
      }),
    ).toEqual({
      domain: "claim.anthonypillot.com",
      scriptUrl: "https://plausible.monitoring.anthonypillot.com/js/script.js",
    });
  });

  test.each([
    ["missing Plausible URL", { PUBLIC_WEB_URL: productionEnvironment.PUBLIC_WEB_URL }],
    ["missing web URL", { PUBLIC_PLAUSIBLE_URL: productionEnvironment.PUBLIC_PLAUSIBLE_URL }],
    [
      "Plausible URL with a path",
      { ...productionEnvironment, PUBLIC_PLAUSIBLE_URL: "https://example.com/a" },
    ],
    [
      "non-HTTP Plausible URL",
      { ...productionEnvironment, PUBLIC_PLAUSIBLE_URL: "ftp://example.com" },
    ],
  ])("rejects %s", (_, environment) => {
    expect(() => resolvePlausibleAnalytics(false, environment)).toThrow(/PUBLIC_|HTTP/);
  });
});
