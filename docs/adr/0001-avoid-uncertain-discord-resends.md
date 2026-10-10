# Prefer missed alerts over duplicate Discord announcements

Discord message creation has only short-lived nonce deduplication, so a timeout or crash can leave
an accepted message indistinguishable from an unsent one. We prefer a missed Giveaway Alert over
a duplicate: persist attempts before sending, retry only known non-acceptance, and never resend an
uncertain attempt, including after restart or lease expiry. This deliberately sacrifices recovery
from some failures—even a crash just before sending—to honor the chosen product guarantee without
claiming exactly-once delivery; see the [accepted design](../features/discord-notifications.md).
