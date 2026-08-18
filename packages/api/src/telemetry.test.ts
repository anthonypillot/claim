import { describe, expect, it } from "bun:test";

import { shouldTraceRequest } from "./telemetry.ts";

describe("shouldTraceRequest", () => {
  it("excludes health probe paths", () => {
    expect(shouldTraceRequest(new Request("http://localhost/health"))).toBe(false);
    expect(shouldTraceRequest(new Request("http://localhost/ready?full=true"))).toBe(false);
  });

  it("traces non-probe requests", () => {
    expect(shouldTraceRequest(new Request("http://localhost/giveaways"))).toBe(true);
  });
});
