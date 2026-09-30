import { z } from "zod";
export type Row = Record<string, any>;
export type Statement = { sql: string; args?: unknown[] };
export interface Repository {
  all<T = Row>(sql: string, args?: unknown[]): Promise<T[]>;
  run(sql: string, args?: unknown[]): Promise<number>;
  batch(statements: Statement[]): Promise<void>;
}
export interface Clock {
  now(): Date;
}
export interface EventQueue {
  send(eventId: string): Promise<void>;
}
export type SendResult =
  | { kind: "sent"; id: string; recipientId?: string }
  | {
      kind: "transient" | "permanent" | "auth" | "uncertain";
      detail: string;
      retryAfter?: number;
    };
export interface SocialProvider {
  name: string;
  live: boolean;
  connect(): Promise<{ url: string }>;
  listMedia(accountId: string): Promise<Row[]>;
  getMediaMetrics(
    mediaId: string,
  ): Promise<{ views?: number; collectedAt: string }>;
  processWebhook(payload: unknown): Promise<NormalizedEvent[]>;
  sendPrivateReply(input: SendInput): Promise<SendResult>;
  sendMessage(input: SendInput): Promise<SendResult>;
}
export type SendInput = {
  accountId: string;
  recipientId: string;
  commentId: string;
  text: string;
};
export type NormalizedEvent = {
  accountId: string;
  providerEventId: string;
  personProviderId: string;
  username?: string;
  mediaId?: string;
  kind: "comment" | "dm";
  text: string;
  occurredAt: string;
  topLevel?: boolean;
  own?: boolean;
};
export interface ApiClient {
  request<T = Row>(path: string, method?: string, body?: unknown): Promise<T>;
}
export const destination = z
  .string()
  .url()
  .max(2048)
  .refine((s) => {
    const u = new URL(s);
    return (
      ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
    );
  }, "Use an HTTP or HTTPS destination without credentials.");
export const campaignInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    account_id: z.string().min(1),
    trigger: z.enum(["comment", "dm"]),
    media_id: z.string().nullable().default(null),
    keywords: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
    exclusions: z.array(z.string().trim().min(1).max(150)).max(30).default([]),
    message: z.string().trim().min(1).max(800),
    destination_url: destination,
    state: z.enum(["Draft", "Active", "Paused", "Error"]).default("Draft"),
    fuzzy: z.boolean().default(true),
    cooldown_hours: z.number().min(0).max(8760).default(24),
  })
  .refine(
    (v) => v.trigger !== "comment" || !!v.media_id,
    "Choose a post for this campaign.",
  );
export const simulationInput = z.object({
  accountId: z.string().default("demo-account"),
  providerEventId: z.string().max(100).optional(),
  personProviderId: z.string().min(1).max(100).default("visitor-demo"),
  username: z.string().max(100).default("new.visitor"),
  mediaId: z.string().default("media-1"),
  kind: z.enum(["comment", "dm"]).default("comment"),
  text: z.string().max(2000).default("ROADMAP"),
  topLevel: z.boolean().default(true),
  own: z.boolean().default(false),
  blocked: z.boolean().default(false),
  failure: z
    .enum(["none", "transient", "permanent", "uncertain", "auth"])
    .default("none"),
});
