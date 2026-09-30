import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SQLiteRepository } from "../packages/core/src/sqlite";
import { Engine } from "../packages/core/src/engine";
import { match, excluded } from "../packages/core/src/matcher";
import {
  SimulatedProvider,
  InstagramProvider,
  classify,
} from "../packages/instagram/src/index";
import { stats } from "../packages/core/src/stats";
import { seed } from "../packages/core/src/seed";
import { createApi } from "../packages/core/src/api";
import {
  hash,
  encrypt,
  decrypt,
  verifySignature,
} from "../packages/core/src/security";
import type { NormalizedEvent, Row } from "../packages/shared/src/index";
const schema = readFileSync("migrations/0001_initial.sql", "utf8");
async function fixture() {
  const db = new SQLiteRepository(":memory:", schema);
  let now = new Date("2026-09-29T12:00:00Z");
  const provider = new SimulatedProvider();
  const engine = new Engine(db, provider, "https://example.test", {
    now: () => now,
  });
  await db.batch([
    { sql: "INSERT INTO workspaces VALUES(?,?,?)", args: ["w", "Test", 30] },
    {
      sql: "INSERT INTO social_accounts(id,workspace_id,provider,provider_id,username,status) VALUES(?,?,?,?,?,?)",
      args: ["a", "w", "instagram", "creator", "test", "connected"],
    },
    {
      sql: "INSERT INTO media(id,account_id,provider_id,caption,type,published_at,views) VALUES(?,?,?,?,?,?,?)",
      args: [
        "media",
        "a",
        "ig-media",
        "Test",
        "REELS",
        now.toISOString(),
        1000,
      ],
    },
    {
      sql: "INSERT INTO campaigns(id,account_id,name,trigger,media_id,message,destination_url,state,activated_at,created_at,exclusions) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        "c",
        "a",
        "Roadmap",
        "comment",
        "media",
        "Your resource",
        "https://example.com/resource",
        "Active",
        now.toISOString(),
        now.toISOString(),
        '["dont send roadmap","no roadmap"]',
      ],
    },
    {
      sql: "INSERT INTO campaign_keywords VALUES(?,?,?)",
      args: ["k", "c", "ROADMAP"],
    },
  ]);
  const event = (
    overrides: Partial<NormalizedEvent> = {},
  ): NormalizedEvent => ({
    accountId: "a",
    providerEventId: crypto.randomUUID(),
    personProviderId: "visitor",
    username: "visitor",
    mediaId: "media",
    kind: "comment",
    text: "ROADMAP",
    occurredAt: now.toISOString(),
    topLevel: true,
    ...overrides,
  });
  const send = async (overrides: Partial<NormalizedEvent> = {}) => {
    const e = await engine.ingest(event(overrides));
    await engine.process(e.eventId);
    return e.eventId;
  };
  return {
    db,
    provider,
    engine,
    event,
    send,
    advance: (ms: number) => (now = new Date(now.getTime() + ms)),
  };
}
for (const value of [
  "ROADMAP",
  "roadmap",
  "Roadmap!",
  " roadmap ",
  "road map",
  "roamdap",
  "roadmp",
  "roadmaap",
  "Can I have the roadmap please?",
])
  test("intent match: " + value, () => assert.ok(match(value, "ROADMAP")));
for (const value of [
  "roadmapping",
  "broadmaps",
  "romance",
  "hi there",
  "aimless",
])
  test("reject false positive: " + value, () =>
    assert.equal(match(value, "ROADMAP"), null),
  );
