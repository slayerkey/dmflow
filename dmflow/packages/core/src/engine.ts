import type {
  Clock,
  NormalizedEvent,
  Repository,
  Row,
  SocialProvider,
} from "../../shared/src/index";
import { excluded, match, normalize } from "./matcher";
import { id, opaque, redact } from "./security";
export class Engine {
  constructor(
    public db: Repository,
    public provider: SocialProvider,
    public baseUrl: string,
    public clock: Clock = { now: () => new Date() },
  ) {}
  now() {
    return this.clock.now().toISOString();
  }
  async log(
    account: string,
    person: string | null,
    campaign: string | null,
    event: string | null,
    kind: string,
    description: string,
    time = this.now(),
  ) {
    await this.db.run("INSERT INTO activity VALUES(?,?,?,?,?,?,?,?)", [
      id(),
      account,
      person,
      campaign,
      event,
      kind,
      description,
      time,
    ]);
  }
  async ingest(e: NormalizedEvent) {
    const account = (
      await this.db.all("SELECT * FROM social_accounts WHERE id=?", [
        e.accountId,
      ])
    )[0];
    if (!account) throw Error("Unknown account");
    const person = id(),
      event = id(),
      now = this.now();
    await this.db.batch([
      {
        sql: "INSERT OR IGNORE INTO people SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM person_aliases WHERE account_id=? AND provider_id=?)",
        args: [
          person,
          e.accountId,
          e.personProviderId,
          e.username ?? null,
          now,
          e.accountId,
          e.personProviderId,
        ],
      },
      {
        sql: `INSERT OR IGNORE INTO incoming_events(id,account_id,provider_event_id,person_id,media_id,kind,text,occurred_at,received_at,top_level,own) SELECT ?,?,?,id,?,?,?,?,?,?,? FROM people WHERE account_id=? AND (provider_id=? OR id=(SELECT person_id FROM person_aliases WHERE account_id=? AND provider_id=?)) LIMIT 1`,
        args: [
          event,
          e.accountId,
          e.providerEventId,
          e.mediaId ?? null,
          e.kind,
          e.text,
          e.occurredAt,
          now,
          e.topLevel === undefined ? null : Number(e.topLevel),
          Number(!!e.own || e.personProviderId === account.provider_id),
          e.accountId,
          e.personProviderId,
          e.accountId,
          e.personProviderId,
        ],
      },
      {
        sql: "INSERT OR IGNORE INTO outbox(event_id,created_at) SELECT id,? FROM incoming_events WHERE id=?",
        args: [now, event],
      },
    ]);
    const row = (
      await this.db.all(
        "SELECT * FROM incoming_events WHERE account_id=? AND provider_event_id=?",
        [e.accountId, e.providerEventId],
      )
    )[0];
    if (row.id === event)
      await this.log(
        e.accountId,
        row.person_id,
        null,
        event,
        "received",
        `${e.kind === "comment" ? "Comment" : "Message"} received: “${e.text.slice(0, 160)}”`,
        e.occurredAt,
      );
    return { eventId: row.id, duplicate: row.id !== event };
  }
  async attribute(personId: string) {
    const before = new Set(
      (
        await this.db.all(
          "SELECT event_id FROM conversation_events WHERE person_id=?",
          [personId],
        )
      ).map((r) => r.event_id),
    );
    // Recompute in timestamp order so late arrivals resolve consistently.
    await this.db.run(
      `INSERT INTO conversation_events(id,event_id,message_id,person_id,occurred_at)
 SELECT 'eng-'||e.id,e.id,(SELECT m.id FROM messages m WHERE m.person_id=e.person_id AND m.status='sent' AND m.sent_at<e.occurred_at ORDER BY m.sent_at DESC,m.id LIMIT 1),e.person_id,e.occurred_at
 FROM incoming_events e WHERE e.person_id=? AND e.kind='dm' AND e.own=0 AND EXISTS(SELECT 1 FROM messages m WHERE m.person_id=e.person_id AND m.status='sent' AND m.sent_at<e.occurred_at)
 ON CONFLICT(event_id) DO UPDATE SET message_id=excluded.message_id`,
      [personId],
    );
    for (const r of await this.db.all(
      "SELECT ce.event_id,ce.occurred_at,m.campaign_id,e.account_id FROM conversation_events ce JOIN messages m ON m.id=ce.message_id JOIN incoming_events e ON e.id=ce.event_id WHERE ce.person_id=?",
      [personId],
    ))
      if (!before.has(r.event_id))
        await this.log(
          r.account_id,
          personId,
          r.campaign_id,
          r.event_id,
          "engaged",
          "Replied after a resource message",
          r.occurred_at,
        );
  }
  async process(eventId: string) {
    const e = (
      await this.db.all(
        "SELECT e.*,a.status account_status FROM incoming_events e JOIN social_accounts a ON a.id=e.account_id WHERE e.id=?",
        [eventId],
      )
    )[0];
    if (!e) return;
    await this.attribute(e.person_id);
    const existing = (
      await this.db.all("SELECT id FROM messages WHERE event_id=?", [eventId])
    )[0];
    if (existing) return this.deliver(existing.id);
    if (e.status !== "received") return;
    const ignore = async (reason: string) => {
      await this.db.run(
        "UPDATE incoming_events SET status='ignored',reason=? WHERE id=? AND status='received'",
        [reason, eventId],
      );
      await this.log(e.account_id, e.person_id, null, e.id, "ignored", reason);
    };
    if (e.own) return ignore("Your own account was ignored");
    if (e.kind === "comment" && e.top_level !== 1)
      return ignore("Only confirmed top-level comments qualify");
    if (
      (
        await this.db.all("SELECT 1 FROM blocked_people WHERE person_id=?", [
          e.person_id,
        ])
      ).length
    )
      return ignore("Person is blocked");
    if (e.account_status !== "connected")
      return ignore("Instagram needs reconnection");
    if (this.provider.live) {
      const age = this.clock.now().getTime() - Date.parse(e.occurred_at);
      if (age < 0 || age > (e.kind === "comment" ? 7 * 86400000 : 86400000))
        return ignore("Instagram messaging window has expired");
    }
    const campaigns = await this.db.all(
      `SELECT * FROM campaigns WHERE account_id=? AND state='Active' AND trigger=? AND (trigger='dm' OR media_id=?)`,
      [e.account_id, e.kind, e.media_id],
    );
    const candidates: { c: Row; keyword: string; rank: number }[] = [];
    let exclusion = false;
    for (const c of campaigns) {
      if (excluded(e.text, JSON.parse(c.exclusions))) {
        exclusion = true;
        continue;
      }
      for (const k of await this.db.all(
        "SELECT keyword FROM campaign_keywords WHERE campaign_id=?",
        [c.id],
      )) {
        const hit = match(
          e.text,
          k.keyword,
          c.fuzzy ? "fuzzy" : "whole_phrase",
        );
        if (hit) candidates.push({ c, ...hit });
      }
    }
    candidates.sort(
      (a, b) =>
        a.rank - b.rank ||
        normalize(b.keyword).length - normalize(a.keyword).length ||
        a.c.activated_at.localeCompare(b.c.activated_at) ||
        a.c.id.localeCompare(b.c.id),
    );
    if (!candidates.length)
      return ignore(
        exclusion
          ? "Excluded phrase — no message sent"
          : "No campaign keyword matched",
      );
    const { c, keyword } = candidates[0],
      message = id(),
      token = opaque(),
      now = this.now(),
      until = new Date(
        this.clock.now().getTime() + c.cooldown_hours * 3600000,
      ).toISOString();
    await this.db.batch([
      {
        sql: `INSERT INTO cooldowns SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM messages WHERE event_id=?) ON CONFLICT(person_id,campaign_id) DO UPDATE SET message_id=excluded.message_id,until_at=excluded.until_at WHERE cooldowns.until_at<=? AND NOT EXISTS(SELECT 1 FROM messages WHERE event_id=?)`,
        args: [e.person_id, c.id, message, until, e.id, now, e.id],
      },
      {
        sql: `INSERT OR IGNORE INTO messages(id,event_id,campaign_id,person_id,media_id,body,status,created_at) SELECT ?,?,?,?,?,?,'queued',? WHERE EXISTS(SELECT 1 FROM cooldowns WHERE message_id=?)`,
        args: [
          message,
          e.id,
          c.id,
          e.person_id,
          e.media_id,
          `${c.message}\n\n${this.baseUrl}/r/${token}`,
          now,
          message,
        ],
      },
      {
        sql: `INSERT OR IGNORE INTO link_redirects(token,message_id,campaign_id,person_id,media_id,destination_url,created_at) SELECT ?,id,campaign_id,person_id,media_id,?,? FROM messages WHERE id=?`,
        args: [token, c.destination_url, now, message],
      },
      {
        sql: `UPDATE incoming_events SET status='matched',campaign_id=?,keyword=? WHERE id=? AND EXISTS(SELECT 1 FROM messages WHERE id=?)`,
        args: [c.id, keyword, e.id, message],
      },
    ]);
    const m = (
      await this.db.all("SELECT id FROM messages WHERE event_id=?", [e.id])
    )[0];
    if (!m) return ignore("Campaign cooldown is active");
    if (m.id === message)
      await this.log(
        e.account_id,
        e.person_id,
        c.id,
        e.id,
        "matched",
        `Keyword ${keyword} matched · message queued`,
      );
    return this.deliver(m.id);
  }
  async deliver(messageId: string) {
    const m = (
      await this.db.all(
        `SELECT m.*,e.account_id,e.provider_event_id,e.kind,e.occurred_at,e.own,e.top_level,p.provider_id,c.state,a.status account_status FROM messages m JOIN incoming_events e ON e.id=m.event_id JOIN people p ON p.id=m.person_id JOIN campaigns c ON c.id=m.campaign_id JOIN social_accounts a ON a.id=e.account_id WHERE m.id=?`,
        [messageId],
      )
    )[0];
    if (!m) return;
    if (
      !["queued", "retry"].includes(m.status) ||
      (m.next_attempt_at && m.next_attempt_at > this.now())
    )
      return;
    if (
      m.state !== "Active" ||
      m.account_status !== "connected" ||
      m.own ||
      (
        await this.db.all("SELECT 1 FROM blocked_people WHERE person_id=?", [
          m.person_id,
        ])
      ).length
    ) {
      await this.db.run(
        "UPDATE messages SET status='cancelled',error_detail='Paused, blocked, or disconnected before sending' WHERE id=? AND status IN ('queued','retry')",
        [messageId],
      );
      return;
    }
    if (this.provider.live) {
      const age = this.clock.now().getTime() - Date.parse(m.occurred_at);
      if (age < 0 || age > (m.kind === "comment" ? 7 * 86400000 : 86400000)) {
        await this.db.run(
          "UPDATE messages SET status='failed',error_kind='permanent',error_detail='Instagram messaging window expired' WHERE id=? AND status IN ('queued','retry')",
          [messageId],
        );
        return;
      }
    }
    // Conservative shared account budget below Meta's 750 private replies/hour.
    // Rolling reservation rows serialize concurrent consumers in the database.
    if (this.provider.live) {
      const reservation = this.now() + ":" + id(),
        hour = new Date(this.clock.now().getTime() - 3600000).toISOString(),
        second = new Date(this.clock.now().getTime() - 1000).toISOString();
      const reserved = await this.db.run(
        `INSERT INTO rate_windows(account_id,window_start,count) SELECT ?,?,1 WHERE (SELECT COUNT(*) FROM rate_windows WHERE account_id=? AND window_start>?)<700 AND (SELECT COUNT(*) FROM rate_windows WHERE account_id=? AND window_start>?)<5`,
        [m.account_id, reservation, m.account_id, hour, m.account_id, second],
      );
      if (!reserved) {
        await this.db.run(
          "UPDATE messages SET next_attempt_at=?,error_detail='Account send budget reached; waiting safely' WHERE id=? AND status IN ('queued','retry')",
          [
            new Date(this.clock.now().getTime() + 60000).toISOString(),
            messageId,
          ],
        );
        return;
      }
    }
    const claimed = await this.db.run(
      "UPDATE messages SET status='dispatching',attempts=attempts+1,claimed_at=? WHERE id=? AND status IN ('queued','retry') AND (next_attempt_at IS NULL OR next_attempt_at<=?) AND NOT EXISTS(SELECT 1 FROM blocked_people b WHERE b.person_id=messages.person_id) AND EXISTS(SELECT 1 FROM campaigns c JOIN social_accounts a ON a.id=c.account_id WHERE c.id=messages.campaign_id AND c.state='Active' AND a.status='connected')",
      [this.now(), messageId, this.now()],
    );
    if (!claimed) return;
    const attempt = id();
    await this.db.run("INSERT INTO send_attempts VALUES(?,?,?,?)", [
      attempt,
      messageId,
      this.now(),
      "dispatching",
    ]);
    let result;
    try {
      const input = {
        accountId: m.account_id,
        recipientId: m.provider_id,
        commentId: m.provider_event_id,
        text: m.body,
      };
      result = await (m.kind === "comment"
        ? this.provider.sendPrivateReply(input)
        : this.provider.sendMessage(input));
    } catch {
      result = {
        kind: "uncertain" as const,
        detail: "Connection interrupted; delivery cannot be confirmed",
      };
    }
    const now = this.now();
    let status: string = result.kind;
    if (result.kind === "sent")
      await this.db.run(
        "UPDATE messages SET status='sent',provider_message_id=?,sent_at=?,error_kind=NULL,error_detail=NULL WHERE id=?",
        [result.id, now, messageId],
      );
    else {
      status =
        result.kind === "transient" && m.attempts < 4
          ? "retry"
          : result.kind === "uncertain"
            ? "uncertain"
            : "failed";
      const next = new Date(
        this.clock.now().getTime() +
          Math.max(
            result.retryAfter ?? 0,
            Math.min(900, 2 ** (m.attempts + 1) * 5),
          ) *
            1000,
      ).toISOString();
      await this.db.run(
        "UPDATE messages SET status=?,next_attempt_at=?,error_kind=?,error_detail=? WHERE id=?",
        [status, next, result.kind, redact(result.detail), messageId],
      );
      if (result.kind === "auth")
        await this.db.run(
          "UPDATE social_accounts SET status='reconnect' WHERE id=?",
          [m.account_id],
        );
    }
    await this.db.run("UPDATE send_attempts SET result=? WHERE id=?", [
      status,
      attempt,
    ]);
    await this.log(
      m.account_id,
      m.person_id,
      m.campaign_id,
      m.event_id,
      status,
      status === "sent"
        ? "Resource message sent"
        : status === "uncertain"
          ? "Delivery uncertain — automatic resend stopped"
          : status === "retry"
            ? "Temporary failure — retry scheduled"
            : result.kind === "transient"
              ? "Retries exhausted — sending stopped"
              : "Instagram did not allow this message to be sent",
    );
    if (status === "sent") {
      if (result.kind === "sent" && result.recipientId) {
        await this.db.batch([
          {
            sql: "INSERT OR IGNORE INTO person_aliases VALUES(?,?,?)",
            args: [m.account_id, result.recipientId, m.person_id],
          },
          {
            sql: "INSERT OR REPLACE INTO provider_recipients VALUES(?,?)",
            args: [messageId, result.recipientId],
          },
        ]);
      }
      await this.attribute(m.person_id);
    }
  }
  async recoverOutbox() {
    for (const row of await this.db.all(
      "SELECT event_id FROM outbox WHERE published_at IS NULL LIMIT 50",
    )) {
      await this.process(row.event_id);
      await this.db.run("UPDATE outbox SET published_at=? WHERE event_id=?", [
        this.now(),
        row.event_id,
      ]);
    }
  }
  async recover() {
    const stale = new Date(this.clock.now().getTime() - 300000).toISOString();
    await this.db.run(
      "UPDATE messages SET status='uncertain',error_kind='uncertain',error_detail='Dispatch interrupted; automatic resend stopped' WHERE status='dispatching' AND claimed_at<?",
      [stale],
    );
    const rows = await this.db.all(
      "SELECT id FROM messages WHERE status IN ('queued','retry') AND (next_attempt_at IS NULL OR next_attempt_at<=?) LIMIT 100",
      [this.now()],
    );
    for (const r of rows) await this.deliver(r.id);
  }
  async click(token: string, request: Request) {
    const link = (
      await this.db.all("SELECT * FROM link_redirects WHERE token=?", [token])
    )[0];
    if (!link) return new Response("Link not found", { status: 404 });
    const preview =
      request.method === "HEAD" ||
      /bot|crawler|spider|facebookexternalhit|preview/i.test(
        request.headers.get("user-agent") ?? "",
      ) ||
      /prefetch|preview/i.test(
        (request.headers.get("purpose") ?? "") +
          (request.headers.get("sec-purpose") ?? ""),
      );
    if (!preview) {
      const now = this.now();
      await this.db.batch([
        {
          sql: "INSERT INTO click_events VALUES(?,?,?)",
          args: [id(), token, now],
        },
        {
          sql: "UPDATE link_redirects SET click_count=click_count+1,first_clicked_at=COALESCE(first_clicked_at,?) WHERE token=?",
          args: [now, token],
        },
      ]);
      const p = (
        await this.db.all("SELECT account_id FROM people WHERE id=?", [
          link.person_id,
        ])
      )[0];
      await this.log(
        p.account_id,
        link.person_id,
        link.campaign_id,
        null,
        "clicked",
        "Resource link clicked",
      );
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: link.destination_url,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
}
