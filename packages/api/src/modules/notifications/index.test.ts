import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";

import { createTestDatabase } from "../../db/testing.ts";
import {
  discordSubscriptions,
  discordFollows,
  discordRateLimits,
  discordRuntime,
  discordInteractions,
  giveawayOccurrences,
  giveawayFetches,
  giveaways,
} from "../../db/schema.ts";
import { createDiscordClient } from "../discord/client.ts";
import { APPLICATION, CHANNEL, discordHttp, freeGame, GUILD } from "../discord/fixtures.ts";
import { createGiveawayCacheScopeResolver, type StoreAdapters } from "../giveaways/cache-scope.ts";
import type { Giveaway, Market, StoreId } from "../giveaways/model.ts";
import type { DiscordMessage } from "../discord/model.ts";
import { createSubscriptions } from "../subscriptions/index.ts";
import { createNotifications } from "./index.ts";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
const originalFetch = globalThis.fetch;
beforeAll(async () => {
  database = await createTestDatabase();
});
beforeEach(async () => {
  for (const table of [
    discordSubscriptions,
    discordRuntime,
    discordRateLimits,
    discordInteractions,
    giveawayOccurrences,
    giveawayFetches,
    giveaways,
  ])
    await database.db.delete(table);
});
afterAll(async () => {
  await database.close();
});
afterEach(async () => {
  globalThis.fetch = originalFetch;
  await createSubscriptions(() => database.db).stop(GUILD);
});

let scenarioId = 0;
async function scenario(
  stores: readonly StoreId[] | null = ["steam"],
  market: Market = { locale: "en-US", country: "US" },
  initialFailures: readonly StoreId[] = [],
) {
  let time = Date.now();
  let games: Giveaway[] = [];
  const failures = new Set(initialFailures);
  const calls = new Map<StoreId, number>();
  const clock = () => new Date(time);
  function fetchStore(store: StoreId) {
    return async function fetchGames(): Promise<Giveaway[]> {
      calls.set(store, (calls.get(store) ?? 0) + 1);
      if (failures.has(store)) throw new Error("Store offline");
      return games;
    };
  }
  const adapters = {
    "epic-games": fetchStore("epic-games"),
    "prime-gaming": fetchStore("prime-gaming"),
    gog: fetchStore("gog"),
    steam: fetchStore("steam"),
  } satisfies StoreAdapters;
  const client = createDiscordClient(`test-${scenarioId++}`, APPLICATION, {
    getDatabase: () => database.db,
    clock,
  });
  const subscriptions = createSubscriptions(() => database.db, {
    clock,
    tokenFingerprint: client.tokenFingerprint,
  });
  await subscriptions.setup(GUILD, { channelId: CHANNEL, ...market, stores });
  const resolve = createGiveawayCacheScopeResolver(() => database.db, adapters, { clock });
  const options = { getDatabase: () => database.db, resolve, client, clock };
  const notifications = createNotifications(options);
  await notifications.runOnce();
  return {
    subscriptions,
    resolve,
    notifications,
    options,
    setGames: (items: Giveaway[]) => {
      games = items;
    },
    advance: (milliseconds = 3600001) => {
      time += milliseconds;
    },
    fail: (store: StoreId, enabled = true) => {
      if (enabled) failures.add(store);
      else failures.delete(store);
    },
    calls,
  };
}