test("short words exact only; exclusion wins", () => {
  assert.equal(match("am", "AIM"), null);
  assert.equal(match("aimless", "AIM"), null);
  assert.ok(excluded("Don't send roadmap", ["dont send roadmap"]));
  assert.equal(match("a roadmap please", "ROADMAP", "exact"), null);
  assert.ok(match("roadmapping", "roadmap", "contains"));
});
test("same event and concurrent consumers yield one send", async () => {
  const f = await fixture();
  const e = f.event();
  const [a, b] = await Promise.all([f.engine.ingest(e), f.engine.ingest(e)]);
  assert.equal(a.eventId, b.eventId);
  await Promise.all([f.engine.process(a.eventId), f.engine.process(b.eventId)]);
  assert.equal(f.provider.calls.length, 1);
  assert.equal((await f.db.all("SELECT * FROM messages")).length, 1);
  f.db.close();
});
test("block, own, nested, unknown parent, and exclusion all skip", async () => {
  const f = await fixture();
  for (const patch of [
    { own: true },
    { topLevel: false },
    { topLevel: undefined },
    { text: "don't send roadmap" },
  ])
    await f.send(patch);
  const e = await f.engine.ingest(f.event());
  const p = (
    await f.db.all("SELECT person_id FROM incoming_events WHERE id=?", [
      e.eventId,
    ])
  )[0];
  await f.db.run("INSERT INTO blocked_people VALUES(?,?)", [
    p.person_id,
    f.engine.now(),
  ]);
  await f.engine.process(e.eventId);
  assert.equal(f.provider.calls.length, 0);
  f.db.close();
});
test("per-campaign cooldown is atomic and expires", async () => {
  const f = await fixture();
  await Promise.all([f.send(), f.send()]);
  assert.equal(f.provider.calls.length, 1);
  f.advance(24 * 3600000);
  await f.send();
  assert.equal(f.provider.calls.length, 2);
  f.db.close();
});
test("exact beats fuzzy and longer keyword wins", async () => {
  const f = await fixture();
  const c = (await f.db.all("SELECT * FROM campaigns"))[0];
  await f.db.run(
    "INSERT INTO campaigns SELECT 'c2',account_id,'Second',trigger,media_id,message,destination_url,state,fuzzy,cooldown_hours,activated_at,created_at,exclusions FROM campaigns WHERE id='c'",
  );
  await f.db.run(
    "INSERT INTO campaign_keywords VALUES('k2','c2','ROADMAP PLEASE')",
  );
  await f.send({ text: "roadmap please" });
  assert.equal(
    (await f.db.all("SELECT campaign_id FROM messages"))[0].campaign_id,
    "c2",
  );
  f.db.close();
});
test("uncertain delivery never retries, even after recovery", async () => {
  const f = await fixture();
  f.provider.failure = "uncertain";
  await f.send();
  f.advance(86400000);
  await f.engine.recover();
  assert.equal(f.provider.calls.length, 1);
  assert.equal(
    (await f.db.all("SELECT status FROM messages"))[0].status,
    "uncertain",
  );
  f.db.close();
});
test("dispatch crash is quarantined", async () => {
  const f = await fixture();
  f.provider.failure = "transient";
  await f.send();
  await f.db.run("UPDATE messages SET status='dispatching',claimed_at=?", [
    f.engine.now(),
  ]);
  f.advance(600000);
  await f.engine.recover();
  assert.equal(
    (await f.db.all("SELECT status FROM messages"))[0].status,
    "uncertain",
  );
  assert.equal(f.provider.calls.length, 1);
  f.db.close();
});
test("transient retries, permanent does not, auth requires reconnect", async () => {
  for (const failure of ["transient", "permanent", "auth"] as const) {
    const f = await fixture();
    f.provider.failure = failure;
    await f.send();
    f.advance(60000);
    f.provider.failure = "sent";
    await f.engine.recover();
    assert.equal(f.provider.calls.length, failure === "transient" ? 2 : 1);
    if (failure === "auth")
      assert.equal(
        (await f.db.all("SELECT status FROM social_accounts"))[0].status,
        "reconnect",
      );
    f.db.close();
  }
});
test("pause and block cancel pending retry", async () => {
  for (const op of ["pause", "block"]) {
    const f = await fixture();
    f.provider.failure = "transient";
    await f.send();
    if (op === "pause") await f.db.run("UPDATE campaigns SET state='Paused'");
    else
      await f.db.run("INSERT INTO blocked_people SELECT id,? FROM people", [
        f.engine.now(),
      ]);
    f.advance(60000);
    await f.engine.recover();
    assert.equal(f.provider.calls.length, 1);
    assert.equal(
      (await f.db.all("SELECT status FROM messages"))[0].status,
      "cancelled",
    );
    f.db.close();
  }
});
test("live windows checked before sending", async () => {
  const f = await fixture();
  f.provider.live = true;
  await f.send({ occurredAt: "2026-09-01T12:00:00Z" });
  assert.equal(f.provider.calls.length, 0);
  f.db.close();
});
test("redirect, preview exclusion, unique lead union, and time saved", async () => {
  const f = await fixture();
  await f.send();
  const token = (await f.db.all("SELECT token FROM link_redirects"))[0].token;
  const head = await f.engine.click(
    token,
    new Request("https://example.test/r/" + token, { method: "HEAD" }),
  );
  assert.equal(head.status, 302);
  assert.equal((await stats(f.db, "w")).leads, 0);
  await f.engine.click(
    token,
    new Request("https://example.test/r/" + token, {
      headers: { "User-Agent": "facebookexternalhit" },
    }),
  );
  assert.equal((await stats(f.db, "w")).leads, 0);
  for (let i = 0; i < 2; i++) {
    const res = await f.engine.click(
      token,
      new Request("https://example.test/r/" + token),
    );
    assert.equal(res.headers.get("Location"), "https://example.com/resource");
    assert.equal(res.headers.get("Cache-Control"), "no-store");
  }
  f.advance(10000);
  await f.send({ kind: "dm", mediaId: undefined, text: "Thanks!" });
  const s = await stats(f.db, "w");
  assert.equal(s.clicks, 1);
  assert.equal(s.engaged, 1);
  assert.equal(s.leads, 1);
  assert.equal(s.savedSeconds, 30);
  assert.equal(s.leadYield, 1);
  assert.equal(
    (await f.db.all("SELECT click_count FROM link_redirects"))[0].click_count,
    2,
  );
  f.db.close();
});
test("late inbound events use provider timestamp, not receipt timestamp", async () => {
  const f = await fixture();
  await f.send();
  f.advance(60000);
  await f.send({
    kind: "dm",
    mediaId: undefined,
    text: "Before",
    occurredAt: "2026-09-29T11:59:00Z",
  });
  assert.equal((await stats(f.db, "w")).engaged, 0);
  await f.send({
    kind: "dm",
    mediaId: undefined,
    text: "After",
    occurredAt: "2026-09-29T12:00:01Z",
  });
  assert.equal((await stats(f.db, "w")).engaged, 1);
  f.db.close();
});
test("views unavailable stays null; shared media counted once", async () => {
  const f = await fixture();
  await f.db.run(
    "INSERT INTO campaigns SELECT 'c2',account_id,'Second',trigger,media_id,message,destination_url,state,fuzzy,cooldown_hours,activated_at,created_at,exclusions FROM campaigns WHERE id='c'",
  );
  assert.equal((await stats(f.db, "w")).views, 1000);
  await f.db.run("UPDATE media SET views=NULL");
  assert.equal((await stats(f.db, "w")).leadYield, null);
  f.db.close();
});
test("seed derives exact funnel from underlying rows", async () => {
  const db = new SQLiteRepository(":memory:", schema);
  await seed(db);
  const s = await stats(db, "demo");
  assert.deepEqual(
    [s.views, s.hits, s.messages, s.clicks, s.engaged, s.leads],
    [128400, 2841, 2734, 627, 184, 711],
  );
  assert.equal(s.savedSeconds, 82020);
  assert.ok(Math.abs(s.leadYield! - 5.537383) < 0.00001);
  await seed(db);
  assert.equal((await stats(db, "demo")).messages, 2734);
  db.close();
});
test("API is authenticated, workspace isolated, pairing single-use", async () => {
  const f = await fixture();
  await f.db.run("INSERT INTO workspaces VALUES('other','Other',30)");
  const api = createApi({
    db: f.db,
    engine: f.engine,
    demo: false,
    authorize: async (r) =>
      r.headers.get("authorization") === "Bearer good" ? "other" : null,
  });
  assert.equal((await api.request("/api/campaigns")).status, 401);
  const rows = await (
    await api.request("/api/campaigns", {
      headers: { Authorization: "Bearer good" },
    })
  ).json();
  assert.deepEqual(rows, []);
  const code = "secure-pair-code";
  await f.db.run("INSERT INTO pairing_codes VALUES(?,?,?,NULL)", [
    await hash(code),
    "w",
    "2026-10-01T00:00:00Z",
  ]);
  const req = () =>
    api.request("/pair", {
      method: "POST",
      body: JSON.stringify({ code }),
      headers: { "Content-Type": "application/json" },
    });
  assert.equal((await req()).status, 200);
  assert.equal((await req()).status, 401);
  f.db.close();
});
test("AES roundtrip and raw webhook HMAC rejects mutation", async () => {
  const key = "ab".repeat(32),
    cipher = await encrypt("private-token", key);
  assert.equal(await decrypt(cipher, key), "private-token");
  assert.ok(!cipher.includes("private-token"));
  const secret = "test-secret",
    raw = '{"entry":[]}';
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature =
    "sha256=" +
    Buffer.from(
      await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(raw)),
    ).toString("hex");
  assert.equal(await verifySignature(raw, signature, secret), true);
  assert.equal(await verifySignature(raw + " ", signature, secret), false);
  assert.equal(await verifySignature(raw, null, secret), false);
});
test("provider error classification preserves ambiguous failures", () => {
  assert.equal(classify(502, {}, false).kind, "uncertain");
  assert.equal(classify(500, { is_transient: true }).kind, "transient");
  assert.equal(classify(400, { code: 190 }).kind, "auth");
  assert.equal(classify(400, { code: 10 }).kind, "permanent");
  assert.equal(classify(429, {}).kind, "transient");
});
test("Instagram sends private replies and DMs with different recipients", async () => {
  const f = await fixture(),
    key = "cd".repeat(32),
    calls: { url: string; body: Row }[] = [];
  await f.db.run(
    "UPDATE social_accounts SET token_ciphertext=?,token_expires_at=?",
    [await encrypt("test-only-token", key), "2027-01-01T00:00:00Z"],
  );
  const provider = new InstagramProvider(
    f.db,
    {
      appId: "app",
      appSecret: "secret",
      encryptionKey: key,
      redirectUri: "https://example.test/oauth",
    },
    async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init!.body as string) });
      return Response.json({ message_id: "mid", recipient_id: "recipient" });
    },
  );
  const input = {
    accountId: "a",
    recipientId: "recipient",
    commentId: "comment-123",
    text: "A message",
  };
  await provider.sendPrivateReply(input);
  await provider.sendMessage(input);
  assert.equal(
    calls[0].url,
    "https://graph.instagram.com/v26.0/creator/messages",
  );
  assert.deepEqual(calls[0].body.recipient, { comment_id: "comment-123" });
  assert.deepEqual(calls[1].body.recipient, { id: "recipient" });
  assert.equal(
    (await provider.sendMessage({ ...input, text: "😀".repeat(251) })).kind,
    "permanent",
  );
  assert.equal(calls.length, 2);
  f.db.close();
});

