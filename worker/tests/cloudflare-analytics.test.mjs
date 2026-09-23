import assert from "node:assert/strict";
import test from "node:test";
import { cloudflareAnalyticsStatus } from "../dist/cloudflare-analytics.js";

const NOW = new Date("2026-09-23T12:00:00.000Z");
const CONFIG = {
  CLOUDFLARE_ANALYTICS_API_TOKEN: "read-only-test-token",
  CLOUDFLARE_ANALYTICS_ACCOUNT_ID: "account-test-id",
  CLOUDFLARE_ANALYTICS_ZONE_ID: "zone-test-id",
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
  assert.equal(requests.length, 1);
  assert.equal(requests[0].input, "https://api.cloudflare.com/client/v4/graphql");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers.authorization, "Bearer read-only-test-token");
  const query = JSON.parse(requests[0].init.body);
  assert.match(query.query, /httpRequestsAdaptiveGroups/u);
  assert.match(query.query, /workersInvocationsAdaptive/u);
  assert.equal(query.variables.zoneTag, CONFIG.CLOUDFLARE_ANALYTICS_ZONE_ID);
  assert.equal(query.variables.accountTag, CONFIG.CLOUDFLARE_ANALYTICS_ACCOUNT_ID);

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
  assert.equal(requests.length, 1, "a five-minute cache window must avoid another provider query");
  assert.deepEqual(cached.metrics, first.metrics);
});

test("Cloudflare analytics keeps a configuration-scoped stale snapshot when a refresh fails", async (t) => {
  installEdgeCache(t);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify(graphqlResponse()), { headers: { "content-type": "application/json" } });
    }
    throw new Error("provider temporarily unavailable");
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const first = await cloudflareAnalyticsStatus(CONFIG, NOW);
  const stale = await cloudflareAnalyticsStatus(CONFIG, new Date(NOW.getTime() + (5 * 60 * 1_000) + 1));
  assert.equal(first.state, "healthy");
  assert.equal(stale.state, "stale");
  assert.equal(calls, 2, "a refresh is attempted after the five-minute fresh window");
  assert.deepEqual(stale.metrics, first.metrics);

  const otherZone = await cloudflareAnalyticsStatus({ ...CONFIG, CLOUDFLARE_ANALYTICS_ZONE_ID: "other-zone" }, NOW);
  assert.equal(otherZone.state, "unavailable");
  assert.equal(calls, 3, "a different zone must not reuse this zone's cached snapshot");
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
