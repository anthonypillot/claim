# Claim Web

Claim Web is the SvelteKit frontend for browsing the free-game giveaways exposed by Claim API.

The giveaway toolbar filters by storefront and can order the visible games by nearest expiry. Cards
show the remaining time in adaptive day, hour, or minute units. Toolbar state is shareable through
the optional `store` and `sort=ending-soon` query parameters; default filters are omitted from the
URL.

The interface is available in English and French. The header language control saves the reader's
choice and reloads the current URL, preserving the selected store, sorting, and fragment.

## Stack

- SvelteKit 2 and Svelte 5 with runes mode forced for project files
- Tailwind CSS 4
- shadcn-svelte with the Rhea style, Taupe base color, and Hugeicons
- Paraglide JS with generated, typed English and French messages
- Vitest with Node and Playwright browser projects, plus Playwright end-to-end tests

## Development

Install dependencies and configure the API by following the
[root development guide](../../README.md). The preferred command from the repository root starts the
API and web workspaces together:

```bash
bun run dev
```

The site is available at http://localhost:5173 and expects the API at http://localhost:3000.

During development, Vite rewrites browser requests under `/api/*` to the local API. The server hook
performs the same rewrite for SSR requests.

## Commands

Run package commands from `packages/web`:

```bash
bun run dev
bun run check
bun run test
bun run test:e2e
bun run build
bun run start
bun run preview
bun run brand:export
bun run i18n:compile
```

Run a focused unit test with:

```bash
bun run test:unit -- --run src/lib/giveaways/model.test.ts
```

Root `bun run typecheck` does not invoke Svelte checking because this package exposes `check` rather
than `typecheck`; always run `bun run check` for web changes. For full web verification, run
`bun run check`, `bun run test`, then `bun run build`.

`bun run test` runs the Vitest suites followed by the end-to-end suite. `bun run test:e2e` builds
the web package and starts its Node adapter at `http://127.0.0.1:4174` with a local stub API on an
ephemeral port. This exercises server-side requests, document reloads, and cookie persistence
without a database or live storefronts. Install Chromium with `bun run playwright install chromium`
before running browser tests; CI also installs its system dependencies with `--with-deps`.

## Localization

English (`en`) and French (`fr`) share the same page URLs. On each request, language selection uses:

1. A supported `claim_locale` preference cookie.
2. The browser's `Accept-Language` preferences, matched by language and positive quality weight.
3. English when no supported preference is available.

Regional browser preferences such as `fr-CA` and `en-GB` select French and English respectively.
Unsupported cookies and malformed or explicitly excluded (`q=0`) language preferences are ignored.
Choosing **EN** or **FR** writes a site-scoped cookie with a one-year lifetime and reloads the current
document. The HTML `lang` attribute, metadata, accessibility labels, interface, and giveaway content
therefore use the selected language from the first render. Hydration reads the server-selected
document language, and concurrent server requests have isolated locale state. Locale-dependent
HTML and SvelteKit data responses use `Content-Language`, `Vary: Cookie, Accept-Language`, and
`Cache-Control: private, no-cache`.

The web language selects a fixed API market:

| Language | API query                 | Regional formatting |
| -------- | ------------------------- | ------------------- |
| English  | `locale=en-US&country=US` | `en-US`             |
| French   | `locale=fr-FR&country=FR` | `fr-FR`             |

Changing language can also change the available games and prices because it selects a different
market. Titles and descriptions come from the API's localized storefront responses; stores may
still supply untranslated titles or omit descriptions. Store refresh failures use localized web
messages. Deadlines use UTC with localized dates and times, countdowns and counts use plural-aware
messages, and prices use the API's minor-unit amount and currency with locale-aware formatting.

Edit `i18n/en.json` and `i18n/fr.json` to change interface copy. Use descriptive keys,
message parameters, and plural variants rather than concatenating translated sentence fragments.
English is the base catalog and the compiler's fallback for a missing French message; a catalog
coverage test ensures the shipped French catalog is complete.

`i18n/project.inlang/settings.json` defines supported languages and loads the message-format plugin
from the installed, locked dependency. `paraglide.config.ts` is shared by the Vite plugin and
`scripts/compile-i18n.ts`. Vite generates messages for development, builds, and Vitest; `check`
also compiles them before Svelte checking, so it works from a clean checkout. While using
`check:watch`, run the dev server for live message regeneration or run `bun run i18n:compile` after
editing catalogs. Treat `src/lib/paraglide` and the SDK's local project caches as generated output.

## UI And Assets

shadcn-svelte configuration lives in `components.json`. Installed primitives are checked into
`src/lib/components/ui`, shared theme variables are in `src/routes/layout.css`, and application
components live directly under `src/lib/components`.

`bun run brand:export` regenerates and verifies the SVG and ICO sources in `static/` and raster
variants in `static/brand/`. Treat those files as generated outputs of
`scripts/export-brand-assets.js`.

## Configuration And Deployment

Production requires these runtime environment variables:

