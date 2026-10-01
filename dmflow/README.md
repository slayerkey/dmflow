# DMFlow V1

A desktop Instagram resource automation app for a private creator pilot. Includes a persistent, credential-free demo and a Cloudflare-backed Instagram Login adapter. Live Instagram behavior has **not** been proven with a real authorized account; see [BLOCKERS.md](BLOCKERS.md).

## Open the app

On an Apple Silicon Mac, open `artifacts/mac-arm64/DMFlow.app`, or unzip the versioned Mac ZIP in `artifacts/`. The app starts in **Demo workspace**. No terminal, development server, Cloudflare account, or Instagram credentials are needed for normal demo use. This build is **unsigned and not notarized**. If macOS asks, use Finder’s Open action or the corresponding Privacy & Security approval for this local build; do not disable Gatekeeper globally.

Start at Home: 128,400 views, 2,841 keyword hits, 2,734 messages, 627 unique clickers, 184 engaged people, and 711 potential leads (100 people both clicked and engaged). The primary yield is 5.54 potential leads per 1,000 views. These are calculated from stored facts, not hardcoded dashboard totals.

Use **Try it out** to send a simulated comment, typo, excluded phrase, blocked event, or failed delivery. Open the tracked resource link and simulate a follow-up DM. Create/edit/pause campaigns, search and block people, inspect their timelines, compare content, and change the estimated manual response time. Settings → Reset demo restores the seed after a confirmation. Demo changes persist across restarts.

## Develop and verify

Run `npm run doctor` anytime for a credential-free status check and the next actionable blocker. It prints presence/status only, never secret values.


Requires Node.js 22.13+ with `node:sqlite`, npm, and macOS for Mac packaging. Validated here with Node 23.8 and the pinned lockfile.

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run test:worker
npm run test:desktop
npm run package
```

`npm ci` downloads Electron through its install script. `npm run dev` builds and launches the app; it does not require a Vite development server. The packaged app bundles its renderer, backend, SQLite runtime, and migrations. Node may print an experimental SQLite warning in development.

`test:worker` uses real local Miniflare Workers/D1/Queues, not cloud resources. `test:desktop` launches a separate disposable Electron instance and saves screenshots in `artifacts/`. Test the packaged executable with:

```sh
DMFLOW_TEST_EXECUTABLE="$PWD/artifacts/mac-arm64/DMFlow.app/Contents/MacOS/DMFlow" npm run test:desktop
```

## CLI demo simulations

The CLI has an isolated demo database; it does not alter your open desktop instance. Start `npm run demo:server` in one terminal. In another:

```sh
npm run simulate:comment -- --text 'ROADMAP' --person sample-person
npm run simulate:comment -- --text 'roamdap' --person typo-person
npm run simulate:comment -- --text "don't send roadmap" --person excluded-person
npm run simulate:comment -- --text 'ROADMAP' --person blocked-person --blocked
npm run simulate:click
npm run simulate:dm -- --text 'Thanks!' --person sample-person
```

`--media media-1`, `--username name`, and `--failure transient|permanent|uncertain|auth` are also supported. In the desktop, use the visible simulator instead. Demo links use a local loopback server and work while that app/session is running.

## Enable live mode

Follow [Cloudflare setup](docs/CLOUDFLARE_SETUP.md), then [Meta setup](docs/META_SETUP.md). Generate a one-time pairing code with `npm run pair`, paste the Worker HTTPS origin and code in Settings, choose Open live workspace, and connect Instagram. Credentials never enter renderer JavaScript; provider tokens remain encrypted in D1. Demo and live data are separate. Restarting the app opens demo by default; the saved pairing remains available.

## Repository

| Path                 | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| `apps/desktop`       | React UI, Electron main/preload, packaged renderer                               |
| `workers/api`        | Hono Worker, OAuth, signed webhook intake, Queue consumer, scheduled recovery    |
| `packages/core`      | Matching, send state machine, attribution, metrics, API, SQLite repository       |
| `packages/shared`    | Interfaces, input schemas, event/send types                                      |
| `packages/instagram` | Instagram Login live provider, simulator, explicitly unsupported TikTok provider |
| `migrations`         | Shared SQLite/D1 schema                                                          |
| `fixtures`, `tests`  | Sanitized provider examples, unit and integration tests                          |
| `scripts`            | Build, package acceptance, setup, pairing, CLI simulations                       |
| `docs`               | Architecture, dated evidence, setup, operations, acceptance, V2 scope            |

## Attribution boundaries

Potential leads are the distinct union of clicked and engaged people within the selected account scope. Clicks and replies are parallel outcomes. Forwarded links remain attributed to the original recipient; an HTTP request cannot prove a human clicked. Known previews, prefetches, and HEAD requests are excluded. No cookies or IP addresses are stored.

Content yield uses lifetime automation results and the latest lifetime views, counting shared media once. Any missing selected view value makes the aggregate yield unavailable. DM-only outcomes have their own messaged-person rate. View collection time is visible; insights can lag. Time saved is an estimate from confirmed sends and the configurable 30-second default.

V1 intentionally excludes all-future-post targeting, inbox replacement, public replies, multi-step flows, payments, team roles, and TikTok integration. See [roadmap](docs/V2_ROADMAP.md).

## Three-product local portal (Scout pilot)

The additive local [shared product website and Scout prototype](apps/portal/README.md) is available using Node 22.13+ without installing npm packages:

```sh
npm run web:dev
# Open http://127.0.0.1:4173
npm run test:portal
```

Use `/app#scout` for campaign briefs, imported creator candidates, evidence-aware shortlists, manual verification, editable outreach drafts, manual mail-client handoff, pipeline and CSV export. `/app#campaigns` is a consent-first planning-only preview; `/app#creator` points to this existing Electron Creator app, whose source remains unchanged. Fictional examples are labeled. Optional licensed discovery adapters are credential-gated and server-side; no third-party scraping, billing, or automatic outbound recruitment is enabled. Detailed confidential market research intentionally belongs **outside this public repository**.

Windows development: Node 22.13+ with `npm run web:dev` for the new portal. Cross-platform CI now passes the existing tests on Windows/macOS/Linux, and the Windows NSIS recipe successfully produces an unsigned installer in GitHub Actions. A human Windows smoke-test and production signing remain before public distribution. Existing Mac packaging is preserved.

Windows/macOS/Linux Worker integration tests now use the same `npm run test:worker` command; `scripts/run-worker-tests.mjs` sets the test-run environment without a POSIX-only assignment. On Windows PowerShell, use `npm run package:win` for an unsigned local NSIS build once dependencies install. Hosted Windows packaging is verified; local human installation/smoke-testing is still required.

## Product and design notes

- [Product map and current boundaries](docs/PRODUCT-MAP.md)
- [Website design swipe guide](docs/DESIGN-REFERENCE.md)
- [Exact Scout pilot runbook](docs/PILOT-RUNBOOK.md)
- [Scout discovery provider options](docs/PROVIDER-OPTIONS.md)
- [API research](docs/API_RESEARCH.md)
- [Current blockers](BLOCKERS.md)

The repository is public. Keep customer interviews, private pricing research, credentials and real pilot data outside this repository.
