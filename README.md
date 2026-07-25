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

Semantic Release runs from `main`. It keeps the root, API, web, and lockfile versions synchronized,
generates `docs/CHANGELOG.md`, verifies the prepared tree, and commits the release assets before
creating the `vX.Y.Z` tag and GitHub release. The generated commit includes `[skip ci]` to avoid a
duplicate push workflow.

The pull-request and release workflows build each multi-platform image once, load it into the
runner's containerd image store, and smoke-test its `linux/amd64` variant. Internal pull requests
publish preview tags, while fork pull requests only run the image checks. Releases push the exact
images that passed their smoke tests. Each image is published only after the tagged source and its
own image check pass.

## Further reading

- [Roadmap](docs/roadmap.md)
- [Architecture](docs/architecture.md)
- [Giveaways request flow](docs/giveaways-flow.md)
- [Web development](packages/web/README.md)
- [Agent guidance](AGENTS.md)
