import type {
  NormalizedEvent,
  Repository,
  Row,
  SendInput,
  SendResult,
  SocialProvider,
} from "../../shared/src/index";
import { decrypt, encrypt, id } from "../../core/src/security";
export const GRAPH_VERSION = "v26.0";
export const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
  "instagram_business_manage_insights",
];
export class MetaError extends Error {
  constructor(
    public kind: "transient" | "permanent" | "auth" | "uncertain",
    public code: number,
    public retryAfter = 60,
  ) {
    super(`Instagram request failed (${code}; ${kind})`);
  }
}
export function classify(
  status: number,
  error: Row = {},
  hasDefinitiveError = true,
): MetaError {
  if (error.code === 190 || status === 401)
    return new MetaError("auth", error.code ?? status);
  if (status === 429 || [4, 17, 32, 613].includes(error.code))
    return new MetaError("transient", error.code ?? status);
  if (status >= 500 && !hasDefinitiveError)
    return new MetaError("uncertain", status);
  if (error.is_transient || status >= 500)
    return new MetaError("transient", error.code ?? status);
  return new MetaError("permanent", error.code ?? status);
}
export type InstagramConfig = {
  appId: string;
  appSecret: string;
  encryptionKey: string;
  redirectUri: string;
  state?: string;
};
export class InstagramProvider implements SocialProvider {
  name = "instagram";
  live = true;
  constructor(
    public db: Repository,
    public config: InstagramConfig,
    public http: typeof fetch = fetch,
  ) {}
  async connect() {
    if (
      !this.config.appId ||
      !this.config.appSecret ||
      !this.config.encryptionKey
    )
      throw Error("Instagram credentials are missing. Complete META_SETUP.md.");
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.search = new URLSearchParams({
      client_id: this.config.appId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: SCOPES.join(","),
      state: this.config.state ?? "",
      force_reauth: "true",
    }).toString();
    return { url: url.toString() };
  }
  async token(accountId: string) {
    const account = (
      await this.db.all("SELECT * FROM social_accounts WHERE id=?", [accountId])
    )[0];
    if (!account?.token_ciphertext || account.status !== "connected")
      throw new MetaError("auth", 190);
    if (
      account.token_expires_at &&
      account.token_expires_at <= new Date().toISOString()
    ) {
      await this.db.run(
        "UPDATE social_accounts SET status='reconnect' WHERE id=?",
        [accountId],
      );
      throw new MetaError("auth", 190);
    }
    return {
      account,
      token: await decrypt(account.token_ciphertext, this.config.encryptionKey),
    };
  }
  async request(
    path: string,
    token: string,
    method = "GET",
    body?: unknown,
  ): Promise<Row> {
    const url = new URL(`https://graph.instagram.com/${GRAPH_VERSION}/${path}`);
    let response: Response;
    try {
      response = await this.http(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new MetaError(method === "GET" ? "transient" : "uncertain", 0);
    }
    let data: Row;
    try {
      data = await response.json();
    } catch {
      throw new MetaError(
        method === "GET" ? "transient" : "uncertain",
        response.status,
      );
    }
    if (!response.ok || data.error) {
      const err = classify(response.status, data.error, !!data.error);
      const retry = Number(response.headers.get("retry-after"));
      if (Number.isFinite(retry) && retry > 0) err.retryAfter = retry;
      throw err;
    }
    return data;
  }
  async exchange(code: string) {
    const body = new FormData();
    for (const [k, v] of Object.entries({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      grant_type: "authorization_code",
      redirect_uri: this.config.redirectUri,
      code,
    }))
      body.set(k, v);
    const r = await this.http("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(15000),
    });
    const response = (await r.json()) as Row;
    const short = response.data?.[0] ?? response;
    if (!r.ok || !short.access_token)
      throw Error(
        "Instagram authorization could not be completed. Please reconnect.",
      );
    const url = new URL("https://graph.instagram.com/access_token");
    url.search = new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: this.config.appSecret,
      access_token: short.access_token,
    }).toString();
    const extended = await this.http(url, {
      signal: AbortSignal.timeout(15000),
    });
    const long = (await extended.json()) as Row;
    if (!extended.ok || !long.access_token)
      throw Error("Instagram token exchange failed. Please reconnect.");
    const profile = await this.request(
        "me?fields=user_id,username,account_type",
        long.access_token,
      ),
      user = profile.data?.[0] ?? profile;
    if (!user.user_id || !user.username)
      throw Error("Instagram professional account identity was not returned.");
    return {
      providerId: String(user.user_id),
      username: user.username,
      token: long.access_token as string,
      expiresAt: new Date(
        Date.now() + Number(long.expires_in) * 1000,
      ).toISOString(),
    };
  }
  async subscribe(accountId: string) {
    const { account, token } = await this.token(accountId);
    await this.request(
      `${account.provider_id}/subscribed_apps`,
      token,
      "POST",
      { subscribed_fields: "comments,messages" },
    );
  }
  async refresh(accountId: string) {
    const { token } = await this.token(accountId);
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.search = new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: token,
    }).toString();
    const r = await this.http(url, { signal: AbortSignal.timeout(15000) });
    const data = (await r.json()) as Row;
    if (!r.ok || !data.access_token) throw classify(r.status, data.error);
    await this.db.run(
      "UPDATE social_accounts SET token_ciphertext=?,token_expires_at=? WHERE id=?",
      [
        await encrypt(data.access_token, this.config.encryptionKey),
        new Date(Date.now() + Number(data.expires_in) * 1000).toISOString(),
        accountId,
      ],
    );
  }
  async listMedia(accountId: string): Promise<Row[]> {
    const { account, token } = await this.token(accountId);
    const all: Row[] = [];
    let after = "";
    for (let page = 0; page < 3; page++) {
      const query = new URLSearchParams({
        fields:
          "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp",
        limit: "50",
        ...(after ? { after } : {}),
      });
      const result = await this.request(
        `${account.provider_id}/media?${query}`,
        token,
      );
      all.push(...(result.data ?? []));
      if (!result.paging?.next || !result.paging?.cursors?.after) break;
      after = result.paging.cursors.after;
    }
    return all.filter((m) => ["FEED", "REELS"].includes(m.media_product_type));
  }
  async getMediaMetrics(mediaId: string) {
    const m = (
      await this.db.all("SELECT * FROM media WHERE id=?", [mediaId])
    )[0];
    if (!m) throw Error("Media not found");
    const { token } = await this.token(m.account_id);
    const collectedAt = new Date().toISOString();
    try {
      const data = await this.request(
        `${m.provider_id}/insights?metric=views`,
        token,
      );
      const metric = data.data?.find((d: Row) => d.name === "views");
      const value = metric?.values?.[0]?.value ?? metric?.total_value?.value;
      return {
        views: typeof value === "number" ? value : undefined,
        collectedAt,
      };
    } catch (e) {
      if (e instanceof MetaError && e.kind === "permanent")
        return { collectedAt };
      throw e;
    }
  }
  async syncMedia(accountId: string) {
    const media = await this.listMedia(accountId);
    for (const m of media) {
      const existing = (
        await this.db.all(
          "SELECT id FROM media WHERE account_id=? AND provider_id=?",
          [accountId, m.id],
        )
      )[0];
      const mid = existing?.id ?? id();
      await this.db.run(
        `INSERT INTO media(id,account_id,provider_id,caption,type,published_at,thumbnail_url,permalink) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account_id,provider_id) DO UPDATE SET caption=excluded.caption,thumbnail_url=excluded.thumbnail_url,permalink=excluded.permalink`,
        [
          mid,
          accountId,
          m.id,
          m.caption ?? "",
          m.media_product_type ?? m.media_type,
          m.timestamp,
          m.thumbnail_url ?? (m.media_type === "IMAGE" ? m.media_url : null),
          m.permalink ?? null,
        ],
      );
      const metric = await this.getMediaMetrics(mid);
      await this.db.run("UPDATE media SET views=?,collected_at=? WHERE id=?", [
        metric.views ?? null,
        metric.collectedAt,
        mid,
      ]);
    }
  }
  async processWebhook(payload: unknown): Promise<NormalizedEvent[]> {
    const events: NormalizedEvent[] = [];
    const envelopes = Array.isArray(payload) ? payload : [payload];
    for (const envelope of envelopes) {
      if (
        !envelope ||
        envelope.object !== "instagram" ||
        !Array.isArray(envelope.entry)
      )
        continue;
      for (const entry of envelope.entry) {
        const account = (
          await this.db.all(
            "SELECT * FROM social_accounts WHERE provider='instagram' AND provider_id=?",
            [String(entry.id)],
          )
        )[0];
        if (!account) continue;
        const changes = Array.isArray(entry.changes)
          ? entry.changes
          : entry.field
            ? [entry]
            : [];
        for (const change of changes) {
          if (change.field !== "comments") continue;
          const v = change.value,
            comment = String(v?.id ?? v?.comment_id ?? "");
          if (
            !comment ||
            typeof v?.text !== "string" ||
            !v.from?.id ||
            v.media?.ad_id ||
            ["STORY", "LIVE"].includes(v.media?.media_product_type)
          )
            continue;
          if (
            (
              await this.db.all(
                "SELECT id FROM incoming_events WHERE account_id=? AND provider_event_id=?",
                [account.id, comment],
              )
            ).length
          )
            continue;
          const media = (
            await this.db.all(
              "SELECT id FROM media WHERE account_id=? AND provider_id=?",
              [account.id, String(v.media?.id)],
            )
          )[0];
          if (!media) continue;
          const { token } = await this.token(account.id);
          let metadata: Row;
          try {
            metadata = await this.request(
              `${comment}?fields=id,parent_id,timestamp`,
              token,
            );
          } catch (e) {
            if (e instanceof MetaError && e.kind === "auth")
              await this.db.run(
                "UPDATE social_accounts SET status='reconnect' WHERE id=?",
                [account.id],
              );
            if (e instanceof MetaError && e.kind === "permanent") {
              events.push({
                accountId: account.id,
                providerEventId: comment,
                personProviderId: String(v.from.id),
                username: v.from.username,
                mediaId: media.id,
                kind: "comment",
                text: v.text,
                occurredAt: new Date(0).toISOString(),
              });
              continue;
            }
            throw e;
          }
          const timestamp = Date.parse(metadata.timestamp);

          events.push({
            accountId: account.id,
            providerEventId: comment,
            personProviderId: String(v.from.id),
            username: v.from.username,
            mediaId: media.id,
            kind: "comment",
            text: v.text,
            occurredAt: new Date(
              Number.isFinite(timestamp) ? timestamp : 0,
            ).toISOString(),
            topLevel: Number.isFinite(timestamp)
              ? !metadata.parent_id
              : undefined,
            own: String(v.from.id) === account.provider_id,
          });
        }
        for (const msg of entry.messaging ?? []) {
          const m = msg.message;
          if (
            !m?.mid ||
            m.is_echo ||
            m.is_self ||
            m.is_deleted ||
            m.is_unsupported ||
            typeof m.text !== "string" ||
            !msg.sender?.id ||
            String(msg.recipient?.id) !== account.provider_id
          )
            continue;
          const timestamp = Number(msg.timestamp);

          events.push({
            accountId: account.id,
            providerEventId: m.mid,
            personProviderId: String(msg.sender.id),
            kind: "dm",
            text: m.text,
            occurredAt: new Date(timestamp).toISOString(),
            own: String(msg.sender.id) === account.provider_id,
          });
        }
      }
    }
    return events;
  }
  async sendPrivateReply(input: SendInput): Promise<SendResult> {
    return this.send(input, { comment_id: input.commentId });
  }
  async sendMessage(input: SendInput): Promise<SendResult> {
    return this.send(input, { id: input.recipientId });
  }
  private async send(input: SendInput, recipient: Row): Promise<SendResult> {
    if (new TextEncoder().encode(input.text).length > 1000)
      return {
        kind: "permanent",
        detail:
          "Message and resource link exceed Instagram’s 1,000-byte limit.",
      };
    try {
      const { account, token } = await this.token(input.accountId);
      const r = await this.request(
        `${account.provider_id}/messages`,
        token,
        "POST",
        { recipient, message: { text: input.text } },
      );
      if (!r.message_id)
        return {
          kind: "uncertain",
          detail: "Instagram did not return a message confirmation.",
        };
      return { kind: "sent", id: r.message_id, recipientId: r.recipient_id };
    } catch (e) {
      if (e instanceof MetaError)
        return { kind: e.kind, detail: e.message, retryAfter: e.retryAfter };
      return {
        kind: "uncertain",
        detail: "Instagram delivery could not be confirmed.",
      };
    }
  }
}
export class TikTokProvider implements SocialProvider {
  name = "tiktok";
  live = false;
  async connect(): Promise<{ url: string }> {
    throw Error(
      "TikTok is outside V1; business API eligibility requires verification.",
    );
  }
  async listMedia(): Promise<Row[]> {
    return [];
  }
  async getMediaMetrics() {
    return { collectedAt: new Date().toISOString() };
  }
  async processWebhook(): Promise<NormalizedEvent[]> {
    return [];
  }
  async sendPrivateReply(): Promise<SendResult> {
    return { kind: "permanent", detail: "TikTok is not supported in V1" };
  }
  async sendMessage(): Promise<SendResult> {
    return this.sendPrivateReply();
  }
}
export class SimulatedProvider implements SocialProvider {
  name = "simulated";
  live = false;
  calls: SendInput[] = [];
  failure: SendResult["kind"] = "sent";
  async connect() {
    return { url: "https://example.com" };
  }
  async listMedia() {
    return [];
  }
  async getMediaMetrics() {
    return { collectedAt: new Date().toISOString() };
  }
  async processWebhook(payload: unknown) {
    return [payload as NormalizedEvent];
  }
  async sendPrivateReply(input: SendInput) {
    return this.send(input);
  }
  async sendMessage(input: SendInput) {
    return this.send(input);
  }
  async send(input: SendInput): Promise<SendResult> {
    this.calls.push(input);
    if (this.failure === "sent")
      return { kind: "sent", id: "sim-" + crypto.randomUUID() };
    return {
      kind: this.failure,
      detail: "Simulated " + this.failure + " response",
      retryAfter: 1,
    };
  }
}
