# Meta setup for the private pilot

Use the official sources and dated caveats in [API research](API_RESEARCH.md). No real credentials are included. Do not paste secrets into chat or renderer code.

1. Create/configure a Meta Business app and add **Instagram → API setup with Instagram login**. Use a public Instagram professional Business or Creator account. This login family does not require a linked Facebook Page.
2. Copy the **Instagram app ID and Instagram app secret** from that product’s setup into Cloudflare secrets `META_APP_ID` and `META_APP_SECRET`. Do not substitute the unrelated top-level Meta app ID.
3. Set the OAuth redirect URI exactly to `https://YOUR_WORKER/oauth/instagram/callback`. The configured `PUBLIC_WORKER_URL` must have the same HTTPS origin, without a trailing slash.
4. Request basic, manage-comments, manage-messages, and manage-insights Instagram business permissions. Complete required review and business verification for their access levels. The Sep 16 webhook setup documentation specifically requires **Live mode and Advanced Access for comments/live_comments**; a role/tester account alone is not evidence that comment webhooks work.
5. Configure callback `https://YOUR_WORKER/webhooks/instagram`. Choose a random verification token and store it as `META_VERIFY_TOKEN`. Store the app secret used for webhook signing as `META_WEBHOOK_SECRET`; this may differ from the Instagram Login secret. The code falls back to `META_APP_SECRET` only when the separate signing secret is absent.
6. Subscribe to Instagram `comments` and `messages`. DMFlow also calls the connected account’s `subscribed_apps` edge after OAuth. A failed subscription is surfaced as setup required; reconnect after correcting permissions.
7. Publish the privacy policy/data handling and deletion instructions required by your app configuration and complete Meta’s dashboard requirements. These need the operator’s actual business/contact information and hosting; this repository does not invent them. Describe the desktop/pilot access route and provide reviewers a usable test path and screen recording.
8. Pair the desktop following [Cloudflare setup](CLOUDFLARE_SETUP.md), open live mode, and click Connect Instagram. Authorize in the system browser. Return to Settings; connection status polls while visible. Media sync follows connection and runs periodically. Use Media → Refresh Instagram media if needed.
9. Follow the real-account acceptance procedure. Do not enable campaigns for unrelated people before your authorized pilot is ready.

## Sender behavior

Comment campaigns use one `recipient.comment_id` private reply within seven days. Inbound DM campaigns use `recipient.id` within 24 hours of the trigger. The app intentionally excludes Live, ads, story comments, nested comments, unverified comment parents, echoes, and unsupported events. Create campaigns for specific owned Feed posts/Reels only.

Keep the configured response brief: the complete text plus generated URL must fit 1,000 UTF-8 bytes. Unicode emoji can use multiple bytes. Include a clear route to reply to the creator in Instagram; DMFlow is not a replacement inbox. The official overview recommends disclosing automated experiences and sets out jurisdiction-dependent requirements; configure suitable creator-facing copy for your use case.

## Troubleshooting

- **No comment events:** confirm public professional account, app Live, Advanced Access for comments, app-level and account-level subscriptions, callback verification, and media ownership. Comment metadata must return `parent_id`/`timestamp` successfully.
- **Connection setup required:** subscription failed after authorization. Correct app/dashboard requirements, then reconnect.
- **Reconnect needed:** expired/revoked authorization stops sends. Reconnect using OAuth; historical analytics remain.
- **Views unavailable:** insights are absent or unsupported, permission is missing, or collection has not completed. Values are null, not zero. Collection can lag; DMFlow fetches up to the latest 150 owned Feed/Reel items.
- **Delivery uncertain:** inspect the native Instagram conversation and provider evidence. Do not manually reset a dispatch state to force a resend. V1 deliberately provides no unsafe auto-resend control.

Token exchange/refresh happens only in the Worker. The scheduled job refreshes valid long-lived tokens before expiry. An already expired token requires reconnection.
