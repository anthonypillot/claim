# Claim

Claim aggregates currently free game giveaways from Epic Games, Amazon Prime Gaming, GOG, and
Steam. The repository contains the public JSON API and a SvelteKit site that consumes it.

## Packages

| Package | Description |
| --- | --- |
| [`packages/api`](packages/api/README.md) | Bun and Elysia JSON API |
| [`packages/web`](packages/web/README.md) | Svelte web application |

## Prerequisites

- Bun 1.3 (CI and images automatically use the latest patch release)
- PostgreSQL, or Docker for the PostgreSQL 18 development database shown below

## Local Development

From the repository root, install dependencies, create the API environment file, start Postgres,
and apply the committed migrations:

```bash
bun install
cp packages/api/.env.example packages/api/.env

docker run --detach --rm --name claim-postgres \
  --env POSTGRES_PASSWORD=postgres \
  --env POSTGRES_DB=claim \
  --publish 5432:5432 \
  postgres:18-alpine

bun --cwd packages/api run db:migrate
bun run dev
```

The workspace development command starts both applications:

- Web: http://localhost:5173
- API: http://localhost:3000
- OpenAPI UI: http://localhost:3000/openapi

The example environment already matches the Docker command. See the
[API README](packages/api/README.md) for configuration, endpoints, and database details.

## Verification

Run shared verification from the repository root:

```bash
bun run lint
bun run format:check
bun run typecheck
bun run --cwd packages/web check
bun test
bun run build
```

Root `test` and `build` cover both workspaces. Root `lint`, `format:check`, and `typecheck` use
`--if-present` and currently cover only the API, so the Svelte package needs its separate `check`.
Package-specific commands and focused tests are documented in each package README.

## Further reading

- [Roadmap](docs/roadmap.md)
- [Architecture](docs/architecture.md)
- [Giveaways request flow](docs/giveaways-flow.md)
- [Web development](packages/web/README.md)
- [Agent guidance](AGENTS.md)