describe("Giveaway Alerts", () => {
  it("baselines without backlog, checks hourly without traffic, and sends only new occurrences", async () => {
    const messages: object[] = [];
    globalThis.fetch = discordHttp(messages, []) as typeof fetch;
    let time = Date.now();
    let games: Giveaway[] = [freeGame({ id: "baseline" })];
    let calls = 0;
    const adapters = {
      "epic-games": async () => [],
      "prime-gaming": async () => [],
      gog: async () => [],
      steam: async () => {
        calls++;
        return games;
      },
    } satisfies StoreAdapters;
    const clock = () => new Date(time);
    const subscriptions = createSubscriptions(() => database.db);
    await subscriptions.setup(GUILD, {
      channelId: CHANNEL,
      locale: "en-US",
      country: "US",
      stores: ["steam"],
    });
    const resolve = createGiveawayCacheScopeResolver(() => database.db, adapters, { clock });
    const notifications = createNotifications({
      getDatabase: () => database.db,
      resolve,
      client: createDiscordClient("test", APPLICATION, { getDatabase: () => database.db, clock }),
      clock,
    });
    await notifications.runOnce();
    expect(messages).toHaveLength(0);
    expect(await subscriptions.status(GUILD)).toContain("steam: ready");
    games = [...games, freeGame({ id: "new", title: "New Giveaway" })];
    time += 3600001;
    await notifications.runOnce();
    expect(calls).toBe(2);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      embeds: [{ title: "New Giveaway" }],
      allowed_mentions: { parse: [] },
      enforce_nonce: true,
    });
    await notifications.runOnce();
    expect(messages).toHaveLength(1);
    expect(calls).toBe(2);
    await subscriptions.stop(GUILD);
  });

  it("retries explicit 429 non-acceptance after retry_after, with a stable destination nonce", async () => {
    const requests: object[] = [];
    const base = discordHttp([], []);
    globalThis.fetch = (async (input, init) => {
      if (init?.method === "POST") {
        requests.push(JSON.parse(String(init.body)));
        if (requests.length === 1) return Response.json({ retry_after: 10 }, { status: 429 });
      }
      return base(input, init);
    }) as typeof fetch;
    const test = await scenario();
    test.setGames([freeGame({ id: "rate-limited" })]);
    test.advance();
    await test.notifications.runOnce();
    await test.notifications.runOnce();
    expect(requests).toHaveLength(1);
    test.advance(10001);
    await createNotifications(test.options).runOnce();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
  });

  it("never resends a network-uncertain attempt across replicas or restart and reports unknown", async () => {
    let attempts = 0;
    const base = discordHttp([], []);
    globalThis.fetch = (async (input, init) => {
      if (init?.method === "POST") {
        attempts++;
        throw new Error("connection lost after acceptance");
      }
      return base(input, init);
    }) as typeof fetch;
    const test = await scenario();
    test.setGames([freeGame({ id: "uncertain" })]);
    test.advance();
    await Promise.all([test.notifications.runOnce(), createNotifications(test.options).runOnce()]);
    test.advance();
    await createNotifications(test.options).runOnce();
    expect(attempts).toBe(1);
    expect(await test.subscriptions.status(GUILD)).toContain("unknown");
  });

  it("recovers an expired started attempt as unknown, never as sendable work", async () => {
    let complete: ((response: Response) => void) | undefined;
    let started: (() => void) | undefined;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    let attempts = 0;
    const base = discordHttp([], []);
    globalThis.fetch = (async (input, init) => {
      if (init?.method === "POST") {
        attempts++;
        started?.();
        return await new Promise<Response>((resolve) => {
          complete = resolve;
        });
      }
      return base(input, init);
    }) as typeof fetch;
    const test = await scenario();
    test.setGames([freeGame({ id: "crash-window" })]);
    test.advance();
    const first = test.notifications.runOnce();
    await began;
    test.advance(60001);
    await createNotifications(test.options).runOnce();
    expect(await test.subscriptions.status(GUILD)).toContain("unknown");
    complete?.(Response.json({ id: "late-message" }));
    await first;
    expect(attempts).toBe(1);
  });

  it("expires old pending alerts even when the Giveaway is still available", async () => {
    const messages: object[] = [];
    globalThis.fetch = discordHttp(messages, []) as typeof fetch;
    const test = await scenario();
    test.setGames([freeGame({ id: "old-work" })]);
    test.advance();
    await test.resolve("steam", { locale: "en-US", country: "US" });
    expect(await test.subscriptions.status(GUILD)).toContain("pending");
    test.advance(25 * 3600000);
    await test.notifications.runOnce();
    expect(messages).toHaveLength(0);
    expect(await test.subscriptions.status(GUILD)).toContain("expired");
  });

  it("cancels queued alerts on destination replacement without catch-up", async () => {
    const messages: object[] = [];
    globalThis.fetch = discordHttp(messages, []) as typeof fetch;
    const test = await scenario();
    test.setGames([freeGame({ id: "before-move" })]);
    test.advance();
    await test.resolve("steam", { locale: "en-US", country: "US" });
    await test.subscriptions.setup(GUILD, {
      channelId: "100000000000000099",
      locale: "en-US",
      country: "US",
      stores: ["steam"],
    });
    expect(await test.subscriptions.status(GUILD)).toContain("cancelled");
    await test.notifications.runOnce();
    expect(messages).toHaveLength(0);
    expect(await test.subscriptions.status(GUILD)).toContain("steam: ready");
  });

  it("pauses sends globally on an invalid bot token without disabling subscriptions", async () => {
    let attempts = 0;
    const base = discordHttp([], []);
    globalThis.fetch = (async (input, init) => {
      if (init?.method === "POST") {
        attempts++;
        return new Response(null, { status: 401 });
      }
      return base(input, init);
    }) as typeof fetch;
    const test = await scenario();
    test.setGames([freeGame({ id: "token-1" }), freeGame({ id: "token-2" })]);
    test.advance();
    await test.notifications.runOnce();
    await createNotifications(test.options).runOnce();
    expect(attempts).toBe(1);
    expect(await test.subscriptions.status(GUILD)).toContain("invalid bot token");
    expect(await test.subscriptions.status(GUILD)).not.toContain("Disabled:");
  });

  it("disables a broken destination, stops repeated sends, and purges it after 30 days", async () => {
    let attempts = 0;
    const base = discordHttp([], []);
    globalThis.fetch = (async (input, init) => {
      if (init?.method === "POST") {
        attempts++;
        return Response.json({ code: 50013 }, { status: 403 });
      }
      return base(input, init);
    }) as typeof fetch;
    const test = await scenario();
    test.setGames([freeGame({ id: "broken-1" }), freeGame({ id: "broken-2" })]);
    test.advance();
    await test.notifications.runOnce();
    expect(attempts).toBe(1);
    expect(await test.subscriptions.status(GUILD)).toContain("Disabled:");
    test.advance(31 * 86400000);
    await test.notifications.runOnce();
    expect(await test.subscriptions.status(GUILD)).toContain("No subscription");
  });

  it("detects confirmed bot removal without alerts and purges server data", async () => {
    const base = discordHttp([], []);
    let removed = false;
    globalThis.fetch = (async (input, init) =>
      removed && String(input).endsWith(`/guilds/${GUILD}`)
        ? Response.json({ code: 10004 }, { status: 404 })
        : base(input, init)) as typeof fetch;
    const test = await scenario();
    removed = true;
    test.advance(86400001);
    await test.notifications.runOnce();
    expect(await test.subscriptions.status(GUILD)).toContain("No subscription");
  });

  it("sends compact French Prime alerts with safe catalog fallback and optional details", async () => {
    const messages: object[] = [];
    globalThis.fetch = discordHttp(messages, []) as typeof fetch;
    const test = await scenario(["prime-gaming"], { locale: "fr-FR", country: "FR" });
    test.setGames([
      freeGame({
        id: "prime-fr",
        title: "x".repeat(300),
        url: "javascript:alert(1)",
        images: { wide: "https://cdn.example/art.png", tall: null, thumbnail: null },
        price: { original: 1999, formatted: "19,99 €", currency: "EUR" },
      }),
    ]);
    test.advance();
    await test.notifications.runOnce();
    expect(messages[0]).toMatchObject({
      embeds: [
        {
          title: "x".repeat(256),
          url: "https://claim.anthonypillot.com/?store=prime-gaming",
          description: expect.stringContaining("Abonnement Prime requis"),
          image: { url: "https://cdn.example/art.png" },
          fields: [{ name: "Prix d’origine", value: "19,99 €" }],
        },
      ],
      allowed_mentions: { parse: [] },
    });
  });

  it("stops starting new delivery attempts when shutdown is requested", async () => {
    const messages: object[] = [];
    globalThis.fetch = discordHttp(messages, []) as typeof fetch;
    const test = await scenario();
    test.setGames([freeGame({ id: "shutdown" })]);
    test.advance();
    await test.resolve("steam", { locale: "en-US", country: "US" });
    const controller = new AbortController();
    controller.abort();
    await createNotifications({ ...test.options, signal: controller.signal }).runOnce();
    expect(messages).toHaveLength(0);
    expect(await test.subscriptions.status(GUILD)).toContain("pending");
  });

  it("uses the same clock for failed-refresh cooldowns and active Giveaway expiry", async () => {
    globalThis.fetch = discordHttp([], []) as typeof fetch;
    const test = await scenario();
    test.fail("steam");
    test.advance();
    await test.notifications.runOnce();
    await test.notifications.runOnce();
    expect(test.calls.get("steam")).toBe(2);
    test.fail("steam", false);
    test.advance(300001);
    test.setGames([
      freeGame({
        id: "already-expired",
        freeUntil: new Date(test.options.clock().getTime() - 1000).toISOString(),
      }),
    ]);
    expect(await test.resolve("steam", { locale: "en-US", country: "US" })).toEqual({
      availability: "available",
      giveaways: [],
    });
  });

  it("does not let a full batch from a rate-limited destination starve healthy servers", async () => {
    const healthyChannel = "200000000000000002";
    let healthy = 0;
    let blocked = 0;
    const base = discordHttp([], []);
    globalThis.fetch = (async (input, init) => {
      if (init?.method === "POST" && String(input).includes(`/channels/${CHANNEL}/`)) {
        blocked++;
        return Response.json({ retry_after: 3600 }, { status: 429 });
      }
      if (init?.method === "POST" && String(input).includes(`/channels/${healthyChannel}/`))
        healthy++;
      return base(input, init);
    }) as typeof fetch;
    const test = await scenario();
    await test.subscriptions.setup("200000000000000001", {
      channelId: healthyChannel,
      locale: "en-US",
      country: "US",
      stores: ["steam"],
    });
    await test.notifications.runOnce();
    test.setGames(Array.from({ length: 51 }, (_, index) => freeGame({ id: `batch-${index}` })));
    test.advance();
    await test.notifications.runOnce();
    await test.notifications.runOnce();
    expect(blocked).toBe(1);
    expect(healthy).toBeGreaterThan(0);
  });

  it("never shortens destination or global backoff when replica responses arrive out of order", async () => {
    const complete: ((response: Response) => void)[] = [];
    let bothStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      bothStarted = resolve;
    });
    let attempts = 0;
    const base = discordHttp([], []);
    globalThis.fetch = (async (input, init) => {
      if (init?.method === "POST") {
        attempts++;
        if (attempts <= 2)
          return await new Promise<Response>((resolve) => {
            complete.push(resolve);
            if (complete.length === 2) bothStarted?.();
          });
      }
      return base(input, init);
    }) as typeof fetch;
    const test = await scenario();
    test.setGames([freeGame({ id: "long-limit" }), freeGame({ id: "short-limit" })]);
    test.advance();
    const first = test.notifications.runOnce();
    const second = createNotifications(test.options).runOnce();
    await started;
    complete[0]?.(Response.json({ retry_after: 3600, global: true }, { status: 429 }));
    await Promise.race([first, second]);
    complete[1]?.(Response.json({ retry_after: 1, global: true }, { status: 429 }));
    await Promise.all([first, second]);
    test.advance(2000);
    await test.notifications.runOnce();
    expect(attempts).toBe(2);
  });

  it("honors a global removal-check 429 before any further Discord requests", async () => {
    let limited = false;
    let checks = 0;
    let sends = 0;
    const base = discordHttp([], []);
    globalThis.fetch = (async (input, init) => {
      if (limited && /\/guilds\/\d+$/.test(new URL(String(input)).pathname)) {
        checks++;
        return Response.json({ retry_after: 3600, global: true }, { status: 429 });
      }
      if (init?.method === "POST") sends++;
      return base(input, init);
    }) as typeof fetch;
    const test = await scenario();
    for (const guildId of ["200000000000000001", "300000000000000001"])
      await test.subscriptions.setup(guildId, {
        channelId: CHANNEL,
        locale: "en-US",
        country: "US",
        stores: ["steam"],
      });
    limited = true;
    test.advance(86400001);
    test.setGames([freeGame({ id: "after-rest-limit" })]);
    await test.notifications.runOnce();
    test.advance(2000);
    await createNotifications(test.options).runOnce();
    expect(checks).toBe(1);
    expect(sends).toBe(0);
  });

  it("reports Store refresh failures without discarding its established baseline", async () => {
    globalThis.fetch = discordHttp([], []) as typeof fetch;
    const test = await scenario();
    test.fail("steam");
    test.advance();
    await test.notifications.runOnce();
    expect(await test.subscriptions.status(GUILD)).toContain("steam: ready (refresh failed");
    test.fail("steam", false);
    test.advance(300001);
    await test.notifications.runOnce();
    expect(await test.subscriptions.status(GUILD)).not.toContain("refresh failed");
  });

  it("baselines failed Stores independently, including their eventual non-empty first success", async () => {
    const messages: DiscordMessage[] = [];
    globalThis.fetch = discordHttp(messages, []) as typeof fetch;
    const test = await scenario(["steam", "gog"], { locale: "en-US", country: "US" }, ["gog"]);
    expect(await test.subscriptions.status(GUILD)).toContain(
      "gog: waiting for baseline (refresh failed",
    );
    test.setGames([freeGame({ id: "healthy-first" })]);
    test.advance();
    await test.notifications.runOnce();
    expect(messages).toHaveLength(1);
    test.fail("gog", false);
    test.advance(300001);
    await test.notifications.runOnce();
    expect(messages).toHaveLength(1);
    expect(await test.subscriptions.status(GUILD)).toContain("gog: ready");
    test.setGames([freeGame({ id: "healthy-first" }), freeGame({ id: "after-both-baselines" })]);
    test.advance();
    await test.notifications.runOnce();
    expect(messages).toHaveLength(3);
  });

  it("suppresses extensions, transient gaps, and ambiguous returns but alerts a proven later period", async () => {
    const messages: DiscordMessage[] = [];
    globalThis.fetch = discordHttp(messages, []) as typeof fetch;
    const test = await scenario();
    const start = test.options.clock().getTime();
    function period(hours: number, title = "Recurring game"): Giveaway {
      return freeGame({
        id: "recurring",
        title,
        freeUntil: new Date(start + hours * 3600000).toISOString(),
      });
    }
    test.setGames([period(5)]);
    test.advance();
    await test.notifications.runOnce();
    test.setGames([]);
    test.advance();
    await test.notifications.runOnce();
    test.setGames([period(12, "Edited title")]);
    test.advance();
    await test.notifications.runOnce();
    expect(messages).toHaveLength(1);
    test.setGames([]);
    test.fail("steam");
    test.advance();
    await test.notifications.runOnce();
    test.fail("steam", false);
    test.setGames([period(20)]);
    test.advance(9 * 3600000);
    await test.notifications.runOnce();
    expect(messages).toHaveLength(1);
    test.setGames([]);
    test.advance(8 * 3600000);
    await test.notifications.runOnce();
    test.setGames([period(25)]);
    test.advance();
    await test.notifications.runOnce();
    expect(messages).toHaveLength(2);
    expect(messages[1]?.nonce).not.toBe(messages[0]?.nonce);
  });

  it("shares discovery between servers while keeping Store and Market occurrences independent", async () => {
    const messages: DiscordMessage[] = [];
    globalThis.fetch = discordHttp(messages, []) as typeof fetch;
    const test = await scenario();
    for (const settings of [
      {
        guildId: "200000000000000001",
        channelId: "200000000000000002",
        locale: "fr-FR",
        country: "FR",
        stores: ["steam"],
      },
      {
        guildId: "300000000000000001",
        channelId: "300000000000000002",
        locale: "en-US",
        country: "US",
        stores: ["gog"],
      },
      {
        guildId: "400000000000000001",
        channelId: "400000000000000002",
        locale: "en-US",
        country: "US",
        stores: ["steam"],
      },
    ] satisfies (Market & { guildId: string; channelId: string; stores: StoreId[] })[]) {
      await test.subscriptions.setup(settings.guildId, settings);
    }
    await test.notifications.runOnce();
    const steamCalls = test.calls.get("steam") ?? 0;
    const gogCalls = test.calls.get("gog") ?? 0;
    test.setGames([freeGame({ id: "same-listing-id" })]);
    test.advance();
    await Promise.all([test.notifications.runOnce(), createNotifications(test.options).runOnce()]);
    expect(messages).toHaveLength(4);
    expect((test.calls.get("steam") ?? 0) - steamCalls).toBe(2);
    expect((test.calls.get("gog") ?? 0) - gogCalls).toBe(1);
    expect(new Set(messages.map((message) => message.nonce)).size).toBe(4);
    expect(messages.some((message) => message.embeds?.[0]?.description.includes("Fin <t:"))).toBe(
      true,
    );
  });

  it("baselines newly selected Stores and a changed Market without catch-up", async () => {
    const messages: DiscordMessage[] = [];
    globalThis.fetch = discordHttp(messages, []) as typeof fetch;
    const test = await scenario();
    test.setGames([freeGame({ id: "existing-offer" })]);
    test.advance();
    await test.notifications.runOnce();
    await test.subscriptions.setup(GUILD, {
      channelId: CHANNEL,
      locale: "en-US",
      country: "US",
      stores: ["steam", "gog"],
    });
    const status = await test.subscriptions.status(GUILD);
    expect(status).toContain("steam: ready");
    expect(status).toContain("gog: waiting for baseline");
    await test.notifications.runOnce();
    expect(messages).toHaveLength(1);
    await test.subscriptions.setup(GUILD, {
      channelId: CHANNEL,
      locale: "fr-FR",
      country: "FR",
      stores: ["steam", "gog"],
    });
    await test.notifications.runOnce();
    expect(messages).toHaveLength(1);
    test.setGames([freeGame({ id: "existing-offer" }), freeGame({ id: "new-fr-offer" })]);
    test.advance();
    await test.notifications.runOnce();
    expect(messages).toHaveLength(3);
  });

  it("includes newly supported Stores in All-Stores mode with a silent fresh baseline", async () => {
    const messages: DiscordMessage[] = [];
    globalThis.fetch = discordHttp(messages, []) as typeof fetch;
    const test = await scenario(null);
    // Arrange a migrated All-Stores subscription whose persisted follows predate Steam support.
    await database.db
      .delete(discordFollows)
      .where(and(eq(discordFollows.guildId, GUILD), eq(discordFollows.store, "steam")));
    test.setGames([freeGame({ id: "new-store-baseline" })]);
    await test.notifications.runOnce();
    expect(
      messages.filter((message) => message.embeds?.[0]?.description.startsWith("Steam")),
    ).toHaveLength(0);
    expect(await test.subscriptions.status(GUILD)).toContain("steam: ready");
    test.setGames([freeGame({ id: "new-store-baseline" }), freeGame({ id: "new-store-next" })]);
    test.advance();
    await test.notifications.runOnce();
    expect(
      messages.filter((message) => message.embeds?.[0]?.description.startsWith("Steam")),
    ).toHaveLength(1);
  });

  it("does not requeue an observed occurrence when old diagnostics are purged", async () => {
    const messages: object[] = [];
    globalThis.fetch = discordHttp(messages, []) as typeof fetch;
    const test = await scenario();
    test.setGames([
      freeGame({
        id: "long-running",
        freeUntil: new Date(test.options.clock().getTime() + 60 * 86400000).toISOString(),
      }),
    ]);
    test.advance();
    await test.notifications.runOnce();
    test.advance(31 * 86400000);
    await test.notifications.runOnce();
    expect(messages).toHaveLength(1);
    expect(await test.subscriptions.status(GUILD)).toContain("Recent deliveries: none");
  });

  it("cancels safely retryable work when a successful observation withdraws the Giveaway", async () => {
    let attempts = 0;
    const base = discordHttp([], []);
    globalThis.fetch = (async (input, init) => {
      if (init?.method === "POST") {
        attempts++;
        return Response.json(
          { retry_after: 1 },
          { status: 429, headers: { "retry-after": "10", "x-ratelimit-reset-after": "20" } },
        );
      }
      return base(input, init);
    }) as typeof fetch;
    const test = await scenario();
    test.setGames([freeGame({ id: "withdrawn" })]);
    test.advance();
    await test.notifications.runOnce();
    test.advance(10001);
    await test.notifications.runOnce();
    expect(attempts).toBe(1);
    test.setGames([]);
    test.advance();
    await test.notifications.runOnce();
    expect(attempts).toBe(1);
    expect(await test.subscriptions.status(GUILD)).toContain("cancelled");
  });

  it("repairs a disabled subscription with fresh baselines instead of replaying old work", async () => {
    const messages: object[] = [];
    const base = discordHttp(messages, []);
    let broken = true;
    globalThis.fetch = (async (input, init) =>
      broken && init?.method === "POST"
        ? new Response(null, { status: 403 })
        : base(input, init)) as typeof fetch;
    const test = await scenario();
    test.setGames([freeGame({ id: "before-repair" })]);
    test.advance();
    await test.notifications.runOnce();
    broken = false;
    await test.subscriptions.setup(GUILD, {
      channelId: CHANNEL,
      locale: "en-US",
      country: "US",
      stores: ["steam"],
    });
    await test.notifications.runOnce();
    expect(messages).toHaveLength(0);
    test.setGames([freeGame({ id: "before-repair" }), freeGame({ id: "after-repair" })]);
    test.advance();
    await test.notifications.runOnce();
    expect(messages).toHaveLength(1);
  });

  it("preserves a late destination embargo across an in-flight settings revision", async () => {
    let complete: ((response: Response) => void) | undefined;
    let began: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    let attempts = 0;
    const base = discordHttp([], []);
    globalThis.fetch = (async (input, init) => {
      if (init?.method === "POST") {
        attempts++;
        if (attempts === 1) {
          began?.();
          return await new Promise<Response>((resolve) => {
            complete = resolve;
          });
        }
      }
      return base(input, init);
    }) as typeof fetch;
    const test = await scenario();
    test.setGames([freeGame({ id: "revision-1" }), freeGame({ id: "revision-2" })]);
    test.advance();
    const running = test.notifications.runOnce();
    await started;
    await test.subscriptions.setup(GUILD, {
      channelId: CHANNEL,
      locale: "en-US",
      country: "US",
      stores: ["steam", "gog"],
    });
    complete?.(Response.json({ retry_after: 3600 }, { status: 429 }));
    await running;
    test.advance(2000);
    await test.notifications.runOnce();
    expect(attempts).toBe(1);
  });

  it("rechecks a global embargo between removal checks across replicas", async () => {
    const complete: { resolve: (response: Response) => void; guildId: string }[] = [];
    let began: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    let concurrent = false;
    let checks = 0;
    const base = discordHttp([], []);
    globalThis.fetch = (async (input, init) => {
      const match = /\/guilds\/(\d+)$/.exec(String(input));
      if (concurrent && match?.[1]) {
        checks++;
        if (checks <= 2)
          return await new Promise<Response>((resolve) => {
            complete.push({ resolve, guildId: match[1]! });
            if (complete.length === 2) began?.();
          });
        return Response.json({ id: match[1] });
      }
      return base(input, init);
    }) as typeof fetch;
    const test = await scenario();
    for (const guildId of ["200000000000000001", "300000000000000001", "400000000000000001"])
      await test.subscriptions.setup(guildId, {
        channelId: CHANNEL,
        locale: "en-US",
        country: "US",
        stores: ["steam"],
      });
    concurrent = true;
    const first = test.notifications.runOnce();
    const second = createNotifications(test.options).runOnce();
    await started;
    complete[0]?.resolve(Response.json({ retry_after: 3600, global: true }, { status: 429 }));
    await Promise.race([first, second]);
    complete[1]?.resolve(Response.json({ id: complete[1].guildId }));
    await Promise.all([first, second]);
    expect(checks).toBe(2);
  });

  it("honors absolute reset and global scope headers even with a malformed 429 body", async () => {
    let resetAt = 0;
    let attempts = 0;
    const base = discordHttp([], []);
    globalThis.fetch = (async (input, init) => {
      if (init?.method === "POST" && ++attempts === 1)
        return new Response("not JSON", {
          status: 429,
          headers: { "x-ratelimit-reset": String(resetAt / 1000), "x-ratelimit-scope": "global" },
        });
      return base(input, init);
    }) as typeof fetch;
    const test = await scenario();
    await test.subscriptions.setup("200000000000000001", {
      channelId: "200000000000000002",
      locale: "en-US",
      country: "US",
      stores: ["steam"],
    });
    await test.notifications.runOnce();
    test.setGames([freeGame({ id: "header-limited" })]);
    test.advance();
    resetAt = test.options.clock().getTime() + 60000;
    await test.notifications.runOnce();
    test.advance(2000);
    await test.notifications.runOnce();
    expect(attempts).toBe(1);
    test.advance(60001);
    await test.notifications.runOnce();
    expect(attempts).toBe(3);
  });
});
