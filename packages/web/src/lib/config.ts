import { dev } from "$app/environment";
import { env } from "$env/dynamic/public";

type PublicOriginName = "PUBLIC_API_URL" | "PUBLIC_WEB_URL";
type PublicConfigName = PublicOriginName | "PUBLIC_PLAUSIBLE_SCRIPT_URL";
type PublicEnvironment = Partial<Record<PublicConfigName, string>>;

function requirePublicUrl(name: PublicOriginName, environment: PublicEnvironment = env): string {
  const value = environment[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) origin`);
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${name} must be a valid HTTP(S) origin`);
  }

  return url.origin;
}

export function getApiUrl(path: `/${string}`): string {
  const baseUrl = dev ? "/api" : requirePublicUrl("PUBLIC_API_URL");
  return `${baseUrl}${path}`;
}

export function getWebUrl(path: `/${string}`, developmentOrigin: string): string {
  const baseUrl = dev ? developmentOrigin : requirePublicUrl("PUBLIC_WEB_URL");
  return new URL(path, baseUrl).toString();
}

export function resolvePlausibleScriptUrl(
  development: boolean,
  environment: PublicEnvironment,
): string | null {
  if (development) return null;

  const value = environment.PUBLIC_PLAUSIBLE_SCRIPT_URL;
  if (!value) {
    throw new Error("PUBLIC_PLAUSIBLE_SCRIPT_URL is not set");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PUBLIC_PLAUSIBLE_SCRIPT_URL must be a valid HTTP(S) script URL");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname === "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("PUBLIC_PLAUSIBLE_SCRIPT_URL must be a valid HTTP(S) script URL");
  }

  return url.toString();
}

export function getPlausibleScriptUrl(): string | null {
  return resolvePlausibleScriptUrl(dev, env);
}