| Variable                      | Purpose                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `PUBLIC_API_URL`              | API origin used for requests and the OpenAPI link.      |
| `PUBLIC_PLAUSIBLE_SCRIPT_URL` | Generated site-specific Plausible analytics script URL. |
| `PUBLIC_WEB_URL`              | Web origin used to generate canonical page URLs.        |
| `ORIGIN`                      | Public web origin used by the Node server.              |
| `ROBOTS_ALLOW_INDEXING`       | Set to `true` only where search indexing is intended.   |
| `PORT`                        | Listening port. Defaults to `3000`.                     |

Set the API and web origins to `https://api.claim.anthonypillot.com` and
`https://claim.anthonypillot.com`. Origins must not contain a path, query, or fragment. See
`.env.example` for a deployable production template; local development continues to use the Vite
origins and `/api` proxy.

### Analytics

Non-development builds load the official generated Plausible tracker from
`PUBLIC_PLAUSIBLE_SCRIPT_URL` and run its initialization snippet once. Generated scripts encode the
site domain, event endpoint, and enabled measurements. Use these environment-specific values:

| Environment    | Script URL                                                                      |
| -------------- | ------------------------------------------------------------------------------- |
| Pre-production | `https://plausible.monitoring.anthonypillot.com/js/pa-RKgeJwB94o2HZsdvZqhux.js` |
| Production     | `https://plausible.monitoring.anthonypillot.com/js/pa-D95gD7Xk4gbNpDXKDnm4m.js` |

Both scripts track page views, outbound links, file downloads, and form submissions. They are
cookie-free and automatically track initial page views and SvelteKit `pushState` and back/forward
navigation. Query-only giveaway filter changes are UI state and are not counted as separate page
views. The tracker and initializer are omitted during local development and Vitest tests;
end-to-end tests use a local empty tracker script.

Clicking an available **View giveaway** link sends a `Giveaway Click` custom event with the giveaway
title and store as properties. Add a matching custom-event goal named `Giveaway Click` in each
Plausible site's settings before expecting conversions to appear in its dashboard. Disabled store links
do not emit an event.

Changing the site's measurements in Plausible can generate a new script URL. Update the corresponding
deployment environment variable whenever that happens; do not reuse one environment's generated
script in another environment.

To verify a deployment without an ad blocker, confirm that the browser loads exactly one configured
tracker script and sends a POST to `https://plausible.monitoring.anthonypillot.com/api/event` for the
initial view and each pathname navigation. Confirm that no Plausible cookies are created and that the
visits and optional events appear in the corresponding Plausible dashboard. The dashboard's site
settings also provide an installation verification tool. If a Content Security Policy is added, allow
the Plausible origin in `script-src` and `connect-src`, and authorize the inline initialization snippet
with a hash or nonce.

### Robot Indexing

Set `ROBOTS_ALLOW_INDEXING=true` only in production. Any other value, including an omitted variable,
makes `/robots.txt` disallow all paths and adds `X-Robots-Tag: noindex, nofollow, noarchive` to server
responses. The generated policy still allows `/favicon.ico` so analytics dashboards and other clients
can retrieve the site icon. Pre-production and pull-request deployments must leave indexing disabled.
These directives discourage compliant crawlers but are not access control; protect private environments
at the ingress or with authentication.

The Svelte plugin, forced runes mode, Tailwind plugin, test projects, development proxy, and
`adapter-node` are all configured in `vite.config.ts`; this package intentionally has no separate
`svelte.config.*`.

Build the production image from the repository root:

```bash
docker build --pull --file packages/web/Dockerfile --tag claim-web .
```

CI passes the published image tag through the `APP_VERSION` build argument so the footer identifies
the exact image version. Local builds fall back to the synchronized package version; pass
`--build-arg APP_VERSION=<version>` to identify a custom local image version instead.

The build uses Bun while the production stage runs Node 24 in a non-root distroless image. Start it
with runtime configuration injected by the deployment platform:

```bash
docker run --rm --publish 3000:3000 \
  --env PUBLIC_API_URL=https://api.claim.anthonypillot.com \
  --env PUBLIC_PLAUSIBLE_SCRIPT_URL=https://plausible.monitoring.anthonypillot.com/js/pa-D95gD7Xk4gbNpDXKDnm4m.js \
  --env PUBLIC_WEB_URL=https://claim.anthonypillot.com \
  --env ORIGIN=https://claim.anthonypillot.com \
  --env ROBOTS_ALLOW_INDEXING=true \
  claim-web
```

The container exposes an API-independent health check at `GET /health`. Production releases are
published to `ghcr.io/anthonypillot/claim-web` with semantic-version, major, minor, and `latest`
tags. Pull requests from this repository publish a versioned preview tag.

Set `ORIGIN` directly unless the server is behind a trusted reverse proxy. In that case,
`PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host` can be used instead. The
distroless runtime has no shell; use the corresponding `debug-nonroot` image temporarily when shell
access is required for diagnosis.

Framework references:

- [Svelte and SvelteKit documentation](https://svelte.dev/docs)
- [shadcn-svelte documentation](https://shadcn-svelte.com/docs)
