import type { CloudflareAnalyticsDiagnostics, CloudflareAnalyticsFailureCategory, PlatformStatusMetric, PlatformStatusSourceState } from "./types.js";

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
  diagnostics?: CloudflareAnalyticsDiagnostics;
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
  diagnostics?: CloudflareAnalyticsDiagnostics;
}

type AnalyticsScope = "zone" | "workers";

interface ScopeSnapshot {
  metrics: PlatformStatusMetric[];
  failure?: CloudflareAnalyticsFailureCategory;
}

class AnalyticsFailure extends Error {
  constructor(readonly category: CloudflareAnalyticsFailureCategory) {
    super(category);
  }
}

const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
// Cache keys remain on the deployed API zone and are never fetched. They are
// scoped to non-secret configuration so a later zone or Worker rename cannot
// reuse an unrelated aggregate snapshot.
const CACHE_KEY_URL = "https://api.riddlearabia.com/__internal/platform-status/cloudflare-analytics-v1";
const CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_STALE_MS = 24 * 60 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 5_000;
const TRANSIENT_ATTEMPTS = 2;
const MAX_RESPONSE_BYTES = 64 * 1_024;
const WINDOW_MS = 24 * 60 * 60 * 1_000;
const EXPECTED_METRIC_COUNT = 7;

const CLOUDFLARE_ZONE_QUERY = `
  query RiddleArabiaZoneTraffic(
    $zoneTag: string
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
    }
  }
`;

