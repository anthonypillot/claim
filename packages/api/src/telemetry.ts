import { opentelemetry } from "@elysia/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";

const SERVICE_NAME = "claim-api";
const PROBE_PATHS = new Set(["/health", "/ready"]);

export function shouldTraceRequest(request: Request): boolean {
  return !PROBE_PATHS.has(new URL(request.url).pathname);
}

export function startTelemetry(serviceVersion: string) {
  const resource = resourceFromAttributes({
    "service.name": SERVICE_NAME,
    "service.version": serviceVersion,
  });
  const sdk = new NodeSDK({
    resource,
    serviceName: SERVICE_NAME,
    traceExporter: new OTLPTraceExporter(),
    logRecordProcessors: [],
  });
  sdk.start();

  return {
    plugin: opentelemetry({
      serviceName: SERVICE_NAME,
      checkIfShouldTrace: shouldTraceRequest,
    }),
    shutdown: () => sdk.shutdown(),
  };
}
