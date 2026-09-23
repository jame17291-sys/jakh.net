import type { PlatformStatusMetric, PlatformStatusSourceState } from "./types.js";

/**
 * This module is intentionally a small, one-way projection of Cloudflare's
 * GraphQL Analytics API. It never returns a provider payload, credential, or
 * provider error to the caller.
 */

export interface CloudflareAnalyticsEnv {
  CLOUDFLARE_ANALYTICS_API_TOKEN?: string;
  CLOUDFLARE_ANALYTICS_ACCOUNT_ID?: string;
  CLOUDFLARE_ANALYTICS_ZONE_ID?: string;
  CLOUDFLARE_ANALYTICS_API_WORKER_NAME?: string;
  CLOUDFLARE_ANALYTICS_SITE_WORKER_NAME?: string;
}

export interface CloudflareAnalyticsStatus {
  state: Extract<PlatformStatusSourceState, "healthy" | "partial" | "stale" | "unavailable" | "not_configured">;
  headline: string;
  detail: string;
  coverage: CloudflareAnalyticsCoverage | null;
  observedAt: string | null;
  metrics: PlatformStatusMetric[];
}

interface CloudflareAnalyticsConfig {
  token: string;
  accountId: string;
  zoneId: string;
  apiWorkerName: string;
  siteWorkerName: string;
}

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

type CloudflareAnalyticsCoverage = "complete" | "partial";

interface CacheEntry {
  cachedAt: string;
  observedAt: string;
  coverage: CloudflareAnalyticsCoverage;
  metrics: PlatformStatusMetric[];
}

interface AnalyticsSnapshot {
  coverage: CloudflareAnalyticsCoverage;
  metrics: PlatformStatusMetric[];
}

const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
// Cache keys remain on the deployed API zone and are never fetched. They are
// scoped to non-secret configuration so a later zone or Worker rename cannot
// reuse an unrelated aggregate snapshot.
const CACHE_KEY_URL = "https://api.riddlearabia.com/__internal/platform-status/cloudflare-analytics-v1";
const CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_STALE_MS = 24 * 60 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 64 * 1_024;
const WINDOW_MS = 24 * 60 * 60 * 1_000;
const EXPECTED_METRIC_COUNT = 7;

const CLOUDFLARE_ANALYTICS_QUERY = `
  query RiddleArabiaPlatformStatus(
    $zoneTag: string
    $accountTag: string
    $apiWorkerName: string
    $siteWorkerName: string
    $start: Time
    $end: Time
  ) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        traffic: httpRequestsAdaptiveGroups(
          limit: 1
          filter: {
            datetime_geq: $start
            datetime_lt: $end
            requestSource: "eyeball"
          }
        ) {
          count
          sum {
            visits
            edgeResponseBytes
          }
        }
      }
      accounts(filter: { accountTag: $accountTag }) {
        apiWorker: workersInvocationsAdaptive(
          limit: 1
          filter: {
            scriptName: $apiWorkerName
            datetime_geq: $start
            datetime_leq: $end
          }
        ) {
          sum {
            requests
            errors
          }
        }
        siteWorker: workersInvocationsAdaptive(
          limit: 1
          filter: {
            scriptName: $siteWorkerName
            datetime_geq: $start
            datetime_leq: $end
          }
        ) {
          sum {
            requests
            errors
          }
        }
      }
    }
  }
`;

function configuredValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function configFrom(env: CloudflareAnalyticsEnv): CloudflareAnalyticsConfig | null {
  const token = configuredValue(env.CLOUDFLARE_ANALYTICS_API_TOKEN);
  const accountId = configuredValue(env.CLOUDFLARE_ANALYTICS_ACCOUNT_ID);
  const zoneId = configuredValue(env.CLOUDFLARE_ANALYTICS_ZONE_ID);
  if (!token || !accountId || !zoneId) return null;
  return {
    token,
    accountId,
    zoneId,
    apiWorkerName: configuredValue(env.CLOUDFLARE_ANALYTICS_API_WORKER_NAME) || "jakh-api",
    siteWorkerName: configuredValue(env.CLOUDFLARE_ANALYTICS_SITE_WORKER_NAME) || "jakh-site",
  };
}

function knownNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function metric(
  id: string,
  label: string,
  value: unknown,
  detail: string,
  format?: PlatformStatusMetric["format"],
): PlatformStatusMetric | null {
  const known = knownNumber(value);
  return known === null ? null : { id, label, value: known, detail, ...(format ? { format } : {}) };
}

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function firstGroup(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && value.length ? plainObject(value[0]) : null;
}

