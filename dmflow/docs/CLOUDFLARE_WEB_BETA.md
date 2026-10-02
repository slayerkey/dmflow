# DMFlow Creator — single-site Cloudflare pilot

**Status (October 2, 2026): web-beta source scaffold, not yet publicly deployed or Meta-live proven.** Prioritize Creator as a Manychat-style Instagram keyword/resource automation replacement. Scout is an existing secondary product, not the current build focus. Do not claim to replace every Manychat capability yet.

## One product, one backend

A single Worker serves the public Creator landing page at `/`, the invited React Creator dashboard at `/app`, the live Creator API at `/app/api/*`, and the existing public Instagram OAuth callback, webhooks, tracking redirect and Worker queue.

The same React Creator interface is compiled for Electron (existing product) and web (new browser bridge). It uses the same core automation engine and D1 data model—not a second independent Instagram implementation.

Future `/scout` and `/campaigns` product pages and workspaces can share branding/auth on this site, but the current pilot focuses on Creator.

## Why two authentication steps?

1. **DMFlow login:** Cloudflare Access sends a one-time email PIN to an allowlisted tester. This confirms her identity to DMFlow.
2. **Instagram connection:** inside the logged-in Creator dashboard she clicks Connect Instagram and explicitly grants official Instagram Login permissions to your Meta app. An email login grants **no** access to Instagram.

Browser requests carry a Cloudflare Access JWT checked cryptographically (signature, team issuer, audience, expiration, email) on the Worker. The verified email must ALSO have an active `pilot_invites` D1 record. First successful login creates a distinct workspace. The original desktop bearer-token pairing remains separate.

**Cloudflare Access must protect the `/app*` application path** and grant only your specific tester email(s). Do not protect the entire Worker: Instagram callbacks/webhooks and tracked public resource URLs must remain reachable without login. Never rely on a mere `CF-Access-Authenticated-User-Email` header or decoded, unsigned JWT.

## Setup sequence — requires your Cloudflare login

Use Node 22.13+ in the `dmflow/` repository.

1. `npm ci` then `npm run build:web`. Check `apps/web/public/app/index.html` and `browser-bridge.js` exist.
2. `npx wrangler login` then `npm run setup` to create D1, queues and apply both `0001` and `0002` migrations. Make sure `workers/api/wrangler.local.json` is copied/updated from the current template and retains the `assets` stanza; an older local file may not contain it.
3. In Cloudflare Zero Trust, add **One-time PIN** identity provider and create a **Self-hosted Access application** for your final Worker hostname with path `/app*`. Allow only your own email and the tester's email. Get the Access **AUD tag** and your team domain, e.g. `https://your-team.cloudflareaccess.com`.
4. Add that same email to D1, replacing the address with the actual tester (do not commit addresses):

```sh
npx wrangler d1 execute dmflow --remote --config workers/api/wrangler.local.json \
  --command "INSERT OR IGNORE INTO pilot_invites(email,active) VALUES('TESTER_EMAIL_HERE',1);"
```

5. Set the Worker runtime configuration via interactive Cloudflare secret prompts (no values in git/chat):

```sh
npx wrangler secret put ACCESS_TEAM_DOMAIN --config workers/api/wrangler.local.json
npx wrangler secret put ACCESS_AUD --config workers/api/wrangler.local.json
npx wrangler secret put META_APP_ID --config workers/api/wrangler.local.json
npx wrangler secret put META_APP_SECRET --config workers/api/wrangler.local.json
npx wrangler secret put META_WEBHOOK_SECRET --config workers/api/wrangler.local.json
npx wrangler secret put META_VERIFY_TOKEN --config workers/api/wrangler.local.json
npx wrangler secret put TOKEN_ENCRYPTION_KEY --config workers/api/wrangler.local.json
```

6. Set `PUBLIC_WORKER_URL` to your final HTTPS Worker origin (no trailing slash) in ignored `wrangler.local.json`. In Meta Developer Console set the matching callback `https://YOUR-ORIGIN/oauth/instagram/callback`, webhook `https://YOUR-ORIGIN/webhooks/instagram`, and required Instagram Login permissions/subscriptions. Follow `docs/META_SETUP.md` and `docs/ACCEPTANCE.md`; do not claim live permission approval until accepted.
7. `npm run web:deploy`. This rebuilds public HTML + invited Creator dashboard and deploys the existing Worker with static assets. Cloudflare can supply a `workers.dev` hostname for initial testing; custom domain is optional now.
8. Visit `https://YOUR-ORIGIN/app` in a private browser window. Check Access one-time PIN, then the correct isolated workspace; Connect Instagram and complete a real comment-to-DM test only after Meta permissions and account review are ready.

**Do not send a tester a “live IG working” promise before the exact acceptance test passes.**

## Domain decision

No new domain purchase is required for the initial trial. You may use a workers.dev URL. Later connect a domain or subdomain in Workers → Settings → Domains & Routes. Owning the domain at Cloudflare Registrar is optional: a domain registered at Namecheap can use Cloudflare DNS and Workers without transferring registration.

## Current limits and remaining external prerequisites

- No Cloudflare account connection is currently available to this chat; actual resource setup, Access application policy, secrets, DNS and deployment must be completed inside your account.
- No Meta Business app credentials, Advanced Access approval, live professional-account authorization or verified delivery logs are available here. These cannot be faked or purchased away.
- Current live V1 supports selected owned post/Reel comment keyword automation and inbound-DM keywords, not every Manychat feature or unsolicited DMs.
- Access OTP + D1 allowlist is appropriate for a private invited pilot. General public signup, Stripe billing, team roles, production support/monitoring, privacy requests and provider review material remain future launch tasks.
- The Scout portal is currently a **separate local Node tool**. Its workflows are not yet migrated to D1/Cloudflare web and should not be advertised as one integrated hosted dashboard.
- Do not upload real customer DMs/screenshots, tester emails or commercial research to this public repo. If an exact prior DM screenshot is important, supply it privately for product acceptance.

## Pilot acceptance checklist

- [ ] Public landing loads from Worker / custom domain
- [ ] Uninvited visitor cannot access `/app` or `/app/api/*`
- [ ] Invited email receives Cloudflare one-time code
- [ ] Different invited emails have isolated D1 workspaces
- [ ] Instagram Connect opens the **official** Meta consent screen
- [ ] Callback creates a connected account only for the correct workspace
- [ ] Comment webhook signature verification and queue processing pass
- [ ] Tester creates keyword/resource campaign and sees eligible send evidence
- [ ] Wrong phrase, typo, exclusion, duplicate, 24-hour DM rule and expired grants behave safely
- [ ] Link clicks and engagement metrics distinguish observed events from estimates
- [ ] Privacy, deletion and support paths exist before admitting real external testers
