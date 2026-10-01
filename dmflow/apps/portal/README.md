# DMFlow local shared website + Scout recruitment preview

Requires Node 22.13+ only. From `dmflow/`: `npm run web:dev` (alternatively `node apps/portal/server.mjs`) and open `http://127.0.0.1:4173/`. This also works in Windows PowerShell. `npm run test:portal` needs no install. Change `PORT` if needed. The original Creator Electron app is preserved in `apps/desktop` and is launched with `npm ci && npm run dev` in a separate terminal. Do not run both demo HTTP endpoints on a public interface.

Home and three product pages share a single website. `/app#scout` is fully interactive: start a measured Pilot Mode session and capture time-to-10 shortlisted creators; save campaign brief; paste CSV with header `name,handle,platform,niche,formats,country,content_url,caption,views,baseline_views,posted_at,contact_email,evidence_source,notes` (handle and platform are required); click Inspect; check evidence manually; create/edit personalized **template** draft; optionally use your **own local** Ollama instance; approve; open an email in your own client if provided (no sending/verification); manually track status; export CSV; download a compact local pilot-summary JSON. Fictional sample load wipes the current private local store, so export real work first. Ranking numbers are deterministic fit points from imported inputs, not model confidence, follower quality or guaranteed conversion.

Optional free local LLM: install/run Ollama separately; make model `llama3.2` available and run it on default loopback port. In your own terminal set `SCOUT_OLLAMA_URL=http://127.0.0.1:11434/api/generate` and (if needed) `SCOUT_OLLAMA_MODEL=<local model>` before launching. No external LLM calls or paid purchases; model output requires review and manual approval. Do not expose this prototype to the internet.

Data: ignored `dmflow/work/scout-local.json`, all creator imports local; the repository contains no real creator dataset. Add raw customer conversations/private analysis **outside** this public repository. The Campaigns workspace intentionally allows only manual reusable template planning/consent steps; no multi-account OAuth/deployment is claimed. `/app#creator` points to the original working Electron engine rather than pretending it is already integrated into this Node portal.

Security: loopback binding, same-origin JSON mutations, request-size cap, static path allowlist, escaped UI text, CSV formula mitigation. Multi-user permissions, production commercial-data licensing review, consent records, deletion tools and independent local-model output verification must be built before any hosted launch. Licensed provider adapters exist, but remain disabled without operator-owned server-side credentials. No checkout is active and prices shown are pilot hypotheses.

Cross-platform project tests: `npm run test:worker` invokes a Node wrapper, rather than requiring Bash-style environment-variable syntax. The original Electron app requires pinned npm dependencies and real local platform acceptance.

## Optional licensed Scout discovery

The portal exposes provider status without exposing credentials. **Influencers Club Discovery** is the preferred pilot adapter behind `SCOUT_INFLUENCERS_CLUB_API_KEY`; **Modash AI Search** remains an enterprise fallback behind `SCOUT_MODASH_API_KEY`. Keys are read server-side only. Without either key, the discovery button is disabled and `/api/discover` fails closed. Provider-returned candidates remain `licensed_provider_unverified` until an operator checks source evidence; missing views/baselines stay missing. Start with CSV or provider trial access—do not buy an annual data contract until pilot economics justify it. TikTok One remains a separate official-access path.


See [the pilot runbook](../../docs/PILOT-RUNBOOK.md) and [provider options](../../docs/PROVIDER-OPTIONS.md) before enabling live discovery.
