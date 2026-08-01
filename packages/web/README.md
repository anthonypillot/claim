# Claim Web

Claim Web is the SvelteKit frontend for browsing the free-game giveaways exposed by Claim API.

The giveaway toolbar filters by storefront and can order the visible games by nearest expiry. Cards
show the remaining time in adaptive day, hour, or minute units. Toolbar state is shareable through
the optional `store` and `sort=ending-soon` query parameters; default filters are omitted from the
URL.

## Stack

- SvelteKit 2 and Svelte 5 with runes mode forced for project files
- Tailwind CSS 4
- shadcn-svelte with the Rhea style, Taupe base color, and Hugeicons
- Vitest with Node and Playwright browser projects

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
bun run build
bun run start
bun run preview
bun run brand:export
```

Run a focused unit test with:

```bash
bun run test:unit -- --run src/lib/giveaways/model.test.ts
```

Root `bun run typecheck` does not invoke Svelte checking because this package exposes `check` rather
than `typecheck`; always run `bun run check` for web changes. For full web verification, run
`bun run check`, `bun run test`, then `bun run build`.

## UI And Assets

shadcn-svelte configuration lives in `components.json`. Installed primitives are checked into
`src/lib/components/ui`, shared theme variables are in `src/routes/layout.css`, and application
components live directly under `src/lib/components`.

`bun run brand:export` regenerates and verifies the SVG and ICO sources in `static/` and raster
variants in `static/brand/`. Treat those files as generated outputs of
`scripts/export-brand-assets.js`.

## Configuration And Deployment

Production requires these runtime environment variables:

| Variable                | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `PUBLIC_API_URL`        | API origin used for requests and the OpenAPI link.           |
| `PUBLIC_PLAUSIBLE_URL`  | Self-hosted Plausible origin used for production analytics.  |
| `PUBLIC_WEB_URL`        | Web origin used for canonical URLs and the analytics domain. |
| `ORIGIN`                | Public web origin used by the Node server.                   |
| `ROBOTS_ALLOW_INDEXING` | Set to `true` only where search indexing is intended.        |
| `PORT`                  | Listening port. Defaults to `3000`.                          |

Set the public origins to `https://api.claim.anthonypillot.com`,
`https://plausible.monitoring.anthonypillot.com`, and `https://claim.anthonypillot.com`, respectively.
Values must be HTTP(S) origins without a path, query, or fragment. See `.env.example` for a deployable
production template; local development continues to use the Vite origins and `/api` proxy.

### Analytics

Non-development builds load the official Plausible tracker once from
`PUBLIC_PLAUSIBLE_URL/js/script.js`. Its `data-domain` is the hostname from `PUBLIC_WEB_URL`, so each
deployed hostname must exist as a site in Plausible. The tracker is omitted during local development
and automated tests. It is cookie-free and automatically tracks initial page views and SvelteKit
`pushState` and back/forward navigation. Query-only giveaway filter changes are UI state and are not
counted as separate page views.

To verify a deployment without an ad blocker, confirm that the browser loads exactly one tracker
script and sends a POST to `PUBLIC_PLAUSIBLE_URL/api/event` for the initial view and each pathname
navigation. Confirm that no Plausible cookies are created and that the visits appear in the Plausible
dashboard. The dashboard's site settings also provide an installation verification tool. If a
Content Security Policy is added, allow the Plausible origin in both `script-src` and `connect-src`.

### Robot Indexing

Set `ROBOTS_ALLOW_INDEXING=true` only in production. Any other value, including an omitted variable,
makes `/robots.txt` disallow all paths and adds `X-Robots-Tag: noindex, nofollow, noarchive` to server
responses. Pre-production and pull-request deployments must leave indexing disabled. These directives
discourage compliant crawlers but are not access control; protect private environments at the ingress
or with authentication.

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
  --env PUBLIC_PLAUSIBLE_URL=https://plausible.monitoring.anthonypillot.com \
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
