# Scout discovery provider options

Research date: 2026-10-01. Prices and limits can change; verify directly before buying. This document is public-safe and contains no credentials.

## Recommendation for the first live-data test

**Use an agency-supplied CSV first.** It proves whether Scout's ranking, evidence review and outreach workflow are useful without paying a data vendor.

If a live discovery feed is necessary for the pilot, test **Influencers Club** first because its current public docs expose a self-serve natural-language Discovery API and trial access at a much lower entry cost than Modash.

## Current options

| Source | Platforms | Current entry point | Best use in DMFlow | Current status |
| --- | --- | --- | --- | --- |
| Agency / operator CSV | Any legitimately researched list | $0 software cost | Validate workflow and buyer pain | Implemented |
| Influencers Club | Instagram, TikTok, YouTube + others | Trial: 30 successful API requests. API Pro advertised from $208/mo | Affordable natural-language creator discovery | Implemented, disabled without server-side key |
| CreatorDB | Instagram, TikTok, YouTube | PAYG from $40; plans advertised from $79/mo | Potential lower-cost discovery + deeper creator/sponsorship data | Research candidate; adapter intentionally not enabled until response contract is verified |
| Modash | Instagram, TikTok, YouTube | Discovery API advertised from $16,200/year; testing credits available by request | Enterprise-grade AI/content search and matching posts | Implemented fallback, disabled without server-side key |
| YouTube Data API | YouTube only | Google quota rather than a DMFlow vendor subscription | Official low-cost YouTube-only research | Not integrated into Scout |
| TikTok One | TikTok | Access/eligibility dependent | Official TikTok creator marketplace path | Not integrated; access must be verified |

## Influencers Club contract used by the prototype

Official documentation currently lists:

```
POST https://api-dashboard.influencers.club/public/v1/discovery/
Authorization: Bearer <server-side key>
Content-Type: application/json
```

DMFlow sends:
- `platform`;
- a campaign-derived `nlp_search`;
- empty explicit filters unless we have verified dictionary values;
- relevance sorting;
- a small page limit.

The provider's Discovery response is treated as **candidate sourcing data, not verified truth**. DMFlow deliberately does not infer:
- recent breakout performance when post views/date/baseline are missing;
- contact email when discovery does not return one;
- content format or niche unless represented by evidence we can store;
- permission to contact the creator.

The operator still reviews source evidence before personalized outreach.

## Why Modash is not the first purchase

Modash is technically attractive because its AI search can return matching posts and semantic scores. The problem is the current public annual minimum. At the validation stage, paying an enterprise contract before proving the workflow would confuse data access with product-market demand.

Keep the adapter because a larger agency could justify it later.

## Why CreatorDB is worth testing next

CreatorDB currently advertises:
- self-serve API keys;
- pay-as-you-go credits from $40;
- plans from $79/month;
- Instagram, TikTok and YouTube profiles;
- natural-language search;
- sponsorship and contact data as separately metered fields.

That makes it a promising second live-data test, especially if Scout needs deeper vetting rather than the broadest possible index. Do not integrate it until its current API v3 response schema and field licensing are confirmed against the exact endpoints we need.

## Cost discipline

During validation:
1. never enrich every search result automatically;
2. search a small candidate set;
3. enrich only shortlisted creators;
4. store provider provenance and retrieval time;
5. respect vendor retention / redistribution terms;
6. do not expose vendor API keys to the renderer;
7. do not advertise a metric the selected provider cannot reliably return.

## Environment variables

```
SCOUT_INFLUENCERS_CLUB_API_KEY=
SCOUT_MODASH_API_KEY=
```

Credentials belong in the operator's local/server secret environment, not in this repository.
