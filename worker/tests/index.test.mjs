import assert from "node:assert/strict";
import test from "node:test";
import handler from "../dist/index.js";

function env(schema = "8") {
  return {
    PASSWORD_PEPPER: "password-pepper-longer-than-24-characters",
    IP_HASH_SALT: "ip-hash-salt-longer-than-24-characters",
    ALLOWED_ORIGINS: "https://jakh.net,https://www.jakh.net",
    BATTLE_ROOMS: {},
    PASSWORD_HASHERS: {},
    DB: {
      prepare(sql) {
        if (sql.includes("schema_meta")) {
          return {
            async first() {
              return { value: schema };
            },
          };
        }
        throw new Error("This request must not reach D1");
      },
      batch() {
        throw new Error("This request must not reach D1");
      },
    },
  };
}

async function featureUnavailable(path, method, schema) {
  const response = await handler.fetch(
    new Request(`https://api.jakh.net${path}`, {
      method,
      headers: {
        origin: "https://jakh.net",
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    }),
    env(schema),
    {},
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "300");
  assert.deepEqual(await response.json(), {
    error: "This account feature is temporarily unavailable during a database upgrade",
    code: "FEATURE_UNAVAILABLE",
  });
}

test("schema 6 gates table-dependent account features without breaking core routes", async () => {
  await featureUnavailable("/api/auth/register", "POST", "6");
  await featureUnavailable("/api/auth/recovery/reset", "POST", "6");
  await featureUnavailable("/api/auth/recovery/rotate", "POST", "6");
  await featureUnavailable("/api/user/account", "DELETE", "6");

  const profile = await handler.fetch(
    new Request("https://api.jakh.net/api/user/profile"),
    env("6"),
    {},
  );
  assert.equal(profile.status, 401);
  assert.equal((await profile.json()).code, "UNAUTHORIZED");
});

test("schema 7 keeps deletion gated while recovery routes reach normal authentication", async () => {
  await featureUnavailable("/api/user/account", "DELETE", "7");
  const recoveryRotation = await handler.fetch(
    new Request("https://api.jakh.net/api/auth/recovery/rotate", {
      method: "POST",
      headers: {
        origin: "https://jakh.net",
        "content-type": "application/json",
      },
      body: JSON.stringify({ password: "current-password-123" }),
    }),
    env("7"),
    {},
  );
  assert.equal(recoveryRotation.status, 401);
  assert.equal((await recoveryRotation.json()).code, "UNAUTHORIZED");
});

test("the session probe treats missing and malformed cookies as anonymous without touching D1", async () => {
  let databaseCalls = 0;
  const probeEnv = {
    ...env(),
    DB: {
      prepare() {
        databaseCalls += 1;
        throw new Error("anonymous probes must not reach D1");
      },
    },
  };
  for (const headers of [{}, { cookie: "__Host-jakh_session=invalid" }]) {
    const response = await handler.fetch(
      new Request("https://api.jakh.net/api/auth/session", { headers }),
      probeEnv,
      {},
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { authenticated: false });
  }
  assert.equal(databaseCalls, 0);
});

test("the session probe normalizes an unknown valid-looking token to anonymous", async () => {
  let databaseCalls = 0;
  const probeEnv = {
    ...env(),
    STATIC_ORIGIN: "https://jakh.net",
    DB: {
      prepare(sql) {
        databaseCalls += 1;
        assert.match(sql, /FROM sessions s[\s\S]+JOIN users/u);
        return {
          bind() { return this; },
          async first() { return null; },
          async run() { throw new Error("unknown sessions must not be deleted"); },
        };
      },
    },
  };
  const response = await handler.fetch(
    new Request("https://api.jakh.net/api/auth/session", {
      headers: { cookie: `__Host-jakh_session=${"B".repeat(43)}` },
    }),
    probeEnv,
    {},
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: false });
  assert.equal(databaseCalls, 1);
});

