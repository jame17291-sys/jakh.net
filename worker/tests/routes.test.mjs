import assert from "node:assert/strict";
import test from "node:test";
import handler from "../dist/index.js";
import {
  PRODUCTION_QUARANTINE_MANIFEST_SHA256,
  QUARANTINED_CATEGORY_IDS,
} from "../dist/content-safety.js";
import {
  analytics,
  favorite,
  health,
  privacyRequest,
  profile,
  saveProgress,
  streak,
  suggestion,
  syncUserData,
} from "../dist/routes.js";
import { sha256 } from "../dist/security.js";

const EXPECTED_CONTENT_PUBLICATION = Object.freeze({
  state: "safety-quarantine-active",
  quarantinedCategories: [...QUARANTINED_CATEGORY_IDS],
  quarantinedQuestions: 278,
  publicQuestions: 3_275,
  manifestSha256: PRODUCTION_QUARANTINE_MANIFEST_SHA256,
});

function healthEnv(schemaVersion = "8") {
  return {
    CF_VERSION_METADATA: {
      id: "11111111-1111-4111-8111-111111111111",
      tag: "",
      timestamp: "2026-08-01T00:00:00.000Z",
    },
    PASSWORD_PEPPER: "password-pepper-longer-than-24-characters",
    IP_HASH_SALT: "ip-hash-salt-longer-than-24-characters",
    BATTLE_ROOMS: {},
    PASSWORD_HASHERS: {},
    DB: {
      prepare() {
        return {
          async first() {
            return { value: schemaVersion };
          },
        };
      },
    },
  };
}

test("health reports ready only when secrets, bindings, schema, and catalog exist", async () => {
  const response = await health(healthEnv());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "jakh-api",
    version: "1.4.0",
    workerVersionId: "11111111-1111-4111-8111-111111111111",
    schema: "8",
    targetSchema: "8",
    compatibleSchemas: ["6", "7", "8"],
    features: {
      registration: true,
      accountRecovery: true,
      accountDeletion: true,
    },
    contentPublication: EXPECTED_CONTENT_PUBLICATION,
  });
});

test("health honestly reports compatibility and feature readiness during phased migrations", async () => {
  const schema6 = await health(healthEnv("6"));
  assert.equal(schema6.status, 200);
  assert.deepEqual(await schema6.json(), {
    ok: true,
    service: "jakh-api",
    version: "1.4.0",
    workerVersionId: "11111111-1111-4111-8111-111111111111",
    schema: "6",
    targetSchema: "8",
    compatibleSchemas: ["6", "7", "8"],
    features: {
      registration: false,
      accountRecovery: false,
      accountDeletion: false,
    },
    contentPublication: EXPECTED_CONTENT_PUBLICATION,
  });

  const schema7 = await health(healthEnv("7"));
  assert.equal(schema7.status, 200);
  assert.deepEqual((await schema7.json()).features, {
    registration: true,
    accountRecovery: true,
    accountDeletion: false,
  });
});

test("health rejects unsupported schemas and incomplete security configuration", async () => {
  const stale = await health(healthEnv("0"));
  assert.equal(stale.status, 503);
  const stalePayload = await stale.json();
  assert.equal(stalePayload.schema, "0");
  assert.equal(stalePayload.targetSchema, "8");
  assert.deepEqual(stalePayload.compatibleSchemas, ["6", "7", "8"]);
  assert.deepEqual(stalePayload.features, {
    registration: false,
    accountRecovery: false,
    accountDeletion: false,
  });
  assert.deepEqual(stalePayload.contentPublication, EXPECTED_CONTENT_PUBLICATION);

  const incomplete = healthEnv();
  incomplete.PASSWORD_PEPPER = "";
  let databaseTouched = false;
  incomplete.DB.prepare = () => {
    databaseTouched = true;
    throw new Error("must not query an unconfigured deployment");
  };
  const response = await health(incomplete);
  assert.equal(response.status, 503);
  assert.equal(databaseTouched, false);
  assert.deepEqual((await response.json()).contentPublication, EXPECTED_CONTENT_PUBLICATION);
});

