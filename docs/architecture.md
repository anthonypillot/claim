# Architecture

How the Claim API is organized — **feature-based** — and how that layout grows as the
[roadmap](./roadmap.md) lands. The tree below is the **target** shape: unmarked entries ship
today, `` entries are roadmap items not built yet, shown so the structure is clear before
the code exists.

## Feature-based architecture

One folder owns a feature end to end — its routes, business logic, data/delivery adapters, and
co-located tests all live together. There are no cross-cutting `controllers/`, `services/`, or
`models/` layer folders. Each capability on the roadmap becomes another folder under `modules/`,
so the app scales by adding features side by side rather than by growing shared layers.

## Target file tree

```
packages/api/
├─ src/
│  ├─ index.ts                 entry point
│  ├─ other.ts                 other needed things
│  ├─ modules/                 one folder per FEATURE
│  │  ├─ giveaways/
│  │  │  ├─ index.ts
│  │  │  ├─ service.ts
│  │  │  ├─ model.ts
│  │  │  └─ stores/
│  │  │     ├─ shared.ts
│  │  │     ├─ epic-games/
│  │  │     ├─ prime-gaming/
│  │  │     ├─ steam/
│  │  │     ├─ gog/
│  │  │     └─ gamerpower/
│  │  ├─ notifications/
│  │  │  ├─ index.ts
│  │  │  ├─ service.ts
│  │  │  ├─ scheduler.ts
│  │  │  ├─ digest.ts
│  │  │  └─ channels/
│  │  │     ├─ shared.ts
│  │  │     ├─ discord/
│  │  │     └─ email/
│  │  └─ subscriptions/
│  │     ├─ index.ts
│  │     ├─ service.ts
│  │     ├─ model.ts
│  │     └─ repository.ts
│  ├─ database/
│  │  ├─ client.ts
│  │  └─ migrations/
│  └─ utils/
│     └─ logger.ts
├─ package.json · tsconfig.json · bunfig.toml · README.md
```