test("the session probe returns only a minimal non-secret authenticated identity", async () => {
  let databaseCalls = 0;
  const probeEnv = {
    ...env(),
    STATIC_ORIGIN: "https://jakh.net",
    DB: {
      prepare(sql) {
        databaseCalls += 1;
        assert.match(sql, /FROM sessions s[\s\S]+JOIN users/u);
        return {
          bind() { return this; },
          async first() {
            return {
              id: "user-1",
              username: "learner",
              email: "private@example.test",
              avatar: "🧠",
              role: "USER",
              is_banned: 0,
              token_hash: "secret-token-digest",
              sessionCreatedAt: "2026-08-01T00:00:00.000Z",
              adminLastActiveAt: null,
            };
          },
        };
      },
    },
  };
  const response = await handler.fetch(
    new Request("https://api.jakh.net/api/auth/session", {
      headers: { cookie: `__Host-jakh_session=${"A".repeat(43)}` },
    }),
    probeEnv,
    {},
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(databaseCalls, 1);
  assert.deepEqual(payload, {
    authenticated: true,
    user: {
      id: "user-1",
      username: "learner",
      avatar: "🧠",
      role: "USER",
    },
  });
  assert.doesNotMatch(JSON.stringify(payload), /private@example|secret-token/u);
});

test("GET cannot trigger the stateful streak route with or without Origin", async () => {
  for (const headers of [{}, { origin: "https://jakh.net" }]) {
    const response = await handler.fetch(
      new Request("https://api.jakh.net/api/user/streak", { headers }),
      env(),
      {},
    );

    assert.equal(response.status, 404);
  }
});

test("unsafe full-handler requests require an allowed Origin", async () => {
  const response = await handler.fetch(
    new Request("https://api.jakh.net/api/user/streak", { method: "POST" }),
    env(),
    {},
  );

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ORIGIN_NOT_ALLOWED");
});

test("authenticated recovery rotation is exposed only at the canonical auth route", async () => {
  const canonical = await handler.fetch(
    new Request("https://api.jakh.net/api/auth/recovery/rotate", {
      method: "POST",
      headers: {
        origin: "https://jakh.net",
        "content-type": "application/json",
      },
      body: JSON.stringify({ password: "current-password-123" }),
    }),
    env(),
    {},
  );
  assert.equal(canonical.status, 401);
  assert.equal((await canonical.json()).code, "UNAUTHORIZED");

  const obsolete = await handler.fetch(
    new Request("https://api.jakh.net/api/user/recovery-code", {
      method: "POST",
      headers: {
        origin: "https://jakh.net",
        "content-type": "application/json",
      },
      body: JSON.stringify({ currentPassword: "current-password-123" }),
    }),
    env(),
    {},
  );
  assert.equal(obsolete.status, 404);
});

test("server-checked scoring has a truthful canonical route and a legacy compatibility alias", async () => {
  for (const prefix of ["server-checked", "verified"]) {
    for (const operation of ["challenge", "submit"]) {
      const response = await handler.fetch(
        new Request(`https://api.jakh.net/api/scores/${prefix}/${operation}`, {
          method: "POST",
          headers: {
            origin: "https://jakh.net",
            "content-type": "application/json",
          },
          body: "{}",
        }),
        env(),
        {},
      );
      assert.equal(response.status, 401, `${prefix}/${operation}`);
      assert.equal((await response.json()).code, "UNAUTHORIZED");
    }
  }

  const canonicalDiscard = await handler.fetch(
    new Request("https://api.jakh.net/api/scores/server-checked/challenge", {
      method: "DELETE",
      headers: {
        origin: "https://jakh.net",
        "content-type": "application/json",
      },
      body: JSON.stringify({ categoryId: "currencies" }),
    }),
    env(),
    {},
  );
  assert.equal(canonicalDiscard.status, 401);
  assert.equal((await canonicalDiscard.json()).code, "UNAUTHORIZED");

  const legacyDiscard = await handler.fetch(
    new Request("https://api.jakh.net/api/scores/verified/challenge", {
      method: "DELETE",
      headers: {
        origin: "https://jakh.net",
        "content-type": "application/json",
      },
      body: JSON.stringify({ categoryId: "currencies" }),
    }),
    env(),
    {},
  );
  assert.equal(legacyDiscard.status, 404);
});

test("the full dispatcher applies authenticated CORS-safe canonical challenge discard", async () => {
  const statements = [];
  const discardEnv = {
    ...env(),
    STATIC_ORIGIN: "https://jakh.net",
    DB: {
      prepare(sql) {
        const statement = {
          sql,
          values: [],
          bind(...values) {
            this.values = values;
            statements.push(this);
            return this;
          },
          async first() {
            if (sql.includes("JOIN users")) {
              return {
                id: "user-1",
                username: "learner",
                email: null,
                avatar: "🧠",
                role: "USER",
                is_banned: 0,
                token_hash: "stored-token-hash",
                sessionCreatedAt: "2026-08-01T00:00:00.000Z",
                adminLastActiveAt: null,
              };
            }
            if (sql.includes("INSERT INTO rate_limits")) return { count: 1 };
            if (sql.includes("SET status = 'expired'") && sql.includes("RETURNING id")) {
              return { id: "challenge-id" };
            }
            return null;
          },
        };
        return statement;
      },
    },
  };

  const response = await handler.fetch(
    new Request("https://api.jakh.net/api/scores/server-checked/challenge", {
      method: "DELETE",
      headers: {
        origin: "https://jakh.net",
        "content-type": "application/json",
        cookie: `__Host-jakh_session=${"A".repeat(43)}`,
        "cf-connecting-ip": "203.0.113.7",
      },
      body: JSON.stringify({ categoryId: "currencies" }),
    }),
    discardEnv,
    {},
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { discarded: true });
  assert.equal(response.headers.get("access-control-allow-origin"), "https://jakh.net");
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  const discard = statements.find(({ sql }) => sql.includes("SET status = 'expired'"));
  assert.match(discard.sql, /user_id = \? AND category_id = \? AND status = 'pending'/u);
  assert.deepEqual(discard.values, ["user-1", "currencies"]);
});

test("scheduled dispatch keeps cleanup inside the event lifetime", async () => {
  const promises = [];
  const batchSizes = [];
  const cleanupEnv = {
    ...env(),
    DB: {
      prepare() {
        return {
          bind() {
            return this;
          },
        };
      },
      async batch(items) {
        batchSizes.push(items.length);
        return items.map(() => ({ success: true, meta: { changes: 0 } }));
      },
    },
  };

  await handler.scheduled(
    { scheduledTime: Date.now(), cron: "17 * * * *", noRetry() {} },
    cleanupEnv,
    { waitUntil(value) { promises.push(Promise.resolve(value)); } },
  );
  assert.equal(promises.length, 1);
  await Promise.all(promises);
  assert.deepEqual(batchSizes.sort(), [2, 2, 3]);
});

test("scheduled maintenance runs every job and attributes all failures", async (t) => {
  const promises = [];
  const invoked = [];
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  const cleanupEnv = {
    ...env(),
    DB: {
      prepare(sql) {
        return {
          sql,
          bind() { return this; },
        };
      },
      async batch(items) {
        const sql = items.map(({ sql }) => sql).join("\n");
        if (sql.includes("DELETE FROM sessions")) {
          invoked.push("security-state");
          throw new Error("security cleanup failed");
        }
        if (sql.includes("DELETE FROM analytics_daily")) {
          invoked.push("privacy-retention");
          return items.map(() => ({ success: true, meta: { changes: 0 } }));
        }
        if (sql.includes("verified_score_sessions")) {
          invoked.push("server-checked-challenges");
          throw new Error("challenge cleanup failed");
        }
        throw new Error("unexpected cleanup job");
      },
    },
  };

  const dispatch = handler.scheduled(
    { scheduledTime: Date.now(), cron: "17 * * * *", noRetry() {} },
    cleanupEnv,
    { waitUntil(value) { promises.push(Promise.resolve(value)); } },
  );

  const matchesFailure = (error) => (
    error?.code === "SCHEDULED_MAINTENANCE_FAILED"
    && error?.message
      === "SCHEDULED_MAINTENANCE_FAILED jobs=security-state,server-checked-challenges"
    && error?.failedJobs?.join(",") === "security-state,server-checked-challenges"
  );
  await assert.rejects(dispatch, matchesFailure);
  assert.equal(promises.length, 1);
  await assert.rejects(promises[0], matchesFailure);
  assert.deepEqual(invoked.sort(), [
    "privacy-retention",
    "security-state",
    "server-checked-challenges",
  ]);
  assert.deepEqual(logs.map(([, detail]) => detail.job), [
    "security-state",
    "server-checked-challenges",
  ]);
});
