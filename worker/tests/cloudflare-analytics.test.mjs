import assert from "node:assert/strict";
import test from "node:test";
import { cloudflareAnalyticsStatus } from "../dist/cloudflare-analytics.js";

const NOW = new Date("2026-09-23T12:00:00.000Z");
const CONFIG = {
  CLOUDFLARE_ANALYTICS_API_TOKEN: "read-only-test-token",
  CLOUDFLARE_ANALYTICS_ACCOUNT_ID: "a".repeat(32),
  CLOUDFLARE_ANALYTICS_ZONE_ID: "b".repeat(32),
  CLOUDFLARE_ANALYTICS_API_WORKER_NAME: "jakh-api",
  CLOUDFLARE_ANALYTICS_SITE_WORKER_NAME: "jakh-site",
};

function graphqlResponse() {
  return {
    data: {
      viewer: {
        zones: [{
          traffic: [{ count: 1_240, sum: { visits: 860, edgeResponseBytes: 4_096_000 } }],
        }],
        accounts: [{
          apiWorker: [{ sum: { requests: 530, errors: 2 } }],
          siteWorker: [{ sum: { requests: 1_240, errors: 0 } }],
        }],
      },
    },
  };
}

function installEdgeCache(t) {
  const entries = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      default: {
        async match(request) { return entries.get(request.url)?.clone(); },
        async put(request, response) { entries.set(request.url, response.clone()); },
      },
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "caches", original);
    else delete globalThis.caches;
  });
}

function metricValues(status) {
  return new Map(status.metrics.map((item) => [item.id, item]));
}

test("Cloudflare analytics is explicitly not configured without the dedicated secret", async (t) => {
  installEdgeCache(t);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("must not call Cloudflare without configuration"); };
  t.after(() => { globalThis.fetch = originalFetch; });

  const status = await cloudflareAnalyticsStatus({}, NOW);
  assert.equal(status.state, "not_configured");
  assert.equal(calls, 0);
  assert.equal(status.observedAt, null);
  assert.deepEqual(status.metrics, []);
});

test("Cloudflare analytics returns a normalized, cached aggregate without leaking the token", async (t) => {
  installEdgeCache(t);
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    return new Response(JSON.stringify(graphqlResponse()), { headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const first = await cloudflareAnalyticsStatus(CONFIG, NOW);
  assert.equal(first.state, "healthy");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].input, "https://api.cloudflare.com/client/v4/graphql");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers.authorization, "Bearer read-only-test-token");
  const zoneQuery = JSON.parse(requests[0].init.body);
  const workersQuery = JSON.parse(requests[1].init.body);
  assert.match(zoneQuery.query, /httpRequestsAdaptiveGroups/u);
  assert.doesNotMatch(zoneQuery.query, /workersInvocationsAdaptive/u);
  assert.match(workersQuery.query, /workersInvocationsAdaptive/u);
  assert.doesNotMatch(workersQuery.query, /httpRequestsAdaptiveGroups/u);
  assert.equal(zoneQuery.variables.zoneTag, CONFIG.CLOUDFLARE_ANALYTICS_ZONE_ID);
  assert.equal(workersQuery.variables.accountTag, CONFIG.CLOUDFLARE_ANALYTICS_ACCOUNT_ID);
  assert.equal(zoneQuery.variables.accountTag, undefined);
  assert.equal(workersQuery.variables.zoneTag, undefined);
  assert.equal(zoneQuery.variables.start, workersQuery.variables.start);
  assert.equal(zoneQuery.variables.end, workersQuery.variables.end);
  assert.equal(first.metrics.length, 7);
  assert.equal(first.diagnostics, undefined);

  const metrics = metricValues(first);
  assert.equal(metrics.get("cloudflare-edge-requests-24h").value, 1_240);
  assert.equal(metrics.get("cloudflare-visits-24h").value, 860);
  assert.equal(metrics.get("cloudflare-edge-data-transfer-24h").value, 4_096_000);
  assert.equal(metrics.get("cloudflare-edge-data-transfer-24h").format, "bytes");
  assert.equal(metrics.get("cloudflare-api-worker-errors-24h").value, 2);
  assert.equal(metrics.get("cloudflare-site-worker-errors-24h").value, 0);
  assert.doesNotMatch(JSON.stringify(first), /read-only-test-token/u);

  const cached = await cloudflareAnalyticsStatus(CONFIG, new Date(NOW.getTime() + 60_000));
  assert.equal(cached.state, "healthy");
  assert.equal(requests.length, 2, "a five-minute cache window must avoid more provider queries");
  assert.deepEqual(cached.metrics, first.metrics);
});

