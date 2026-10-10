import { env } from "$env/dynamic/private";

export type DiscordPublicInformation = { installUrl: string | null; supportUrl: string | null };
const VIEW_CHANNEL = 1 << 10;
const SEND_MESSAGES = 1 << 11;
const EMBED_LINKS = 1 << 14;

export function getDiscordPublicInformation(): DiscordPublicInformation {
  if (env.DISCORD_PUBLIC_INSTALL_ENABLED !== "true") return { installUrl: null, supportUrl: null };
  const applicationId = env.DISCORD_APPLICATION_ID ?? "";
  if (!/^\d{1,20}$/.test(applicationId))
    throw new Error("DISCORD_APPLICATION_ID is required for public Discord installation");
  const support = new URL(env.DISCORD_SUPPORT_URL ?? "");
  if (support.protocol !== "https:" || support.username || support.password)
    throw new Error("DISCORD_SUPPORT_URL must be a credential-free HTTPS support form URL");
  const install = new URL("https://discord.com/oauth2/authorize");
  install.searchParams.set("client_id", applicationId);
  install.searchParams.set("scope", "bot applications.commands");
  install.searchParams.set("permissions", String(VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS));
  install.searchParams.set("integration_type", "0");
  return { installUrl: install.href, supportUrl: support.href };
}
