# Discord Operations

Discord alerts are implemented but disabled by default. The
[accepted specification](./discord-notifications.md) and
[reliability ADR](../adr/0001-avoid-uncertain-discord-resends.md) govern behavior. This guide does not
certify that a deployment, application, or support provider has been provisioned.

## Before public installation

1. Apply the committed API migrations from source before deploying. Use separate Discord
   applications, secrets, and databases for development and production.
2. Create a public **guild-install** application with `bot` and `applications.commands` scopes.
   Request only View Channel, Send Messages, and Embed Links (`19456`). Do not enable Gateway
   connections or privileged intents. Register the command explicitly for the intended application
   using the [API commands](../../packages/api/README.md#discord-alerts); previews must not register
   production commands.
3. Configure API secrets and its public HTTPS `/discord/interactions` endpoint. Confirm Discord's
   signed PING validation, rejection of invalid signatures, installation in a test server, and
   private acknowledgements. Run setup, wait for per-Store baselines, then test a genuinely new
   offer. Do not use live users or production giveaway delivery as an ordinary automated test.
4. Verify encryption at rest, restricted database/log access, secret injection, backup deletion
   schedules, and third-party infrastructure access. Ensure backups do not restore deleted server
   data into active delivery. Do not log tokens, interaction payloads, or channel conversations.
5. Provide a **private HTTPS support form**, check its access and retention protections, and
   establish the verified-request procedure below. Configure the web server's
   `DISCORD_APPLICATION_ID` and `DISCORD_SUPPORT_URL`.
6. Review the public `/discord`, `/discord/privacy`, and `/discord/support` pages for accuracy in
   the actual deployment. Enable `DISCORD_PUBLIC_INSTALL_ENABLED=true` **only after** these
   checks, the API deployment, and support are ready. This flag is a manual launch gate, not an
   automatic security certification. Never expose bot secrets to the web client.
7. Plan Discord application verification before reaching the 100-server limit. Configure any
   required Terms of Service information before verification; App Directory discovery is optional.

## Support and deletion requests

The configured form is an operator-run, private contact route, not a deletion API. Do not accept
an arbitrary server ID, screenshot, claimed member ID, or public GitHub comment as authorization.

- Prefer `/claim stop`, which is signature-verified and checks Manage Server or Administrator
  permission. This immediately deletes live server data without a manual support workflow.
- For manual requests, authenticate the requester in Discord and verify their current Manage
  Server/Administrator permission in the target server through a fresh administrator challenge
  and an operator's independent inspection of the server's Discord permissions. Coordinate the
  challenge through the private form; do not treat a reusable screenshot as proof. If that cannot
  be verified, disclose no server settings and perform no manual mutation. Removing the bot is
  another self-service deletion path once the removal check confirms it.
- After authorization, delete only the verified server's `discord_subscriptions` row through
  restricted operator database access. Foreign-key cascades remove its follows, pending work,
  and delivery diagnostics. Do not delete independent `giveaway_occurrences` history or other
  servers. Confirm completion privately and dispose of support evidence under the provider's
  approved retention policy. Previously sent Discord messages are outside this deletion scope.

The bot receives member metadata transiently with commands but does not persist profiles or raw
payloads. Unassociated replay hashes expire after ten minutes. Diagnostics and unrepaired disabled
subscriptions have a 30-day maximum live retention window; cleanup and bounded daily removal
checks require the API to be operating. Outages, Discord errors, and rate limits can delay them.
Audit these limitations and the infrastructure's backup policies rather than promising immediate
deletion merely from bot removal.

## Failure handling

- **Invalid token:** delivery pauses for that token fingerprint without disabling every server.
  Correct the secret and restart all replicas with the same configuration. A corrected token gets
  fresh runtime state; uncertain or rejected attempts are never replayed.
- **Missing destination/permissions:** that subscription is disabled. `/claim setup` validates a
  repaired destination and establishes fresh baselines; it does not replay old alerts.
- **Explicit message `429`:** wait for `retry_after` and rate-limit headers; replicas share
  destination/global backoff. Pending age and latest deadline still apply.
- **Network/timeout/server uncertainty or expired started attempt:** status reports `unknown`.
  Never manually turn an uncertain attempt back into pending work or claim exactly-once delivery.
- **Database failure:** the next bounded cycle tries again. A started attempt with an unrecorded
  outcome becomes unknown after its claim expires; missed alerts are intentional under the ADR.

Use `/claim status` for per-Store readiness and recent outcomes. Runtime failures use the API's
structured logger without credentials or raw interactions. There is no resend or manual-trigger
endpoint.
