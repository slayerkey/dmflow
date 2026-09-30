import { normalize } from "./matcher";
import type { Repository, Row } from "../../shared/src/index";
export async function stats(
  db: Repository,
  workspace: string,
  filter: { account?: string; campaign?: string; media?: string } = {},
) {
  let condition = "a.workspace_id=?";
  const args: unknown[] = [workspace];
  if (filter.account) {
    condition += " AND a.id=?";
    args.push(filter.account);
  }
  if (filter.campaign) {
    condition += " AND c.id=?";
    args.push(filter.campaign);
  }
  if (filter.media) {
    condition += " AND c.media_id=?";
    args.push(filter.media);
  }
  const campaigns = await db.all(
    `SELECT c.id,c.media_id,c.trigger FROM campaigns c JOIN social_accounts a ON a.id=c.account_id WHERE ${condition}`,
    args,
  );
  const ids = campaigns.map((c) => c.id);
  if (!ids.length)
    return {
      views: null,
      hits: 0,
      messages: 0,
      clicks: 0,
      engaged: 0,
      leads: 0,
      leadYield: null,
      active: 0,
      savedSeconds: 0,
      dmLeads: 0,
      dmRate: null,
      contentLeads: 0,
    };
  const qs = ids.map(() => "?").join(",");
  const [hits, messages, clicked, engaged, media, workspaceRow, active] =
    await Promise.all([
      db.all(
        `SELECT COUNT(*) n,SUM(CASE WHEN kind='comment' THEN 1 ELSE 0 END) content_n FROM incoming_events WHERE campaign_id IN (${qs}) AND status='matched'`,
        ids,
      ),
      db.all(
        `SELECT id,person_id,media_id FROM messages WHERE campaign_id IN (${qs}) AND status='sent'`,
        ids,
      ),
      db.all(
        `SELECT DISTINCT person_id,media_id FROM link_redirects WHERE campaign_id IN (${qs}) AND first_clicked_at IS NOT NULL`,
        ids,
      ),
      db.all(
        `SELECT DISTINCT ce.person_id,m.media_id FROM conversation_events ce JOIN messages m ON m.id=ce.message_id WHERE m.campaign_id IN (${qs})`,
        ids,
      ),
      db.all(
        `SELECT DISTINCT m.id,m.views FROM media m JOIN campaigns c ON c.media_id=m.id WHERE c.id IN (${qs})`,
        ids,
      ),
      db.all("SELECT manual_seconds FROM workspaces WHERE id=?", [workspace]),
      db.all(
        `SELECT COUNT(*) n FROM campaigns WHERE id IN (${qs}) AND state='Active'`,
        ids,
      ),
    ]);
  const union = [...clicked, ...engaged],
    leads = new Set(union.map((x) => x.person_id)).size,
    contentLeads = new Set(
      union.filter((x) => x.media_id).map((x) => x.person_id),
    ).size,
    dmLeads = new Set(union.filter((x) => !x.media_id).map((x) => x.person_id))
      .size;
  const views =
      media.length && media.every((m) => m.views !== null)
        ? media.reduce((s, m) => s + m.views, 0)
        : null,
    dmPeople = new Set(
      messages.filter((m) => !m.media_id).map((m) => m.person_id),
    ).size;
  return {
    views,
    hits: hits[0].n,
    messages: messages.length,
    clicks: new Set(clicked.map((x) => x.person_id)).size,
    engaged: new Set(engaged.map((x) => x.person_id)).size,
    leads,
    contentLeads,
    leadYield: views ? (contentLeads / views) * 1000 : null,
    active: active[0].n,
    savedSeconds: messages.length * (workspaceRow[0]?.manual_seconds ?? 30),
    dmLeads,
    dmRate: dmPeople ? dmLeads / dmPeople : null,
    leadRate: messages.length
      ? leads / new Set(messages.map((m) => m.person_id)).size
      : null,
    keywordPer1k: views ? (hits[0].content_n / views) * 1000 : null,
    messagesPer1k: views
      ? (messages.filter((m) => m.media_id).length / views) * 1000
      : null,
    clicksPer1k: views
      ? (new Set(clicked.filter((m) => m.media_id).map((m) => m.person_id))
          .size /
          views) *
        1000
      : null,
  };
}
export async function people(
  db: Repository,
  workspace: string,
  search = "",
  filter = "All",
  offset = 0,
) {
  const rows = await db.all(
    `SELECT p.*,a.username account_username,
 EXISTS(SELECT 1 FROM blocked_people b WHERE b.person_id=p.id) blocked,
 EXISTS(SELECT 1 FROM link_redirects r WHERE r.person_id=p.id AND r.first_clicked_at IS NOT NULL) clicked,
 EXISTS(SELECT 1 FROM conversation_events ce WHERE ce.person_id=p.id) engaged,
 EXISTS(SELECT 1 FROM messages m WHERE m.person_id=p.id AND m.status='sent') messaged,
 EXISTS(SELECT 1 FROM messages m WHERE m.person_id=p.id AND m.status IN ('failed','uncertain')) failed,
 EXISTS(SELECT 1 FROM incoming_events e WHERE e.person_id=p.id AND e.status='ignored') ignored,
 (SELECT c.name FROM incoming_events e JOIN campaigns c ON c.id=e.campaign_id WHERE e.person_id=p.id ORDER BY e.occurred_at DESC LIMIT 1) campaign,
 (SELECT keyword FROM incoming_events e WHERE e.person_id=p.id AND keyword IS NOT NULL ORDER BY e.occurred_at DESC LIMIT 1) keyword,
 (SELECT kind FROM incoming_events e WHERE e.person_id=p.id ORDER BY e.occurred_at DESC LIMIT 1) source,
 COALESCE((SELECT MAX(occurred_at) FROM activity WHERE person_id=p.id),p.created_at) last_activity
 FROM people p JOIN social_accounts a ON a.id=p.account_id WHERE a.workspace_id=? AND COALESCE(p.username,'') LIKE ?`,
    [workspace, "%" + search + "%"],
  );
  const processed = rows
    .map((p): Row => ({
      ...p,
      status: p.blocked
        ? "Blocked"
        : p.engaged
          ? "Engaged"
          : p.clicked
            ? "Clicked"
            : p.messaged
              ? "Message Sent"
              : p.failed
                ? "Failed"
                : p.ignored
                  ? "Ignored"
                  : "Keyword Hit",
    }))
    .filter(
      (p) =>
        filter === "All" ||
        (filter === "Potential Leads" && (p.clicked || p.engaged)) ||
        (filter === "Messaged" && p.messaged) ||
        (filter === "Failed" && p.failed) ||
        (filter === "Clicked" && p.clicked) ||
        (filter === "Engaged" && p.engaged) ||
        (filter === "Blocked" && p.blocked) ||
        (filter === "Ignored" && p.ignored) ||
        p.status === filter,
    )
    .sort((a, b) => b.last_activity.localeCompare(a.last_activity));
  return {
    total: processed.length,
    items: processed.slice(offset, offset + 50),
  };
}

