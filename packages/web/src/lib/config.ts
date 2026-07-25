import { dev } from "$app/environment";
import { env } from "$env/dynamic/public";

type PublicUrlName = "PUBLIC_API_URL" | "PUBLIC_WEB_URL";

function requirePublicUrl(name: PublicUrlName): string {
  const value = env[name];
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
