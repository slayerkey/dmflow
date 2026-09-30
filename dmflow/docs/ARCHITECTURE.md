# Architecture and safety

## Runtime boundaries

Electron hosts a bundled React renderer and a SQLite-backed demo server bound only to `127.0.0.1` on an ephemeral port. A random session credential remains in the main process. The narrow preload exposes API request, mode selection, pairing, reset, and approved external-link opening. Node access is disabled in the renderer; context isolation and sandboxing are enabled. Navigation/new windows and permission requests are denied. The renderer has a restrictive CSP and receives no device or provider credentials.

Live mode swaps the API transport to an HTTPS Worker using an OS-encrypted saved device credential. The Worker derives workspace ownership from its hash; client-provided workspace IDs cannot select another tenant. OAuth state is workspace-bound, hashed, expiring, and consumed once. Provider tokens are AES-GCM encrypted in D1 with a separate Cloudflare secret. There is one administratively provisioned pilot owner, no shared desktop API secret, no public signup, and no team-role system.

The renderer depends on the `ApiClient` shape rather than Node APIs. `SocialProvider`, `Repository`, `EventQueue`, and `Clock` are shared contracts. Both SQLite and D1 implement the same repository and SQL schema; the demo runs the same matching, eligibility, attribution, and send engine. Real provider requests are replaced by explicit simulated results only in the demo.

## Durable processing

1. Validate raw webhook HMAC, hash the receipt for deduplication, persist it, then acknowledge. A durable receipt is itself the pending normalization job; queue publication is best effort with scheduled recovery.
2. The consumer resolves owned media/comment metadata and atomically inserts the normalized event and outbox row. Provider timestamps drive eligibility and attribution.
3. Match one campaign by whole-phrase/exact rank, keyword length, activation time, then stable ID. Apply exclusions and safety checks before reserving a cooldown.
4. In one transaction, reserve event/person-campaign cooldown, prepare one message, and snapshot its body/destination and random redirect token. An event has at most one message.
5. Immediately before the provider call, recheck state, blocks, authorization, window, and rolling account budget. An atomic state transition claims dispatch for one consumer.
6. Record confirmed delivery, confirmed transient failure, permanent failure, or uncertainty. Five total attempts maximum for confirmed transient failures. Backoff is bounded and honors a longer provider delay. A timeout after dispatch is uncertain, not a retryable failure.
7. Scheduled recovery handles undispatched work. A dispatch older than five minutes is quarantined as uncertain. Pausing cancels unclaimed work; a call already dispatched can finish.

Rate reservations count attempted live sends conservatively, including reservations that lose a later dispatch claim. This may delay work but cannot create extra sends. Budgets span Worker isolates through D1. V1 does not assume exactly-once Queue delivery.

## Identity and analytics

A person is keyed by provider/account-scoped ID, never username. Confirmed send recipient IDs can map back to the triggering person within the same connected account. There is no inferred cross-account identity match, so a block affects the identifiable account-scoped person and its aliases across that workspace’s campaigns. Unknown identity equivalence is never guessed from names.

Messages, clicks, engagement, blocks, and ignored events remain independent facts. Display status is a convenience, not the data model. Clicked and Engaged filters can both include the same person. Engagement attaches to the most recent confirmed automation strictly before the inbound provider timestamp; late events recompute attribution. Forwarded links retain original-recipient attribution.

Per-keyword reporting preserves the keyword on the matched event even after campaign aliases are edited. Campaign trigger/media cannot change after send history exists. Media views are deduplicated in aggregate denominators. Account-scoped people are not silently deduplicated across accounts.

## Operations and limits

Home polls aggregate stats/activity every 15 seconds only while visible; settings polls connection status. Heavy campaign/media/keyword reports load on explicit refresh/mutations. This is a private-pilot design, not an unbounded enterprise analytics service. The media collector intentionally fetches at most 150 recent items per account. D1 production capacity, provider latency, and high-volume load remain untested.

Failed receipts retain sanitized failure metadata; raw failed payloads clear after seven days, successful ones immediately. Historical automation data persists until operator deletion. No automated privacy deletion endpoint is supplied; the pilot operator must establish their retention/deletion process before public use. No IP or cookie tracking is stored. Request invocation logs are disabled; structured application logs contain internal IDs and safe statuses only.
