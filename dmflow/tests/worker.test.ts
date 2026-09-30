import { test } from "node:test";
import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import { readFileSync, mkdirSync } from "node:fs";
import { hash, encrypt } from "../packages/core/src/security";
import { D1Repository } from "../workers/api/src/index";
import { Engine } from "../packages/core/src/engine";
import { SimulatedProvider } from "../packages/instagram/src/index";
import { stats } from "../packages/core/src/stats";
import { seed } from "../packages/core/src/seed";
const integration = process.env.DMFLOW_WORKER_TEST === "1" ? test : test.skip;
integration(
  "real local D1 repository, webhook verification, queue receipt, OAuth replay, and API auth",
  async () => {
    mkdirSync("work", { recursive: true });
    await build({
      entryPoints: ["workers/api/src/index.ts"],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      outfile: "work/worker-test.mjs",
    });
    const mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        scriptPath: "work/worker-test.mjs",
        compatibilityDate: "2026-09-28",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: { DB: "test-db" },
        queueProducers: { EVENT_QUEUE: "events" },
        queueConsumers: { events: { maxBatchSize: 1, maxBatchTimeout: 0 } },
        bindings: {
          PUBLIC_WORKER_URL: "https://worker.test",
          META_APP_ID: "test-app",
          META_APP_SECRET: "test-secret",
          META_VERIFY_TOKEN: "verify-test",
          TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
        },
      }),
    );
    try {
      const d1 = await mf.getD1Database("DB");
      const schema = readFileSync("migrations/0001_initial.sql", "utf8");
      for (const statement of schema
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await d1.prepare(statement).run();
      const repo = new D1Repository(d1 as any);
      await seed(repo);
      const s = await stats(repo, "demo");
      assert.deepEqual(
        [s.views, s.hits, s.messages, s.clicks, s.engaged, s.leads],
        [128400, 2841, 2734, 627, 184, 711],
      );
      const provider = new SimulatedProvider(),
        engine = new Engine(repo, provider, "https://worker.test");
      const e = await engine.ingest({
        accountId: "demo-account",
        providerEventId: "d1-event",
        personProviderId: "d1-user",
        kind: "comment",
        text: "roamdap",
        mediaId: "media-1",
        topLevel: true,
        occurredAt: new Date().toISOString(),
      });
      await Promise.all([engine.process(e.eventId), engine.process(e.eventId)]);
      assert.equal(provider.calls.length, 1);
      assert.equal(
        (await mf.dispatchFetch("https://worker.test/api/campaigns")).status,
        401,
      );
      assert.equal(
        (
          await mf.dispatchFetch(
            "https://worker.test/webhooks/instagram?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=123",
          )
        ).status,
        200,
      );
      assert.equal(
        await (
          await mf.dispatchFetch(
            "https://worker.test/webhooks/instagram?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=123",
          )
        ).text(),
        "123",
      );
      assert.equal(
        (
          await mf.dispatchFetch(
            "https://worker.test/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong",
          )
        ).status,
        403,
      );
      const payload = JSON.stringify({
        object: "instagram",
        entry: [{ id: "unknown-account", messaging: [] }],
      });
      assert.equal(
        (
          await mf.dispatchFetch("https://worker.test/webhooks/instagram", {
            method: "POST",
            body: payload,
          })
        ).status,
        401,
      );
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode("test-secret"),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const signature =
        "sha256=" +
        Buffer.from(
          await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(payload),
          ),
        ).toString("hex");
      const response = await mf.dispatchFetch(
        "https://worker.test/webhooks/instagram",
        {
          method: "POST",
          body: payload,
          headers: { "X-Hub-Signature-256": signature },
        },
      );
      assert.equal(response.status, 200);
      // Bounded polling allows the actual local Queue consumer to acknowledge the receipt.
      let done = false;
      for (let i = 0; i < 40; i++) {
        const receipt = await repo.all("SELECT status FROM webhook_receipts");
        if (receipt[0]?.status === "done") {
          done = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(done, true);
      const state = "test-state";
      await repo.run("INSERT INTO oauth_states VALUES(?,?,?,NULL)", [
        await hash(state),
        "demo",
        new Date(Date.now() + 600000).toISOString(),
      ]);
      assert.equal(
        (
          await mf.dispatchFetch(
            "https://worker.test/oauth/instagram/callback?state=test-state&error=access_denied",
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await mf.dispatchFetch(
            "https://worker.test/oauth/instagram/callback?state=test-state&error=access_denied",
          )
        ).status,
        400,
      );
    } finally {
      await mf.dispose();
    }
  },
);
