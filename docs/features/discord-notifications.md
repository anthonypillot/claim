# Discord Giveaway Alerts

**Status:** implemented behind opt-in configuration; public launch prerequisites pending operator
verification. **Decision date:** October 9, 2026.

See [Discord Operations](./discord-operations.md) and the
[API runtime configuration](../../packages/api/README.md#discord-alerts) for deployment and commands.

This design is tracked in [issue #56](https://github.com/anthonypillot/claim/issues/56), replacing
the outdated email/Discord digest and subscription-CRUD proposals in closed
[issue #3](https://github.com/anthonypillot/claim/issues/3) and
[issue #4](https://github.com/anthonypillot/claim/issues/4). Discord is the first delivery channel;
email is deferred. See [GLOSSARY.md](../../GLOSSARY.md) for notification terminology and
[CONTEXT.md](../../CONTEXT.md) for Giveaway, Store, and Market definitions.

## Product scope

- A publicly installable Discord bot announces newly detected Giveaway Occurrences in opt-in
  server channels, not private messages.
- Each server has one active Subscribed Channel: an ordinary guild text channel. Threads,
  forum/media channels, and multiple destinations per server are out of scope.
- Administrators manage the subscription inside Discord. No Claim account, web dashboard,
  webhook-URL submission, or public subscription-management REST API is needed.
- Store preferences default to all supported Stores. Administrators can instead select a
  non-empty subset. All-Stores mode includes future supported Stores; a custom list stays fixed.
- Each subscription selects English/US (`en-US`, `US`) or French/France (`fr-FR`, `FR`), defaulting
  to English/US. This selects announcement language and the Store Market, not the eligibility of
  every member of an international server.
- Prime Gaming remains supported. Every Prime alert clearly states that Prime membership is
  required; administrators can exclude Prime through Store preferences.

There are no periodic current-state digests, expiry reminders, genre/rating/price filters,
configurable role pings, pause/resume or resend controls, or manual notification-trigger endpoint
in this version. Do not build speculative email providers or a generalized `SendDigest` contract.

## Installation and commands

Use guild installation with the `bot` and `applications.commands` scopes. Receive server-only
commands through a public HTTPS HTTP Interactions Endpoint; no persistent Gateway connection or
privileged intents are needed. Request only the permissions needed to view the destination,
send messages, and embed links, not Administrator.

- **`/claim setup`**: create or change the destination, Store selection, and Market. Confirm the
  resulting settings publicly in the destination channel.
- **`/claim status`**: privately show settings, per-Store baseline/readiness, disabled/global error
  state, and recent delivery diagnostics, including unknown outcomes.
- **`/claim stop`**: stop future delivery and purge that server's stored configuration, pending
  work, and diagnostics.

Management responses are private to the invoking administrator, except for the public setup
confirmation. Setup also handles repairs and later configuration changes; there is no separate
settings command. Confirmations contain configuration information, not a catch-up of Giveaways.

Enforce Manage Server (`MANAGE_GUILD`) or Administrator permission at execution time, including
interactive setup controls. Discord command visibility/default permissions are not sufficient
authorization. Bind every operation to the invoking server; never accept another server's ID as
authorization. Validate that the destination belongs to that server, has the supported channel
type, and grants the bot effective View Channel, Send Messages, and Embed Links permissions.
Permissions at the command's invocation location alone do not establish destination access.

Verify Discord signatures against the exact raw request body before parsing/trusting commands.
Handle PING and acknowledge/defer interactions within Discord's three-second deadline. Prevent
replayed interaction IDs from repeating mutations or confirmations. Public help/install/privacy
information is the website's role; subscription management remains in Discord.

## Baselines and configuration changes

Each newly followed Store/Market waits for its first successful observation after setup. That
result establishes the subscription's Giveaway Alert Baseline and generates no Giveaway Alerts
for that subscription. Baselines advance independently: a failing Store does not block healthy
Stores, and a failed observation never establishes an empty baseline. A successful empty result
does establish a baseline.

Do not require an immediate upstream fetch during setup. Consequently, a Giveaway that begins
between setup and its Store's first successful observation may be suppressed with the baseline.
"Future Giveaways" means newly detected occurrences after the baseline, not guaranteed actual
start times; current normalized data cannot support the stronger guarantee.

Configuration changes apply forward only:

- Keep baselines for unchanged followed Stores in the same Market.
- Baseline newly selected Stores, newly supported Stores in All-Stores mode, and a new Market
  before alerting about them.
- Replacing the destination starts it without catch-up; do not redirect previously queued
  announcements into the replacement channel.
- Cancel incompatible unsent work and recheck the current subscription revision before sending.
  Already accepted or in-flight Discord messages cannot be recalled.
- Running setup to repair a disabled subscription does not replay old alerts. Its new monitoring
  baseline must prevent an accumulated catch-up.

## Discovery and recurring giveaways

The current cache refreshes only on reads and can remain fresh for 24 hours; repeatedly calling
`GiveawayReads.getAll(market)` on a timer would not provide hourly discovery. Existing
`firstSeenAt`, `lastSeenAt`, and `freeUntil` values also do not identify distinct promotion periods.

Run configurable hourly monitoring **inside the API process**, independent of website traffic.
Monitor Store/Market combinations followed by active subscriptions, sharing work across servers
with the same preferences. Reuse the Giveaway Cache Scope's adapter, refresh coordination, and
snapshot-replacement path, but give monitored scopes an independent hourly refresh deadline
instead of relying on the read-through TTL. Unsubscribed scopes retain existing cache behavior.

Every successful refresh of a monitored scope, including one caused by a public API read,
participates in the same occurrence detection. Such a read can discover and announce a Giveaway
before the next hourly check. Persist the observation/occurrence transition and eligible pending
delivery work atomically with the successful snapshot, so another refresh cannot overwrite the
only evidence before notifications see it. Failures preserve the last successful observation:
they are not empty results and must not manufacture disappearance or recurrence.

Occurrence rules:

- Treat different Stores and Markets independently. A game offered by two Stores can generate
  two alerts; do not infer cross-Store game identity.
- A genuinely later giveaway period of the same Store listing is a new occurrence.
- Changed titles, artwork, prices, or extended deadlines do not create new occurrences.
- Temporary absence during the old period does not by itself create a new occurrence.
- Require successful observations establishing that the old period ended and that availability
  subsequently returned. A failed fetch, elapsed old deadline, or discovery gap alone is not
  enough evidence of a new period.
- When extension and recurrence cannot be distinguished, do not reannounce. An end-and-return
  entirely between hourly observations can therefore be missed as a repeat.

Monitoring is best-effort, not a one-hour delivery SLA. A short-lived Giveaway occurring entirely
between checks, an upstream omission, or an outage can prevent discovery. Durable occurrence
state and subscription baselines survive restarts; startup does not baseline everything again.

## Message content

Send one compact embed per newly detected occurrence, with:

- Localized title and Store identity.
- A safe Store claim link; if unavailable, a safe link to Claim's corresponding catalog rather
  than a fabricated claim URL.
- The deadline using Discord timestamps so viewers see their local time.
- Artwork and original price when available, omitting missing optional details.
- A localized Prime-membership requirement for Prime Gaming.

Disable automatic mentions, including mentions embedded in Store-supplied text. Respect Discord
message/embed limits and validate external links; missing optional fields must not block delivery.
Sent messages are announcements of what was observed: do not edit/delete them for deadline
changes, expiration, corrected details, or unsubscription.

## Delivery and failure policy

**Prefer a missed alert over a duplicate.** See the
[reliability ADR](../adr/0001-avoid-uncertain-discord-resends.md).

Persist pending deliveries, claims, attempts, and outcomes in Postgres. Use uniqueness and fenced
claims to prevent replicas or concurrent discovery paths from creating/sending the same eligible
delivery twice. Record a send attempt durably before making the Discord request.

- **Created message**: persist success and the returned message ID.
- **Known non-acceptance, such as an explicit `429`**: retry within the alert's age/deadline
  window; honor rate-limit headers and `retry_after`.
- **Timeout, uncertain server/network error, or crash during an attempt**: record/recover as
  delivery unknown; never automatically resend and provide no manual resend command.
- **Deleted channel or lost destination permissions**: disable that subscription until setup
  repairs it; stop repeated delivery requests.
- **Confirmed bot removal**: purge that server's data, rather than retaining a disabled subscription.
- **Invalid bot token**: pause delivery globally and surface an operational error; do not disable
  every subscription individually.

Use a stable, destination-specific nonce with `enforce_nonce` to reduce accidental duplicates,
within Discord's length limit. Its deduplication window is only "the past few minutes," not a
durable exactly-once guarantee. Never reclaim an uncertain started attempt for another send,
even after its lease expires. A crash just before the HTTP request can therefore lose an alert.

Expire previously unattempted or safely retryable work 24 hours after detection (configurable),
or at the latest known Giveaway deadline if earlier. Recheck the current subscription and latest
successful active Giveaway state before sending. Do not send an expired or successfully withdrawn
Giveaway. After downtime, process due work once and resume; do not replay every missed hourly tick.

Failures are isolated by Store/destination, logged through the existing logger without credentials
or raw interactions, and reflected in status. Retention cleanup must never cause an already
observed/delivered occurrence to become eligible again.

## Runtime and persistence constraints

- Do not introduce a separate worker deployment, Redis, a message broker, or an external scheduler.
- Start/stop background work from the API runtime bootstrap, not imports or the IO-free `buildApp`.
  Support graceful shutdown and database-independent `/health` and tests.
- Keep the feature disabled when not configured; enabling it requires validated Discord credentials
  and the existing Postgres connection. Access environment values through lazy configuration.
- Coordinate scheduled refreshes and delivery work across API replicas with durable Postgres
  state. Existing refresh leases are not themselves delivery deduplication.
- Use the existing centralized Drizzle schema and committed generated migrations; do not create
  another database foundation or switch to SQLite.
- Persist subscription preferences/readiness, monitored occurrence evidence, pending work, and
  delivery outcomes. Keep domain history separate from removable Discord-specific diagnostics.
- Use existing PGlite/migration tests and mocked outbound HTTP. Do not require live Discord,
  database credentials, or a running server for ordinary tests.

## Privacy and launch requirements

Persist only necessary server/channel identifiers, preferences, readiness, and delivery
diagnostics. Do not persist member profiles, raw interaction payloads, or message histories.
Interaction member metadata is processed transiently for authorization; do not claim it is never
received. Storing a sent-message ID/outcome is not permission to ingest channel conversations.

- Keep delivery diagnostics for at most 30 days.
- `/claim stop` and confirmed bot removal purge that server's configuration, pending work, and
  diagnostics. Preserve only independent, non-Discord Giveaway history.
- Purge unrepaired disabled subscriptions and their data after 30 days.
- Periodic, bounded REST checks must detect bot removal even if no alerts are being sent.
- Publish an accurate, accessible privacy policy, install/help information, and support/deletion
  request route; explain bot-removal detection and retention limitations. Requests need an
  appropriate authorization/verification process, not an unauthenticated deletion-by-server-ID API.
- Protect Discord API data in database/log storage, including encryption at rest, and restrict
  credentials and third-party processing. Hosting guarantees must be checked before public launch.
- Configure a public guild-install application, minimum permissions, command registration, the
  signed HTTPS interaction endpoint, and secrets. Use separate applications for development and
  production; do not let previews overwrite production commands.
- Plan application verification before expanding beyond Discord's 100-server limit. Verification
  adds requirements including a Terms of Service link; App Directory discovery is not required.

The repository's paused deployment workflows do not establish an active notification deployment.
Application provisioning, storage safeguards, public policy/contact details, and deployment must
be verified before enabling the feature publicly.

## Implementation scope and acceptance coverage

[Issue #56](https://github.com/anthonypillot/claim/issues/56) covers the complete end-to-end feature:

- **Giveaway discovery and Discord alert delivery:** hourly in-process monitoring, shared-refresh
  durable handoff, occurrence detection, the delivery ledger and bot sender, failure isolation,
  and safe recovery. Consume subscription eligibility/readiness from subscription management.
- **Discord-native subscription management:** signed HTTP interactions, permission checks,
  setup/status/stop, persistent one-channel-per-server configuration and baseline eligibility,
  forward-only changes, disabled/purge lifecycle, and install/help/privacy surfaces. Reuse the
  existing database foundation from completed #7.

These capabilities coordinate on baseline advancement, status diagnostics, cancellation, and
cleanup. Test at least:

- No-traffic discovery, hourly due checks, shared scopes, public-read discovery, and replica/restart
  coordination without timers in `buildApp` or database access in `/health`.
- Non-empty/empty initial baselines, per-Store failures, settings changes, replacement destinations,
  dynamic All-Stores mode, and no catch-up.
- Repeat periods, extensions, transient gaps, ambiguous returns, failed observations, and Store/
  Market isolation.
- Successful sends, safe `429` retries, unknown outcomes/crashes with no resend, stale/expired/
  withdrawn work, global token failures, and isolated destination failures.
- Signed PING/commands, tampering/replay rejection, cross-server and non-admin rejection,
  destination permissions/types, and interaction response deadlines.
- Localized/partial message details, Prime labels, disabled mentions, Discord limits, retention,
  stop/removal purges, and cleanup that cannot requeue old occurrences.

## Official Discord references

- [Bot authorization and public installation](https://docs.discord.com/developers/topics/oauth2#bot-authorization-flow)
- [HTTP interactions, signatures, and response deadlines](https://docs.discord.com/developers/interactions/receiving-and-responding)
- [Permissions and channel overwrites](https://docs.discord.com/developers/topics/permissions)
- [Message creation, embeds, and enforced nonces](https://docs.discord.com/developers/resources/message#create-message)
- [Rate limits and invalid-request handling](https://docs.discord.com/developers/topics/rate-limits)
- [Developer Terms: privacy, deletion, and data safeguards](https://support-dev.discord.com/hc/en-us/articles/8562894815383-Discord-Developer-Terms-of-Service)
- [Application verification](https://support-dev.discord.com/hc/en-us/articles/23926564536471-How-Do-I-Get-My-App-Verified)