const CLOUDFLARE_WORKERS_QUERY = `
  query RiddleArabiaWorkerUsage(
    $accountTag: string
    $apiWorkerName: string
    $siteWorkerName: string
    $start: Time
    $end: Time
  ) {
    viewer {
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

function graphqlFailure(payload: Record<string, unknown>): CloudflareAnalyticsFailureCategory | undefined {
  if (!Array.isArray(payload.errors) || !payload.errors.length) return undefined;
  // Classify only explicit authentication/rate-limit signals. Unknown errors
  // stay generic, and no provider-controlled text enters the status or cache.
  for (const candidate of payload.errors) {
    const error = plainObject(candidate);
    const extensions = plainObject(error?.extensions);
    const code = typeof extensions?.code === "string" ? extensions.code.toUpperCase() : "";
    const message = typeof error?.message === "string" ? error.message : "";
    if (["UNAUTHENTICATED", "UNAUTHORIZED"].includes(code)
      || /\b(authentication (?:error|failed)|invalid (?:api |access )?token|unauthorized)\b/iu.test(message)) {
      return "authentication_failed";
    }
    if (code === "FORBIDDEN" || /\b(permission denied|does not have access|not authorized|forbidden)\b/iu.test(message)) {
      return "permission_denied";
    }
    if (["RATE_LIMITED", "RATE_LIMIT_EXCEEDED", "TOO_MANY_REQUESTS"].includes(code)
      || /\b(rate limit(?:ed| exceeded)?|too many requests)\b/iu.test(message)) {
      return "rate_limited";
    }
    if (/\b(time range.{0,40}(?:too (?:large|long)|exceeds|limit)|max(?:imum)? duration|query (?:complexity|cost).{0,40}(?:exceeds|limit)|cannot request data older than|number of fields can(?:not|'t) be more than|limit must be positive number and not greater than)\b/iu.test(message)) {
      return "query_limit";
    }
  }
  return "query_rejected";
}

function metricsFromPayload(value: unknown, scope: AnalyticsScope): ScopeSnapshot {
  const payload = plainObject(value);
  const viewer = plainObject(payload?.data);
  const viewerData = plainObject(viewer?.viewer);
  const failure = payload ? graphqlFailure(payload) : undefined;
  const groups = scope === "zone" ? viewerData?.zones : viewerData?.accounts;
  if (!Array.isArray(groups)) return { metrics: [], failure: failure || "malformed_response" };
  if (!groups.length) return { metrics: [], failure: failure || "no_data" };
  const zone = firstGroup(viewerData?.zones);
  const account = firstGroup(viewerData?.accounts);
  const traffic = firstGroup(zone?.traffic);
  const trafficSum = plainObject(traffic?.sum);
  const apiWorker = firstGroup(account?.apiWorker);
  const apiSum = plainObject(apiWorker?.sum);
  const siteWorker = firstGroup(account?.siteWorker);
  const siteSum = plainObject(siteWorker?.sum);
  // Only project the requested scope, even if an unexpected response includes
  // extra data. Empty groups never manufacture zero usage.
  const candidates = scope === "zone" ? [
    traffic && metric("cloudflare-edge-requests-24h", "Cloudflare edge requests (24h)", traffic.count, "End-user requests at the Cloudflare edge over the last 24 hours."),
    trafficSum && metric("cloudflare-visits-24h", "Cloudflare visits (24h)", trafficSum.visits, "A visit is a direct or referral page view, not a unique visitor count."),
    trafficSum && metric("cloudflare-edge-data-transfer-24h", "Cloudflare data transfer (24h)", trafficSum.edgeResponseBytes, "Edge response bytes served to end users in the last 24 hours.", "bytes"),
  ] : [
    apiSum && metric("cloudflare-api-worker-requests-24h", "API Worker requests (24h)", apiSum.requests, "Invocations of jakh-api in the last 24 hours."),
    apiSum && metric("cloudflare-api-worker-errors-24h", "API Worker errors (24h)", apiSum.errors, "Cloudflare Worker invocation errors, not site HTTP status codes."),
    siteSum && metric("cloudflare-site-worker-requests-24h", "Site Worker requests (24h)", siteSum.requests, "Invocations of jakh-site in the last 24 hours."),
    siteSum && metric("cloudflare-site-worker-errors-24h", "Site Worker errors (24h)", siteSum.errors, "Cloudflare Worker invocation errors, not site HTTP status codes."),
  ];
  const metrics = candidates.filter((candidate): candidate is PlatformStatusMetric => candidate !== null);
  const expectedCount = scope === "zone" ? 3 : 4;
  const aggregateGroups = scope === "zone" ? [zone?.traffic] : [account?.apiWorker, account?.siteWorker];
  const missingAggregate = aggregateGroups.some((group) => Array.isArray(group) && !group.length);
  return {
    metrics,
    ...(failure ? { failure } : metrics.length < expectedCount
      ? { failure: missingAggregate ? "no_data" : "malformed_response" }
      : {}),
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
    throw new AnalyticsFailure("malformed_response");
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
      if (size > MAX_RESPONSE_BYTES) throw new AnalyticsFailure("malformed_response");
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
    throw new AnalyticsFailure("malformed_response");
  }
}

function safeDiagnostics(value: unknown): CloudflareAnalyticsDiagnostics | undefined {
  const input = plainObject(value);
  if (!input) return undefined;
  const diagnostics: CloudflareAnalyticsDiagnostics = {};
  const categories: CloudflareAnalyticsFailureCategory[] = [
    "configuration_invalid", "authentication_failed", "permission_denied", "rate_limited", "query_limit", "provider_failure", "malformed_response", "timeout", "query_rejected", "no_data",
  ];
  for (const scope of ["zone", "workers"] as const) {
    const category = input[scope];
    if (typeof category === "string" && categories.includes(category as CloudflareAnalyticsFailureCategory)) {
      diagnostics[scope] = category as CloudflareAnalyticsFailureCategory;
    }
  }
  return Object.keys(diagnostics).length ? diagnostics : undefined;
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
  const diagnostics = safeDiagnostics(entry.diagnostics);
  return { cachedAt: entry.cachedAt, observedAt: entry.observedAt, coverage, metrics, ...(diagnostics ? { diagnostics } : {}) };
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

async function fetchScopeAttempt(config: CloudflareAnalyticsConfig, scope: AnalyticsScope, start: string, end: string): Promise<ScopeSnapshot> {
  const resourceId = scope === "zone" ? config.zoneId : config.accountId;
  if (!/^[a-f0-9]{32}$/iu.test(resourceId) || /[\s\u0000-\u001f\u007f]/u.test(config.token)) {
    throw new AnalyticsFailure("configuration_invalid");
  }
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  // Race the whole request, including body consumption, against a deadline.
  // Aborting fetch alone does not bound a stalled or non-cooperative stream.
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new AnalyticsFailure("timeout"));
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    const request = (async () => {
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
          query: scope === "zone" ? CLOUDFLARE_ZONE_QUERY : CLOUDFLARE_WORKERS_QUERY,
          variables: {
            ...(scope === "zone" ? { zoneTag: config.zoneId } : {
              accountTag: config.accountId,
              apiWorkerName: config.apiWorkerName,
              siteWorkerName: config.siteWorkerName,
            }),
            start,
            end,
          },
        }),
      });
      if (!response.ok) {
        if (response.status === 401) throw new AnalyticsFailure("authentication_failed");
        if (response.status === 403) throw new AnalyticsFailure("permission_denied");
        if (response.status === 429) throw new AnalyticsFailure("rate_limited");
        if (response.status === 400) {
          // Cloudflare returns GraphQL validation/query-limit errors with
          // either HTTP 200 or 400. Inspect only the bounded JSON error shape.
          let payload: Record<string, unknown> | null = null;
          try { payload = plainObject(await jsonBody(response)); } catch { /* Use the generic rejection category. */ }
          throw new AnalyticsFailure(payload ? graphqlFailure(payload) || "query_rejected" : "query_rejected");
        }
        throw new AnalyticsFailure(response.status >= 500 ? "provider_failure" : "query_rejected");
      }
      return metricsFromPayload(await jsonBody(response), scope);
    })();
    return await Promise.race([request, deadline]);
  } catch (error) {
    // Preserve the explicit, allowlisted outcomes above. Every other fetch or
    // stream error is a transient provider transport failure and is eligible
    // for the single safe retry in fetchScope.
    if (error instanceof AnalyticsFailure) throw error;
    throw new AnalyticsFailure("provider_failure");
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchScope(config: CloudflareAnalyticsConfig, scope: AnalyticsScope, start: string, end: string): Promise<ScopeSnapshot> {
  for (let attempt = 1; attempt <= TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
      return await fetchScopeAttempt(config, scope, start, end);
    } catch (error) {
      // Analytics queries are read-only. A one-time retry handles a transient
      // Cloudflare API/edge transport failure without masking an explicit
      // configuration, authentication, permission, or query problem.
      if (attempt < TRANSIENT_ATTEMPTS && error instanceof AnalyticsFailure && error.category === "provider_failure") continue;
      throw error;
    }
  }
  throw new AnalyticsFailure("provider_failure");
}

async function fetchLiveSnapshot(config: CloudflareAnalyticsConfig, now: Date): Promise<{ entry: CacheEntry | null; diagnostics?: CloudflareAnalyticsDiagnostics }> {
  const end = now.toISOString();
  const start = new Date(now.getTime() - WINDOW_MS).toISOString();
  const scopes = ["zone", "workers"] as const;
  const results = await Promise.allSettled(scopes.map((scope) => fetchScope(config, scope, start, end)));
  const metrics: PlatformStatusMetric[] = [];
  const failures: CloudflareAnalyticsDiagnostics = {};
  results.forEach((result, index) => {
    const scope = scopes[index]!;
    if (result.status === "fulfilled") {
      metrics.push(...result.value.metrics);
      if (result.value.failure) failures[scope] = result.value.failure;
    } else {
      failures[scope] = result.reason instanceof AnalyticsFailure ? result.reason.category : "provider_failure";
    }
  });
  const diagnostics = safeDiagnostics(failures);
  return {
    entry: metrics.length ? {
      cachedAt: end,
      observedAt: end,
      metrics,
      coverage: metrics.length === EXPECTED_METRIC_COUNT && !diagnostics ? "complete" : "partial",
      ...(diagnostics ? { diagnostics } : {}),
    } : null,
    ...(diagnostics ? { diagnostics } : {}),
  };
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
    ...(entry.diagnostics ? { diagnostics: entry.diagnostics } : {}),
  };
}

function staleStatus(entry: CacheEntry, diagnostics?: CloudflareAnalyticsDiagnostics): CloudflareAnalyticsStatus {
  return {
    state: "stale",
    headline: "Cloudflare analytics needs a refresh",
    detail: entry.coverage === "partial"
      ? "The provider did not return a fresh aggregate snapshot, so the last successful partial Cloudflare snapshot is shown."
      : "The provider did not return a fresh aggregate snapshot, so the last successful Cloudflare snapshot is shown.",
    coverage: entry.coverage,
    observedAt: entry.observedAt,
    metrics: entry.metrics,
    ...(diagnostics ? { diagnostics } : {}),
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
  const fresh = await fetchLiveSnapshot(config, now);
  if (fresh.entry) {
    await writeCache(config, fresh.entry);
    return liveStatus(fresh.entry);
  }
  if (cached && Number.isFinite(cachedAt) && now.getTime() - cachedAt <= MAX_STALE_MS) {
    return staleStatus(cached, fresh.diagnostics);
  }
  return {
    state: "unavailable",
    headline: "Cloudflare analytics is temporarily unavailable",
    detail: "The secure analytics connection did not return a usable aggregate snapshot. Cloudflare traffic and the website itself may still be operating normally.",
    coverage: null,
    observedAt: null,
    metrics: [],
    ...(fresh.diagnostics ? { diagnostics: fresh.diagnostics } : {}),
  };
}
