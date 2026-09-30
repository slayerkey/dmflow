import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  campaignInput,
  simulationInput,
  type Repository,
  type Row,
} from "../../shared/src/index";
import { Engine } from "./engine";
import { stats, people, keywordStats } from "./stats";
import { hash, id, opaque } from "./security";
import { SimulatedProvider } from "../../instagram/src/index";
type Options = {
  db: Repository;
  engine: Engine;
  demo: boolean;
  authorize: (r: Request) => Promise<string | null>;
};
export function createApi(o: Options) {
  const api = new Hono<{ Variables: { workspace: string } }>();
  api.use(
    "*",
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) => c.json({ error: "Request too large" }, 413),
    }),
  );
  api.onError((err, c) =>
    c.json(
      {
        error:
          err.name === "ZodError"
            ? "Check the highlighted fields and destination URL."
            : err.message.includes("UNIQUE")
              ? "That item already exists."
              : "The request could not be completed.",
      },
      400,
    ),
  );
  api.get("/health", async (c) => {
    await o.db.all("SELECT 1");
    return c.json({
      ok: true,
      database: true,
      queue: o.demo ? "local" : "configured; delivery checked by outbox",
      mode: o.demo ? "demo" : "live",
    });
  });
  api.on(["GET", "HEAD"], "/r/:token", (c) =>
    o.engine.click(c.req.param("token"), c.req.raw),
  );
  api.post("/pair", async (c) => {
    const { code } = await c.req.json();
    if (typeof code !== "string" || code.length > 100)
      return c.json({ error: "Invalid pairing code" }, 400);
    const digest = await hash(code),
      now = o.engine.now(),
      token = opaque(),
      tokenHash = await hash(token);
    // All statements execute atomically; only the winner's token can be inserted.
    await o.db.batch([
      {
        sql: "INSERT INTO devices SELECT ?,workspace_id,?,NULL FROM pairing_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>?",
        args: [tokenHash, now, digest, now],
      },
      {
        sql: "UPDATE pairing_codes SET used_at=? WHERE code_hash=? AND EXISTS(SELECT 1 FROM devices WHERE token_hash=?)",
        args: [now, digest, tokenHash],
      },
    ]);
    const d = (
      await o.db.all("SELECT workspace_id FROM devices WHERE token_hash=?", [
        tokenHash,
      ])
    )[0];
    return d
      ? c.json({ token, workspace: d.workspace_id })
      : c.json({ error: "Pairing code expired or already used" }, 401);
  });
  api.use("/api/*", async (c, next) => {
    const w = await o.authorize(c.req.raw);
    if (!w) return c.json({ error: "Pair this desktop to continue." }, 401);
    c.set("workspace", w);
    await next();
  });
  const accountOwned = async (workspace: string, account: string) =>
    !!(
      await o.db.all(
        "SELECT id FROM social_accounts WHERE id=? AND workspace_id=?",
        [account, workspace],
      )
    ).length;
  api.get("/api/bootstrap", async (c) =>
    c.json({
      mode: o.demo ? "demo" : "live",
      accounts: await o.db.all(
        "SELECT id,provider,username,status FROM social_accounts WHERE workspace_id=?",
        [c.get("workspace")],
      ),
      settings: (
        await o.db.all("SELECT * FROM workspaces WHERE id=?", [
          c.get("workspace"),
        ])
      )[0],
      instagramAvailable: !o.demo,
    }),
  );
  api.get("/api/stats", async (c) =>
    c.json(
      await stats(o.db, c.get("workspace"), {
        account: c.req.query("account"),
        campaign: c.req.query("campaign"),
        media: c.req.query("media"),
      }),
    ),
  );
  api.get("/api/keywords", async (c) =>
    c.json(await keywordStats(o.db, c.get("workspace"))),
  );
  api.get("/api/campaigns", async (c) => {
    const rows = await o.db.all(
      "SELECT c.*,a.username FROM campaigns c JOIN social_accounts a ON a.id=c.account_id WHERE a.workspace_id=? ORDER BY c.created_at DESC",
      [c.get("workspace")],
    );
    return c.json(
      await Promise.all(
        rows.map(async (r) => ({
          ...r,
          exclusions: JSON.parse(r.exclusions),
          keywords: (
            await o.db.all(
              "SELECT keyword FROM campaign_keywords WHERE campaign_id=?",
              [r.id],
            )
          ).map((k) => k.keyword),
          stats: await stats(o.db, c.get("workspace"), { campaign: r.id }),
        })),
      ),
    );
  });
  const save = async (c: any) => {
    const v = campaignInput.parse(await c.req.json()),
      workspace = c.get("workspace"),
      oldId = c.req.param("id");
    if (!(await accountOwned(workspace, v.account_id)))
      return c.json({ error: "Account not found" }, 404);
    if (
      v.media_id &&
      !(
        await o.db.all("SELECT id FROM media WHERE id=? AND account_id=?", [
          v.media_id,
          v.account_id,
        ])
      ).length
    )
      return c.json({ error: "Post not found" }, 404);
    const old = oldId
      ? (
          await o.db.all(
            "SELECT c.* FROM campaigns c JOIN social_accounts a ON a.id=c.account_id WHERE c.id=? AND a.workspace_id=?",
            [oldId, workspace],
          )
        )[0]
      : null;
    if (oldId && !old) return c.json({ error: "Campaign not found" }, 404);
    if (old && old.account_id !== v.account_id)
      return c.json({ error: "Create a new campaign to change accounts" }, 400);
    if (
      new TextEncoder().encode(
        v.message + "\n\n" + o.engine.baseUrl + "/r/" + "x".repeat(48),
      ).length > 1000
    )
      return c.json(
        {
          error:
            "Message plus tracked URL must fit Instagram’s 1,000-byte limit. Shorten your message.",
        },
        400,
      );
    if (
      old &&
      (old.trigger !== v.trigger ||
        old.media_id !== (v.trigger === "dm" ? null : v.media_id)) &&
      (
        await o.db.all("SELECT id FROM messages WHERE campaign_id=? LIMIT 1", [
          old.id,
        ])
      ).length
    )
      return c.json(
        {
          error:
            "This campaign has history. Create a new campaign to change its trigger or post.",
        },
        400,
      );
    const cid = oldId ?? id(),
      now = o.engine.now(),
      state = v.state;
    const statements = [
      {
        sql: `INSERT INTO campaigns(id,account_id,name,trigger,media_id,message,destination_url,state,fuzzy,cooldown_hours,activated_at,created_at,exclusions) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,trigger=excluded.trigger,media_id=excluded.media_id,message=excluded.message,destination_url=excluded.destination_url,state=excluded.state,fuzzy=excluded.fuzzy,cooldown_hours=excluded.cooldown_hours,exclusions=excluded.exclusions,activated_at=excluded.activated_at`,
        args: [
          cid,
          v.account_id,
          v.name,
          v.trigger,
          v.trigger === "dm" ? null : v.media_id,
          v.message,
          v.destination_url,
          state,
          Number(v.fuzzy),
          v.cooldown_hours,
          old?.state === "Draft" && state === "Active"
            ? now
            : (old?.activated_at ?? now),
          old?.created_at ?? now,
          JSON.stringify(v.exclusions),
        ],
      },
      { sql: "DELETE FROM campaign_keywords WHERE campaign_id=?", args: [cid] },
      ...Array.from(new Set(v.keywords)).map((k) => ({
        sql: "INSERT INTO campaign_keywords VALUES(?,?,?)",
        args: [id(), cid, k],
      })),
    ];
    await o.db.batch(statements);
    if (state !== "Active")
      await o.db.run(
        "UPDATE messages SET status='cancelled',error_detail='Campaign paused' WHERE campaign_id=? AND status IN ('queued','retry')",
        [cid],
      );
    return c.json({ id: cid });
  };
  api.post("/api/campaigns", save);
  api.put("/api/campaigns/:id", save);
  api.get("/api/media", async (c) => {
    const rows = await o.db.all(
      "SELECT m.*,a.username FROM media m JOIN social_accounts a ON a.id=m.account_id WHERE a.workspace_id=? ORDER BY m.published_at DESC",
      [c.get("workspace")],
    );
    return c.json(
      await Promise.all(
        rows.map(async (r) => ({
          ...r,
          stats: await stats(o.db, c.get("workspace"), { media: r.id }),
        })),
      ),
    );
  });
  api.get("/api/people", async (c) =>
    c.json(
      await people(
        o.db,
        c.get("workspace"),
        c.req.query("q"),
        c.req.query("filter"),
        Math.max(0, Number(c.req.query("offset")) || 0),
      ),
    ),
  );
  api.get("/api/people/:id", async (c) => {
    const p = (
      await o.db.all(
        "SELECT p.* FROM people p JOIN social_accounts a ON a.id=p.account_id WHERE p.id=? AND a.workspace_id=?",
        [c.req.param("id"), c.get("workspace")],
      )
    )[0];
    if (!p) return c.json({ error: "Person not found" }, 404);
    return c.json({
      ...p,
      timeline: await o.db.all(
        "SELECT * FROM activity WHERE person_id=? ORDER BY occurred_at DESC LIMIT 100",
        [p.id],
      ),
      messages: await o.db.all(
        "SELECT m.*,r.token FROM messages m JOIN link_redirects r ON r.message_id=m.id WHERE m.person_id=? ORDER BY m.created_at DESC",
        [p.id],
      ),
    });
  });
  api.post("/api/people/:id/block", async (c) => {
    const p = (
      await o.db.all(
        "SELECT p.id FROM people p JOIN social_accounts a ON a.id=p.account_id WHERE p.id=? AND a.workspace_id=?",
        [c.req.param("id"), c.get("workspace")],
      )
    )[0];
    if (!p) return c.json({ error: "Person not found" }, 404);
    const { blocked } = await c.req.json();
    if (typeof blocked !== "boolean")
      return c.json({ error: "Invalid value" }, 400);
    if (blocked)
      await o.db.run("INSERT OR IGNORE INTO blocked_people VALUES(?,?)", [
        p.id,
        o.engine.now(),
      ]);
    else await o.db.run("DELETE FROM blocked_people WHERE person_id=?", [p.id]);
    return c.json({ ok: true });
  });
  api.get("/api/activity", async (c) =>
    c.json(
      await o.db.all(
        "SELECT l.*,p.username,c.name campaign FROM activity l JOIN social_accounts a ON a.id=l.account_id LEFT JOIN people p ON p.id=l.person_id LEFT JOIN campaigns c ON c.id=l.campaign_id WHERE a.workspace_id=? ORDER BY l.occurred_at DESC LIMIT 200",
        [c.get("workspace")],
      ),
    ),
  );
  api.put("/api/settings", async (c) => {
    const { manual_seconds } = await c.req.json();
    if (
      !Number.isInteger(manual_seconds) ||
      manual_seconds < 1 ||
      manual_seconds > 3600
    )
      return c.json({ error: "Choose 1–3600 seconds" }, 400);
    await o.db.run("UPDATE workspaces SET manual_seconds=? WHERE id=?", [
      manual_seconds,
      c.get("workspace"),
    ]);
    return c.json({ ok: true });
  });
  api.post("/api/connect/instagram", (c) =>
    c.json(
      {
        error:
          "Instagram connection is not enabled: demo mode does not connect real accounts. Pair and open your live workspace in Settings.",
      },
      503,
    ),
  );
  api.post("/api/simulate", async (c) => {
    if (!o.demo) return c.json({ error: "Not found" }, 404);
    const v = simulationInput.parse(await c.req.json());
    if (!(await accountOwned(c.get("workspace"), v.accountId)))
      return c.json({ error: "Account not found" }, 404);
    const e = {
      ...v,
      mediaId: v.kind === "dm" ? undefined : v.mediaId,
      providerEventId: v.providerEventId ?? id(),
      occurredAt: o.engine.now(),
    };
    const result = await o.engine.ingest(e);
    const person = (
      await o.db.all(
        "SELECT id FROM people WHERE account_id=? AND provider_id=?",
        [v.accountId, v.personProviderId],
      )
    )[0];
    if (v.blocked)
      await o.db.run("INSERT OR IGNORE INTO blocked_people VALUES(?,?)", [
        person.id,
        o.engine.now(),
      ]);
    // Per-request provider avoids one simulation's failure setting leaking into another.
    const provider = new SimulatedProvider();
    provider.failure = v.failure === "none" ? "sent" : v.failure;
    const simulation = new Engine(
      o.db,
      provider,
      o.engine.baseUrl,
      o.engine.clock,
    );
    await simulation.process(result.eventId);
    const event = (
      await o.db.all("SELECT * FROM incoming_events WHERE id=?", [
        result.eventId,
      ])
    )[0];
    const message = (
      await o.db.all(
        "SELECT m.*,r.token FROM messages m JOIN link_redirects r ON r.message_id=m.id WHERE m.event_id=?",
        [result.eventId],
      )
    )[0];
    return c.json({
      ...result,
      event,
      message,
      personId: person.id,
      url: message ? `${o.engine.baseUrl}/r/${message.token}` : null,
    });
  });
  return api;
}