function syncEnv({
  favoriteRows = [],
  progressRows = [],
  streakDates = [],
  streakRecord = null,
} = {}) {
  const captured = { batch: [], firstSql: [], runSql: [], statements: [] };
  const DB = {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          captured.firstSql.push(sql);
          if (sql.includes("JOIN users")) {
            return {
              id: "user-1",
              username: "tester",
              email: null,
              avatar: "👤",
              role: "USER",
              is_banned: 0,
              token_hash: "stored-token-hash",
            };
          }
          if (sql.includes("INSERT INTO rate_limits")) return { count: 1 };
          if (sql.includes("SELECT streak_freeze_count")) return streakRecord;
          return null;
        },
        async run() {
          captured.runSql.push(sql);
          return { success: true };
        },
        async all() {
          if (sql.includes("SELECT DISTINCT substr(first_correct_at")) {
            return { results: streakDates };
          }
          if (sql.includes("FROM progress")) return { results: progressRows };
          if (sql.includes("FROM favorites")) return { results: favoriteRows };
          return { results: [] };
        },
      };
      captured.statements.push(statement);
      return statement;
    },
    async batch(statements) {
      captured.batch = statements;
      return statements.map(() => ({ success: true }));
    },
  };
  return {
    env: {
      ...healthEnv(),
      DB,
    },
    captured,
  };
}

function syncRequest(body) {
  return userRequest("/api/user/sync", body);
}

