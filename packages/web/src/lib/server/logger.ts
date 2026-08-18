import { context, trace, TraceFlags, type SpanContext } from "@opentelemetry/api";
import pino from "pino";

type LogValue = string | number;
type LogFields = Record<string, LogValue>;

export type ServerLogger = {
  info(fields: LogFields, message: string): void;
  warn(fields: LogFields, message: string): void;
  error(fields: LogFields, message: string): void;
};

export function getTraceBindings(
  spanContext: SpanContext | undefined = trace.getSpan(context.active())?.spanContext(),
): LogFields {
  if (
    !spanContext ||
    !trace.isSpanContextValid(spanContext) ||
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

export const logger: ServerLogger = pino({
  base: {
    service_name: "claim-web",
    service_version: __APP_VERSION__,
  },
  mixin: () => getTraceBindings(),
});
