# Validation and acceptance

## Automated coverage

`npm test` covers normalization, typo/short-word false positives, exclusions, overlap selection, duplicates/concurrent claims, cooldown boundary, blocking/self/nested/unknown parent, uncertain dispatch recovery, bounded retries, pauses, expired comment windows, redirect preview filtering, unique lead overlap, provider-timestamp attribution, shared/missing views, seed consistency, workspace authentication/isolation, single-use pairing, AES/HMAC, private-reply versus DM request bodies, 1,000-byte limits, historical keyword aliases, parallel people filters, returned-recipient aliases, message snapshots, live rate reservations, webhook normalization, OAuth exchange identity, and secret redaction.

`npm run test:worker` uses an actual local Worker runtime, D1 database, and Queue consumer. It validates shared-repository seed parity, concurrent processing, HTTP authorization, signature verification, durable webhook receipt processing, and OAuth state replay rejection. It does not call Instagram.

`npm run test:desktop` launches an isolated app, checks the seed dashboard, creates a campaign through the wizard, matches a comment, follows an actual local HTTP redirect, simulates an engaged reply, checks typo/exclusion behavior, filters people, navigates media/settings, changes the time estimate, and verifies saved campaign/settings after restart. The same test can target the packaged executable. Screenshots are stored in `artifacts/`.

## Manual demo journey

1. Launch DMFlow. Confirm visible Demo workspace labeling and the 5.54 yield.
2. Create a comment campaign for a chosen post, keyword BLUEPRINT, valid HTTPS destination, short message, and 24-hour cooldown. Activate it.
3. Try it out → select that post, enter BLUEPRINT and a fresh person. Confirm one sent result. Open the tracked link.
4. Simulate a follow-up DM. Its text need not match a campaign to establish engagement after a confirmed send.
5. Inspect People → Engaged, the person timeline, and updated lead counts. Clicked + engaged counts once.
6. On the roadmap post, try `roamdap` with a new person. Try `don't send roadmap` and a blocked person. Check the explanation for each result.
7. Pause a campaign; pending/retry sends must stop. Simulate uncertain delivery and confirm that automatic recovery does not resend it.
8. Restart the app and confirm edits persist. Reset demo only when ready to discard the demo edits.

## Real Instagram acceptance — not yet run

Prerequisites: deployed authenticated Worker, valid secrets, public professional account, Meta app Live, required access/review, verified callback and subscriptions, paired desktop, connected account and fetched owned media. Use a separate consenting Instagram account as the participant.

1. Create a specific-post ROADMAP campaign with a controlled resource destination. Confirm campaign/media/account identity.
2. Post one top-level `ROADMAP` comment from the participant. Confirm a signed webhook receipt, one matched event, exactly one confirmed private reply in the participant’s native Instagram inbox, and one stored provider message ID.
3. Re-deliver the same fixture/event only through a controlled signed test or provider redelivery; verify no second send. Test own and nested comments; no private reply should be sent.
4. From a fresh eligible participant, test a typo; then an exclusion and blocked person. Check logs and native inbox for both expected delivery and expected absence.
5. Click the real tracked link, verify HTTP 302 and the destination, then reply in Instagram after the automated message. Confirm parallel click/engagement facts and a single potential lead.
6. Create an inbound-DM keyword campaign. Send its keyword from the participant, verify one ordinary DM reply in the valid window, and confirm it does not inflate view-normalized results.
7. Pause and verify future sends stop. Revoke authorization and verify reconnect guidance. Restore access and inspect media view availability/collection time without assuming every post returns views.
8. Record timestamps, IDs, redacted results, and screenshots. Keep production findings separate from simulated/local test evidence.

Do not claim live acceptance, cloud deployment, app review, signing, or notarization from a passing demo test.
