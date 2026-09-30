import type { Repository, Statement } from "../../shared/src/index";
export async function seed(db: Repository) {
  if ((await db.all("SELECT id FROM workspaces LIMIT 1")).length) return;
  const now = new Date(),
    base = new Date(now.getTime() - 86400000 * 12).toISOString();
  const s: Statement[] = [];
  const add = (sql: string, ...args: unknown[]) => s.push({ sql, args });
  add("INSERT INTO workspaces VALUES(?,?,?)", "demo", "Creator studio", 30);
  add("INSERT INTO owners VALUES(?,?)", "owner-demo", "demo");
  add(
    "INSERT INTO social_accounts(id,workspace_id,provider,provider_id,username,status) VALUES(?,?,?,?,?,?)",
    "demo-account",
    "demo",
    "instagram",
    "creator-001",
    "maya.creates",
    "connected",
  );
  const captions = [
    "Your next chapter starts with a roadmap.",
    "3 things I wish I knew before starting",
    "The simple weekly planning system",
    "Stop waiting for the perfect moment",
    "Build a business that fits your life",
  ];
  const views = [42000, 31400, 25000, 18000, 12000],
    keys = ["ROADMAP", "GUIDE", "PLAN", "START", "AIM"];
  for (let i = 0; i < 5; i++) {
    const media = "media-" + (i + 1),
      campaign = "campaign-" + (i + 1);
    add(
      "INSERT INTO media(id,account_id,provider_id,caption,type,published_at,views,collected_at) VALUES(?,?,?,?,?,?,?,?)",
      media,
      "demo-account",
      "ig-media-" + i,
      captions[i],
      i === 2 ? "IMAGE" : "REELS",
      new Date(now.getTime() - (20 - i * 2) * 86400000).toISOString(),
      views[i],
      now.toISOString(),
    );
    add(
      "INSERT INTO campaigns(id,account_id,name,trigger,media_id,message,destination_url,state,activated_at,created_at,exclusions) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      campaign,
      "demo-account",
      [
        "The creator roadmap",
        "Your free starter guide",
        "Weekly planning kit",
        "Start here",
        "Find your focus",
      ][i],
      "comment",
      media,
      "Here's the resource I promised 👇",
      "https://example.com/" + keys[i].toLowerCase(),
      "Active",
      base,
      base,
      JSON.stringify(["don't send " + keys[i], "no " + keys[i]]),
    );
    add(
      "INSERT INTO campaign_keywords VALUES(?,?,?)",
      "key-" + i,
      campaign,
      keys[i],
    );
  }
  add(
    "INSERT INTO campaigns(id,account_id,name,trigger,message,destination_url,state,activated_at,created_at,exclusions) VALUES(?,?,?,?,?,?,?,?,?,?)",
    "campaign-dm",
    "demo-account",
    "Roadmap in your DMs",
    "dm",
    "Here's your roadmap 👇",
    "https://example.com/roadmap",
    "Active",
    base,
    base,
    '["no roadmap","dont send roadmap"]',
  );
  add(
    "INSERT INTO campaign_keywords VALUES(?,?,?)",
    "key-dm",
    "campaign-dm",
    "ROADMAP",
  );
  for (let i = 0; i < 2841; i++) {
    const person = "person-" + i,
      event = "event-" + i,
      message = "message-" + i,
      media = "media-" + ((i % 5) + 1),
      campaign = "campaign-" + ((i % 5) + 1),
      time = new Date(now.getTime() - 86400000 * 10 + i * 240000).toISOString(),
      sent = new Date(Date.parse(time) + 1000).toISOString();
    add(
      "INSERT INTO people VALUES(?,?,?,?,?)",
      person,
      "demo-account",
      "visitor-" + i,
      ["alex", "jordan", "sam", "taylor", "jamie", "casey"][i % 6] +
        "." +
        String(i + 1).padStart(3, "0"),
      time,
    );
    add(
      "INSERT INTO incoming_events(id,account_id,provider_event_id,person_id,media_id,kind,text,occurred_at,received_at,top_level,status,campaign_id,keyword) VALUES(?,?,?,?,?,'comment',?,?,?,1,'matched',?,?)",
      event,
      "demo-account",
      "ig-comment-" + i,
      person,
      media,
      keys[i % 5],
      time,
      time,
      campaign,
      keys[i % 5],
    );
    add(
      "INSERT INTO messages(id,event_id,campaign_id,person_id,media_id,body,status,provider_message_id,sent_at,created_at,attempts,error_detail) VALUES(?,?,?,?,?,?,?,?,?,?,1,?)",
      message,
      event,
      campaign,
      person,
      media,
      "Here is your resource",
      i < 2734 ? "sent" : "failed",
      i < 2734 ? "sim-seed-" + i : null,
      i < 2734 ? sent : null,
      time,
      i < 2734 ? null : "Instagram did not allow this message",
    );
    // Seed tokens are opaque deterministic UUID-like values, only in isolated demo data.
    const token = "demo" + i.toString(16).padStart(44, "0");
    add(
      "INSERT INTO link_redirects(token,message_id,campaign_id,person_id,media_id,destination_url,created_at,first_clicked_at,click_count) VALUES(?,?,?,?,?,?,?,?,?)",
      token,
      message,
      campaign,
      person,
      media,
      "https://example.com/resource",
      time,
      i < 627 ? new Date(Date.parse(time) + 60000).toISOString() : null,
      i < 627 ? 1 : 0,
    );
    add(
      "INSERT INTO activity VALUES(?,?,?,?,?,?,?,?)",
      "a-" + i,
      "demo-account",
      person,
      campaign,
      event,
      i < 2734 ? "sent" : "failed",
      i < 2734
        ? "Resource message sent"
        : "Instagram did not allow this message",
      sent,
    );
    if (i < 627)
      add(
        "INSERT INTO click_events VALUES(?,?,?)",
        "click-" + i,
        token,
        new Date(Date.parse(time) + 60000).toISOString(),
      );
    if (i < 100 || (i >= 627 && i < 711)) {
      const reply = "reply-" + i,
        t = new Date(Date.parse(time) + 120000).toISOString();
      add(
        "INSERT INTO incoming_events(id,account_id,provider_event_id,person_id,kind,text,occurred_at,received_at,status,reason) VALUES(?,?,?,?,'dm',?,?,?,'ignored','No campaign keyword matched')",
        reply,
        "demo-account",
        "ig-dm-" + i,
        person,
        "Thank you, this is exactly what I needed!",
        t,
        t,
      );
      add(
        "INSERT INTO conversation_events VALUES(?,?,?,?,?)",
        "eng-" + i,
        reply,
        message,
        person,
        t,
      );
      add(
        "INSERT INTO activity VALUES(?,?,?,?,?,?,?,?)",
        "eng-a-" + i,
        "demo-account",
        person,
        campaign,
        reply,
        "engaged",
        "Replied after the resource message",
        t,
      );
    }
  }
  for (let i = 0; i < 6; i++) {
    add(
      "INSERT INTO people VALUES(?,?,?,?,?)",
      "blocked-" + i,
      "demo-account",
      "blocked-visitor-" + i,
      "blocked.account." + i,
      base,
    );
    add("INSERT INTO blocked_people VALUES(?,?)", "blocked-" + i, base);
  }
  for (let i = 0; i < s.length; i += 100) await db.batch(s.slice(i, i + 100));
}
