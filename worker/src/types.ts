import type { PasswordHasherStub } from "./password-hasher.js";

export interface Env {
  CF_VERSION_METADATA: WorkerVersionMetadata;
  DB: D1Database;
  BATTLE_ROOMS: DurableObjectNamespace<BattleRoomStub>;
  PASSWORD_HASHERS: DurableObjectNamespace<PasswordHasherStub>;
  PASSWORD_PEPPER: string;
  IP_HASH_SALT: string;
  ALLOWED_ORIGINS: string;
  STATIC_ORIGIN: string;
  /** Dedicated read-only Cloudflare GraphQL Analytics configuration. */
  CLOUDFLARE_ANALYTICS_API_TOKEN?: string;
  CLOUDFLARE_ANALYTICS_ACCOUNT_ID?: string;
  CLOUDFLARE_ANALYTICS_ZONE_ID?: string;
  CLOUDFLARE_ANALYTICS_API_WORKER_NAME?: string;
  CLOUDFLARE_ANALYTICS_SITE_WORKER_NAME?: string;
}

interface WorkerVersionMetadata {
  id: string;
  tag: string;
  timestamp: string;
}

export interface BattleRoomStub extends Rpc.DurableObjectBranded {
  fetch(request: Request): Promise<Response>;
}

export interface SessionUser {
  id: string;
  username: string;
  email: string | null;
  avatar: string;
  role: string;
  tokenHash: string;
  sessionCreatedAt: string;
  adminLastActiveAt: string | null;
}

export interface BattleQuestion {
  id: string;
  question: { en: string; ar: string };
  answer: { en: string; ar: string };
  options: { en: string[]; ar: string[] };
  correctIndex: number;
}

export interface BattlePlayer {
  id: string;
  name: string;
  score: number;
  streak: number;
  isHost: boolean;
}

export interface BattleRoomState {
  code: string;
  category: string;
  difficulty: string;
  hostToken: string;
  players: BattlePlayer[];
  questions: BattleQuestion[];
  currentQ: number;
  phase: "lobby" | "question" | "reveal" | "finished";
  answers: Record<string, { answerIndex: number; timeMs: number }>;
  questionStartTime: number;
  deadline: number;
  createdAt: number;
}

/**
 * Owner-console only status data. Provider cards intentionally contain a
 * compact, display-safe projection rather than a provider API response.
 */
export interface PlatformStatusMetric {
  id: string;
  label: string;
  value: number;
  detail?: string;
  format?: "bytes" | "percent";
}

export type PlatformStatusSourceState = "healthy" | "partial" | "stale" | "unavailable" | "manual" | "not_configured";

export type CloudflareAnalyticsFailureCategory = "configuration_invalid" | "authentication_failed" | "permission_denied" | "rate_limited" | "query_limit" | "provider_failure" | "malformed_response" | "timeout" | "query_rejected" | "no_data";
export type CloudflareAnalyticsDiagnostics = Partial<Record<"zone" | "workers", CloudflareAnalyticsFailureCategory>>;

export interface PlatformStatusSourceCard {
  id: "cloudflare" | "github" | "google-analytics" | "godaddy" | "search-console";
  label: string;
  category: string;
  state: PlatformStatusSourceState;
  headline: string;
  detail: string;
  /** Whether a live provider snapshot included every requested aggregate. */
  coverage?: "complete" | "partial";
  /** Allowlisted failure categories only; never raw provider errors or identifiers. */
  diagnostics?: CloudflareAnalyticsDiagnostics;
  /** Null means this endpoint has not read a live provider data source. */
  observedAt: string | null;
  link: { label: string; url: string };
  metrics: PlatformStatusMetric[];
}

export interface PlatformStatusResponse {
  updatedAt: string;
  overall: {
    state: "healthy" | "degraded";
    headline: string;
    detail: string;
  };
  metrics: PlatformStatusMetric[];
  sources: PlatformStatusSourceCard[];
}
