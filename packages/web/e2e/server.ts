import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { GiveawaysResponse } from "../src/lib/giveaways/model";

// This fixture serves the built Node application so SSR fetches hit the stub too.
const api = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/tracker.js") {
    response.writeHead(200, { "Content-Type": "application/javascript" }).end("");
    return;
  }

  const locale = url.searchParams.get("locale");
  const country = url.searchParams.get("country");
  if (
    url.pathname !== "/giveaways" ||
    !((locale === "en-US" && country === "US") || (locale === "fr-FR" && country === "FR"))
  ) {
    response.writeHead(422).end("Expected an explicit supported locale and country");
    return;
  }

  const french = locale === "fr-FR";
  const body = {
    count: 1,
    giveaways: [
      {
        id: "fixture",
        title: french ? "Une aventure offerte" : "A free adventure",
        description: french
          ? "Découvrez ce jeu en français (FR)."
          : "Discover this game in English (US).",
        url: "https://example.com/game",
        images: { wide: null, tall: null, thumbnail: null },
        seller: "Unknown",
        price: {
          original: 1999,
          formatted: french ? "€19.99" : "$19.99",
          currency: french ? "EUR" : "USD",
        },
        freeUntil: "2099-12-31T12:00:00.000Z",
        store: "epic-games",
      },
    ],
    errors: [],
  } satisfies GiveawaysResponse;
  response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
});

api.listen(0, "127.0.0.1");
await once(api, "listening");
const address = api.address();
if (!address || typeof address === "string") throw new Error("Expected a TCP stub API address");

const origin = "http://127.0.0.1:4174";
const apiOrigin = `http://127.0.0.1:${address.port}`;
const app = spawn(process.execPath, ["build/index.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: "4174",
    ORIGIN: origin,
    PUBLIC_WEB_URL: origin,
    PUBLIC_API_URL: apiOrigin,
    PUBLIC_PLAUSIBLE_SCRIPT_URL: `${apiOrigin}/tracker.js`,
    ROBOTS_ALLOW_INDEXING: "false",
  },
});

app.on("exit", (code) => {
  api.close();
  process.exitCode = code ?? 0;
});

function shutdown(): void {
  app.kill("SIGTERM");
  api.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
