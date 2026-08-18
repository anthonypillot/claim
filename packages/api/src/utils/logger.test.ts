import { describe, expect, it } from "bun:test";
import { TraceFlags, type SpanContext } from "@opentelemetry/api";

import { getTraceCorrelation } from "./logger.ts";

const TRACE_ID = "0123456789abcdef0123456789abcdef";
const SPAN_ID = "0123456789abcdef";

function createSpanContext(traceFlags: TraceFlags): SpanContext {
  return { traceId: TRACE_ID, spanId: SPAN_ID, traceFlags };
}

describe("getTraceCorrelation", () => {
  it("returns SigNoz correlation fields for a sampled span", () => {
    expect(getTraceCorrelation(createSpanContext(TraceFlags.SAMPLED))).toEqual({
      trace_id: TRACE_ID,
      span_id: SPAN_ID,
      trace_flags: "01",
    });
  });

  it("omits correlation for missing, invalid, and unsampled spans", () => {
    expect(getTraceCorrelation(undefined)).toEqual({});
    expect(getTraceCorrelation(createSpanContext(TraceFlags.NONE))).toEqual({});
    expect(
      getTraceCorrelation({ traceId: "invalid", spanId: SPAN_ID, traceFlags: TraceFlags.SAMPLED }),
    ).toEqual({});
  });
});
