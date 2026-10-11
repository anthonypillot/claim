import { Value } from "@sinclair/typebox/value";
import { t } from "elysia";
import { createHash } from "node:crypto";
import { getDb, type Database } from "../../db/client.ts";

import type { DiscordMessage } from "./model.ts";
import { ADMINISTRATOR, DESTINATION_PERMISSIONS } from "./permissions.ts";
import { createDiscordRateLimits } from "./rate-limits.ts";

const REQUEST_TIMEOUT_MS = 10_000;
const MINIMUM_BACKOFF_MS = 1_000;
const MAX_REPLY_LENGTH = 2_000;

const GUILD_TEXT_CHANNEL_TYPE = 0;
const ROLE_OVERWRITE_TYPE = 0;
const MEMBER_OVERWRITE_TYPE = 1;

const MessageSchema = t.Object({ id: t.String() });

const UserSchema = t.Object({ id: t.String() });

const GuildSchema = t.Object({
  id: t.String(),
  owner_id: t.String(),
  roles: t.Array(t.Object({ id: t.String(), permissions: t.String({ pattern: "^\\d+$" }) })),
});

const MemberSchema = t.Object({
  roles: t.Array(t.String()),
  communication_disabled_until: t.Optional(t.Nullable(t.String())),
});

const ChannelSchema = t.Object({
  id: t.String(),
  guild_id: t.String(),
  type: t.Number(),
  permission_overwrites: t.Array(
    t.Object({
      id: t.String(),
      type: t.Number(),
      allow: t.String({ pattern: "^\\d+$" }),
      deny: t.String({ pattern: "^\\d+$" }),
    }),
  ),
});

const RateLimitSchema = t.Object({
  retry_after: t.Number({ minimum: 0 }),
  global: t.Optional(t.Boolean()),
});

const ErrorSchema = t.Object({ code: t.Number() });

type RetryOutcome = { kind: "retry"; retryAfterMs: number; global: boolean };

export type SendOutcome =
  | { kind: "sent"; messageId: string; retryAfterMs: number }
  | RetryOutcome
  | { kind: "unknown" | "invalid-token" | "inaccessible" | "rejected" };

type PresenceOutcome = RetryOutcome | { kind: "present" | "removed" | "invalid-token" | "unknown" };

type RateLimitResponse = { headers: Pick<Headers, "get">; json: Response["json"] };

type PermissionOverwrite = (typeof ChannelSchema.static.permission_overwrites)[number];

type DestinationAccess = {
  guild: typeof GuildSchema.static;
  member: typeof MemberSchema.static;
  channel: typeof ChannelSchema.static;
  botUserId: string;
  clock: () => Date;
};

function applyPermissionOverwrite(
  permissions: bigint,
  overwrite: PermissionOverwrite | undefined,
): bigint {
  if (!overwrite) return permissions;

  return (permissions & ~BigInt(overwrite.deny)) | BigInt(overwrite.allow);
}

function canSendEmbedsToDestination(access: DestinationAccess): boolean {
  const { guild, member, channel, botUserId, clock } = access;

  const everyoneRole = guild.roles.find((role) => role.id === guild.id);
  if (!everyoneRole) return false;

  let permissions = BigInt(everyoneRole.permissions);

  for (const role of guild.roles) {
    if (member.roles.includes(role.id)) permissions |= BigInt(role.permissions);
  }

  if (guild.owner_id === botUserId || (permissions & ADMINISTRATOR) !== 0n) {
    return true;
  }

  // Discord applies @everyone, combined role, then member-specific overwrites in this order.
  const everyoneOverwrite = channel.permission_overwrites.find(
    (overwrite) => overwrite.type === ROLE_OVERWRITE_TYPE && overwrite.id === guild.id,
  );
  permissions = applyPermissionOverwrite(permissions, everyoneOverwrite);

  let roleAllow = 0n;
  let roleDeny = 0n;

  for (const overwrite of channel.permission_overwrites) {
    if (overwrite.type !== ROLE_OVERWRITE_TYPE || !member.roles.includes(overwrite.id)) continue;

    roleAllow |= BigInt(overwrite.allow);
    roleDeny |= BigInt(overwrite.deny);
  }

  permissions = (permissions & ~roleDeny) | roleAllow;

  const memberOverwrite = channel.permission_overwrites.find(
    (overwrite) => overwrite.type === MEMBER_OVERWRITE_TYPE && overwrite.id === botUserId,
  );
  permissions = applyPermissionOverwrite(permissions, memberOverwrite);

  if (
    member.communication_disabled_until &&
    Date.parse(member.communication_disabled_until) > clock().getTime()
  ) {
    return false;
  }

  return (permissions & DESTINATION_PERMISSIONS) === DESTINATION_PERMISSIONS;
}

function rateLimitHeaderDelay(response: RateLimitResponse, now = Date.now()): number {
  const resetAfterSeconds = Number(response.headers.get("x-ratelimit-reset-after"));
  const resetEpochSeconds = Number(response.headers.get("x-ratelimit-reset"));
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : 0;
  const retryDelayMs = Number.isFinite(retryAfterSeconds)
    ? retryAfterSeconds * 1000
    : Math.max(0, Date.parse(retryAfterHeader ?? "") - now);

  return Math.max(
    0,
    Number.isFinite(resetAfterSeconds) ? resetAfterSeconds * 1000 : 0,
    Number.isFinite(resetEpochSeconds) ? resetEpochSeconds * 1000 - now : 0,
    Number.isFinite(retryDelayMs) ? retryDelayMs : 0,
  );
}

