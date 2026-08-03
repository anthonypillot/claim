import { describe, expect, test } from "vitest";
import { resolvePlausibleScriptUrl } from "./config";

const productionEnvironment = {
  PUBLIC_PLAUSIBLE_SCRIPT_URL:
    "https://plausible.monitoring.anthonypillot.com/js/pa-D95gD7Xk4gbNpDXKDnm4m.js",
};

describe("resolvePlausibleScriptUrl", () => {
  test("does not configure analytics during development", () => {
    expect(resolvePlausibleScriptUrl(true, {})).toBeNull();
  });

  test("uses the generated self-hosted tracker", () => {
    expect(resolvePlausibleScriptUrl(false, productionEnvironment)).toBe(
      productionEnvironment.PUBLIC_PLAUSIBLE_SCRIPT_URL,
    );
  });

  test.each([
    ["missing script URL", {}],
    [
      "script origin without a path",
      { PUBLIC_PLAUSIBLE_SCRIPT_URL: "https://plausible.monitoring.anthonypillot.com" },
    ],
    ["non-HTTP script URL", { PUBLIC_PLAUSIBLE_SCRIPT_URL: "ftp://example.com/script.js" }],
    [
      "script URL with credentials",
      { PUBLIC_PLAUSIBLE_SCRIPT_URL: "https://user@example.com/script.js" },
    ],
    [
      "script URL with a query",
      { PUBLIC_PLAUSIBLE_SCRIPT_URL: "https://example.com/script.js?v=1" },
    ],
  ])("rejects %s", (_, environment) => {
    expect(() => resolvePlausibleScriptUrl(false, environment)).toThrow(/PUBLIC_|HTTP/);
  });
});
