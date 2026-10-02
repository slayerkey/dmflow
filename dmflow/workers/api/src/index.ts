import { createApi } from "../../../packages/core/src/api";
import { verifyAccessJwt } from "./access";
import { Engine } from "../../../packages/core/src/engine";
import {
  hash,
  id,
  opaque,
  encrypt,
  verifySignature,
} from "../../../packages/core/src/security";
import {
  InstagramProvider,
  MetaError,
} from "../../../packages/instagram/src/index";
import type {
  Repository,
  Statement,
  Row,
} from "../../../packages/shared/src/index";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
type Bindings = Env & {
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  META_VERIFY_TOKEN?: string;
  META_WEBHOOK_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ASSETS?: Fetcher;
};
export class D1Repository implements Repository {
  constructor(public db: D1Database) {}
  async all<T = Row>(sql: string, args: unknown[] = []): Promise<T[]> {
    return (
      await this.db
        .prepare(sql)
        .bind(...args)
        .all<T>()
    ).results;
  }
  async run(sql: string, args: unknown[] = []) {
    return (
      await this.db
        .prepare(sql)
        .bind(...args)
        .run()
    ).meta.changes;
  }
  async batch(s: Statement[]) {
    await this.db.batch(
      s.map((x) => this.db.prepare(x.sql).bind(...(x.args ?? []))),
    );
  }
}
function services(env: Bindings) {
  const db = new D1Repository(env.DB);
  const provider = new InstagramProvider(db, {
    appId: env.META_APP_ID ?? "",
    appSecret: env.META_APP_SECRET ?? "",
    encryptionKey: env.TOKEN_ENCRYPTION_KEY ?? "",
    redirectUri: env.PUBLIC_WORKER_URL + "/oauth/instagram/callback",
  });
  return {
    db,
    provider,
    engine: new Engine(db, provider, env.PUBLIC_WORKER_URL),
  };
}
async function authorize(db: Repository, r: Request) {
  const token = r.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  return (
    (
      await db.all(
        "SELECT workspace_id FROM devices WHERE token_hash=? AND revoked_at IS NULL",
        [await hash(token)],
      )
    )[0]?.workspace_id ?? null
  );
}
/** Web beta users must have BOTH a verified Cloudflare Access JWT and an active D1 invitation.
 * Each approved email gets its own workspace; no user-supplied workspace IDs accepted.
 */