async function rateLimitOutcome(
  response: RateLimitResponse,
  now = Date.now(),
): Promise<RetryOutcome> {
  let retryAfterMs = Math.max(MINIMUM_BACKOFF_MS, rateLimitHeaderDelay(response, now));
  let global =
    response.headers.get("x-ratelimit-global") === "true" ||
    response.headers.get("x-ratelimit-scope") === "global";

  try {
    const body = await response.json();

    if (Value.Check(RateLimitSchema, body)) {
      retryAfterMs = Math.max(retryAfterMs, body.retry_after * 1000);
      global ||= body.global ?? false;
    }
  } catch {
    /* Explicit 429 proves non-acceptance even when its body is malformed. */
  }

  return { kind: "retry", retryAfterMs, global };
}

type DiscordClientOptions = {
  signal?: AbortSignal;
  getDatabase?: () => Database;
  clock?: () => Date;
};

export function createDiscordClient(
  token: string,
  applicationId: string,
  options: DiscordClientOptions = {},
) {
  const tokenFingerprint = createHash("sha256").update(token).digest("hex");
  const clock = options.clock ?? (() => new Date());
  const limits = createDiscordRateLimits(options.getDatabase ?? getDb, tokenFingerprint, clock);

  async function recordBotResponseLimits(path: string, response: Response): Promise<void> {
    if (response.status === 429) {
      const outcome = await rateLimitOutcome(response.clone(), clock().getTime());
      await limits.postpone(path, outcome.retryAfterMs, outcome.global);
      return;
    }

    if (response.status === 401) {
      await limits.pause();
      return;
    }

    if (response.headers.get("x-ratelimit-remaining") !== "0") return;

    const retryAfterMs = Math.max(
      MINIMUM_BACKOFF_MS,
      rateLimitHeaderDelay(response, clock().getTime()),
    );
    await limits.postpone(path, retryAfterMs, false);
  }

  async function request(path: string, method = "GET", body?: object): Promise<Response> {
    // Interaction webhooks have their own token and are exempt from the bot's global rate limit.
    const isInteractionWebhook = path.startsWith("/webhooks/");
    if (!isInteractionWebhook) {
      const blocked = await limits.check(path);
      if (blocked) return blocked;
    }

    const response = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: {
        ...(!isInteractionWebhook ? { authorization: `Bot ${token}` } : {}),
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!isInteractionWebhook) await recordBotResponseLimits(path, response);

    return response;
  }

  async function send(channelId: string, message: DiscordMessage): Promise<SendOutcome> {
    try {
      const response = await request(`/channels/${channelId}/messages`, "POST", message);

      if (response.status === 429) return await rateLimitOutcome(response, clock().getTime());
      if (response.status === 401) return { kind: "invalid-token" };
      if (response.status === 403 || response.status === 404) return { kind: "inaccessible" };
      if (!response.ok) return { kind: response.status >= 500 ? "unknown" : "rejected" };

      const body = await response.json();
      if (!Value.Check(MessageSchema, body)) return { kind: "unknown" };

      return {
        kind: "sent",
        messageId: body.id,
        retryAfterMs:
          response.headers.get("x-ratelimit-remaining") === "0"
            ? rateLimitHeaderDelay(response, clock().getTime())
            : 0,
      };
    } catch {
      return { kind: "unknown" };
    }
  }

  async function reply(interactionToken: string, content: string): Promise<void> {
    const response = await request(
      `/webhooks/${applicationId}/${encodeURIComponent(interactionToken)}/messages/@original`,
      "PATCH",
      {
        content: content.slice(0, MAX_REPLY_LENGTH),
        allowed_mentions: { parse: [] },
      },
    );
    if (!response.ok) throw new Error("Discord rejected interaction response");
  }

  async function validateDestination(guildId: string, channelId: string): Promise<boolean> {
    const channelResponse = await request(`/channels/${channelId}`);
    if (!channelResponse.ok) return false;

    const channel = await channelResponse.json();

    if (
      !Value.Check(ChannelSchema, channel) ||
      channel.guild_id !== guildId ||
      channel.id !== channelId ||
      channel.type !== GUILD_TEXT_CHANNEL_TYPE
    ) {
      return false;
    }

    const userResponse = await request("/users/@me");
    if (!userResponse.ok) return false;

    const user = await userResponse.json();
    if (!Value.Check(UserSchema, user)) return false;

    const guildResponse = await request(`/guilds/${guildId}`);
    if (!guildResponse.ok) return false;

    const guild = await guildResponse.json();
    if (!Value.Check(GuildSchema, guild) || guild.id !== guildId) return false;

    const memberResponse = await request(`/guilds/${guildId}/members/${user.id}`);
    if (!memberResponse.ok) return false;

    const member = await memberResponse.json();
    if (!Value.Check(MemberSchema, member)) return false;

    return canSendEmbedsToDestination({ guild, member, channel, botUserId: user.id, clock });
  }

  async function presence(guildId: string): Promise<PresenceOutcome> {
    try {
      const response = await request(`/guilds/${guildId}`);

      if (response.status === 429) return await rateLimitOutcome(response, clock().getTime());
      if (response.status === 401) return { kind: "invalid-token" };

      const body = await response.json();

      if (response.ok && Value.Check(UserSchema, body) && body.id === guildId)
        return { kind: "present" };

      if (
        (response.status === 403 || response.status === 404) &&
        Value.Check(ErrorSchema, body) &&
        (body.code === 10004 || body.code === 50001)
      )
        return { kind: "removed" };

      return { kind: "unknown" };
    } catch {
      return { kind: "unknown" };
    }
  }

  return {
    request,
    send,
    reply,
    validateDestination,
    presence,
    tokenFingerprint,
  };
}

export type DiscordClient = ReturnType<typeof createDiscordClient>;
