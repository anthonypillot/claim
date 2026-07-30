# Claim

Claim aggregates currently free game giveaways from Epic Games, Amazon Prime Gaming, GOG, and
Steam. The repository contains the public JSON API and a SvelteKit site that consumes it.

## Packages

| Package                                  | Description             |
| ---------------------------------------- | ----------------------- |
| [`packages/api`](packages/api/README.md) | Bun and Elysia JSON API |
| [`packages/web`](packages/web/README.md) | Svelte web application  |

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

bun run --cwd packages/api db:migrate
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
bun run verify
```

This checks package and lockfile version consistency, linting, formatting, API types, Svelte types,
tests, and both production builds. Root `test` and `build` cover both workspaces. Root `lint`,
`format:check`, and `typecheck` use `--if-present` and currently cover only the API, so the
consolidated command also runs the web package's separate `check`. Package-specific commands and
focused tests are documented in each package README.

## Releases

Semantic Release runs from `main`, synchronizes package versions, updates `docs/CHANGELOG.md`, and
creates the `vX.Y.Z` tag and GitHub release after verification. Release commits include `[skip ci]`.

Pull requests publish preview images for internal branches; forks only run image checks. Adding
`deploy` to an internal pull request takes effect on its next commit. Published releases deploy the
verified stable images to pre-production and production. Labels do not trigger pull-request jobs.

Run `🚀 Deploy` manually to redeploy or roll back a published stable tag in pre-production, production,
or both.

## Further reading

- [Roadmap](docs/roadmap.md)
- [Architecture](docs/architecture.md)
- [Giveaways request flow](docs/giveaways-flow.md)
- [Web development](packages/web/README.md)
- [Agent guidance](AGENTS.md)
