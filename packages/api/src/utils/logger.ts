import { isSpanContextValid, trace, TraceFlags, type SpanContext } from "@opentelemetry/api";
import pino from "pino";
import { version as packageVersion } from "../../package.json" with { type: "json" };

const isProduction = process.env["NODE_ENV"] === "production";

export function getTraceCorrelation(
  spanContext: SpanContext | undefined = trace.getActiveSpan()?.spanContext(),
): Record<string, string> {
  if (
    spanContext === undefined ||
    !isSpanContextValid(spanContext) ||
    (spanContext.traceFlags & TraceFlags.SAMPLED) === 0
  ) {
    return {};
  }

  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: spanContext.traceFlags.toString(16).padStart(2, "0"),
  };
}

export const logger = pino({
  base: {
    service_name: "claim-api",
    service_version: process.env["APP_VERSION"] || packageVersion,
  },
  level: process.env["LOG_LEVEL"] ?? (isProduction ? "info" : "debug"),
  mixin() {
    return getTraceCorrelation();
  },
  // pino-pretty is a devDependency: referenced only by this runtime target string so the
  // production bundle never depends on it.
  ...(isProduction ? {} : { transport: { target: "pino-pretty", options: { colorize: true } } }),
});

/**
 * A logger whose every message is prefixed with an uppercase `[LOCATION]` tag (e.g. `[GIVEAWAYS
 * SERVICE]`) so a log line's origin is obvious when tracing issues. Pass the location in natural
 * case — the bracketing and uppercasing live here so call sites never format the prefix themselves.
 */
export function createLogger(location: string) {
  return logger.child({}, { msgPrefix: `[${location.toUpperCase()}] ` });
}
