import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import handler from "../dist/index.js";
import { adminPlatformStatus } from "../dist/admin.js";

const SESSION_TOKEN = "A".repeat(43);
const PRIVATE_EMAIL = "owner-private@example.test";
const PRIVATE_HASH = "private-password-hash-must-not-leak";
const PRIVATE_SALT = "private-password-salt-must-not-leak";

function request(path = "/api/admin/platform-status", { origin } = {}) {
  const headers = {
    cookie: `__Host-jakh_session=${SESSION_TOKEN}`,
    "cf-connecting-ip": "203.0.113.88",
  };
  if (origin) headers.origin = origin;
  return new Request(`https://api.riddlearabia.com${path}`, { headers });
}

async function platformEnv(t, { role = "OWNER", schemaVersion = 9 } = {}) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec("PRAGMA foreign_keys = ON");
  const migrationsDirectory = new URL("../migrations/", import.meta.url);
  const migrations = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name) && Number(name.slice(0, 4)) <= schemaVersion)
    .sort();
  for (const name of migrations) database.exec(await readFile(new URL(name, migrationsDirectory), "utf8"));

  const now = new Date().toISOString();
  const activeExpiry = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
  const insertUser = database.prepare(
    `INSERT INTO users (id, username, username_key, email, password_hash, password_salt,
                        password_iterations, role, is_banned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 100000, ?, ?, ?, ?)`,
  );
  insertUser.run("actor-1", "owner", "owner", PRIVATE_EMAIL, PRIVATE_HASH, PRIVATE_SALT, role, 0, now, now);
  insertUser.run("member-1", "member", "member", "member-private@example.test", "member-hash", "member-salt", "USER", 0, now, now);
  insertUser.run("suspended-1", "suspended", "suspended", "suspended-private@example.test", "suspended-hash", "suspended-salt", "USER", 1, now, now);
  database.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(createHash("sha256").update(SESSION_TOKEN).digest("base64url"), "actor-1", now, activeExpiry);
  database.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run("second-active-session", "member-1", now, activeExpiry);
  database.prepare(
    "INSERT INTO progress (user_id, card_id, category_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("member-1", "science-001", "science", "correct", now, now);
  database.prepare(
    "INSERT INTO progress (user_id, card_id, category_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("member-1", "science-002", "science", "wrong-1", now, now);
  database.prepare(
    "INSERT INTO suggestions (id, text, email, status, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run("suggestion-1", "A pending private report", "reporter-private@example.test", "new", now);
  database.prepare(
    `INSERT INTO privacy_preferences (
       user_id, usage_analytics_enabled, notice_version, consent_updated_at, created_at, updated_at
     ) VALUES (?, 1, '2026-08-01', ?, ?, ?)`,
  ).run("member-1", now, now, now);
  database.prepare(
    "INSERT INTO analytics_daily (user_id, page_slug, activity_date, time_spent, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run("member-1", "science", now.slice(0, 10), 900, now);
  if (schemaVersion >= 9) {
    const snapshot = JSON.stringify({
      question: { en: "Question", ar: "سؤال" },
      answer: { en: "Answer", ar: "إجابة" },
      explanation: { en: "Explanation", ar: "شرح" },
      sources: [{ title: "Source", publisher: "Fixture", url: "https://example.test/source" }],
    });
    const insertContent = database.prepare(
      `INSERT INTO content_question_edits (
        question_id, category_slug, draft_json, workflow_status, version, published_version,
        published_snapshot_json, editor_user_id, created_at, updated_at, published_at
      ) VALUES (?, 'science', ?, ?, 1, ?, ?, 'actor-1', ?, ?, ?)`,
    );
    insertContent.run("draft-1", snapshot, "DRAFT", null, null, now, now, null);
    insertContent.run("review-1", snapshot, "IN_REVIEW", null, null, now, now, null);
    insertContent.run("published-1", snapshot, "PUBLISHED", 1, snapshot, now, now, now);
  }

  const queries = [];
  const env = {
    CF_VERSION_METADATA: {
      id: "11111111-1111-4111-8111-111111111111",
      tag: "test",
      timestamp: now,
    },
    PASSWORD_PEPPER: "password-pepper-longer-than-24-characters",
    IP_HASH_SALT: "ip-hash-salt-longer-than-24-characters",
    ALLOWED_ORIGINS: "https://riddlearabia.com",
    STATIC_ORIGIN: "https://riddlearabia.com",
    BATTLE_ROOMS: {},
    PASSWORD_HASHERS: {},
    DB: {
      prepare(sql) {
        queries.push(sql);
        const statement = database.prepare(sql);
        return {
          values: [],
          bind(...values) { this.values = values; return this; },
          async first() { return statement.get(...this.values) || null; },
          async all() { return { results: statement.all(...this.values), success: true }; },
          async run() { return { meta: statement.run(...this.values), success: true }; },
        };
      },
      async batch(statements) {
        database.exec("BEGIN");
        try {
          const results = [];
          for (const statement of statements) results.push(await statement.run());
          database.exec("COMMIT");
          return results;
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      },
    },
  };
  return { database, env, queries };
}

function metricMap(payload) {
  return new Map(payload.metrics.map((metric) => [metric.id, metric]));
}

test("owner platform status is a sanitized, no-store operational summary with no provider calls", async (t) => {
  const { env, queries } = await platformEnv(t);
  const originalFetch = globalThis.fetch;
  let outgoingCalls = 0;
  globalThis.fetch = async () => {
    outgoingCalls += 1;
    throw new Error("Platform status must not call a provider from the request path");
  };
  let response;
  try {
    response = await adminPlatformStatus(request(), env);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(outgoingCalls, 0);
  const payload = await response.json();
  assert.deepEqual(Object.keys(payload).sort(), ["metrics", "overall", "sources", "updatedAt"]);
  assert.ok(Number.isFinite(Date.parse(payload.updatedAt)), "updatedAt must be an ISO timestamp");
  assert.ok(["healthy", "degraded"].includes(payload.overall.state));
  assert.equal(typeof payload.overall.headline, "string");
  assert.equal(typeof payload.overall.detail, "string");

  const metrics = metricMap(payload);
  for (const id of [
    "registered-users",
    "administrators",
    "active-sessions",
    "completed-progress",
    "pending-suggestions",
    "suspended-users",
    "consented-usage-minutes",
    "content-drafts",
    "content-in-review",
    "published-content-overrides",
  ]) {
    assert.ok(metrics.has(id), `Missing ${id} metric`);
    assert.equal(typeof metrics.get(id).value, "number", `${id} must be numeric`);
  }
  assert.equal(metrics.get("registered-users").value, 3);
  assert.equal(metrics.get("administrators").value, 1);
  assert.equal(metrics.get("active-sessions").value, 2);
  assert.equal(metrics.get("completed-progress").value, 1);
  assert.equal(metrics.get("pending-suggestions").value, 1);
  assert.equal(metrics.get("suspended-users").value, 1);
  assert.equal(metrics.get("consented-usage-minutes").value, 15);
  assert.equal(metrics.get("content-drafts").value, 1);
  assert.equal(metrics.get("content-in-review").value, 1);
  assert.equal(metrics.get("published-content-overrides").value, 1);

  const sources = new Map(payload.sources.map((source) => [source.id, source]));
  assert.deepEqual([...sources.keys()].sort(), [
    "cloudflare",
    "github",
    "godaddy",
    "google-analytics",
    "search-console",
  ].sort());
  for (const id of ["cloudflare", "github", "godaddy", "google-analytics", "search-console"]) {
    assert.equal(sources.get(id).state, "not_configured");
  }
  for (const source of sources.values()) {
    assert.equal(typeof source.label, "string");
    assert.equal(typeof source.category, "string");
    assert.equal(typeof source.headline, "string");
    assert.equal(typeof source.detail, "string");
    assert.ok(source.observedAt === null || Number.isFinite(Date.parse(source.observedAt)));
    assert.equal(typeof source.link?.label, "string");
    assert.equal(new URL(source.link?.url).protocol, "https:");
    assert.deepEqual(source.metrics, []);
  }

  const serialized = JSON.stringify(payload);
  for (const secret of [PRIVATE_EMAIL, PRIVATE_HASH, PRIVATE_SALT, SESSION_TOKEN, "reporter-private@example.test"]) {
    assert.doesNotMatch(serialized, new RegExp(secret, "u"));
  }
  assert.doesNotMatch(serialized, /(?:authorization|api[_ -]?key|password|secret|token)/iu);
  assert.ok(queries.some((sql) => sql.includes("privacy_preferences")), "usage must be scoped to current consent");
  assert.ok(queries.some((sql) => sql.includes("analytics_daily")), "usage must use first-party analytics only");
});

test("platform status excludes editorial metrics before schema 9", async (t) => {
  const { env } = await platformEnv(t, { schemaVersion: 8 });
  const response = await adminPlatformStatus(request(), env);
  assert.equal(response.status, 200);
  const ids = (await response.json()).metrics.map((metric) => metric.id);
  for (const id of ["content-drafts", "content-in-review", "published-content-overrides"]) {
    assert.equal(ids.includes(id), false, `${id} must not query an unavailable editorial table`);
  }
});

test("owner platform status exposes only the normalized Cloudflare aggregate when its dedicated read-only configuration exists", async (t) => {
  const { env } = await platformEnv(t);
  Object.assign(env, {
    CLOUDFLARE_ANALYTICS_API_TOKEN: "read-only-test-token",
    CLOUDFLARE_ANALYTICS_ACCOUNT_ID: "a".repeat(32),
    CLOUDFLARE_ANALYTICS_ZONE_ID: "b".repeat(32),
  });
  const originalFetch = globalThis.fetch;
  const outgoing = [];
  globalThis.fetch = async (input, init) => {
    outgoing.push({ input: String(input), init });
    return new Response(JSON.stringify({
      data: {
        viewer: {
          zones: [{ traffic: [{ count: 42, sum: { visits: 12, edgeResponseBytes: 4_096 } }] }],
          accounts: [{
            apiWorker: [{ sum: { requests: 42, errors: 1 } }],
            siteWorker: [{ sum: { requests: 42, errors: 0 } }],
          }],
        },
      },
    }), { headers: { "content-type": "application/json" } });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const requestStartedAt = Date.now();
  const response = await adminPlatformStatus(request(), env);
  const requestFinishedAt = Date.now();
  assert.equal(response.status, 200);
  assert.equal(outgoing.length, 2);
  assert.equal(outgoing[0].input, "https://api.cloudflare.com/client/v4/graphql");
  assert.equal(outgoing[0].init.headers.authorization, "Bearer read-only-test-token");
  const payload = await response.json();
  const cloudflare = payload.sources.find((source) => source.id === "cloudflare");
  assert.equal(cloudflare.state, "healthy");
  assert.equal(cloudflare.metrics.length, 7);
  assert.equal(cloudflare.diagnostics, undefined);
  // The dashboard snapshot starts before the provider query; separate reads
  // need not occur in the same millisecond. The provider timestamp must match
  // its requested aggregation window and both must belong to this request.
  const providerWindow = JSON.parse(outgoing[0].init.body).variables;
  assert.equal(cloudflare.observedAt, providerWindow.end);
  assert.ok(Date.parse(payload.updatedAt) >= requestStartedAt);
  assert.ok(Date.parse(payload.updatedAt) <= Date.parse(cloudflare.observedAt));
  assert.ok(Date.parse(cloudflare.observedAt) <= requestFinishedAt);
  assert.equal(cloudflare.metrics.find((metric) => metric.id === "cloudflare-edge-requests-24h").value, 42);
  assert.equal(cloudflare.metrics.find((metric) => metric.id === "cloudflare-edge-data-transfer-24h").format, "bytes");
  assert.doesNotMatch(JSON.stringify(payload), /read-only-test-token/u);
});

test("owner platform status projects safe per-scope Cloudflare diagnostics", async (t) => {
  const { env } = await platformEnv(t);
  Object.assign(env, {
    CLOUDFLARE_ANALYTICS_API_TOKEN: "read-only-test-token",
    CLOUDFLARE_ANALYTICS_ACCOUNT_ID: "a".repeat(32),
    CLOUDFLARE_ANALYTICS_ZONE_ID: "b".repeat(32),
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const zone = "zoneTag" in JSON.parse(init.body).variables;
    return new Response(JSON.stringify({ errors: [{ message: "private-provider-detail" }] }), { status: zone ? 401 : 429 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await adminPlatformStatus(request(), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  const cloudflare = payload.sources.find((source) => source.id === "cloudflare");
  assert.equal(cloudflare.state, "unavailable");
  assert.deepEqual(cloudflare.metrics, []);
  assert.deepEqual(cloudflare.diagnostics, { zone: "authentication_failed", workers: "rate_limited" });
  assert.doesNotMatch(JSON.stringify(payload), /private-provider-detail|read-only-test-token/u);
});

test("platform status is owner-only through the public dispatcher", async (t) => {
  const cases = [
    { role: "ADMIN", expectedStatus: 403, expectedCode: "OWNER_REQUIRED" },
    { role: "USER", expectedStatus: 403, expectedCode: "ADMIN_REQUIRED" },
  ];
  for (const { role, expectedStatus, expectedCode } of cases) {
    const { env } = await platformEnv(t, { role });
    const response = await handler.fetch(request("/api/admin/platform-status", { origin: "https://riddlearabia.com" }), env);
    assert.equal(response.status, expectedStatus);
    assert.equal((await response.json()).code, expectedCode);
  }

  const { env } = await platformEnv(t);
  const anonymous = await handler.fetch(new Request("https://api.riddlearabia.com/api/admin/platform-status"), env);
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).code, "UNAUTHORIZED");
  const crossOrigin = await handler.fetch(request("/api/admin/platform-status", { origin: "https://untrusted.example" }), env);
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).code, "ORIGIN_NOT_ALLOWED");
});