test("keyword aliases retain separate historical attribution and shared views", async () => {
  const f = await fixture();
  await f.db.run("INSERT INTO campaign_keywords VALUES('alias','c','GUIDE')");
  await f.send();
  await f.send({ personProviderId: "second", text: "GUIDE" });
  const { keywordStats } = await import("../packages/core/src/stats");
  const rows = await keywordStats(f.db, "w");
  assert.equal(rows.find((r) => r.keyword === "ROADMAP")?.hits, 1);
  assert.equal(rows.find((r) => r.keyword === "GUIDE")?.messages, 1);
  await f.db.run("DELETE FROM campaign_keywords WHERE keyword='GUIDE'");
  assert.equal(
    (await keywordStats(f.db, "w")).find((r) => r.keyword === "GUIDE")
      ?.messages,
    1,
  );
  f.db.close();
});
test("clicked filter includes people who also engaged", async () => {
  const f = await fixture();
  await f.send();
  const token = (await f.db.all("SELECT token FROM link_redirects"))[0].token;
  await f.engine.click(token, new Request("https://example.test/r/" + token));
  f.advance(1000);
  await f.send({ kind: "dm", text: "Thanks", mediaId: undefined });
  const { people } = await import("../packages/core/src/stats");
  assert.equal((await people(f.db, "w", "", "Clicked")).total, 1);
  assert.equal((await people(f.db, "w", "", "Engaged")).total, 1);
  f.db.close();
});
test("confirmed recipient alias attributes later DMs without username merging", async () => {
  const f = await fixture();
  f.provider.sendPrivateReply = async () => ({
    kind: "sent",
    id: "confirmed",
    recipientId: "messaging-id",
  });
  await f.send();
  f.advance(1000);
  await f.send({
    personProviderId: "messaging-id",
    kind: "dm",
    text: "Thank you",
    mediaId: undefined,
  });
  assert.equal((await f.db.all("SELECT * FROM people")).length, 1);
  assert.equal((await stats(f.db, "w")).engaged, 1);
  f.db.close();
});
test("bounded transient retries end visibly and preserve message snapshot", async () => {
  const f = await fixture();
  f.provider.failure = "transient";
  await f.send();
  await f.db.run(
    "UPDATE campaigns SET message='Changed',destination_url='https://example.com/new'",
  );
  for (let i = 0; i < 6; i++) {
    f.advance(3600000);
    await f.engine.recover();
  }
  const m = (await f.db.all("SELECT * FROM messages"))[0];
  assert.equal(m.status, "failed");
  assert.equal(m.attempts, 5);
  assert.equal(f.provider.calls.length, 5);
  assert.ok(f.provider.calls.every((c) => c.text.startsWith("Your resource")));
  assert.equal(
    (await f.db.all("SELECT destination_url FROM link_redirects"))[0]
      .destination_url,
    "https://example.com/resource",
  );
  f.db.close();
});
test("rolling live budget defers without claiming or calling provider", async () => {
  const f = await fixture();
  f.provider.live = true;
  for (let i = 0; i < 5; i++)
    await f.db.run("INSERT INTO rate_windows VALUES(?,?,1)", [
      "a",
      f.engine.now() + ":" + i,
    ]);
  await f.send();
  assert.equal(f.provider.calls.length, 0);
  assert.equal(
    (await f.db.all("SELECT status FROM messages"))[0].status,
    "queued",
  );
  f.advance(60000);
  await f.engine.recover();
  assert.equal(f.provider.calls.length, 1);
  f.db.close();
});
test("webhook metadata establishes parent and timestamp; echoes never become events", async () => {
  const f = await fixture(),
    key = "ab".repeat(32);
  await f.db.run("UPDATE social_accounts SET token_ciphertext=?", [
    await encrypt("test-token", key),
  ]);
  const provider = new InstagramProvider(
    f.db,
    {
      appId: "app",
      appSecret: "secret",
      encryptionKey: key,
      redirectUri: "https://example.test",
    },
    async () =>
      Response.json({
        id: "comment",
        parent_id: "parent",
        timestamp: "2026-09-29T11:00:00Z",
      }),
  );
  const payload = JSON.parse(
    readFileSync("fixtures/instagram-webhooks.json", "utf8"),
  );
  const events = await provider.processWebhook(payload);
  assert.equal(events.length, 2);
  assert.equal(events[0].topLevel, false);
  assert.equal(events[0].occurredAt, "2026-09-29T11:00:00.000Z");
  assert.equal(events[1].kind, "dm");
  f.db.close();
});
test("OAuth exchange uses Instagram credentials and professional user_id", async () => {
  const f = await fixture(),
    calls: string[] = [];
  const provider = new InstagramProvider(
    f.db,
    {
      appId: "instagram-app",
      appSecret: "test-secret",
      encryptionKey: "ab".repeat(32),
      redirectUri: "https://example.test/callback",
      state: "one-use",
    },
    async (url, init) => {
      calls.push(String(url));
      if (calls.length === 1) {
        assert.equal(
          (init?.body as FormData).get("client_id"),
          "instagram-app",
        );
        return Response.json({ data: [{ access_token: "short" }] });
      }
      if (calls.length === 2)
        return Response.json({ access_token: "long", expires_in: 5184000 });
      return Response.json({
        data: [
          { id: "app-scoped", user_id: "professional", username: "creator" },
        ],
      });
    },
  );
  assert.equal(
    new URL((await provider.connect()).url).searchParams.get("state"),
    "one-use",
  );
  assert.equal((await provider.exchange("code")).providerId, "professional");
  assert.ok(
    calls[0].startsWith("https://api.instagram.com/oauth/access_token"),
  );
  assert.ok(calls[1].startsWith("https://graph.instagram.com/access_token"));
  f.db.close();
});
test("redaction removes bearer credentials and token fields", async () => {
  const { redact } = await import("../packages/core/src/security");
  const text = redact(
    "Authorization: Bearer sensitiveToken access_token=hiddenToken",
  );
  assert.ok(!text.includes("sensitiveToken"));
  assert.ok(!text.includes("hiddenToken"));
});

