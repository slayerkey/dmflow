# DMFlow Scout pilot runbook

Updated 2026-10-01. Public-safe: do not commit a participant's private campaign brief, creator list, email addresses, customer notes, API credentials, or pilot recordings to this repository.

## Goal

Answer one question before building more SaaS infrastructure:

> Does Scout help a small UGC / creator agency produce a genuinely contact-worthy creator shortlist and reviewed outreach materially faster than its current process?

The pilot can run with **zero paid provider cost** using an agency-supplied CSV. Licensed discovery is optional.

## 1. Recruit the right tester

Use an operator who personally sources/recruits creators for active campaigns. Prefer an agency or team that typically needs roughly 10–50 creators in a campaign, not an individual creator looking for brand deals.

Ask them to bring:
- one real, currently relevant campaign brief;
- 20–50 creator candidates they are legitimately allowed to research, if they already have a list;
- their normal workflow (sheet, tabs, CRM, notes, etc.);
- 30–45 minutes.

Do not ask them to paste credentials into DMFlow.

## 2. Record the baseline

Before showing Scout, ask the operator to explain or demonstrate how they would normally choose 10 creators worth contacting.

Record privately:
- minutes required;
- tools/tabs used;
- information they check before outreach;
- what makes them reject a creator;
- where outreach drafts and follow-up status live;
- the point in the workflow they hate most.

Do not commit these notes to this public repository.

## 3. Run Scout

From the repository's `dmflow` directory:

```sh
npm run web:dev
```

Open:

```
http://127.0.0.1:4173/app#scout
```

Then:
1. Open **Pilot Mode** and enter the operator's normal baseline time if known.
2. Click **Start measured pilot** when the operator begins using Scout.
3. Enter the real campaign brief.
4. Import the agency's creator CSV, or use licensed discovery if a trial key is configured.
5. Review the ranked candidates.
6. Use **Add to shortlist** for creators the operator would genuinely contact. Scout automatically timestamps the tenth distinct shortlist decision.
7. Open each shortlisted candidate's source/evidence.
8. Mark evidence checked only after a human actually verifies it.
9. Prepare and edit outreach.
10. Approve the message.
11. Handoff to the operator's permitted email/client workflow.
12. Record status manually.
13. Click **End pilot**, then download the local pilot-summary JSON plus the creator CSV if desired.

Nothing in the prototype automatically sends an Instagram cold DM.

## 4. Optional live discovery trial

### Preferred pilot provider: Influencers Club

Current public documentation says trial accounts receive 30 successful API requests. API access is available on the Pro plan after trial, currently advertised from $208/month. Discovery supports natural-language briefs and Instagram, TikTok and YouTube.

Create the trial directly with the provider, then set the key only in your local shell:

macOS / Linux:

```sh
export SCOUT_INFLUENCERS_CLUB_API_KEY="YOUR_LOCAL_KEY"
npm run web:dev
```

Windows PowerShell:

```powershell
$env:SCOUT_INFLUENCERS_CLUB_API_KEY="YOUR_LOCAL_KEY"
npm run web:dev
```

Never put the key in source control.

### Enterprise fallback: Modash

The adapter remains available through `SCOUT_MODASH_API_KEY`, but the public Discovery API price starts at $16,200/year. Do not buy it for a first pilot; use testing credits only if the vendor supplies them.

## 5. What to measure

For the same campaign brief, capture:

| Metric | Baseline | Scout | Notes |
| --- | ---: | ---: | --- |
| Minutes to 10 contact-worthy creators |  |  |  |
| Creators reviewed to get those 10 |  |  |  |
| Top-10 creators operator would actually contact |  |  |  |
| Drafts needing factual correction |  |  |  |
| Tools/tabs used |  |  |  |
| Follow-up status lost / unclear |  |  |  |

Pilot Mode records the baseline, elapsed session time, time-to-10, shortlist count, verified count and approved count locally. Keep each downloaded pilot summary with the private interview notes.

After permitted outreach, optionally track:
- meaningful replies;
- interested creators;
- negotiations;
- recruited creators.

Do not turn any single pilot result into a public marketing claim.

## 6. Five interview questions

1. Where in this workflow did Scout save you real work, if anywhere?
2. Which recommendation or piece of evidence would you not trust yet?
3. If Scout disappeared tomorrow, which part would you actually miss?
4. What would need to happen for your team to use this on the next campaign?
5. At what monthly price would you seriously consider keeping it, and what would have to be included at that price?

Ask the price question last.

## 7. Decision rule after three agency pilots

Continue **Scout-first** if the repeated pain is sourcing/research/recruitment and operators ask to reuse the workflow.

Move **Campaigns** forward if the repeated pain is deploying the same authorized campaign logic across many participating creator accounts.

Emphasize **Creator** if the strongest demand comes from individual creators converting inbound Instagram attention instead of agencies recruiting creators.

Do not choose based on which product is most fun to build.

## 8. Do not build yet

Until pilots demand it, defer:
- Stripe billing;
- public signup;
- production multi-tenancy;
- broad team roles;
- automatic cold Instagram outreach;
- scraping infrastructure;
- expensive annual creator-data contracts;
- a full inbox replacement;
- complex AI agents.

## 9. Pilot completion checklist

- [ ] Active agency buyer/operator tested
- [ ] Baseline workflow recorded
- [ ] Real brief entered
- [ ] Real candidate data used legitimately
- [ ] 10 candidates reviewed
- [ ] Evidence limitations surfaced
- [ ] Outreach drafts reviewed by human
- [ ] No unsupported delivery claim made
- [ ] Time difference captured
- [ ] Five interview questions answered
- [ ] Willingness-to-pay captured
- [ ] Next product decision written down