test("Cloudflare analytics keeps a configuration-scoped stale snapshot when a refresh fails", async (t) => {
  installEdgeCache(t);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls <= 2) {
      return new Response(JSON.stringify(graphqlResponse()), { headers: { "content-type": "application/json" } });
    }
    throw new Error("provider temporarily unavailable");
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const first = await cloudflareAnalyticsStatus(CONFIG, NOW);
  const stale = await cloudflareAnalyticsStatus(CONFIG, new Date(NOW.getTime() + (5 * 60 * 1_000) + 1));
  assert.equal(first.state, "healthy");
  assert.equal(stale.state, "stale");
  assert.equal(calls, 6, "each failed scope retries its transient provider failure once");
  assert.deepEqual(stale.metrics, first.metrics);
  assert.deepEqual(stale.diagnostics, { zone: "provider_failure", workers: "provider_failure" });

  const otherZone = await cloudflareAnalyticsStatus({ ...CONFIG, CLOUDFLARE_ANALYTICS_ZONE_ID: "c".repeat(32) }, NOW);
  assert.equal(otherZone.state, "unavailable");
  assert.equal(calls, 10, "a different zone must not reuse this zone's cached snapshot");
});

test("Cloudflare retries one transient provider failure per scope before returning data", async (t) => {
  installEdgeCache(t);
  const originalFetch = globalThis.fetch;
  const attempts = new Map();
  globalThis.fetch = async (_input, init) => {
    const scope = "zoneTag" in JSON.parse(init.body).variables ? "zone" : "workers";
    const count = (attempts.get(scope) || 0) + 1;
    attempts.set(scope, count);
    if (count === 1) throw new Error("temporary upstream transport failure");
    return new Response(JSON.stringify(graphqlResponse()), { headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const status = await cloudflareAnalyticsStatus(CONFIG, NOW);
  assert.equal(status.state, "healthy");
  assert.equal(status.metrics.length, 7);
  assert.deepEqual([...attempts.entries()].sort(), [["workers", 2], ["zone", 2]]);
});

test("Cloudflare analytics retains valid partial aggregates without manufacturing Worker zeros", async (t) => {
  installEdgeCache(t);
  const originalFetch = globalThis.fetch;
  const payload = graphqlResponse();
  payload.data.viewer.accounts[0].siteWorker = [];
  let failRefresh = false;
  globalThis.fetch = async () => {
    if (failRefresh) throw new Error("provider temporarily unavailable");
    return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const partial = await cloudflareAnalyticsStatus(CONFIG, NOW);
  assert.equal(partial.state, "partial");
  assert.equal(partial.coverage, "partial");
  const metrics = metricValues(partial);
  assert.equal(metrics.get("cloudflare-edge-requests-24h").value, 1_240);
  assert.equal(metrics.get("cloudflare-api-worker-errors-24h").value, 2);
  assert.equal(metrics.has("cloudflare-site-worker-requests-24h"), false);
  assert.equal(metrics.has("cloudflare-site-worker-errors-24h"), false);
  assert.deepEqual(partial.diagnostics, { workers: "no_data" });

  const cached = await cloudflareAnalyticsStatus(CONFIG, new Date(NOW.getTime() + 60_000));
  assert.equal(cached.state, "partial");
  assert.deepEqual(cached.diagnostics, partial.diagnostics);

  failRefresh = true;
  const stale = await cloudflareAnalyticsStatus(CONFIG, new Date(NOW.getTime() + (5 * 60 * 1_000) + 1));
  assert.equal(stale.state, "stale");
  assert.equal(stale.coverage, "partial");
  assert.equal(metricValues(stale).has("cloudflare-site-worker-requests-24h"), false);
});

test("Cloudflare preserves returned zone data when another GraphQL scope reports an error", async (t) => {
  installEdgeCache(t);
  const originalFetch = globalThis.fetch;
  const payload = graphqlResponse();
  payload.data.viewer.accounts = [];
  payload.errors = [{ message: "account metrics denied: test-private-detail" }];
  globalThis.fetch = async () => new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  const status = await cloudflareAnalyticsStatus(CONFIG, NOW);
  const metrics = metricValues(status);
  assert.equal(status.state, "partial");
  assert.equal(status.coverage, "partial");
  assert.equal(metrics.get("cloudflare-edge-requests-24h").value, 1_240);
  assert.equal(metrics.has("cloudflare-api-worker-requests-24h"), false);
  assert.doesNotMatch(JSON.stringify(status), /test-private-detail/u);
});

test("Cloudflare GraphQL errors keep the admin endpoint safe and show no raw provider error", async (t) => {
  installEdgeCache(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ errors: [{ message: "token denied: test-private-detail" }] }), {
    headers: { "content-type": "application/json" },
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  const status = await cloudflareAnalyticsStatus(CONFIG, NOW);
  assert.equal(status.state, "unavailable");
  assert.equal(status.observedAt, null);
  assert.deepEqual(status.metrics, []);
  assert.doesNotMatch(JSON.stringify(status), /test-private-detail/u);
});

test("Cloudflare isolates a rejected scope and caches the successful scope in either direction", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const failedScope of ["zone", "workers"]) {
    await t.test(failedScope, async (t) => {
      installEdgeCache(t);
      let calls = 0;
      globalThis.fetch = async (_input, init) => {
        calls += 1;
        const isZone = "zoneTag" in JSON.parse(init.body).variables;
        if (isZone === (failedScope === "zone")) {
          return new Response(JSON.stringify({ errors: [{ message: "does not have access: private-account-id" }] }));
        }
        return new Response(JSON.stringify(graphqlResponse()));
      };
      const status = await cloudflareAnalyticsStatus(CONFIG, NOW);
      assert.equal(status.state, "partial");
      assert.equal(status.metrics.length, failedScope === "zone" ? 4 : 3);
      assert.deepEqual(status.diagnostics, { [failedScope]: "permission_denied" });
      assert.doesNotMatch(JSON.stringify(status), /private-account-id|read-only-test-token/u);
      const cached = await cloudflareAnalyticsStatus(CONFIG, new Date(NOW.getTime() + 60_000));
      assert.equal(calls, 2);
      assert.deepEqual(cached, status);
    });
  }
});

test("Cloudflare returns only allowlisted failure categories when both scopes fail", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const cases = [
    ["authentication_failed", () => new Response("private body", { status: 401 })],
    ["permission_denied", () => new Response("private body", { status: 403 })],
    ["rate_limited", () => new Response("private body", { status: 429 })],
    ["provider_failure", () => new Response("private body", { status: 503 })],
    ["query_rejected", () => new Response("private body", { status: 400 })],
    ["malformed_response", () => new Response("not JSON: private body")],
    ["malformed_response", () => new Response(JSON.stringify({ unexpected: "private body" }))],
    ["malformed_response", () => new Response("private body", { headers: { "content-length": "65537" } })],
    ["no_data", () => new Response(JSON.stringify({ data: { viewer: { zones: [], accounts: [] } } }))],
    ["authentication_failed", () => new Response(JSON.stringify({ errors: [{ message: "Authentication error: private body" }] }))],
    ["permission_denied", () => new Response(JSON.stringify({ errors: [{ message: "not authorized: private body" }] }))],
    ["rate_limited", () => new Response(JSON.stringify({ errors: [{ message: "rate limit exceeded: private body" }] }))],
    ["query_limit", () => new Response(JSON.stringify({ errors: [{ message: "time range is too large: private body" }] }))],
    ["query_limit", () => new Response(JSON.stringify({ errors: [{ message: "cannot request data older than private body" }] }), { status: 400 })],
    ["query_limit", () => new Response(JSON.stringify({ errors: [{ message: "number of fields can't be more than private body" }] }), { status: 400 })],
    ["query_limit", () => new Response(JSON.stringify({ errors: [{ message: "limit must be positive number and not greater than private body" }] }), { status: 400 })],
    ["query_rejected", () => new Response(JSON.stringify({ errors: [{ message: "unknown error: private body" }] }))],
    ["provider_failure", () => { throw new Error("network failure: private body"); }],
  ];
  for (const [category, response] of cases) {
    await t.test(category, async (t) => {
      installEdgeCache(t);
      globalThis.fetch = async () => response();
      const status = await cloudflareAnalyticsStatus(CONFIG, NOW);
      assert.equal(status.state, "unavailable");
      assert.equal(status.observedAt, null);
      assert.deepEqual(status.metrics, []);
      assert.deepEqual(status.diagnostics, { zone: category, workers: category });
      assert.doesNotMatch(JSON.stringify(status), /private body|read-only-test-token/u);
    });
  }
});

test("Cloudflare transport logs use a fixed safe vocabulary", async (t) => {
  installEdgeCache(t);
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings = [];
  globalThis.fetch = async () => { throw new Error("Network connection lost: private transport detail"); };
  console.warn = (...args) => { warnings.push(args); };
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });

  const status = await cloudflareAnalyticsStatus(CONFIG, NOW);
  assert.deepEqual(status.diagnostics, { zone: "provider_failure", workers: "provider_failure" });
  assert.equal(warnings.length, 4, "each scope logs its two bounded transport attempts");
  for (const warning of warnings) {
    assert.equal(warning[0], "cloudflare_analytics_transport_failure");
    assert.equal(warning[1].kind, "network");
    assert.ok(["zone", "workers"].includes(warning[1].scope));
    assert.doesNotMatch(JSON.stringify(warning), /private transport detail|read-only-test-token/u);
  }
});