async function webWorkspace(db: Repository,r: Request,env: Bindings){
  const email=await verifyAccessJwt(r,env);
  if(!email)return null;
  const rows=await db.all("SELECT workspace_id FROM pilot_invites WHERE email=? AND active=1",[email]);
  if(!rows.length)return null;
  if(rows[0].workspace_id)return String(rows[0].workspace_id);
  const candidate=id();
  await db.run("INSERT OR IGNORE INTO workspaces(id,name) VALUES(?,?)",[candidate,"Creator beta"]);
  await db.run("UPDATE pilot_invites SET workspace_id=? WHERE email=? AND workspace_id IS NULL AND active=1",[candidate,email]);
  const again=await db.all("SELECT workspace_id FROM pilot_invites WHERE email=? AND active=1",[email]);
  return again[0]?.workspace_id?String(again[0].workspace_id):null;
}
function log(event: string, values: Row = {}) {
  console.log(JSON.stringify({ event, provider: "instagram", ...values }));
}
async function processReceipt(env: Bindings, receiptId: string) {
  const { db, provider, engine } = services(env);
  const receipt = (
    await db.all("SELECT * FROM webhook_receipts WHERE id=?", [receiptId])
  )[0];
  if (!receipt || receipt.status === "done" || receipt.status === "failed")
    return;
  await db.run("UPDATE webhook_receipts SET attempts=attempts+1 WHERE id=?", [
    receiptId,
  ]);
  try {
    const events = await provider.processWebhook(JSON.parse(receipt.payload));
    for (const event of events) {
      const result = await engine.ingest(event);
      await engine.process(result.eventId);
      await db.run("UPDATE outbox SET published_at=? WHERE event_id=?", [
        engine.now(),
        result.eventId,
      ]);
      log("event_processed", {
        account_id: event.accountId,
        event_id: result.eventId,
        status: result.duplicate ? "duplicate" : "processed",
      });
    }
    await db.run(
      "UPDATE webhook_receipts SET status='done',payload='{}',error_detail=NULL WHERE id=?",
      [receiptId],
    );
  } catch (e) {
    const permanent =
      e instanceof MetaError && ["auth", "permanent"].includes(e.kind);
    await db.run(
      "UPDATE webhook_receipts SET status=?,error_detail=? WHERE id=?",
      [
        permanent || receipt.attempts >= 4 ? "failed" : "pending",
        e instanceof MetaError ? e.message : "Event processing failed",
        receiptId,
      ],
    );
    if (!permanent && receipt.attempts < 4) throw e;
    log("receipt_failed", { event_id: receiptId, status: "failed" });
  }
}
const worker: ExportedHandler<Bindings> = {
  async fetch(request, env, ctx) {
    const { db, provider, engine } = services(env);
    const app = new Hono();
    app.use(
      "*",
      bodyLimit({
        maxSize: 1024 * 1024,
        onError: (c) => c.text("Request too large", 413),
      }),
    );
    app.onError((_e, c) =>
      c.json(
        { error: "The request could not be completed. Please try again." },
        500,
      ),
    );
    app.get("/webhooks/instagram", (c) =>
      env.META_VERIFY_TOKEN &&
      c.req.query("hub.mode") === "subscribe" &&
      c.req.query("hub.verify_token") === env.META_VERIFY_TOKEN
        ? c.text(c.req.query("hub.challenge") ?? "")
        : c.text("Verification failed", 403),
    );
    app.post("/webhooks/instagram", async (c) => {
      const bytes = await c.req.arrayBuffer();
      if (
        !(await verifySignature(
          bytes,
          c.req.header("x-hub-signature-256") ?? null,
          env.META_WEBHOOK_SECRET ?? env.META_APP_SECRET ?? "",
        ))
      )
        return c.text("Invalid signature", 401);
      let raw: string;
      try {
        raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        JSON.parse(raw);
      } catch {
        return c.text("Invalid JSON", 400);
      }
      const receiptId = await hash(raw);
      await db.run(
        "INSERT OR IGNORE INTO webhook_receipts(id,payload,created_at) VALUES(?,?,?)",
        [receiptId, raw, engine.now()],
      );
      ctx.waitUntil(
        env.EVENT_QUEUE.send({ receiptId }).catch(() =>
          log("queue_publish_failed", {
            event_id: receiptId,
            status: "pending",
          }),
        ),
      );
      return c.text("EVENT_RECEIVED");
    });
    // Browser sessions are authenticated by Access cookies; require a same-origin
    // Origin header on state-changing requests to prevent cross-site form submissions.
    app.use("/app/api/*",async(c,next)=>{
      if(!["GET","HEAD","OPTIONS"].includes(c.req.method)){
        const origin=c.req.header("origin");
        if(origin!==new URL(c.req.url).origin)return c.json({error:"Same-origin request required"},403);
      }
      await next();
    });
    // Hosted browser path: Access JWT + explicit D1 invite instead of desktop pairing token.
    // Keep the public webhook and OAuth callback outside the Access-protected /app path.
    app.post("/app/api/connect/instagram", async (c) => {
      const workspace=await webWorkspace(db,c.req.raw,env);
      if(!workspace)return c.json({error:"Invitation or email login required"},401);
      const state=opaque();
      provider.config.state=state;
      let result;
      try{ result=await provider.connect(); }
      catch{return c.json({error:"Meta app credentials and approval are not configured yet."},503);}
      await db.run("INSERT INTO oauth_states VALUES(?,?,?,NULL)",[
        await hash(state),workspace,new Date(Date.now()+600000).toISOString()
      ]);
      return c.json(result);
    });
    app.post("/api/connect/instagram", async (c) => {
      const workspace = await authorize(db, c.req.raw);
      if (!workspace) return c.json({ error: "Pair this desktop first" }, 401);
      const state = opaque();
      provider.config.state = state;
      let result;
      try {
        result = await provider.connect();
      } catch {
        return c.json(
          {
            error:
              "Add the Meta app credentials to Cloudflare secrets before connecting Instagram.",
          },
          503,
        );
      }
      await db.run("INSERT INTO oauth_states VALUES(?,?,?,NULL)", [
        await hash(state),
        workspace,
        new Date(Date.now() + 600000).toISOString(),
      ]);
      return c.json(result);
    });
    app.get("/oauth/instagram/callback", async (c) => {
      const state = c.req.query("state");
      if (!state)
        return c.text("Connection expired. Start again in DMFlow.", 400);
      const stateHash = await hash(state),
        now = engine.now();
      const records = await db.all(
        "UPDATE oauth_states SET used_at=? WHERE state_hash=? AND used_at IS NULL AND expires_at>? RETURNING workspace_id",
        [now, stateHash, now],
      );
      if (!records.length)
        return c.text(
          "Connection expired or already used. Start again in DMFlow.",
          400,
        );
      if (c.req.query("error"))
        return c.text(
          "Instagram connection was cancelled. You can return to DMFlow.",
        );
      const code = c.req.query("code");
      if (!code) return c.text("Missing authorization code", 400);
      try {
        const result = await provider.exchange(code);
        const existing = (
          await db.all(
            "SELECT id,workspace_id FROM social_accounts WHERE provider='instagram' AND provider_id=?",
            [result.providerId],
          )
        )[0];
        if (existing && existing.workspace_id !== records[0].workspace_id)
          return c.text("This account belongs to a different workspace.", 409);
        const accountId = existing?.id ?? id();
        await db.run(
          `INSERT INTO social_accounts(id,workspace_id,provider,provider_id,username,status,token_ciphertext,token_expires_at) VALUES(?,?,'instagram',?,?,'connected',?,?) ON CONFLICT(provider,provider_id) DO UPDATE SET username=excluded.username,status='connected',token_ciphertext=excluded.token_ciphertext,token_expires_at=excluded.token_expires_at`,
          [
            accountId,
            records[0].workspace_id,
            result.providerId,
            result.username,
            await encrypt(result.token, env.TOKEN_ENCRYPTION_KEY!),
            result.expiresAt,
          ],
        );
        try {
          await provider.subscribe(accountId);
        } catch (e) {
          await db.run(
            "UPDATE social_accounts SET status='setup_required' WHERE id=?",
            [accountId],
          );
          return c.text(
            "Account authorized, but webhook subscription failed. Confirm Live mode, Advanced Access, and comments/messages subscriptions in the Meta dashboard, then reconnect.",
            400,
          );
        }
        await db.run(
          "INSERT INTO sync_state VALUES(?,?,NULL) ON CONFLICT(account_id) DO UPDATE SET next_sync_at=excluded.next_sync_at",
          [accountId, now],
        );
        ctx.waitUntil(
          provider.syncMedia(accountId).catch(() =>
            log("media_sync_pending", {
              account_id: accountId,
              status: "pending",
            }),
          ),
        );
        return c.text(
          "Instagram connected. You can close this tab and return to DMFlow.",
        );
      } catch {
        return c.text(
          "Instagram connection could not be completed. Check the app credentials and permissions, then reconnect from DMFlow.",
          400,
        );
      }
    });
    app.post("/api/media/sync", async (c) => {
      const workspace = await authorize(db, c.req.raw);
      if (!workspace) return c.json({ error: "Unauthorized" }, 401);
      const accounts = await db.all(
        "SELECT id FROM social_accounts WHERE workspace_id=? AND status='connected'",
        [workspace],
      );
      for (const a of accounts)
        await db.run(
          "INSERT INTO sync_state VALUES(?,?,NULL) ON CONFLICT(account_id) DO UPDATE SET next_sync_at=excluded.next_sync_at",
          [a.id, engine.now()],
        );
      return c.json({ ok: true });
    });
    app.route(
      "/",
      createApi({
        db,
        engine,
        demo: false,
        authorize: (r) => authorize(db, r),
      }),
    );
    // Same shared Creator engine and D1 database power desktop and web clients.
    app.route("/app",createApi({
      db,engine,demo:false,authorize:(r)=>webWorkspace(db,r,env)
    }));
    app.get("/app",async(c)=>{
      const w=await webWorkspace(db,c.req.raw,env);
      if(!w)return c.text("Email invitation or Cloudflare Access login required",401);
      return env.ASSETS?env.ASSETS.fetch(new Request(new URL("/app/index.html",c.req.url))):c.text("Build web assets before deploying",503);
    });
    app.get("/app/*",async(c)=>{
      const w=await webWorkspace(db,c.req.raw,env);
      if(!w)return c.text("Email invitation or Cloudflare Access login required",401);
      return env.ASSETS?env.ASSETS.fetch(c.req.raw):c.text("Build web assets before deploying",503);
    });
    app.get("/",async(c)=>env.ASSETS?await env.ASSETS.fetch(c.req.raw):c.text("DMFlow Creator API",200));
    return app.fetch(request, env, ctx);
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      try {
        const body = message.body as { receiptId?: string };
        if (body.receiptId) await processReceipt(env, body.receiptId);
        message.ack();
      } catch {
        message.retry({ delaySeconds: 60 });
      }
    }
  },
  async scheduled(_event, env, ctx) {
    const { db, provider, engine } = services(env);
    await db.run("DELETE FROM rate_windows WHERE window_start<?", [
      new Date(Date.now() - 3600000).toISOString(),
    ]);
    await engine.recover();
    await engine.recoverOutbox();
    for (const r of await db.all(
      "SELECT id FROM webhook_receipts WHERE status='pending' AND attempts<5 LIMIT 50",
    ))
      await env.EVENT_QUEUE.send({ receiptId: r.id });
    const accounts = await db.all(
      "SELECT a.* FROM social_accounts a LEFT JOIN sync_state s ON s.account_id=a.id WHERE a.status='connected' AND (s.next_sync_at IS NULL OR s.next_sync_at<=?) LIMIT 2",
      [engine.now()],
    );
    for (const a of accounts) {
      try {
        if (
          a.token_expires_at &&
          Date.parse(a.token_expires_at) < Date.now() + 7 * 86400000
        )
          await provider.refresh(a.id);
        await provider.syncMedia(a.id);
        await db.run(
          "INSERT INTO sync_state VALUES(?,?,NULL) ON CONFLICT(account_id) DO UPDATE SET next_sync_at=excluded.next_sync_at,last_error=NULL",
          [a.id, new Date(Date.now() + 6 * 3600000).toISOString()],
        );
      } catch (e) {
        if (e instanceof MetaError && e.kind === "auth")
          await db.run(
            "UPDATE social_accounts SET status='reconnect' WHERE id=?",
            [a.id],
          );
        await db.run(
          "INSERT INTO sync_state VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET next_sync_at=excluded.next_sync_at,last_error=excluded.last_error",
          [
            a.id,
            new Date(Date.now() + 3600000).toISOString(),
            "Could not refresh Instagram data",
          ],
        );
        log("sync_failed", { account_id: a.id, status: "failed" });
      }
    }
    // Retain failed receipt metadata, but clear personal payloads after seven days.
    await db.run(
      "UPDATE webhook_receipts SET payload='{}' WHERE status='failed' AND created_at<?",
      [new Date(Date.now() - 7 * 86400000).toISOString()],
    );
  },
};
export default worker;
