# Claim

Claim aggregates currently free game giveaways from storefronts including Epic Games, Amazon Prime
Gaming, GOG, and Steam.

## Packages

| Package | Description |
| --- | --- |
| [`packages/api`](packages/api/README.md) | Bun and Elysia JSON API |
| [`packages/web`](packages/web/README.md) | Svelte web application |

## Local development

Install dependencies and run workspace scripts from the repository root:

```bash
bun install
bun run dev
```

## Development commands

Root scripts run their corresponding command across the workspaces:

```bash
bun test
bun run lint
bun run format:check
bun run typecheck
bun run build
```

## Further reading

- [Roadmap](docs/roadmap.md)
- [Architecture](docs/architecture.md)
- [Giveaways request flow](docs/giveaways-flow.md)
- [Agent guidance](AGENTS.md)
