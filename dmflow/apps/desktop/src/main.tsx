import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Home,
  Camera as Instagram,
  LayoutGrid,
  Link,
  MessageCircle,
  MoreHorizontal,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
  Zap,
} from "lucide-react";
import type { Row } from "../../../packages/shared/src/index";
import "./style.css";
const api = window.dmflow;
const n = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("en-US");
const pct = (a: number, b: number) =>
  b ? `${((a / b) * 100).toFixed(1)}%` : "—";
const date = (v: string) =>
  new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const time = (v: string) =>
  new Date(v).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
function Badge({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: () => void;
}) {
  return (
    <div className="empty">
      <MessageCircle size={32} />
      <h3>{title}</h3>
      <p>{detail}</p>
      {action && (
        <button className="primary" onClick={action}>
          Create your first campaign <Plus size={16} />
        </button>
      )}
    </div>
  );
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current
      ?.querySelector<HTMLElement>("button,input,select,textarea")
      ?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const nodes = Array.from(
              ref.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary",
              ) ?? [],
            );
            const first = nodes[0],
              last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide" : "")}
      >
        <header>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function App() {
  const [page, setPage] = useState("Home"),
    [boot, setBoot] = useState<Row | null>(null),
    [metrics, setMetrics] = useState<Row | null>(null),
    [campaigns, setCampaigns] = useState<Row[]>([]),
    [media, setMedia] = useState<Row[]>([]),
    [activity, setActivity] = useState<Row[]>([]),
    [personRows, setPersonRows] = useState<Row[]>([]),
    [peopleTotal, setPeopleTotal] = useState(0),
    [offset, setOffset] = useState(0),
    [filter, setFilter] = useState("All"),
    [query, setQuery] = useState(""),
    [wizard, setWizard] = useState<Row | null | false>(false),
    [simulate, setSimulate] = useState(false),
    [person, setPerson] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [account, setAccount] = useState(""),
    [sort, setSort] = useState("leads"),
    [keywords, setKeywords] = useState<Row[]>([]);
  const refresh = useCallback(async () => {
    try {
      const [b, s, c, m, a, k] = await Promise.all([
        api.request("/api/bootstrap"),
        api.request("/api/stats" + (account ? "?account=" + account : "")),
        api.request<Row[]>("/api/campaigns"),
        api.request<Row[]>("/api/media"),
        api.request<Row[]>("/api/activity"),
        api.request<Row[]>("/api/keywords"),
      ]);
      setKeywords(k);
      setBoot(b);
      setMetrics(s);
      setCampaigns(c);
      setMedia(m);
      setActivity(a);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [account]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        if (page === "Home") {
          const [s, a] = await Promise.all([
            api.request("/api/stats" + (account ? "?account=" + account : "")),
            api.request<Row[]>("/api/activity"),
          ]);
          setMetrics(s);
          setActivity(a);
        } else if (page === "Activity")
          setActivity(await api.request<Row[]>("/api/activity"));
        else if (page === "Settings")
          setBoot(await api.request("/api/bootstrap"));
      } catch (e) {
        setError((e as Error).message);
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [page, account]);
  const loadPeople = useCallback(async () => {
    try {
      const p = await api.request(
        "/api/people?" +
          new URLSearchParams({ q: query, filter, offset: String(offset) }),
      );
      setPersonRows(p.items);
      setPeopleTotal(p.total);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [query, filter, offset]);
  useEffect(() => {
    if (page === "People") void loadPeople();
  }, [page, loadPeople, metrics]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  const action = async (fn: () => Promise<unknown>, message?: string) => {
    try {
      await fn();
      if (message) setNotice(message);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const toggle = (c: Row) =>
    action(
      () =>
        api.request("/api/campaigns/" + c.id, "PUT", {
          ...c,
          fuzzy: !!c.fuzzy,
          state: c.state === "Active" ? "Paused" : "Active",
        }),
      "Campaign updated",
    );
  const openPerson = async (id: string) => {
    try {
      setPerson(await api.request("/api/people/" + id));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const nav = [
    ["Home", Home],
    ["Campaigns", Zap],
    ["People", Users],
    ["Media", LayoutGrid],
    ["Activity", Activity],
    ["Settings", Settings],
  ] as const;
  const scopedCampaigns = campaigns.filter(
      (c) => !account || c.account_id === account,
    ),
    scopedMedia = media.filter((m) => !account || m.account_id === account);
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <MessageCircle size={23} />
          </div>
          dmflow<span>beta</span>
        </div>
        <div className="workspace">
          <div className="avatar">MC</div>
          <div>
            <strong>Creator studio</strong>
            <small>Your workspace</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([name, Icon]) => {
            const label = name.split(",")[0];
            return (
              <button
                key={label}
                className={page === label ? "selected" : ""}
                onClick={() => setPage(label)}
              >
                <Icon size={19} />
                {label}
                {label === "Campaigns" && (
                  <span>
                    {campaigns.filter((c) => c.state === "Active").length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="small-note">
            <ShieldCheck size={17} />
            <span>
              One thoughtful reply.
              <br />A real connection.
            </span>
          </div>
          <div className="account">
            <Instagram size={22} />
            <div>
              <strong>
                @{boot?.accounts?.[0]?.username ?? "your.account"}
              </strong>
              <small>
                <i />
                {boot?.accounts?.[0]?.status === "connected"
                  ? "Connected"
                  : "Not connected"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <main>
        <div className="topbar">
          <span>
            Workspace <ChevronRight size={13} /> <strong>{page}</strong>
          </span>
          <div>
            <span
              className={"mode-pill " + (boot?.mode === "demo" ? "" : "live")}
            >
              <i />
              {boot?.mode === "demo" ? "Demo workspace" : "Live workspace"}
            </span>
            <div className="avatar small">MC</div>
          </div>
        </div>
        {boot?.mode === "demo" && (
          <div className="demo-banner">
            <Sparkles size={15} />
            <span>
              You're exploring demo data. Try an automation and watch the
              results update.
            </span>
            <button onClick={() => setSimulate(true)}>
              Try it out <ArrowRight size={14} />
            </button>
          </div>
        )}
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "Home"
                  ? "YOUR CONTENT. REAL CONNECTIONS."
                  : "CREATOR STUDIO"}
              </div>
              <h1>{page === "Home" ? "A little more impact." : page}</h1>
              <p>
                {
                  (
                    {
                      Home: "See how your content turns curiosity into connection.",
                      Campaigns:
                        "The right resource, delivered at the right moment.",
                      People: "Meet the people taking the next step.",
                      Media: "Find the content that creates real interest.",
                      Activity: "A clear record of what happened, and why.",
                      Settings: "Make DMFlow feel right for your workflow.",
                    } as Row
                  )[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              <button
                onClick={() => void refresh()}
                aria-label="Refresh workspace"
              >
                Refresh
              </button>
              {page === "Home" && (
                <select
                  aria-label="Account filter"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                >
                  <option value="">All accounts</option>
                  {boot?.accounts?.map((a: Row) => (
                    <option key={a.id} value={a.id}>
                      @{a.username}
                    </option>
                  ))}
                </select>
              )}
              {["Home", "Campaigns"].includes(page) && (
                <button className="primary" onClick={() => setWizard(null)}>
                  <Plus size={17} /> Create campaign
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {boot?.mode === "live" &&
            boot.accounts.some((a: Row) => a.status !== "connected") && (
              <div className="error">
                An Instagram connection needs attention. Open Settings to
                reconnect before sending resumes.
              </div>
            )}
          {loading ? (
            <div className="empty">Getting your workspace ready…</div>
          ) : (
            <>
              {page === "Home" && metrics && (
                <>
                  <div className="overview-grid">
                    <section className="hero-card">
                      <div className="hero-top">
                        <span>
                          <Target size={17} /> YOUR LEAD YIELD
                        </span>
                        <Badge tone="soft">Lifetime · selected content</Badge>
                      </div>
                      <div className="hero-number">
                        {metrics.leadYield == null
                          ? "—"
                          : metrics.leadYield.toFixed(2)}
                        <span>per 1,000 views</span>
                      </div>
                      <h2>Potential Leads / 1K Views</h2>
                      <p>
                        People who clicked your resource or replied after your
                        automation, normalized per 1,000 content views.
                      </p>
                      <div className="hero-foot">
                        <span>
                          {metrics.views === null
                            ? "View data unavailable"
                            : `${n(metrics.contentLeads)} potential leads from ${n(metrics.views)} content views`}
                        </span>
                        <ArrowUpRight size={20} />
                      </div>
                    </section>
                    <section className="insight-card">
                      <div className="icon-circle">
                        <Sparkles size={22} />
                      </div>
                      <h3>
                        Small moments.
                        <br />
                        Meaningful connections.
                      </h3>
                      <p>
                        Your automations have helped{" "}
                        <strong>{n(metrics.leads)} people</strong> take the next
                        step.
                      </p>
                      <div className="insight-line" />
                      <div>
                        <span className="green-dot" /> {metrics.active}{" "}
                        campaigns working for you
                      </div>
                      <button
                        className="text-button"
                        onClick={() => {
                          setFilter("Potential Leads");
                          setPage("People");
                        }}
                      >
                        Meet your potential leads <ArrowRight size={16} />
                      </button>
                    </section>
                  </div>
                  <div className="metrics-grid">
                    {[
                      [
                        Send,
                        "Messages automated",
                        n(metrics.messages),
                        "Successful resource deliveries",
                      ],
                      [
                        Clock,
                        "Estimated time saved",
                        `${Math.floor(metrics.savedSeconds / 3600)}h ${Math.floor((metrics.savedSeconds % 3600) / 60)}m`,
                        `Estimated at ${boot?.settings?.manual_seconds ?? 30} sec/message`,
                      ],
                      [
                        MousePointer2,
                        "Unique clickers",
                        n(metrics.clicks),
                        "People who opened a resource",
                      ],
                      [
                        Users,
                        "Potential leads",
                        n(metrics.leads),
                        "Clicked or replied, counted once",
                      ],
                    ].map(([Icon, label, value, desc]: any) => (
                      <section className="metric" key={label}>
                        <div>
                          <span>{label}</span>
                          <Icon size={17} />
                        </div>
                        <strong>{value}</strong>
                        <small>{desc}</small>
                      </section>
                    ))}
                  </div>
                  <section className="panel funnel-panel">
                    <div className="section-heading">
                      <div>
                        <h2>From views to conversations</h2>
                        <p>
                          Follow the moments that move your audience closer.
                        </p>
                      </div>
                      <Badge>Lifetime performance</Badge>
                    </div>
                    <div className="funnel">
                      <div className="stage">
                        <div className="stage-icon">
                          <Play size={19} />
                        </div>
                        <small>CONTENT VIEWS</small>
                        <strong>{n(metrics.views)}</strong>
                        <span>
                          {metrics.views === null
                            ? "View data unavailable"
                            : "Selected posts, counted once"}
                        </span>
                      </div>
                      <ArrowRight className="flow-arrow" />
                      <div className="stage">
                        <div className="stage-icon">
                          <MessageCircle size={19} />
                        </div>
                        <small>KEYWORD HITS</small>
                        <strong>{n(metrics.hits)}</strong>
                        <span>Eligible campaign matches</span>
                      </div>
                      <ArrowRight className="flow-arrow" />
                      <div className="stage">
                        <div className="stage-icon">
                          <Send size={19} />
                        </div>
                        <small>MESSAGES SENT</small>
                        <strong>{n(metrics.messages)}</strong>
                        <span>
                          {pct(metrics.messages, metrics.hits)} of keyword hits
                        </span>
                      </div>
                      <div className="branch">
                        <div>
                          <MousePointer2 size={15} />
                          <strong>{n(metrics.clicks)}</strong>
                          <span>
                            clicked · {pct(metrics.clicks, metrics.messages)}
                          </span>
                        </div>
                        <div>
                          <MessageCircle size={15} />
                          <strong>{n(metrics.engaged)}</strong>
                          <span>
                            replied · {pct(metrics.engaged, metrics.messages)}
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="flow-arrow" />
                      <div className="stage last">
                        <div className="stage-icon">
                          <Users size={19} />
                        </div>
                        <small>POTENTIAL LEADS</small>
                        <strong>{n(metrics.leads)}</strong>
                        <span>Unique clickers ∪ repliers</span>
                      </div>
                    </div>
                    <div className="funnel-note">
                      <ShieldCheck size={14} /> People who both click and reply
                      are counted once. DM campaigns contribute to totals, but
                      not to leads per view.
                    </div>
                    {metrics.views === null && metrics.leadRate != null && (
                      <p className="dm-rate">
                        Potential leads per messaged person:{" "}
                        {(metrics.leadRate * 100).toFixed(1)}%
                      </p>
                    )}
                    {metrics.dmRate !== null && (
                      <p className="dm-rate">
                        DM campaign lead rate:{" "}
                        {(metrics.dmRate * 100).toFixed(1)}% of messaged people
                      </p>
                    )}
                  </section>
                  <div className="bottom-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <div>
                          <h2>Your keywords at a glance</h2>
                          <p>Which invitations start the most connections?</p>
                        </div>
                        <select
                          aria-label="Sort keyword performance"
                          value={sort}
                          onChange={(e) => setSort(e.target.value)}
                        >
                          <option value="leads">By leads</option>
                          <option value="hits">By hits</option>
                          <option value="messages">By messages</option>
                          <option value="clicks">By clicks</option>
                        </select>
                      </div>
                      {!scopedCampaigns.length ? (
                        <Empty
                          title="No campaigns yet"
                          detail="Turn comments into resource deliveries automatically."
                          action={() => setWizard(null)}
                        />
                      ) : (
                        <table>
                          <thead>
                            <tr>
                              <th>Keyword</th>
                              <th>Hits</th>
                              <th>Sent</th>
                              <th>Clicks</th>
                              <th>Leads</th>
                              <th>Leads / 1K</th>
                            </tr>
                          </thead>
                          <tbody>
                            {keywords
                              .filter(
                                (k) => !account || k.account_id === account,
                              )
                              .sort((a, b) => b[sort] - a[sort])
                              .map((k) => (
                                <tr key={k.account_id + k.keyword}>
                                  <td>
                                    <span className="keyword">{k.keyword}</span>
                                  </td>
                                  <td>{n(k.hits)}</td>
                                  <td>{n(k.messages)}</td>
                                  <td>{n(k.clicks)}</td>
                                  <td>
                                    <strong>{n(k.leads)}</strong>
                                  </td>
                                  <td>{k.leadYield?.toFixed(1) ?? "—"}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      )}
                    </section>
                    <section className="panel recent">
                      <div className="section-heading">
                        <h2>Just happened</h2>
                        <button
                          className="text-button"
                          onClick={() => setPage("Activity")}
                        >
                          View all <ArrowUpRight size={15} />
                        </button>
                      </div>
                      {activity.slice(0, 4).map((a) => (
                        <div className="recent-item" key={a.id}>
                          <div className="activity-icon">
                            <MessageCircle size={16} />
                          </div>
                          <div>
                            <strong>{a.description}</strong>
                            <span>
                              @{a.username ?? "unknown"} · {date(a.occurred_at)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </section>
                  </div>
                </>
              )}
              {page === "Campaigns" && (
                <>
                  {!campaigns.length ? (
                    <Empty
                      title="No campaigns yet."
                      detail="Turn Instagram comments into resource deliveries automatically."
                      action={() => setWizard(null)}
                    />
                  ) : (
                    <div className="campaign-grid">
                      {campaigns.map((c) => (
                        <section className="panel campaign-card" key={c.id}>
                          <div className="card-top">
                            <div className="icon-circle">
                              <MessageCircle size={20} />
                            </div>
                            <Badge tone={c.state === "Active" ? "green" : ""}>
                              {c.state === "Active" && <i />}
                              {c.state}
                            </Badge>
                          </div>
                          <h2>{c.name}</h2>
                          <p>
                            {c.trigger === "comment"
                              ? "Comment keyword"
                              : "Direct-message keyword"}{" "}
                            · @{c.username}
                          </p>
                          <div className="keywords">
                            {c.keywords.map((k: string) => (
                              <span key={k} className="keyword">
                                {k}
                              </span>
                            ))}
                          </div>
                          <div className="message-preview">
                            {c.message}
                            <br />
                            <span>
                              dmflow…/r/unique-link <Link size={12} />
                            </span>
                          </div>
                          <div className="mini-stats">
                            <div>
                              <strong>{n(c.stats.messages)}</strong>
                              <span>Messages</span>
                            </div>
                            <div>
                              <strong>{n(c.stats.clicks)}</strong>
                              <span>Clickers</span>
                            </div>
                            <div>
                              <strong>{n(c.stats.leads)}</strong>
                              <span>Leads</span>
                            </div>
                          </div>
                          <footer>
                            <button onClick={() => setWizard(c)}>
                              Edit campaign
                            </button>
                            <button
                              className="text-button"
                              onClick={() => void toggle(c)}
                            >
                              {c.state === "Active" ? (
                                <Pause size={15} />
                              ) : (
                                <Play size={15} />
                              )}{" "}
                              {c.state === "Active" ? "Pause" : "Activate"}
                            </button>
                          </footer>
                        </section>
                      ))}
                    </div>
                  )}
                </>
              )}
              {page === "People" && (
                <section className="panel">
                  <div className="people-tools">
                    <div className="search">
                      <Search size={17} />
                      <input
                        aria-label="Search people"
                        placeholder="Search by username…"
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setOffset(0);
                        }}
                      />
                    </div>
                    <span>{n(peopleTotal)} people</span>
                  </div>
                  <div className="tabs">
                    {[
                      "All",
                      "Potential Leads",
                      "Engaged",
                      "Clicked",
                      "Messaged",
                      "Blocked",
                      "Ignored",
                      "Failed",
                    ].map((f) => (
                      <button
                        key={f}
                        className={filter === f ? "active" : ""}
                        onClick={() => {
                          setFilter(f);
                          setOffset(0);
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th>Source</th>
                        <th>Campaign</th>
                        <th>Keyword</th>
                        <th>Status</th>
                        <th>Last activity</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {personRows.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <button
                              aria-label={"@" + (p.username ?? "unknown")}
                              className="person-link"
                              onClick={() => void openPerson(p.id)}
                            >
                              <span className="avatar small">
                                {(p.username ?? "?").slice(0, 2).toUpperCase()}
                              </span>
                              @{p.username ?? "unknown"}
                            </button>
                          </td>
                          <td>
                            {p.source === "dm" ? "Direct message" : "Comment"}
                          </td>
                          <td>{p.campaign ?? "—"}</td>
                          <td>{p.keyword ?? "—"}</td>
                          <td>
                            <Badge
                              tone={
                                p.clicked || p.engaged
                                  ? "green"
                                  : p.blocked || p.failed
                                    ? "red"
                                    : ""
                              }
                            >
                              {p.status}
                            </Badge>
                          </td>
                          <td>{time(p.last_activity)}</td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() =>
                                void action(
                                  () =>
                                    api
                                      .request(
                                        "/api/people/" + p.id + "/block",
                                        "POST",
                                        { blocked: !p.blocked },
                                      )
                                      .then(() => loadPeople()),
                                  p.blocked
                                    ? "Person unblocked"
                                    : "Person blocked",
                                )
                              }
                            >
                              {p.blocked ? "Unblock" : "Block"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!personRows.length && (
                    <Empty
                      title="No people here yet"
                      detail="Matches, clicks, and replies will appear here."
                    />
                  )}
                  <div className="pagination">
                    <span>
                      {offset + 1}–{Math.min(offset + 50, peopleTotal)} of{" "}
                      {n(peopleTotal)}
                    </span>
                    <button
                      disabled={!offset}
                      onClick={() => setOffset(Math.max(0, offset - 50))}
                    >
                      <ChevronLeft size={16} /> Previous
                    </button>
                    <button
                      disabled={offset + 50 >= peopleTotal}
                      onClick={() => setOffset(offset + 50)}
                    >
                      Next <ChevronRight size={16} />
                    </button>
                  </div>
                </section>
              )}
              {page === "Media" && (
                <>
                  {boot?.mode === "live" && (
                    <button
                      onClick={() =>
                        void action(
                          () => api.request("/api/media/sync", "POST"),
                          "Media refresh requested. Results will appear after collection.",
                        )
                      }
                    >
                      Refresh Instagram media
                    </button>
                  )}
                  <div className="media-grid">
                    {media.map((m, i) => (
                      <section className="panel media-card" key={m.id}>
                        <div className={"media-art art-" + i}>
                          {m.thumbnail_url ? (
                            <img src={m.thumbnail_url} alt="Post thumbnail" />
                          ) : (
                            <>
                              <div className="art-orbit" />
                              <span>
                                {boot?.mode !== "demo"
                                  ? "Preview unavailable"
                                  : [
                                      "YOUR NEXT\nCHAPTER.",
                                      "START\nBEFORE\nYOU’RE READY.",
                                      "MAKE ROOM\nFOR WHAT\nMATTERS.",
                                      "PROGRESS\nOVER\nPERFECTION.",
                                      "CREATE\nYOUR OWN\nPATH.",
                                    ][i % 5]}
                              </span>
                            </>
                          )}
                          <Badge>
                            {m.type === "REELS" ? (
                              <Play size={12} />
                            ) : (
                              <LayoutGrid size={12} />
                            )}{" "}
                            {m.type === "REELS" ? "Reel" : "Post"}
                            {boot?.mode === "demo" ? " · Demo artwork" : ""}
                          </Badge>
                        </div>
                        <div className="media-detail">
                          <small>
                            {date(m.published_at)} · @{m.username}
                          </small>
                          <h3>{m.caption}</h3>
                          <div className="media-numbers">
                            <div>
                              <span>Views</span>
                              <strong>{n(m.views)}</strong>
                            </div>
                            <div>
                              <span>Keyword hits</span>
                              <strong>{n(m.stats.hits)}</strong>
                            </div>
                            <div>
                              <span>Messages</span>
                              <strong>{n(m.stats.messages)}</strong>
                            </div>
                            <div>
                              <span>Clickers</span>
                              <strong>{n(m.stats.clicks)}</strong>
                            </div>
                            <div>
                              <span>Potential leads</span>
                              <strong>{n(m.stats.leads)}</strong>
                            </div>
                          </div>
                          <div className="yield-row">
                            <span>Leads / 1K views</span>
                            <strong>
                              {m.stats.leadYield?.toFixed(2) ?? "Unavailable"}
                            </strong>
                          </div>
                          <small className="metric-detail">
                            Per 1K views:{" "}
                            {m.stats.keywordPer1k?.toFixed(1) ?? "—"} hits ·{" "}
                            {m.stats.messagesPer1k?.toFixed(1) ?? "—"} messages
                            · {m.stats.clicksPer1k?.toFixed(1) ?? "—"} clickers
                          </small>
                          <small className="metric-detail">
                            Views collected{" "}
                            {m.collected_at ? time(m.collected_at) : "not yet"}
                          </small>
                        </div>
                      </section>
                    ))}
                    {!media.length && (
                      <Empty
                        title="Your content will appear here"
                        detail="Connect Instagram to load your recent posts and Reels."
                      />
                    )}
                  </div>
                </>
              )}
              {page === "Activity" && (
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Activity log</h2>
                      <p>
                        Latest 200 events · times shown in your local timezone
                      </p>
                    </div>
                    {boot?.mode === "demo" && (
                      <button onClick={() => setSimulate(true)}>
                        <Play size={15} /> Simulate event
                      </button>
                    )}
                  </div>
                  <div className="activity-list">
                    {activity.map((a) => (
                      <div className="log-row" key={a.id}>
                        <div
                          className={
                            "activity-icon " +
                            (a.kind === "failed" ? "red" : "")
                          }
                        >
                          <Activity size={16} />
                        </div>
                        <div>
                          <strong>{a.description}</strong>
                          <span>
                            @{a.username ?? "unknown"}
                            {a.campaign ? " · " + a.campaign : ""}
                          </span>
                          <details>
                            <summary>Developer details</summary>
                            <code>
                              Event: {a.event_id ?? "—"} · Type: {a.kind} ·
                              Account: {a.account_id}
                            </code>
                          </details>
                        </div>
                        <time>{time(a.occurred_at)}</time>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {page === "Settings" && (
                <SettingsPage
                  boot={boot!}
                  onChange={refresh}
                  onError={setError}
                  onNotice={setNotice}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>Made for meaningful connections.</span>
            <span>
              DMFlow V1 ·{" "}
              {boot?.mode === "demo" ? "Demo data" : "Private pilot"}
            </span>
          </footer>
        </div>
      </main>
      {wizard !== false && (
        <Wizard
          initial={wizard}
          accounts={boot?.accounts ?? []}
          media={media}
          onClose={() => setWizard(false)}
          onSave={async () => {
            setWizard(false);
            setNotice("Campaign saved");
            await refresh();
          }}
        />
      )}
      {simulate && (
        <Simulator
          media={media}
          onClose={() => setSimulate(false)}
          onChange={refresh}
        />
      )}
      {person && (
        <Modal
          title={"@" + person.username}
          subtitle="A simple timeline of your connection"
          onClose={() => setPerson(null)}
        >
          <div className="modal-body">
            <div className="timeline">
              {person.timeline.map((a: Row) => (
                <div key={a.id}>
                  <span />
                  <section>
                    <small>{time(a.occurred_at)}</small>
                    <p>{a.description}</p>
                  </section>
                </div>
              ))}
            </div>
            {person.messages.map((m: Row) => (
              <div className="message-preview" key={m.id}>
                <Badge>{m.status}</Badge>
                <p>{m.body}</p>
                {m.error_detail && <p>{m.error_detail}</p>}
              </div>
            ))}
          </div>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
    </div>
  );
}
function Wizard({
  initial,
  accounts,
  media,
  onClose,
  onSave,
}: {
  initial: Row | null;
  accounts: Row[];
  media: Row[];
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState<Row>(
      initial
        ? {
            ...initial,
            fuzzy: !!initial.fuzzy,
            keywords: initial.keywords.join(", "),
            exclusions: initial.exclusions.join("\n"),
          }
        : {
            name: "",
            account_id: accounts[0]?.id ?? "",
            trigger: "comment",
            media_id: media[0]?.id ?? null,
            keywords: "",
            exclusions: "",
            message: "Here's the resource I promised 👇",
            destination_url: "",
            fuzzy: true,
            cooldown_hours: 24,
            state: "Active",
          },
    );
  const update = (k: string, v: unknown) => setForm({ ...form, [k]: v });
  const steps = ["Trigger", "Keyword", "Message", "Safety", "Review"];
  function next() {
    setError("");
    if (
      step === 0 &&
      (!form.account_id || (form.trigger === "comment" && !form.media_id))
    )
      return setError("Choose an account and a post.");
    if (step === 1 && !form.keywords.trim()) return setError("Add a keyword.");
    if (step === 2) {
      try {
        const u = new URL(form.destination_url);
        if (
          !["http:", "https:"].includes(u.protocol) ||
          u.username ||
          u.password
        )
          throw Error();
        if (!form.message.trim()) throw Error();
      } catch {
        return setError("Add a message and a valid HTTP or HTTPS destination.");
      }
    }
    setStep(step + 1);
  }
  async function save(state: string) {
    setBusy(true);
    try {
      await api.request(
        "/api/campaigns" + (initial ? "/" + initial.id : ""),
        initial ? "PUT" : "POST",
        {
          ...form,
          name: form.name || form.keywords.split(",")[0].trim() + " campaign",
          keywords: form.keywords
            .split(",")
            .map((x: string) => x.trim())
            .filter(Boolean),
          exclusions: form.exclusions
            .split("\n")
            .map((x: string) => x.trim())
            .filter(Boolean),
          cooldown_hours: Number(form.cooldown_hours),
          state,
        },
      );
      await onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={initial ? "Edit campaign" : "A new connection starts here"}
      subtitle="One keyword. One useful reply."
      onClose={onClose}
    >
      <div className="wizard-steps">
        {steps.map((s, i) => (
          <div key={s} className={i <= step ? "done" : ""}>
            <span>{i < step ? <Check size={13} /> : i + 1}</span>
            {s}
          </div>
        ))}
      </div>
      <div className="modal-body">
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {step === 0 && (
          <>
            <h3>What starts the conversation?</h3>
            <div className="choice-grid">
              {[
                ["comment", "A comment", "Someone comments on your post."],
                ["dm", "A direct message", "Someone sends you a keyword."],
              ].map(([value, title, desc]) => (
                <button
                  key={value}
                  className={
                    "choice " + (form.trigger === value ? "chosen" : "")
                  }
                  onClick={() => update("trigger", value)}
                >
                  <MessageCircle size={22} />
                  <strong>{title}</strong>
                  <span>{desc}</span>
                </button>
              ))}
            </div>
            <label>
              Instagram account
              <select
                value={form.account_id}
                disabled={!!initial}
                onChange={(e) =>
                  setForm({
                    ...form,
                    account_id: e.target.value,
                    media_id:
                      media.find((m) => m.account_id === e.target.value)?.id ??
                      null,
                  })
                }
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.username}
                  </option>
                ))}
              </select>
            </label>
            {form.trigger === "comment" && (
              <label>
                Choose a Reel or post
                <select
                  value={form.media_id ?? ""}
                  onChange={(e) => update("media_id", e.target.value)}
                >
                  <option value="">Select a post</option>
                  {media
                    .filter((m) => m.account_id === form.account_id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.caption}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <h3>Give them a word to say.</h3>
            <p className="muted">Choose something memorable and specific.</p>
            <label>
              Keyword and optional aliases
              <input
                autoFocus
                placeholder="ROADMAP, GUIDE"
                value={form.keywords}
                onChange={(e) => update("keywords", e.target.value)}
              />
            </label>
            <small>
              Separate aliases with commas. Short keywords require an exact
              match.
            </small>
            <label className="check">
              <input type="checkbox" checked disabled /> Ignore capitalization
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.fuzzy}
                onChange={(e) => update("fuzzy", e.target.checked)}
              />{" "}
              Allow common misspellings
            </label>
            <label>
              Excluded phrases{" "}
              <span className="optional">Optional · one per line</span>
              <textarea
                placeholder={"don't send roadmap\nno roadmap"}
                value={form.exclusions}
                onChange={(e) => update("exclusions", e.target.value)}
              />
            </label>
          </>
        )}
        {step === 2 && (
          <>
            <h3>Make the next step easy.</h3>
            <label>
              Your message
              <textarea
                rows={4}
                maxLength={800}
                value={form.message}
                onChange={(e) => update("message", e.target.value)}
              />
            </label>
            <label>
              Resource destination
              <input
                type="url"
                placeholder="https://example.com/roadmap"
                value={form.destination_url}
                onChange={(e) => update("destination_url", e.target.value)}
              />
            </label>
            <div className="preview-label">MESSAGE PREVIEW</div>
            <div className="bubble">
              {form.message}
              <br />
              <br />
              <span>https://dmflow…/r/unique-link</span>
            </div>
            <small>Each person receives a unique tracked link.</small>
          </>
        )}
        {step === 3 && (
          <>
            <h3>Helpful, never overwhelming.</h3>
            <div className="safety-list">
              {[
                "Ignore blocked people",
                "Ignore your own account",
                "Ignore duplicate events",
                "Send only one matching campaign",
              ].map((t) => (
                <div key={t}>
                  <ShieldCheck size={19} />
                  {t}
                  <Check size={16} />
                </div>
              ))}
            </div>
            <label>
              Same-person campaign cooldown (hours)
              <input
                type="number"
                min={0}
                max={8760}
                value={form.cooldown_hours}
                onChange={(e) => update("cooldown_hours", e.target.value)}
              />
            </label>
            <p className="muted">
              If delivery is uncertain, DMFlow stops automatic retries to avoid
              sending twice.
            </p>
          </>
        )}
        {step === 4 && (
          <>
            <h3>Ready when you are.</h3>
            <label>
              Campaign name
              <input
                placeholder={form.keywords.split(",")[0] + " campaign"}
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
              />
            </label>
            <div className="review-box">
              <p>
                <strong>When</strong> someone{" "}
                {form.trigger === "comment" ? "comments" : "messages"}{" "}
                <span className="keyword">{form.keywords}</span>
              </p>
              <p>
                <strong>Send</strong> one message and their resource link.
              </p>
              <p>
                <strong>Then</strong> track clicks and conversation engagement.
              </p>
            </div>
            <div className="message-preview">
              {form.message}
              <br />
              <span>{form.destination_url}</span>
            </div>
          </>
        )}
      </div>
      <footer className="modal-footer">
        <button onClick={() => (step ? setStep(step - 1) : onClose())}>
          {step ? "Back" : "Cancel"}
        </button>
        <div>
          {step === 4 ? (
            <>
              <button disabled={busy} onClick={() => void save("Draft")}>
                Save draft
              </button>
              <button
                disabled={busy}
                className="primary"
                onClick={() => void save("Active")}
              >
                <Zap size={16} />
                {busy ? "Saving…" : "Turn campaign on"}
              </button>
            </>
          ) : (
            <button className="primary" onClick={next}>
              Continue <ArrowRight size={16} />
            </button>
          )}
        </div>
      </footer>
    </Modal>
  );
}
function Simulator({
  media,
  onClose,
  onChange,
}: {
  media: Row[];
  onClose: () => void;
  onChange: () => Promise<void>;
}) {
  const [form, setForm] = useState({
      kind: "comment",
      text: "ROADMAP",
      mediaId:
        media.find((m) => m.id === "media-1")?.id ?? media[0]?.id ?? "media-1",
      username: "new.visitor",
      personProviderId: "visitor-" + Date.now(),
      blocked: false,
      failure: "none",
    }),
    [result, setResult] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(overrides: Row = {}) {
    setBusy(true);
    setError("");
    try {
      setResult(
        await api.request("/api/simulate", "POST", { ...form, ...overrides }),
      );
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Try your automation"
      subtitle="Demo only · no real Instagram messages are sent"
      onClose={onClose}
    >
      <div className="modal-body">
        {error && <div className="error">{error}</div>}
        <div className="form-row">
          <label>
            Trigger
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              <option value="comment">Comment</option>
              <option value="dm">Direct message</option>
            </select>
          </label>
          <label>
            Person
            <input
              value={form.username}
              onChange={(e) =>
                setForm({
                  ...form,
                  username: e.target.value,
                  personProviderId: e.target.value,
                })
              }
            />
          </label>
        </div>
        {form.kind === "comment" && (
          <label>
            Post
            <select
              value={form.mediaId}
              onChange={(e) => setForm({ ...form, mediaId: e.target.value })}
            >
              {media.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.caption}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          What do they say?
          <input
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
          />
        </label>
        <div className="quick-picks">
          {["ROADMAP", "roamdap", "don't send roadmap"].map((t) => (
            <button key={t} onClick={() => setForm({ ...form, text: t })}>
              {t}
            </button>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={form.blocked}
            onChange={(e) => setForm({ ...form, blocked: e.target.checked })}
          />{" "}
          Block this person before processing
        </label>
        <label>
          Simulate delivery
          <select
            value={form.failure}
            onChange={(e) => setForm({ ...form, failure: e.target.value })}
          >
            <option value="none">Successful send</option>
            <option value="permanent">Message not allowed</option>
            <option value="transient">Temporary failure</option>
            <option value="uncertain">Uncertain delivery</option>
            <option value="auth">Expired connection</option>
          </select>
        </label>
        <button
          className="primary full"
          disabled={busy}
          onClick={() => void run()}
        >
          <Play size={16} />
          {busy ? "Processing…" : "Simulate event"}
        </button>
        {result && (
          <div className="simulation-result">
            <Badge tone={result.message?.status === "sent" ? "green" : ""}>
              {result.duplicate
                ? "Duplicate ignored"
                : (result.message?.status ?? result.event.status)}
            </Badge>
            <p>
              {result.event.reason ??
                (result.message?.status === "sent"
                  ? "Your keyword matched. One resource message was sent."
                  : (result.message?.error_detail ?? "Event processed"))}
            </p>
            {result.url && (
              <>
                <label>
                  Tracked resource link
                  <input readOnly value={result.url} />
                </label>
                <div className="form-row">
                  <button onClick={() => void api.open(result.url)}>
                    Open tracked link <ExternalLink size={14} />
                  </button>
                  <button
                    onClick={() =>
                      void run({
                        kind: "dm",
                        text: "Thank you, this is so helpful!",
                        failure: "none",
                        blocked: false,
                      })
                    }
                  >
                    Simulate follow-up DM
                  </button>
                </div>
              </>
            )}
            <button
              className="text-button"
              onClick={() =>
                setForm({
                  ...form,
                  personProviderId: "visitor-" + Date.now(),
                  username: "new.visitor",
                })
              }
            >
              Use a fresh person (reset cooldown)
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
function SettingsPage({
  boot,
  onChange,
  onError,
  onNotice,
}: {
  boot: Row;
  onChange: () => Promise<void>;
  onError: (v: string) => void;
  onNotice: (v: string) => void;
}) {
  const [seconds, setSeconds] = useState(boot.settings.manual_seconds),
    [url, setUrl] = useState(""),
    [code, setCode] = useState(""),
    [connection, setConnection] = useState<Row>({ paired: false });
  useEffect(() => {
    void api.mode().then(setConnection);
  }, []);
  async function perform(fn: () => Promise<unknown>, message: string) {
    try {
      await fn();
      await onChange();
      setConnection(await api.mode());
      onNotice(message);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <div className="settings-layout">
      <section className="panel settings-card">
        <h2>Connected accounts</h2>
        <p>Keep your resources flowing while your computer is closed.</p>
        {boot.accounts.map((a: Row) => (
          <div className="connection-row" key={a.id}>
            <Instagram size={25} />
            <div>
              <strong>Instagram @{a.username}</strong>
              <small>
                {boot.mode === "demo" ? "Simulated connection" : a.status}
              </small>
            </div>
            <Badge tone={a.status === "connected" ? "green" : "red"}>
              {a.status === "connected" ? "Connected" : "Reconnect needed"}
            </Badge>
          </div>
        ))}
        <button
          onClick={() =>
            void perform(async () => {
              const result = await api.request(
                "/api/connect/instagram",
                "POST",
              );
              if (result.url) await api.open(result.url);
            }, "Connection started")
          }
        >
          Connect Instagram <ArrowUpRight size={15} />
        </button>
        <div className="connection-row muted">
          <MessageCircle size={23} />
          <div>
            <strong>TikTok</strong>
            <small>
              Official business API access needs further verification
            </small>
          </div>
          <Badge>Coming later</Badge>
        </div>
      </section>
      <section className="panel settings-card">
        <h2>Your time matters</h2>
        <p>Use your own estimate for a manual resource reply.</p>
        <label>
          Estimated manual response time (seconds)
          <input
            type="number"
            min={1}
            max={3600}
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
          />
        </label>
        <button
          onClick={() =>
            void perform(
              () =>
                api.request("/api/settings", "PUT", {
                  manual_seconds: seconds,
                }),
              "Time estimate updated",
            )
          }
        >
          Save estimate
        </button>
        <small>This is an estimate, never a measured productivity claim.</small>
      </section>
      {!window.DMFLOW_WEB && (
      <section className="panel settings-card">
        <h2>Demo & live workspace</h2>
        <p>
          Separate data. Separate connections. Your live workspace never
          receives demo events.
        </p>
        <div className="form-row">
          <button
            className={boot.mode === "demo" ? "primary" : ""}
            onClick={() =>
              void perform(() => api.mode("demo"), "Demo workspace selected")
            }
          >
            Explore demo
          </button>
          <button
            disabled={!connection.paired}
            className={boot.mode === "live" ? "primary" : ""}
            onClick={() =>
              void perform(() => api.mode("live"), "Live workspace selected")
            }
          >
            Open live workspace
          </button>
        </div>
        <label>
          Worker address
          <input
            placeholder="https://dmflow-api.your-name.workers.dev"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label>
          One-time pairing code
          <input
            type="password"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <button
          onClick={() =>
            void perform(() => api.pair(url, code), "Desktop paired securely")
          }
        >
          Pair this desktop
        </button>
        <small>
          Generate a ten-minute pairing code with npm run pair. Credentials stay
          in OS-protected storage.
        </small>
      </section>
      )}
      <section className="panel settings-card">
        <h2>A fresh start</h2>
        <p>Restore the sample campaigns and their original results.</p>
        <button
          disabled={boot.mode !== "demo"}
          onClick={() =>
            void perform(() => api.reset(), "Demo reset completed")
          }
        >
          Reset demo data
        </button>
        <small>Live data is never affected.</small>
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
