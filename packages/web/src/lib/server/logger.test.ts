import { TraceFlags } from "@opentelemetry/api";
import { describe, expect, it } from "vitest";
import { getTraceBindings } from "./logger.ts";

describe("getTraceBindings", () => {
  it("formats valid OpenTelemetry context for Pino", () => {
    expect(
      getTraceBindings({
        traceId: "0123456789abcdef0123456789abcdef",
        spanId: "0123456789abcdef",
        traceFlags: TraceFlags.SAMPLED,
      }),
    ).toEqual({
      trace_id: "0123456789abcdef0123456789abcdef",
      span_id: "0123456789abcdef",
      trace_flags: "01",
    });
  });

  it("omits correlation fields without a valid sampled span", () => {
    expect(getTraceBindings(undefined)).toEqual({});
    expect(
      getTraceBindings({
        traceId: "0123456789abcdef0123456789abcdef",
        spanId: "0123456789abcdef",
        traceFlags: TraceFlags.NONE,
      }),
    ).toEqual({});
  });
});
