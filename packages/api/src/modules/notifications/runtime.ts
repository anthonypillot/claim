import type { DiscordConfiguration } from "../../config.ts";
import { getDb } from "../../db/client.ts";
import { createLogger } from "../../utils/logger.ts";
import { createDiscordClient } from "../discord/client.ts";
import { createDiscordCommands } from "../discord/commands.ts";
import { createDiscordInteractions } from "../discord/index.ts";
import { createGiveawayCacheScopeResolver } from "../giveaways/cache-scope.ts";
import { createGiveawayReads } from "../giveaways/read.ts";
import { storeAdapters } from "../giveaways/stores/index.ts";
import { createNotifications } from "./index.ts";

const log = createLogger("discord runtime");

export function createDiscordRuntime(configuration: DiscordConfiguration) {
  const controller = new AbortController();
  const client = createDiscordClient(configuration.token, configuration.applicationId, {
    signal: controller.signal,
  });
  const resolve = createGiveawayCacheScopeResolver(getDb, storeAdapters, {
    monitoringIntervalMs: configuration.monitoringIntervalMs,
  });
  const interactions = createDiscordInteractions({
    publicKey: configuration.publicKey,
    applicationId: configuration.applicationId,
    commands: createDiscordCommands(getDb, client),
  });
  const notifications = createNotifications({
    getDatabase: getDb,
    resolve,
    client,
    webUrl: configuration.webUrl,
    maxAlertAgeMs: configuration.maxAlertAgeMs,
    membershipCheckIntervalMs: configuration.membershipCheckIntervalMs,
    signal: controller.signal,
  });
  let stopping = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let work: Promise<void> | undefined;
  async function cycle(): Promise<void> {
    try {
      await notifications.runOnce();
    } catch {
      log.error("Discord monitoring cycle failed; will try again on the next cycle");
    } finally {
      if (!stopping) timer = setTimeout(tick, 60000);
    }
  }
  function tick(): void {
    work = cycle();
  }
  function start(): void {
    if (!stopping || controller.signal.aborted) return;
    stopping = false;
    tick();
  }
  async function stop(stopListener: () => Promise<void>): Promise<void> {
    stopping = true;
    controller.abort();
    if (timer) clearTimeout(timer);
    // Finish accepted HTTP requests before taking the final command-task drain snapshot.
    await stopListener();
    await work;
    await interactions.decorator.discord.drain();
  }
  return { interactions, reads: createGiveawayReads(resolve), start, stop };
}
