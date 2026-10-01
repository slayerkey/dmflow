# DMFlow product map — public-safe

Updated 2026-10-01. This document describes what the prototype actually does and what still requires validation. It intentionally excludes private customer conversations and commercial research because this repository is public.

## One foundation, three products

### Scout — first validation priority
**Buyer:** small UGC/influencer agencies and creator-recruitment operators.

**Job:** turn a campaign brief plus legitimately sourced creator candidates into an explainable shortlist, reviewed outreach drafts and a recruitment pipeline.

**Implemented now:** brief builder, CSV/operator imports, deterministic evidence-aware ranking, missing-data flags, manual evidence verification, template/local-AI drafting, human approval, permitted email-client handoff, response/status tracking, CSV export, optional server-side licensed Influencers Club and Modash discovery adapters.

**Not claimed:** automatic globally fresh viral discovery, provider-verified performance for arbitrary accounts, scraped contact details, unsolicited Instagram DMs, automatic email delivery, production multi-tenant SaaS.

### Campaigns — secondary validation
**Buyer:** agencies coordinating many participating creators.

**Job:** reuse campaign setup without pretending one creator authorization grants access to another account.

**Implemented now:** planning template and authorization-readiness preview.

**Deferred until demand + platform access are proven:** per-creator OAuth roster, account entitlements, team permissions, template deployment, consolidated reporting.

### Creator — existing product
**Buyer:** individual creators/coaches using their own authorized account.

**Job:** turn Instagram comment/message intent into resource delivery and attributable conversations.

**Existing implementation:** Electron/React demo, shared SQLite/D1 processing engine, matching/typo/suppression logic, attribution, Cloudflare Worker adapter and Instagram provider code.

**Still external:** Meta production approval/live account acceptance and production code signing/notarization. Cross-platform tests and unsigned Windows packaging are verified in CI.

## Why Scout first

Creator auto-DM is crowded. Campaign-wide automation has value only if agencies actually want to own this layer and every participant can be authorized. Scout can be tested earlier with an agency's existing list, which measures whether ranking + research + outreach preparation removes meaningful labor before paying for creator data. A lower-cost Influencers Club trial/API path now exists, so live discovery can be tested without committing to Modash's enterprise annual minimum.

## Validation metric

For one live agency brief, record:
1. baseline minutes to produce 10 genuinely approvable candidates;
2. DMFlow-assisted minutes to the same standard;
3. how many of 10 candidates the buyer would really approach;
4. how many draft claims needed correction before approval;
5. meaningful reply / recruited status after the operator sends through a permitted channel;
6. explicit willingness to continue at a stated price.

Do not turn targets into marketing claims until measured.

## Current technical boundaries

- Local portal binds to 127.0.0.1.
- Sample creators are fictional and labeled.
- Creator imports are operator-supplied unless a server-side licensed provider is explicitly configured.
- Provider credentials stay server-side.
- Scout outbound remains human-approved.
- No billing is enabled.
- No public deployment is required for validation.
- Public repo contains no private interviews, credentials or real customer datasets.

## Development commands

```sh
npm run web:dev
npm run test:portal
```

After dependencies install:

```sh
npm run typecheck
npm test
npm run test:worker
npm run package:win   # Windows
npm run package       # macOS ARM64
```

Cross-platform CI lives in `.github/workflows/dmflow-prototype-verification.yml`. See `PILOT-RUNBOOK.md` for the next validation run and `PROVIDER-OPTIONS.md` for discovery-data choices.
