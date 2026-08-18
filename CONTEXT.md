# Claim

Claim gathers current free-to-keep game offers from multiple storefronts into one normalized catalog.

## Language

**Giveaway**:
A time-limited offer that lets someone claim a game at no cost and keep it.

**Store**:
A storefront that publishes Giveaways.
_Avoid_: Provider, source

**Market**:
A locale and country pair that determines which Giveaways a Store exposes.

**Giveaway Cache Scope**:
One Store and Market combination whose Snapshot is managed independently.
_Avoid_: Cache slice, bare scope

**Snapshot**:
The last successful normalized set of Giveaways for a Giveaway Cache Scope; it may be empty.
_Avoid_: Cache contents