test("durable outbox recovers a crash before normalization processing", async () => {
  const f = await fixture();
  await f.engine.ingest(f.event());
  assert.equal(f.provider.calls.length, 0);
  await f.engine.recoverOutbox();
  await f.engine.recoverOutbox();
  assert.equal(f.provider.calls.length, 1);
  assert.equal(
    (await f.db.all("SELECT published_at FROM outbox"))[0].published_at,
    f.engine.now(),
  );
  f.db.close();
});
test("exact match beats fuzzy and oldest activation resolves equal keywords", async () => {
  const f = await fixture();
  await f.db.run(
    "INSERT INTO campaigns SELECT 'c2',account_id,'Second',trigger,media_id,message,destination_url,state,fuzzy,cooldown_hours,'2026-09-01',created_at,exclusions FROM campaigns WHERE id='c'",
  );
  await f.db.run("INSERT INTO campaign_keywords VALUES('k2','c2','ROAMDAP')");
  await f.send({ text: "roamdap" });
  assert.equal(
    (await f.db.all("SELECT campaign_id FROM messages"))[0].campaign_id,
    "c2",
  );
  await f.db.run(
    "UPDATE campaign_keywords SET keyword='ROADMAP' WHERE id='k2'",
  );
  await f.send({ personProviderId: "another", text: "ROADMAP" });
  assert.equal(
    (
      await f.db.all(
        "SELECT campaign_id FROM messages WHERE person_id=(SELECT id FROM people WHERE provider_id='another')",
      )
    )[0].campaign_id,
    "c2",
  );
  f.db.close();
});