test("Cloudflare classifies a nested transport cause without logging it", async (t) => {
  installEdgeCache(t);
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings = [];
  globalThis.fetch = async () => {
    const outer = new Error("generic outer runtime error");
    outer.cause = new Error("TLS certificate error: private nested detail");
    throw outer;
  };
  console.warn = (...args) => { warnings.push(args); };
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });

  await cloudflareAnalyticsStatus(CONFIG, NOW);
  assert.equal(warnings.length, 4);
  for (const warning of warnings) {
    assert.equal(warning[1].kind, "network");
    assert.doesNotMatch(JSON.stringify(warning), /generic outer runtime error|private nested detail|read-only-test-token/u);
  }
});

test("Cloudflare logs an allowlisted category for an unavailable provider response", async (t) => {
  installEdgeCache(t);
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings = [];
  globalThis.fetch = async () => new Response("private provider failure", { status: 503 });
  console.warn = (...args) => { warnings.push(args); };
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });

  const status = await cloudflareAnalyticsStatus(CONFIG, NOW);
  assert.deepEqual(status.diagnostics, { zone: "provider_failure", workers: "provider_failure" });
  assert.equal(warnings.length, 4, "each scope retries the bounded transient provider failure once");
  for (const warning of warnings) {
    assert.deepEqual(warning, ["cloudflare_analytics_transport_failure", { scope: warning[1].scope, kind: "provider_http" }]);
    assert.doesNotMatch(JSON.stringify(warning), /private provider failure|read-only-test-token/u);
  }
});

