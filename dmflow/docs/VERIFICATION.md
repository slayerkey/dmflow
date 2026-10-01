# Verification record

Date: 2026-09-29. Host: Apple Silicon macOS 15.6 (Darwin 24.6), Node 23.8.0. Application: DMFlow 0.1.0, Electron 44.4.5. Dependencies are pinned by `package-lock.json`.

| Check                                             | Result                                                                                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                               | PASS                                                                                                                                               |
| `npm test`                                        | PASS — 42 tests; the separately invoked Worker integration test is skipped in this command                                                         |
| `npm run test:worker`                             | PASS — actual local Workers/D1/Queues, shared seed parity, signature/auth/OAuth replay, concurrent processing; latest run approximately 84 seconds |
| Packaged `test:desktop`                           | PASS — wizard, comment, typo, exclusion, successful send, HTTP 302, engagement, people/media navigation, settings, restart persistence             |
| `npm run package`                                 | PASS — Apple Silicon `.app` and ZIP, no development server required                                                                                |
| Binary architecture                               | Verified Mach-O arm64                                                                                                                              |
| Signing                                           | No Developer ID signing or notarization; launcher has an ad-hoc linker signature, no team identity or sealed bundle resources                      |
| Worker type generation / deploy dry-run           | PASS locally; no remote deployment                                                                                                                 |
| Production dependency audit                       | Zero reported production vulnerabilities at delivery                                                                                               |
| Prettier source check                             | PASS                                                                                                                                               |
| Visual inspection                                 | Dashboard screenshot inspected; six desktop pages exercised, screenshots in `artifacts/`                                                           |
| Cloudflare authentication                         | Unauthenticated — remote provisioning/deployment NOT VERIFIED                                                                                      |
| Real Meta OAuth, webhook/send/insights acceptance | NOT RUN — app credentials, permissions, and account authorization unavailable                                                                      |

The demo’s initial results derive from its SQLite rows: 128,400 views; 2,841 eligible hits; 2,734 confirmed simulated sends; 627 clickers; 184 engaged; 100 overlapping; 711 potential leads; 5.537383 leads per 1,000 views; 82,020 estimated seconds saved.

Automated desktop tests use separate disposable data directories under `work/`; they never reset the user’s open demo instance. The source demo and packaged application use their own application-data directories; existing seed data is preserved rather than silently reseeded after a source update.

Build/test output is copied to `artifacts/verification/`. `artifacts/SHA256SUMS.txt` identifies the deliverable archives. These results do not imply cloud deployment, Meta approval, or real Instagram delivery.


## 2026-10-01 prototype branch verification

Branch: `dmflow-scout-prototype-2026-10-01`. GitHub Actions run `36927236875` completed successfully. Hosted jobs passed for Windows, macOS, and Linux; the Windows NSIS package and macOS ARM64 package jobs passed. The Windows artifact contains `DMFlow Setup 0.1.0.exe` and an unpacked executable. These hosted results establish build/test compatibility, not code-signing, notarization, or a human Windows GUI smoke-test.

The Scout/portal suite additionally has nine local `.mjs` tests covering CSV safety, evidence limitations, formula mitigation, same-origin HTTP workflow, optional local AI approval gating, provider status, Modash request construction, provider response mapping, and credential gating.
