# DMFlow: one offer, one beta

Decision: October 2, 2026. This document overrides the older three-products-first marketing priorities without deleting or rewriting their code.

## What DMFlow is

**DMFlow is an Instagram DM automation product, initially offered with one-time guided setup for creators.**

A creator should be able to:
1. Join an approved invite-only workspace with an email PIN.
2. Connect **their own** eligible professional Instagram account via the official Instagram Login API.
3. Choose an owned Reel/feed post, comment keyword or inbound DM keyword, reply message and resource URL.
4. Review safe matching, typo handling, exclusions and cooldown.
5. Enable their automation when the integration and permissions are actually verified.
6. View recorded sends, tracked resource link clicks and engagement, with missing data labeled.

**One-time guided setup** is the selling difference in the beta: we help configure and validate the creator's *first* flow. It is not a separate app or a promise of ongoing bespoke management. No beta/recurring price should be represented as final until tested.

## Names and navigation

- Public website: DMFlow. One offer. No three-product suite, Scout positioning, agency pricing tiers or SaaS promises.
- Logged-in app navigation: Home, Campaigns, People, Media, Activity, Settings.
- **Campaign** = one configured DM automation for selected owned content or an eligible inbound keyword. Campaigns is **not** a separate product.
- Scout code is preserved but deprioritized. Do not integrate or advertise it during this Creator beta.
- The existing desktop app remains available as a development and optional creator client, but testers should evaluate the Cloudflare browser application first.

## Site preview and launch

Marketing entry: `apps/web/public/index.html`.

- Headline: **Your Instagram DMs, handled.**
- Promise: recognize resource requests, deliver the configured answer, show observed engagement.
- Primary action: Try the interactive demo (`/app/demo.html`; intentionally simulated).
- Secondary: invited beta sign-in (`/app`; real Access, real Meta prerequisites).

The site includes an illustrative dashboard without fictitious public results, one three-part product explanation and a large one-time guided-setup section. No unapproved testimonials or fabricated growth numbers.

The generated React browser bundle comes from the existing Creator UI (`npm run build:web`). The Cloudflare Worker routes `/app` and `/app/api` are protected with verified Access JWT plus an explicit D1 email-invite allowlist.

**Cloudflare deployment is not done by a GitHub CI pass.** The owner needs to authenticate their Cloudflare account, configure Access OTP (specific tester email allowed), configure final Worker domain and deploy as detailed in `CLOUDFLARE_WEB_BETA.md`.

## First beta acceptance (one specific creator)

1. Confirm the prospective tester's actual Instagram professional account and the *one* lead magnet/resource she currently distributes.
2. Have her describe exactly which post/comment/DM phrase should trigger it and what response she currently pastes. Do not infer details from unverified old screenshots.
3. Give her the interactive demo to test the concept before asking for Instagram access.
4. Set up her email invite in Cloudflare Access **and** D1 `pilot_invites`; do not store her email in GitHub.
5. When the Meta app/permissions are verified, authorize her professional Instagram account through Meta.
6. Complete a human-witnessed live end-to-end test: exact phrase, variant, nonmatch, duplicate, permitted send, resource-click attribution, and consent/reconnect failure behavior.
7. Make the first workflow active only after the tester agrees. Record her feedback and fix her highest-friction step.

## Real blockers versus code readiness

Existing app engine: built and cross-platform automated tests passing.
One-offer landing: changed, GitHub CI passing on October 2, 2026.
Browser app scaffold and Access verification: implemented and tested by repository CI; **not yet tested against configured, deployed Cloudflare Access**.
Real Meta delivery: external app credentials, Advanced Access/review where necessary, tester consent and live acceptance not completed by this repository alone.
Paid billing, multi-workspace self-service signup, comprehensive two-way DM inbox, ongoing custom service: not the first beta scope.

**Do not describe this V1 as a full replacement for all of Manychat or a full Instagram inbox manager.** It replaces the repeatable keyword-to-resource DM workflow first.
