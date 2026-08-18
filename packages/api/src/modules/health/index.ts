import { SpanStatusCode, trace } from "@opentelemetry/api";
import { sql } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { getDb } from "../../db/client.ts";
import { createLogger } from "../../utils/logger.ts";

const HealthResponseSchema = t.Object({ status: t.Literal("ok") });
const ReadyResponseSchema = t.Object({ status: t.Literal("ready") });
const NotReadyResponseSchema = t.Object({ status: t.Literal("not_ready") });
const readinessTracer = trace.getTracer("claim-api");
const log = createLogger("readiness");

export type CheckReadiness = () => Promise<void>;

function getHealth(): typeof HealthResponseSchema.static {
  return { status: "ok" };
}

async function checkDatabaseReadiness(): Promise<void> {
  await getDb().execute(sql`select 1`);
}

export function createHealth(checkReadiness: CheckReadiness = checkDatabaseReadiness) {
  return new Elysia()
    .get("/health", getHealth, {
      response: { 200: HealthResponseSchema },
      detail: { summary: "Check process liveness", tags: ["health"] },
    })
    .get(
      "/ready",
      async function getReadiness({ status }) {
        try {
          await checkReadiness();
          return { status: "ready" } as const;
        } catch (error) {
          return readinessTracer.startActiveSpan("readiness.check", (span) => {
            span.setAttributes({
              "claim.readiness.outcome": "unavailable",
              "http.request.method": "GET",
              "http.response.status_code": 503,
              "http.route": "/ready",
            });
            span.setStatus({ code: SpanStatusCode.ERROR });
            log.warn(
              { error_type: error instanceof Error ? error.name : "NonErrorException" },
              "readiness check failed",
            );
            span.end();
            return status(503, { status: "not_ready" });
          });
        }
      },
      {
        response: {
          200: ReadyResponseSchema,
          503: NotReadyResponseSchema,
        },
        detail: { summary: "Check database readiness", tags: ["health"] },
      },
    );
}