test("Cloudflare requests both scopes concurrently and bounds a stalled response body", async (t) => {
  installEdgeCache(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  let stalledSignal;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    if (calls === 2) markStarted();
    if ("zoneTag" in JSON.parse(init.body).variables) return new Response(JSON.stringify(graphqlResponse()));
    stalledSignal = init.signal;
    return new Response(new ReadableStream({ start() {} }));
  };
  const pending = cloudflareAnalyticsStatus(CONFIG, NOW);
  await started;
  // Let the immediately available zone body settle before advancing time.
  for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
  assert.equal(calls, 2, "the second scope starts while the first is still in flight");
  t.mock.timers.tick(5_000);
  const status = await pending;
  assert.equal(status.state, "partial");
  assert.equal(status.metrics.length, 3);
  assert.deepEqual(status.diagnostics, { workers: "timeout" });
  assert.equal(stalledSignal.aborted, true);
});

test("Cloudflare rejects malformed configuration per scope without returning its contents", async (t) => {
  installEdgeCache(t);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify(graphqlResponse()));
  };
  const partial = await cloudflareAnalyticsStatus({ ...CONFIG, CLOUDFLARE_ANALYTICS_ZONE_ID: "private-invalid-zone" }, NOW);
  assert.equal(calls, 1);
  assert.equal(partial.metrics.length, 4);
  assert.deepEqual(partial.diagnostics, { zone: "configuration_invalid" });
  assert.doesNotMatch(JSON.stringify(partial), /private-invalid-zone/u);
  const invalidToken = await cloudflareAnalyticsStatus({
    ...CONFIG, CLOUDFLARE_ANALYTICS_API_TOKEN: "private invalid token",
  }, NOW);
  assert.equal(calls, 1);
  assert.equal(invalidToken.state, "unavailable");
  assert.deepEqual(invalidToken.diagnostics, { zone: "configuration_invalid", workers: "configuration_invalid" });
  assert.doesNotMatch(JSON.stringify(invalidToken), /private invalid token/u);
});

test("Cloudflare does not keep a failed snapshot beyond the 24-hour stale window", async (t) => {
  installEdgeCache(t);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify(graphqlResponse()));
  assert.equal((await cloudflareAnalyticsStatus(CONFIG, NOW)).state, "healthy");
  globalThis.fetch = async () => new Response("private body", { status: 429 });
  const expired = await cloudflareAnalyticsStatus(CONFIG, new Date(NOW.getTime() + 24 * 60 * 60 * 1_000 + 1));
  assert.equal(expired.state, "unavailable");
  assert.equal(expired.observedAt, null);
  assert.deepEqual(expired.metrics, []);
  assert.deepEqual(expired.diagnostics, { zone: "rate_limited", workers: "rate_limited" });
});