// One pass through independent event facts; keywords retain historical attribution after editing.
export async function keywordStats(db: Repository, workspace: string) {
  const [definitions, facts] = await Promise.all([
    db.all(
      `SELECT k.keyword,c.account_id,c.media_id,m.views FROM campaign_keywords k JOIN campaigns c ON c.id=k.campaign_id JOIN social_accounts a ON a.id=c.account_id LEFT JOIN media m ON m.id=c.media_id WHERE a.workspace_id=?`,
      [workspace],
    ),
    db.all(
      `SELECT e.keyword,e.account_id,e.person_id,e.media_id,media.views,m.status,
 EXISTS(SELECT 1 FROM link_redirects r WHERE r.message_id=m.id AND r.first_clicked_at IS NOT NULL) clicked,
 EXISTS(SELECT 1 FROM conversation_events ce WHERE ce.message_id=m.id) engaged
 FROM incoming_events e JOIN social_accounts a ON a.id=e.account_id LEFT JOIN messages m ON m.event_id=e.id LEFT JOIN media ON media.id=e.media_id WHERE a.workspace_id=? AND e.status='matched'`,
      [workspace],
    ),
  ]);
  const groups = new Map<
    string,
    {
      keyword: string;
      account_id: string;
      hits: number;
      messages: number;
      clickers: Set<string>;
      leads: Set<string>;
      contentLeads: Set<string>;
      media: Map<string, number | null>;
    }
  >();
  const group = (r: Row) => {
    const keyword = normalize(r.keyword),
      key = r.account_id + ":" + keyword;
    if (!groups.has(key))
      groups.set(key, {
        keyword: keyword.toUpperCase(),
        account_id: r.account_id,
        hits: 0,
        messages: 0,
        clickers: new Set(),
        leads: new Set(),
        contentLeads: new Set(),
        media: new Map(),
      });
    const g = groups.get(key)!;
    if (r.media_id) g.media.set(r.media_id, r.views);
    return g;
  };
  for (const d of definitions) group(d);
  for (const f of facts) {
    const g = group(f);
    g.hits++;
    if (f.status === "sent") g.messages++;
    if (f.clicked) g.clickers.add(f.person_id);
    if (f.clicked || f.engaged) {
      g.leads.add(f.person_id);
      if (f.media_id) g.contentLeads.add(f.person_id);
    }
  }
  return [...groups.values()].map((g) => {
    const values = [...g.media.values()],
      views =
        values.length && values.every((v) => v !== null)
          ? values.reduce<number>((sum, v) => sum + v!, 0)
          : null;
    return {
      keyword: g.keyword,
      account_id: g.account_id,
      hits: g.hits,
      messages: g.messages,
      clicks: g.clickers.size,
      leads: g.leads.size,
      leadYield: views ? (g.contentLeads.size / views) * 1000 : null,
    };
  });
}
