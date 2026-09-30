# Cloudflare setup

Run commands from the repository root. Wrangler is pinned in the lockfile. A Cloudflare account with permission for Workers, D1, and Queues is required. Resource creation and ongoing usage may be billable under your account plan.

```sh
npm ci
npx wrangler login
npx wrangler whoami
npm run setup
```

The repeatable setup script creates/reuses database `dmflow`, queues `dmflow-events` and `dmflow-dead`, applies migrations, and inserts the pilot workspace/owner. It generates ignored `workers/api/wrangler.local.json` with the actual D1 ID. It does not overwrite existing records or reset live data. Inspect that file before using it with an existing Cloudflare account that already has resources with these names.

Find your account’s workers.dev subdomain in the dashboard. Set the intended final Worker origin, then deploy:

```sh
DMFLOW_WORKER_URL=https://dmflow-api.YOUR_SUBDOMAIN.workers.dev npm run deploy
```

Use interactive secret entry; never put secret values in checked-in files or shell history:

```sh
npx wrangler secret put META_APP_ID --config workers/api/wrangler.local.json
npx wrangler secret put META_APP_SECRET --config workers/api/wrangler.local.json
npx wrangler secret put META_WEBHOOK_SECRET --config workers/api/wrangler.local.json
npx wrangler secret put META_VERIFY_TOKEN --config workers/api/wrangler.local.json
npx wrangler secret put TOKEN_ENCRYPTION_KEY --config workers/api/wrangler.local.json
```

`TOKEN_ENCRYPTION_KEY` must be 32 cryptographically random bytes encoded as 64 hexadecimal characters. Generate it in a password manager or with `openssl rand -hex 32`, store it securely, and paste it into the prompt. Keep it available for recovery; changing it without re-encrypting existing rows makes old tokens unreadable. See [Meta setup](META_SETUP.md) for the difference between login and webhook signing credentials.

Then run:

```sh
npm run pair
```

This authenticated Wrangler command writes only a hashed single-use pairing code to D1. The displayed code expires in ten minutes. Paste it and your Worker HTTPS origin into the desktop Settings. Pairing cannot be replayed. Desktop device tokens are hashed server-side and encrypted using Electron safeStorage/OS facilities locally.

## Check operation

```sh
curl https://dmflow-api.YOUR_SUBDOMAIN.workers.dev/health
npx wrangler tail --config workers/api/wrangler.local.json
```

Health checks D1; its queue field describes configuration, not proof of remote delivery. Validate actual Queue processing through the real acceptance test. Logs deliberately omit credentials, webhook bodies, and OAuth URLs. Automatic invocation request logs are disabled so callback query codes do not appear there.

The scheduled job runs every minute: recover pending sends/outbox entries, republish durable webhook receipts, quarantine interrupted dispatches, and refresh due accounts. Media is normally collected every six hours, at most two accounts per scheduled run. Failed syncs retry after an hour. Queue retries use a dead-letter queue; inspect failed receipt metadata and dead-letter backlog before deciding on any manual repair.

Useful read-only operational queries (run with `npx wrangler d1 execute dmflow --remote --config workers/api/wrangler.local.json --command 'SQL'`):

```sql
SELECT status,COUNT(*) FROM messages GROUP BY status;
SELECT id,status,attempts,error_detail FROM webhook_receipts WHERE status='failed';
SELECT COUNT(*) FROM outbox WHERE published_at IS NULL;
SELECT account_id,last_error,next_sync_at FROM sync_state WHERE last_error IS NOT NULL;
```

To revoke a lost device, set its `devices.revoked_at` timestamp through authenticated D1 administration. To disconnect an account immediately, set its status to `disconnected` and revoke the app’s grant in Instagram. Back up before any operator deletion. V1 has no multi-user administration UI.

## Local Worker development

Copy `workers/api/.dev.vars.example` to the ignored `.dev.vars` in that directory only when real local credentials are necessary. Leave tests credential-free.

```sh
npx wrangler d1 migrations apply dmflow --local --config workers/api/wrangler.jsonc
npm run worker:dev
npm run test:worker
npx wrangler deploy --dry-run --config workers/api/wrangler.jsonc
```

The checked-in configuration contains no account/database identifiers. Cloudflare deployment was not performed during delivery because Wrangler reported unauthenticated; local integration success is not production deployment verification.
