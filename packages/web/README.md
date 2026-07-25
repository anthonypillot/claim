# Claim Web

Claim Web is the SvelteKit frontend for browsing the free-game giveaways exposed by Claim API.

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
performs the same rewrite for SSR requests. Production SSR currently fetches
`https://api.claim.anthonypillot.fr` directly; there is no environment-variable override yet.

## Commands

Run package commands from `packages/web`:

```bash
bun run dev
bun run check
bun run test
bun run build
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

`bun run brand:export` regenerates and verifies the SVG sources in `static/` and raster variants in
`static/brand/`. Treat those files as generated outputs of `scripts/export-brand-assets.js`.

## Configuration And Deployment

The Svelte plugin, forced runes mode, Tailwind plugin, test projects, development proxy, and
`adapter-auto` are all configured in `vite.config.ts`; this package intentionally has no separate
`svelte.config.*`. Replace `adapter-auto` there when deploying to a platform it does not support.

Framework references:

- [Svelte and SvelteKit documentation](https://svelte.dev/docs)
- [shadcn-svelte documentation](https://shadcn-svelte.com/docs)
