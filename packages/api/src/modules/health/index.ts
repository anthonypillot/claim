import { sql } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { getDb } from "../../db/client.ts";

const HealthResponseSchema = t.Object({ status: t.Literal("ok") });
const ReadyResponseSchema = t.Object({ status: t.Literal("ready") });
const NotReadyResponseSchema = t.Object({ status: t.Literal("not_ready") });

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
        } catch {
          return status(503, { status: "not_ready" });
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