function metricsFromPayload(value: unknown): AnalyticsSnapshot | null {
  const payload = plainObject(value);
  const viewer = plainObject(payload?.data);
  const viewerData = plainObject(viewer?.viewer);
  const zone = firstGroup(viewerData?.zones);
  const account = firstGroup(viewerData?.accounts);
  const traffic = firstGroup(zone?.traffic);
  const trafficSum = plainObject(traffic?.sum);
  const apiWorker = firstGroup(account?.apiWorker);
  const apiSum = plainObject(apiWorker?.sum);
  const siteWorker = firstGroup(account?.siteWorker);
  const siteSum = plainObject(siteWorker?.sum);
  // A missing scope means the token/configuration cannot read the requested
  // resource. Empty aggregate groups are valid for an idle or undeployed
  // Worker, so retain every aggregate that did arrive instead of hiding the
  // entire provider card or manufacturing zeros. A provider response that
  // contains neither scope remains unusable.
  if (!zone && !account) return null;
  const metrics = [
    traffic && metric("cloudflare-edge-requests-24h", "Cloudflare edge requests (24h)", traffic.count, "End-user requests at the Cloudflare edge over the last 24 hours."),
    trafficSum && metric("cloudflare-visits-24h", "Cloudflare visits (24h)", trafficSum.visits, "A visit is a direct or referral page view, not a unique visitor count."),
    trafficSum && metric("cloudflare-edge-data-transfer-24h", "Cloudflare data transfer (24h)", trafficSum.edgeResponseBytes, "Edge response bytes served to end users in the last 24 hours.", "bytes"),
    apiSum && metric("cloudflare-api-worker-requests-24h", "API Worker requests (24h)", apiSum.requests, "Invocations of jakh-api in the last 24 hours."),
    apiSum && metric("cloudflare-api-worker-errors-24h", "API Worker errors (24h)", apiSum.errors, "Cloudflare Worker invocation errors, not site HTTP status codes."),
    siteSum && metric("cloudflare-site-worker-requests-24h", "Site Worker requests (24h)", siteSum.requests, "Invocations of jakh-site in the last 24 hours."),
    siteSum && metric("cloudflare-site-worker-errors-24h", "Site Worker errors (24h)", siteSum.errors, "Cloudflare Worker invocation errors, not site HTTP status codes."),
  ].filter((candidate): candidate is PlatformStatusMetric => candidate !== null);
  if (!metrics.length) return null;
  return {
    metrics,
    coverage: zone && account && metrics.length === EXPECTED_METRIC_COUNT ? "complete" : "partial",
  };
}

