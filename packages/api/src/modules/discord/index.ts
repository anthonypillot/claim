import { createPublicKey, verify } from "node:crypto";
import { Elysia, t } from "elysia";
import { Value } from "@sinclair/typebox/value";
import { createLogger } from "../../utils/logger.ts";
import { CommandSchema } from "./model.ts";
import type { DiscordCommands } from "./commands.ts";
import { MANAGEMENT_PERMISSIONS } from "./permissions.ts";

type DiscordInteractionsOptions = {
  publicKey: string;
  applicationId: string;
  commands?: DiscordCommands;
};
const PingSchema = t.Object({ type: t.Literal(1) });
const log = createLogger("discord interactions");
const MAX_INTERACTION_BYTES = 65536;
const SIGNATURE_WINDOW_SECONDS = 300;

async function readBody(request: Request): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return Buffer.concat(chunks);
      size += chunk.value.byteLength;
      if (size > MAX_INTERACTION_BYTES) {
        await reader.cancel();
        throw new Error("Interaction too large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
}

export function createDiscordInteractions(options: DiscordInteractionsOptions) {
  const key = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(options.publicKey, "hex"),
    ]),
    format: "der",
    type: "spki",
  });
  const tasks = new Set<Promise<void>>();
  async function drain(): Promise<void> {
    await Promise.allSettled(tasks);
  }
  return new Elysia().decorate("discord", { drain }).post(
    "/discord/interactions",
    async ({ request, status }) => {
      const timestamp = request.headers.get("x-signature-timestamp") ?? "";
      const signature = request.headers.get("x-signature-ed25519") ?? "";
      if (
        !/^\d+$/.test(timestamp) ||
        !/^[a-f\d]{128}$/i.test(signature) ||
        Math.abs(Date.now() / 1000 - Number(timestamp)) > SIGNATURE_WINDOW_SECONDS
      )
        return status(401);
      let body: Buffer;
      try {
        body = await readBody(request);
      } catch {
        return status(413);
      }
      // Slow body arrival must not extend the replay window checked before reading the stream.
      if (Math.abs(Date.now() / 1000 - Number(timestamp)) > SIGNATURE_WINDOW_SECONDS)
        return status(401);
      if (
        !verify(
          null,
          Buffer.concat([Buffer.from(timestamp), body]),
          key,
          Buffer.from(signature, "hex"),
        )
      )
        return status(401);
      try {
        const interaction = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
        if (Value.Check(PingSchema, interaction)) return { type: 1 };
        if (
          !Value.Check(CommandSchema, interaction) ||
          interaction.application_id !== options.applicationId
        )
          return status(400);
        if ((BigInt(interaction.member.permissions) & MANAGEMENT_PERMISSIONS) === 0n)
          return {
            type: 4,
            data: {
              flags: 64,
              content: "Manage Server permission is required.",
              allowed_mentions: { parse: [] },
            },
          };
        if (!options.commands) return status(503);
        async function execute(): Promise<void> {
          try {
            await options.commands?.run(interaction);
          } catch {
            log.error("Discord command failed; no raw payload or credentials logged");
          } finally {
            tasks.delete(task);
          }
        }
        const task = execute();
        tasks.add(task);
        return { type: 5, data: { flags: 64 } };
      } catch {
        return status(400);
      }
    },
    { parse: "none", detail: { hide: true } },
  );
}
