import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { Elysia } from "elysia";
import { buildApp } from "../../app.ts";

import { createTestDatabase } from "../../db/testing.ts";
import { createDiscordClient } from "./client.ts";
import { createDiscordCommands } from "./commands.ts";
import {
  APPLICATION,
  CHANNEL,
  GUILD,
  discordHttp,
  interaction,
  publicKey,
  signedRequest,
} from "./fixtures.ts";
import { createDiscordInteractions } from "./index.ts";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
const originalFetch = globalThis.fetch;
beforeAll(async () => {
  database = await createTestDatabase();
});
afterAll(async () => {
  await database.close();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Discord signed interactions", () => {
  it("composes configured interactions without starting monitoring or needing database credentials", async () => {
    const metadata = { name: "claim", version: "test", description: "test" };
    const plugin = createDiscordInteractions({ publicKey, applicationId: APPLICATION });
    const app = buildApp(metadata, { discord: plugin });
    expect((await app.handle(signedRequest({ type: 1 }))).status).toBe(200);
    expect((await app.handle(new Request("http://localhost/health"))).status).toBe(200);
    expect((await buildApp(metadata).handle(signedRequest({ type: 1 }))).status).toBe(404);
  });
  it("answers a signed PING without a database and rejects raw-body tampering", async () => {
    const app = new Elysia().use(createDiscordInteractions({ publicKey, applicationId: "100" }));
    const body = { type: 1 };
    const response = await app.handle(signedRequest(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: 1 });
    expect((await app.handle(signedRequest(body, true))).status).toBe(401);
  });

  it("defers setup privately, confirms once publicly, and supports status and stop", async () => {
    const messages: object[] = [];
    const replies: object[] = [];
    globalThis.fetch = discordHttp(messages, replies) as typeof fetch;
    const client = createDiscordClient("test-token", APPLICATION, {
      getDatabase: () => database.db,
    });
    const commands = createDiscordCommands(() => database.db, client);
    const plugin = createDiscordInteractions({ publicKey, applicationId: APPLICATION, commands });
    const app = new Elysia().use(plugin);
    const setup = interaction("setup", [{ name: "channel", type: 7, value: CHANNEL }]);
    expect(await (await app.handle(signedRequest(setup))).json()).toEqual({
      type: 5,
      data: { flags: 64 },
    });
    await plugin.decorator.discord.drain();
    await app.handle(signedRequest(setup));
    await plugin.decorator.discord.drain();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      allowed_mentions: { parse: [] },
      content: expect.stringContaining("English"),
    });
    await app.handle(signedRequest(interaction("status")));
    await plugin.decorator.discord.drain();
    expect(replies.at(-1)).toMatchObject({ content: expect.stringContaining(CHANNEL) });
    await app.handle(signedRequest(interaction("stop")));
    await plugin.decorator.discord.drain();
    await app.handle(signedRequest(interaction("status")));
    await plugin.decorator.discord.drain();
    expect(replies.at(-1)).toMatchObject({ content: expect.stringContaining("No subscription") });
  });

  it("rejects non-admins, foreign channels, threads, and denied destination permissions", async () => {
    const messages: object[] = [];
    const replies: object[] = [];
    const base = discordHttp(messages, replies);
    let channelDetails = {
      id: CHANNEL,
      guild_id: "foreign",
      type: 0,
      permission_overwrites: [] as object[],
    };
    globalThis.fetch = (async (input, init) =>
      String(input).endsWith(`/channels/${CHANNEL}`)
        ? Response.json(channelDetails)
        : base(input, init)) as typeof fetch;
    const plugin = createDiscordInteractions({
      publicKey,
      applicationId: APPLICATION,
      commands: createDiscordCommands(
        () => database.db,
        createDiscordClient("test", APPLICATION, { getDatabase: () => database.db }),
      ),
    });
    const app = new Elysia().use(plugin);
    const options = [{ name: "channel", type: 7, value: CHANNEL }];
    const denied = await app.handle(
      signedRequest(interaction("setup", options, { member: { permissions: "0" } })),
    );
    expect(await denied.json()).toMatchObject({
      type: 4,
      data: { flags: 64, content: expect.stringContaining("permission") },
    });
    for (const details of [
      channelDetails,
      { ...channelDetails, guild_id: GUILD, type: 11 },
      {
        ...channelDetails,
        guild_id: GUILD,
        permission_overwrites: [{ id: GUILD, type: 0, allow: "0", deny: "2048" }],
      },
    ]) {
      channelDetails = details;
      await app.handle(signedRequest(interaction("setup", options)));
      await plugin.decorator.discord.drain();
    }
    expect(messages).toHaveLength(0);
    expect(replies).toHaveLength(3);
  });

  it("saves a non-empty Store selection and French/France preferences", async () => {
    const messages: object[] = [];
    const replies: object[] = [];
    globalThis.fetch = discordHttp(messages, replies) as typeof fetch;
    const plugin = createDiscordInteractions({
      publicKey,
      applicationId: APPLICATION,
      commands: createDiscordCommands(
        () => database.db,
        createDiscordClient("test", APPLICATION, { getDatabase: () => database.db }),
      ),
    });
    const app = new Elysia().use(plugin);
    await app.handle(
      signedRequest(
        interaction("setup", [
          { name: "channel", type: 7, value: CHANNEL },
          { name: "stores", type: 3, value: "steam,gog" },
          { name: "market", type: 3, value: "fr-FR" },
        ]),
      ),
    );
    await plugin.decorator.discord.drain();
    expect(messages[0]).toMatchObject({ content: expect.stringContaining("Français") });
    await app.handle(signedRequest(interaction("status")));
    await plugin.decorator.discord.drain();
    expect(replies.at(-1)).toMatchObject({
      content: expect.stringContaining("fr-FR/FR\nStores: steam, gog"),
    });
    const invalid = interaction("setup", [
      { name: "channel", type: 7, value: CHANNEL },
      { name: "stores", type: 3, value: "invalid" },
    ]);
    await app.handle(signedRequest(invalid));
    await plugin.decorator.discord.drain();
    expect(messages).toHaveLength(1);
  });

  it("rejects unsigned, stale, wrong-application, private, and oversized interactions", async () => {
    const app = new Elysia().use(
      createDiscordInteractions({ publicKey, applicationId: APPLICATION }),
    );
    expect(
      (
        await app.handle(
          new Request("http://localhost/discord/interactions", { method: "POST", body: "{}" }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await app.handle(
          signedRequest({ type: 1 }, false, String(Math.floor(Date.now() / 1000) - 3600)),
        )
      ).status,
    ).toBe(401);
    expect(
      (await app.handle(signedRequest(interaction("stop", [], { application_id: "wrong" }))))
        .status,
    ).toBe(400);
    expect(
      (await app.handle(signedRequest(interaction("stop", [], { guild_id: undefined })))).status,
    ).toBe(400);
    expect((await app.handle(signedRequest({ type: 1, padding: "x".repeat(65536) }))).status).toBe(
      413,
    );
  });

  it("acknowledges an administrator privately before waiting for destination HTTP", async () => {
    const messages: object[] = [];
    const base = discordHttp(messages, []);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = (async (input, init) => {
      if (String(input).endsWith(`/channels/${CHANNEL}`)) await gate;
      return base(input, init);
    }) as typeof fetch;
    const plugin = createDiscordInteractions({
      publicKey,
      applicationId: APPLICATION,
      commands: createDiscordCommands(
        () => database.db,
        createDiscordClient("test", APPLICATION, { getDatabase: () => database.db }),
      ),
    });
    const app = new Elysia().use(plugin);
    try {
      const response = await app.handle(
        signedRequest(
          interaction("setup", [{ name: "channel", type: 7, value: CHANNEL }], {
            member: { permissions: "8" },
          }),
        ),
      );
      expect(await response.json()).toEqual({ type: 5, data: { flags: 64 } });
      expect(messages).toHaveLength(0);
    } finally {
      release?.();
      await plugin.decorator.discord.drain();
    }
    expect(messages).toHaveLength(1);
  });

  it("persists setup confirmation backoff and applies it to a different API replica", async () => {
    let botRequests = 0;
    const replies: object[] = [];
    const base = discordHttp([], replies);
    globalThis.fetch = (async (input, init) => {
      if (!String(input).includes("/webhooks/")) botRequests++;
      if (init?.method === "POST")
        return Response.json({ retry_after: 3600, global: true }, { status: 429 });
      return base(input, init);
    }) as typeof fetch;
    for (const invocation of [0, 1]) {
      const client = createDiscordClient("setup-rate-limit", APPLICATION, {
        getDatabase: () => database.db,
      });
      const plugin = createDiscordInteractions({
        publicKey,
        applicationId: APPLICATION,
        commands: createDiscordCommands(() => database.db, client),
      });
      await new Elysia()
        .use(plugin)
        .handle(
          signedRequest(interaction("setup", [{ name: "channel", type: 7, value: CHANNEL }])),
        );
      await plugin.decorator.discord.drain();
      expect(botRequests).toBe(5);
      expect(replies).toHaveLength(invocation + 1);
    }
  });

  it("rejects a signed request that ages out while its raw body is arriving", async () => {
    const app = new Elysia().use(
      createDiscordInteractions({ publicKey, applicationId: APPLICATION }),
    );
    const signed = signedRequest({ type: 1 });
    let release: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        release = () => {
          controller.enqueue(new TextEncoder().encode('{"type":1}'));
          controller.close();
        };
      },
    });
    const request = new Request(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: stream,
    });
    const now = Date.now();
    let readClock: (() => void) | undefined;
    const checked = new Promise<void>((resolve) => {
      readClock = resolve;
    });
    const clock = spyOn(Date, "now").mockImplementation(() => {
      readClock?.();
      return now;
    });
    try {
      const response = app.handle(request);
      await checked;
      clock.mockReturnValue(now + 3600000);
      release?.();
      expect((await response).status).toBe(401);
    } finally {
      clock.mockRestore();
    }
  });
});