function userRequest(path, body, method = "POST") {
  return new Request(`https://api.jakh.net${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      cookie: `__Host-jakh_session=${"A".repeat(43)}`,
      "cf-connecting-ip": "203.0.113.20",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function heldProgress() {
  return {
    cardId: "medical-questions-001",
    categoryId: "medical-questions",
    status: "correct",
  };
}

test("profile filters held and category-mismatched pre-deployment rows", async () => {
  const { env } = syncEnv({
    progressRows: [
      { cardId: "currencies-1", categoryId: "currencies", status: "easy", createdAt: "public" },
      { ...heldProgress(), createdAt: "held" },
      { cardId: "medical-questions-001", categoryId: "science", status: "easy", createdAt: "mismatch" },
    ],
    favoriteRows: [
      { cardId: "currencies-2", categoryId: "currencies", createdAt: "public" },
      { cardId: "medical-questions-002", categoryId: "medical-questions", createdAt: "held" },
      { cardId: "pharm-001", categoryId: "science", createdAt: "mismatch" },
    ],
  });

  const response = await profile(userRequest("/api/user/profile", undefined, "GET"), env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload.progress.map(({ cardId }) => cardId), ["currencies-1"]);
  assert.deepEqual(payload.favorites.map(({ cardId }) => cardId), ["currencies-2"]);
  assert.deepEqual(payload.stats, { solvedCount: 1, favoritesCount: 1 });
  assert.doesNotMatch(JSON.stringify(payload), /medical-questions|pharm-001/u);
});

test("progress, favorites, bulk sync, and analytics deny held content before content writes", async () => {
  {
    const { env, captured } = syncEnv();
    await assert.rejects(
      saveProgress(userRequest("/api/user/progress", heldProgress()), env),
      (error) => error?.status === 503 && error?.code === "CATEGORY_QUARANTINED",
    );
    assert.equal(captured.runSql.some((sql) => sql.includes("INSERT INTO progress")), false);
  }

  {
    const { env, captured } = syncEnv();
    await assert.rejects(
      favorite(userRequest("/api/user/favorites", {
        cardId: "medical-questions-001",
        categoryId: "medical-questions",
        action: "add",
      }), env),
      (error) => error?.status === 503 && error?.code === "CATEGORY_QUARANTINED",
    );
    assert.equal(captured.runSql.some((sql) => sql.includes("INSERT INTO favorites")), false);
  }

  {
    const { env, captured } = syncEnv();
    await assert.rejects(
      syncUserData(syncRequest({ progress: [heldProgress()] }), env),
      (error) => error?.status === 503 && error?.code === "CATEGORY_QUARANTINED",
    );
    assert.equal(captured.batch.length, 0);
  }

  {
    const { env, captured } = syncEnv();
    await assert.rejects(
      analytics(userRequest("/api/analytics/time", {
        pageSlug: "medical-questions",
        timeSpent: 30,
      }), env),
      (error) => error?.status === 503 && error?.code === "CATEGORY_QUARANTINED",
    );
    assert.equal(captured.firstSql.some((sql) => sql.includes("INSERT INTO analytics_daily")), false);
  }
});

test("removal endpoints remain available so users can delete held references", async () => {
  const { env, captured } = syncEnv();
  const response = await favorite(userRequest("/api/user/favorites", {
    cardId: "medical-questions-001",
    action: "remove",
  }), env);

  assert.equal(response.status, 200);
  assert.equal(captured.runSql.some((sql) => sql.includes("DELETE FROM favorites")), true);
});

test("streak history excludes held categories while preserving earned freeze inventory", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const { env, captured } = syncEnv({
    streakDates: [{ activityDate: today }],
    streakRecord: { streak_freeze_count: 2, streak_freeze_highest: 14 },
  });

  const response = await streak(userRequest("/api/user/streak", undefined), env);
  const payload = await response.json();
  const historyQuery = captured.statements.find(({ sql }) => (
    sql.includes("SELECT DISTINCT substr(first_correct_at")
  ));

  assert.deepEqual(payload, { streak: 1, freezeCount: 2 });
  assert.match(historyQuery.sql, /category_id NOT IN \(\?, \?, \?, \?, \?\)/u);
  assert.deepEqual(historyQuery.values, ["user-1", ...QUARANTINED_CATEGORY_IDS]);
  assert.equal(captured.runSql.some((sql) => sql.includes("UPDATE users SET streak")), false);
});

test("bulk sync validates real cards and batches bounded writes", async () => {
  const { env, captured } = syncEnv();
  const response = await syncUserData(syncRequest({
    progress: [{
      cardId: "currencies-1",
      categoryId: "currencies",
      status: "correct",
    }],
    favorites: [{
      cardId: "currencies-2",
      categoryId: "currencies",
    }],
  }), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    progress: 1,
    favorites: 1,
  });
  assert.equal(captured.batch.length, 2);
  assert.equal(captured.batch[0].values[3], "easy");
});

test("bulk sync rejects forged scores before writing", async () => {
  const { env, captured } = syncEnv();
  await assert.rejects(
    syncUserData(syncRequest({
      progress: [{
        cardId: "currencies-1",
        categoryId: "currencies",
        status: "very-advanced",
      }],
    }), env),
    (error) => error?.status === 400,
  );
  assert.equal(captured.batch.length, 0);
});

function suggestionEnv(sessionExists = true) {
  const captured = { insert: null, sessionLookups: 0 };
  return {
    env: {
      IP_HASH_SALT: "ip-hash-salt-longer-than-24-characters",
      DB: {
        prepare(sql) {
          return {
            sql,
            values: [],
            bind(...values) {
              this.values = values;
              return this;
            },
            async first() {
              if (sql.includes("INSERT INTO rate_limits")) return { count: 1 };
              if (sql.includes("JOIN users")) {
                captured.sessionLookups += 1;
                return sessionExists ? {
                  id: "user-1",
                  username: "tester",
                  email: null,
                  avatar: "👤",
                  role: "USER",
                  is_banned: 0,
                  token_hash: "stored-token-hash",
                } : null;
              }
              return null;
            },
            async run() {
              if (sql.includes("INSERT INTO suggestions")) captured.insert = this.values;
              return { success: true };
            },
          };
        },
      },
    },
    captured,
  };
}

function suggestionRequest(saveWithAccount, includeCookie = true) {
  return new Request("https://api.jakh.net/api/suggestions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(includeCookie ? { cookie: `__Host-jakh_session=${"A".repeat(43)}` } : {}),
      "cf-connecting-ip": "203.0.113.30",
    },
    body: JSON.stringify({
      text: "Please add a new topic",
      saveWithAccount,
    }),
  });
}

test("suggestions link to an account only after explicit opt-in", async () => {
  for (const optedIn of [false, true]) {
    const { env, captured } = suggestionEnv();
    const response = await suggestion(suggestionRequest(optedIn), env);
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.deepEqual(payload, { success: true, savedWithAccount: optedIn });
    assert.equal(captured.sessionLookups, optedIn ? 1 : 0);
    assert.equal(captured.insert[1], optedIn ? "user-1" : null);
  }
});

test("account-linked suggestions require a current authenticated session", async () => {
  for (const scenario of [
    { includeCookie: false, sessionExists: true, expectedLookups: 0 },
    { includeCookie: true, sessionExists: false, expectedLookups: 1 },
  ]) {
    const { env, captured } = suggestionEnv(scenario.sessionExists);

    await assert.rejects(
      suggestion(suggestionRequest(true, scenario.includeCookie), env),
      (error) => error?.status === 401 && error?.code === "UNAUTHORIZED",
    );
    assert.equal(captured.sessionLookups, scenario.expectedLookups);
    assert.equal(captured.insert, null);
  }
});

function privacyRequestEnv(sessionExists = true, rateCount = 1) {
  const captured = {
    insert: null,
    rateLimitKey: null,
    sessionLookups: 0,
  };
  return {
    env: {
      PASSWORD_PEPPER: "password-pepper-longer-than-24-characters",
      IP_HASH_SALT: "ip-hash-salt-longer-than-24-characters",
      ALLOWED_ORIGINS: "https://jakh.net,https://www.jakh.net",
      STATIC_ORIGIN: "https://jakh.net",
      DB: {
        prepare(sql) {
          return {
            sql,
            values: [],
            bind(...values) {
              this.values = values;
              return this;
            },
            async first() {
              if (sql.includes("INSERT INTO rate_limits")) {
                captured.rateLimitKey = this.values[0];
                return { count: rateCount };
              }
              if (sql.includes("JOIN users")) {
                captured.sessionLookups += 1;
                return sessionExists ? {
                  id: "user-1",
                  username: "tester",
                  email: "account@example.com",
                  avatar: "👤",
                  role: "USER",
                  is_banned: 0,
                  token_hash: "stored-token-hash",
                } : null;
              }
              return null;
            },
            async run() {
              if (sql.includes("INSERT INTO suggestions")) captured.insert = this.values;
              return { success: true };
            },
          };
        },
      },
    },
    captured,
  };
}

function privacyRequestRequest(overrides = {}, includeCookie = false) {
  return new Request("https://api.jakh.net/api/privacy/requests", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://jakh.net",
      ...(includeCookie ? { cookie: `__Host-jakh_session=${"A".repeat(43)}` } : {}),
      "cf-connecting-ip": "203.0.113.40",
    },
    body: JSON.stringify({
      type: "access",
      text: "Please provide a copy of the data connected to me.",
      email: "  Person@Example.COM  ",
      saveWithAccount: false,
      ...overrides,
    }),
  });
}

test("privacy requests reject unsupported types and invalid bounded fields", async () => {
  for (const overrides of [
    { type: "delete" },
    { type: " ACCESS " },
    { text: "1234" },
    { text: "x".repeat(2_001) },
    { saveWithAccount: "false" },
    { saveWithAccount: undefined },
    { email: "not-an-email" },
  ]) {
    const { env, captured } = privacyRequestEnv();
    await assert.rejects(
      privacyRequest(privacyRequestRequest(overrides), env),
      (error) => error?.status === 400,
    );
    assert.equal(captured.insert, null);
  }
});

test("anonymous privacy requests are normalized, typed, and never inspect a session", async () => {
  const { env, captured } = privacyRequestEnv();
  const response = await privacyRequest(privacyRequestRequest({
    type: "correction",
    text: "  Please correct the email associated with my request.  ",
  }, true), env);
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(payload, {
    success: true,
    privacyRequest: {
      accepted: true,
      type: "correction",
      savedWithAccount: false,
    },
  });
  assert.equal(captured.sessionLookups, 0);
  assert.equal(captured.insert[1], null);
  assert.equal(
    captured.insert[2],
    "[JAKH_PRIVACY_REQUEST_V1:correction]\nPlease correct the email associated with my request.",
  );
  assert.equal(captured.insert[3], "person@example.com");
});

test("privacy requests link only after explicit opt-in with a valid session", async () => {
  const { env, captured } = privacyRequestEnv();
  const response = await privacyRequest(privacyRequestRequest({
    type: "deletion-help",
    saveWithAccount: true,
  }, true), env);

  assert.equal(response.status, 201);
  assert.equal(captured.sessionLookups, 1);
  assert.equal(captured.insert[1], "user-1");
  assert.deepEqual(await response.json(), {
    success: true,
    privacyRequest: {
      accepted: true,
      type: "deletion-help",
      savedWithAccount: true,
    },
  });
});

test("privacy request account linkage rejects missing and invalid sessions identically", async () => {
  for (const scenario of [
    { includeCookie: false, sessionExists: true, expectedLookups: 0 },
    { includeCookie: true, sessionExists: false, expectedLookups: 1 },
  ]) {
    const { env, captured } = privacyRequestEnv(scenario.sessionExists);
    await assert.rejects(
      privacyRequest(privacyRequestRequest({ saveWithAccount: true }, scenario.includeCookie), env),
      (error) => error?.status === 401
        && error?.code === "UNAUTHORIZED"
        && error?.message === "Unauthorized",
    );
    assert.equal(captured.sessionLookups, scenario.expectedLookups);
    assert.equal(captured.insert, null);
  }
});

test("privacy requests use a distinct rate namespace and return no submitted secrets", async () => {
  const { env, captured } = privacyRequestEnv();
  const submittedText = "Do not echo this private request text.";
  const submittedEmail = "private@example.com";
  const response = await privacyRequest(privacyRequestRequest({
    type: "objection",
    text: submittedText,
    email: submittedEmail,
    password: "must-not-be-processed",
    recoveryCode: "must-not-be-processed",
  }), env);
  const payloadText = JSON.stringify(await response.json());
  const expectedPrivacyKey = await sha256(
    `${env.IP_HASH_SALT}:privacy-request:203.0.113.40`,
  );
  const suggestionKey = await sha256(
    `${env.IP_HASH_SALT}:suggestion:203.0.113.40`,
  );

  assert.equal(captured.rateLimitKey, expectedPrivacyKey);
  assert.notEqual(captured.rateLimitKey, suggestionKey);
  assert.doesNotMatch(payloadText, /private@example\.com|private request text|password|recovery/iu);
  assert.equal(captured.insert.length, 6);
  assert.doesNotMatch(captured.insert.join("\n"), /must-not-be-processed/u);
});

test("privacy request rate limits use the privacy-specific failure path", async () => {
  const { env, captured } = privacyRequestEnv(true, 6);
  await assert.rejects(
    privacyRequest(privacyRequestRequest(), env),
    (error) => error?.status === 429 && error?.headers?.["retry-after"] === "3600",
  );
  assert.equal(captured.insert, null);
});

test("the Worker dispatcher exposes the dedicated privacy request route", async () => {
  const { env, captured } = privacyRequestEnv();
  const response = await handler.fetch(
    privacyRequestRequest({ type: "other", email: null }),
    env,
    {},
  );

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://jakh.net");
  assert.match(captured.insert[2], /^\[JAKH_PRIVACY_REQUEST_V1:other\]\n/u);
});
