import { generateKeyPairSync, sign } from "node:crypto";

import type { Giveaway } from "../giveaways/model.ts";

const keys = generateKeyPairSync("ed25519");
export const publicKey = keys.publicKey
  .export({ type: "spki", format: "der" })
  .subarray(-32)
  .toString("hex");
export const GUILD = "100000000000000001";
export const CHANNEL = "100000000000000002";
export const APPLICATION = "100000000000000003";
export const BOT = "100000000000000004";
let sequence = 0;

export function interaction(
  command: string,
  options: object[] = [],
  overrides: object = {},
): object {
  return {
    id: String(100000000000000010n + BigInt(sequence++)),
    application_id: APPLICATION,
    type: 2,
    token: "transient-token",
    guild_id: GUILD,
    member: { permissions: "32" },
    data: { name: "claim", options: [{ name: command, type: 1, options }] },
    ...overrides,
  };
}

export function signedRequest(
  payload: object,
  tamper = false,
  timestamp = String(Math.floor(Date.now() / 1000)),
): Request {
  const body = JSON.stringify(payload);
  return new Request("http://localhost/discord/interactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature-ed25519": sign(null, Buffer.from(timestamp + body), keys.privateKey).toString(
        "hex",
      ),
      "x-signature-timestamp": timestamp,
    },
    body: tamper ? body + " " : body,
  });
}

export function freeGame(overrides: Partial<Giveaway> = {}): Giveaway {
  return {
    id: "game-1",
    title: "A Free Game",
    description: "",
    seller: "Steam",
    url: "https://store.steampowered.com/app/1",
    images: { wide: null, tall: null, thumbnail: null },
    price: null,
    freeUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
    ...overrides,
  };
}

export function discordHttp(messages: object[], replies: object[]) {
  return async function fetchDiscord(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const path = new URL(String(input)).pathname;
    if (init?.method === "POST" && path.endsWith("/messages")) {
      messages.push(JSON.parse(String(init.body)));
      return Response.json({ id: String(900000000000000001n + BigInt(messages.length)) });
    }
    if (init?.method === "PATCH") {
      replies.push(JSON.parse(String(init.body)));
      return Response.json({ id: "900000000000000001" });
    }
    if (path.endsWith("/users/@me")) return Response.json({ id: BOT });
    if (path.endsWith(`/channels/${CHANNEL}`))
      return Response.json({
        id: CHANNEL,
        guild_id: GUILD,
        type: 0,
        permission_overwrites: [],
      });
    if (path.endsWith(`/guilds/${GUILD}`))
      return Response.json({
        id: GUILD,
        owner_id: "owner",
        roles: [{ id: GUILD, permissions: "19456" }],
      });
    if (path.endsWith(`/members/${BOT}`)) return Response.json({ roles: [], user: { id: BOT } });
    throw new Error(`Unexpected Discord request: ${path}`);
  };
}
