import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { NodeSDK, resources, tracing } from "@opentelemetry/sdk-node";
import { createAddHookMessageChannel } from "import-in-the-middle";
import { register } from "node:module";

const endpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"]?.trim();

if (endpoint) {
  const { registerOptions } = createAddHookMessageChannel();
  register("import-in-the-middle/hook.mjs", import.meta.url, registerOptions);

  const parentBasedSampler = new tracing.ParentBasedSampler({
    root: new tracing.AlwaysOnSampler(),
  });
  const healthFilteringSampler: tracing.Sampler = {
    shouldSample: (context, traceId, spanName, spanKind, attributes, links) => {
      const requestUrl = attributes["http.url"];
      const isHealthRequest =
        typeof requestUrl === "string" &&
        new URL(requestUrl, "http://localhost").pathname === "/health";

      return isHealthRequest
        ? { decision: tracing.SamplingDecision.NOT_RECORD }
        : parentBasedSampler.shouldSample(context, traceId, spanName, spanKind, attributes, links);
    },
    toString: () => "HealthFilteringParentBasedSampler",
  };

  const sdk = new NodeSDK({
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-http": {
          ignoreIncomingRequestHook: (request) =>
            new URL(request.url ?? "/", "http://localhost").pathname === "/health",
        },
        "@opentelemetry/instrumentation-pino": { enabled: false },
        "@opentelemetry/instrumentation-undici": { enabled: true },
      }),
    ],
    logRecordProcessors: [],
    metricReaders: [],
    resource: resources.resourceFromAttributes({
      "service.name": "claim-web",
      "service.version": __APP_VERSION__,
    }),
    sampler: healthFilteringSampler,
    serviceName: "claim-web",
    traceExporter: new OTLPTraceExporter(),
  });

  sdk.start();

  process.on("sveltekit:shutdown", async () => {
    await sdk.shutdown();
  });
}
