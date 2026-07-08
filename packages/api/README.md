# Claim API

The HTTP API for [Claim](../../README.md) — a small, read-only JSON API that serves free
game giveaways aggregated across storefronts (Epic Games, Amazon Prime Gaming, GOG, and Steam today).

Built with **Bun**, **Elysia**, **TypeBox**, and **pino**.

## Run it

From the repo root (preferred — root scripts fan out to the workspace):

```bash
bun install
bun run dev      # hot-reload → http://localhost:3000
```

Or from this package directory:

```bash
bun run dev            # hot-reload
bun test               # run tests
bun run build          # production bundle → build/index.js
bun run start          # run the bundle (NODE_ENV=production, cluster mode)
```

## Where to look

- **API contract** (endpoints, params, response shape) — the live OpenAPI spec at `/openapi`
  (`/openapi/json`).
- **What Claim does & where it's headed** — [`docs/roadmap.md`](../../docs/roadmap.md).
- **Architecture** (file tree, feature-based layout) —
  [`docs/architecture.md`](../../docs/architecture.md).
- **Conventions & pitfalls** (strict TypeScript, testing patterns) —
  [`AGENTS.md`](../../AGENTS.md).

## Layout

The annotated file tree and the feature-based layout live in
[`docs/architecture.md`](../../docs/architecture.md).
