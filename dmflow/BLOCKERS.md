# Delivery status and external blockers

Updated 2026-10-01.

## Demo verification

Source, interactive six-page Electron app, persistent SQLite demo, shared engine/schema, simulation controls/CLI, Worker adapter, tests, setup scripts, and documentation are implemented. Forty-two unit/API/provider tests pass. Local Workers/D1/Queues integration passes, including queue receipt processing and repository parity. Source desktop acceptance passes. The unsigned Apple Silicon app and ZIP have been built. Packaged acceptance passes, including typo/exclusion checks and persistence. Detailed status is recorded in `docs/VERIFICATION.md`.

## Deployment verification

**Blocked by Cloudflare authentication.** `wrangler whoami` reported unauthenticated on September 29. No remote database, queues, Worker, or production secrets were provisioned. Worker type generation and deployment dry-run pass; these are local validations only.

Minimal next action: run `npx wrangler login` in this repository. Then follow `docs/CLOUDFLARE_SETUP.md`: setup, final HTTPS origin, deployment, interactive secret entry, health check, and pairing.

## Live Instagram verification

**Blocked by account/app credentials and access.** No Meta app credentials, authorized professional account token, or proof of required app access were available. OAuth, comment private replies, inbound sends, signatures, token refresh, and media requests are implemented against dated official contracts and fixture-tested; none is reported as live-proven.

Minimal next actions: configure the Instagram Login app and secrets, verify callback/subscriptions, satisfy Live/Advanced Access requirements for comment webhooks, and authorize a public professional pilot account. Use `docs/META_SETUP.md` and execute the real-account procedure in `docs/ACCEPTANCE.md`. Supply credentials through Cloudflare secret prompts, not chat.

The earlier documentation-access blocker was substantially resolved through the official browser pages and user-provided changelog. The endpoint-specific webhook access requirements remain stricter than the overview’s general Standard Access description; do not assume role-account testing bypasses them.

## Distribution and deferred verification

No Apple signing identity/notarization access was supplied. The local build is unsigned/not notarized; distributable signing is not claimed. Hosted CI passed on 2026-10-01 for Windows, macOS, and Linux test jobs. The Windows NSIS packaging job also passed and produced `DMFlow Setup 0.1.0.exe`; the installer remains unsigned and still needs a human smoke-test on a Windows desktop before public distribution. Linux desktop packaging remains outside the current deliverable. Cloud scale, production recovery, real provider rate limits, real views, and live account identity behavior need pilot evidence.

TikTok’s official index documents Comment-to-Message and business messaging, but exact region/eligibility and account-specific review access remain unverified. TikTok is explicitly unsupported in V1. Public privacy/deletion materials require the operator’s actual details and are not fabricated.

## Scout discovery and validation

The local Scout prototype now supports CSV/manual research plus a credential-gated Modash AI Search adapter. No paid provider is enabled by default. Provider results preserve provenance and remain human-unverified until checked; the app does not invent missing view/baseline metrics. Nine local Scout/provider tests pass.

**Commercial discovery remains externally blocked by licensing/credentials.** Modash's published Discovery API pricing is not an implementation blocker, but purchasing a contract is intentionally deferred until agency pilots establish willingness to pay. TikTok discovery must use an appropriate TikTok One / TTO path rather than repurposing the Accounts API.

**Market validation remains external.** Product-market demand cannot be solved in code. Run agency-operator pilots with the import-first workflow before buying discovery data or turning on billing.

## October 1 prototype follow-up

**Resolved on the prototype branch:** cross-platform dependency install/test verification and unsigned Windows packaging. GitHub Actions run [36928638475](https://github.com/slayerkey/dmflow/actions/runs/36928638475) completed successfully on Ubuntu, Windows and macOS for `npm ci`, typecheck, existing tests, portal tests and Worker integration tests. The same run built the Windows NSIS package and macOS ARM64 package; the unsigned Windows artifact is retained by GitHub Actions temporarily. This verifies the build recipe, not code signing, notarization or production distribution.

**Partially resolved:** Scout has an optional server-side Modash Discovery API adapter and explicit provider/evidence mapping. It stays disabled without `SCOUT_MODASH_API_KEY`; the public API license currently starts at $16,200/year, so no purchase was made. Manual/CSV import remains the $0-provider validation path. Modash advertises test credits via a demo request, which is the next no-purchase provider test.

**Still external / cannot be solved in source alone:**
- Meta app credentials, Advanced Access / App Review, live professional-account authorization and real webhook/send acceptance.
- Cloudflare account authentication and production secrets if Creator live mode is deployed.
- A commercial creator-data license or approved testing credentials for live Scout discovery.
- Real agency pilot evidence showing the Scout workflow is worth paying for.
- Production SaaS account auth, multi-tenancy, billing, privacy/deletion operations and signing certificates. These should not be built before buyer validation unless required for a pilot.

**Not a blocker for the next pilot:** public hosting, automated cold Instagram outreach, or a paid discovery API. Run Scout locally with a real agency-supplied CSV first.