function cache(): EdgeCache | null {
  const storage = (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches;
  return storage?.default || null;
}

function cacheKey(config: CloudflareAnalyticsConfig): Request {
  const url = new URL(CACHE_KEY_URL);
  url.searchParams.set("account", config.accountId);
  url.searchParams.set("zone", config.zoneId);
  url.searchParams.set("api-worker", config.apiWorkerName);
  url.searchParams.set("site-worker", config.siteWorkerName);
  return new Request(url.toString());
}

async function limitedText(response: Response): Promise<string> {
  const declaredSize = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(declaredSize) && declaredSize > MAX_RESPONSE_BYTES) {
    throw new Error("Cloudflare analytics response exceeds the safe limit");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("Cloudflare analytics response exceeds the safe limit");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function jsonBody(response: Response): Promise<unknown> {
  const text = await limitedText(response);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Cloudflare analytics response is not valid JSON");
  }
}

function cacheEntry(value: unknown): CacheEntry | null {
  const entry = plainObject(value);
  if (!entry || !Array.isArray(entry.metrics) || typeof entry.cachedAt !== "string" || typeof entry.observedAt !== "string") return null;
  if (Number.isNaN(Date.parse(entry.cachedAt)) || Number.isNaN(Date.parse(entry.observedAt))) return null;
  const metrics = entry.metrics.filter((candidate): candidate is PlatformStatusMetric => {
    const item = plainObject(candidate);
    return Boolean(
      item
      && typeof item.id === "string"
      && typeof item.label === "string"
      && typeof item.value === "number"
      && Number.isFinite(item.value)
      && item.value >= 0,
    );
  });
  if (metrics.length !== entry.metrics.length) return null;
  const coverage: CloudflareAnalyticsCoverage = entry.coverage === "partial" ? "partial" : "complete";
  return { cachedAt: entry.cachedAt, observedAt: entry.observedAt, coverage, metrics };
}

async function readCache(config: CloudflareAnalyticsConfig): Promise<CacheEntry | null> {
  const edgeCache = cache();
  if (!edgeCache) return null;
  try {
    const response = await edgeCache.match(cacheKey(config));
    return response ? cacheEntry(await jsonBody(response)) : null;
  } catch {
    return null;
  }
}

async function writeCache(config: CloudflareAnalyticsConfig, entry: CacheEntry): Promise<void> {
  const edgeCache = cache();
  if (!edgeCache) return;
  try {
    await edgeCache.put(cacheKey(config), new Response(JSON.stringify(entry), {
      // Keep the entry long enough to make the 24-hour stale fallback usable;
      // fresh-versus-stale behavior is enforced by cachedAt below.
      headers: { "content-type": "application/json", "cache-control": `public, max-age=${MAX_STALE_MS / 1_000}` },
    }));
  } catch {
    // A cache miss must never prevent the owner console from using a fresh response.
  }
}

async function fetchLiveSnapshot(config: CloudflareAnalyticsConfig, now: Date): Promise<CacheEntry> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const end = now.toISOString();
    const start = new Date(now.getTime() - WINDOW_MS).toISOString();
    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      redirect: "error",
      signal: controller.signal,
      body: JSON.stringify({
        query: CLOUDFLARE_ANALYTICS_QUERY,
        variables: {
          zoneTag: config.zoneId,
          accountTag: config.accountId,
          apiWorkerName: config.apiWorkerName,
          siteWorkerName: config.siteWorkerName,
          start,
          end,
        },
      }),
    });
    if (!response.ok) throw new Error("Cloudflare analytics request failed");
    const payload = plainObject(await jsonBody(response));
    if (!payload) throw new Error("Cloudflare analytics query did not return a usable result");
    const snapshot = metricsFromPayload(payload);
    if (!snapshot) throw new Error("Cloudflare analytics query returned an unexpected shape");
    // GraphQL can return usable data alongside errors from a separate
    // zone/account dataset. Keep that normalized data but never expose the
    // provider errors or present a complete snapshot when one was reported.
    const hasGraphqlErrors = Array.isArray(payload.errors) && payload.errors.length > 0;
    return {
      cachedAt: end,
      observedAt: end,
      ...snapshot,
      coverage: hasGraphqlErrors ? "partial" : snapshot.coverage,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function liveStatus(entry: CacheEntry): CloudflareAnalyticsStatus {
  const partial = entry.coverage === "partial";
  return {
    state: partial ? "partial" : "healthy",
    headline: partial ? "Cloudflare analytics is partially available" : "Cloudflare analytics is current",
    detail: partial
      ? "A current Cloudflare snapshot is available, but one or more requested aggregates had no data. Shown values remain valid."
      : "A normalized rolling 24-hour Cloudflare snapshot is available. Edge traffic and Worker invocations are separate measures.",
    coverage: entry.coverage,
    observedAt: entry.observedAt,
    metrics: entry.metrics,
  };
}

function staleStatus(entry: CacheEntry): CloudflareAnalyticsStatus {
  return {
    state: "stale",
    headline: "Cloudflare analytics needs a refresh",
    detail: entry.coverage === "partial"
      ? "The provider did not return a fresh aggregate snapshot, so the last successful partial Cloudflare snapshot is shown."
      : "The provider did not return a fresh aggregate snapshot, so the last successful Cloudflare snapshot is shown.",
    coverage: entry.coverage,
    observedAt: entry.observedAt,
    metrics: entry.metrics,
  };
}

export async function cloudflareAnalyticsStatus(
  env: CloudflareAnalyticsEnv,
  now = new Date(),
): Promise<CloudflareAnalyticsStatus> {
  const config = configFrom(env);
  if (!config) {
    return {
      state: "not_configured",
      headline: "Cloudflare analytics is not connected",
      detail: "A separate, read-only Cloudflare Analytics connection and the selected account and zone identifiers are required before this admin page can request live traffic data.",
      coverage: null,
      observedAt: null,
      metrics: [],
    };
  }

  const cached = await readCache(config);
  const cachedAt = cached ? Date.parse(cached.cachedAt) : Number.NaN;
  if (cached && Number.isFinite(cachedAt) && now.getTime() - cachedAt <= CACHE_TTL_MS) {
    return liveStatus(cached);
  }
  try {
    const fresh = await fetchLiveSnapshot(config, now);
    await writeCache(config, fresh);
    return liveStatus(fresh);
  } catch {
    if (cached && Number.isFinite(cachedAt) && now.getTime() - cachedAt <= MAX_STALE_MS) {
      return staleStatus(cached);
    }
    return {
      state: "unavailable",
      headline: "Cloudflare analytics is temporarily unavailable",
      detail: "The secure analytics connection did not return a usable aggregate snapshot. Cloudflare traffic and the website itself may still be operating normally.",
      coverage: null,
      observedAt: null,
      metrics: [],
    };
  }
}
