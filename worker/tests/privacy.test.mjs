import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  cleanupPrivacyRetentionState,
  deleteAccount,
  exportAccountData,
  getPrivacyPreferences,
  updatePrivacyPreferences,
} from "../dist/privacy.js";
import { analytics } from "../dist/routes.js";

const SESSION_TOKEN = "A".repeat(43);
const SESSION_ROW = {
  id: "user-1",
  username: "tester",
  email: "tester@example.com",
  avatar: "🧠",
  role: "USER",
  is_banned: 0,
  token_hash: "stored-session-token-hash",
};

function apiRequest(path, method = "GET", body) {
  return new Request(`https://api.jakh.net${path}`, {
    method,
    headers: {
      cookie: `__Host-jakh_session=${SESSION_TOKEN}`,
      "cf-connecting-ip": "203.0.113.40",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function hasherBinding(valid = true, onFetch = () => {}) {
  return {
    idFromName(name) {
      return name;
    },
    get() {
      return {
        async fetch(request) {
          onFetch(request);
          return new Response(JSON.stringify({ valid }), {
            headers: { "content-type": "application/json" },
          });
        },
      };
    },
  };
}

function exportEnv() {
  const statements = [];
  return {
    PASSWORD_PEPPER: "password-pepper-longer-than-24-characters",
    IP_HASH_SALT: "ip-hash-salt-longer-than-24-characters",
    PASSWORD_HASHERS: hasherBinding(),
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
            if (sql.includes("JOIN users")) return SESSION_ROW;
            if (sql.includes("INSERT INTO rate_limits")) return { count: 1 };
            if (sql.includes("SELECT id, username, email, avatar")) {
              return {
                id: "user-1",
                username: "tester",
                email: "tester@example.com",
                avatar: "🧠",
                role: "USER",
                streak_freeze_count: 1,
                streak_freeze_highest: 8,
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-07-01T00:00:00.000Z",
                last_login_at: "2026-07-30T10:00:00.000Z",
                password_hash: "must-never-be-exported",
              };
            }
            if (sql.includes("FROM privacy_preferences")) {
              return {
                usage_analytics_enabled: 1,
                notice_version: "2026-07-31",
                consent_updated_at: "2026-07-20T00:00:00.000Z",
              };
            }
            return null;
          },
          async all() {
            if (sql.includes("FROM progress")) {
              return {
                results: [{
                  cardId: "currencies-1",
                  categoryId: "currencies",
                  status: "easy",
                }],
              };
            }
            if (sql.includes("FROM favorites")) {
              return {
                results: [{
                  cardId: "currencies-2",
                  categoryId: "currencies",
                }],
              };
            }
            if (sql.includes("FROM analytics_daily")) {
              return {
                results: [{
                  pageSlug: "currencies",
                  activityDate: "2026-07-20",
                  timeSpentSeconds: 60,
                }],
              };
            }
            if (sql.includes("FROM verified_score_sessions")) {
              return {
                results: [{
                  id: "verified-1",
                  categoryId: "currencies",
                  questionCount: 10,
                  status: "completed",
                  correctCount: 9,
                  score: 920,
                  elapsedMs: 18_000,
                  verified: 1,
                }],
              };
            }
            if (sql.includes("FROM suggestions")) {
              return {
                results: [{
                  id: "suggestion-1",
                  text: "Please add an astronomy challenge",
                  email: "tester@example.com",
                  status: "new",
                  createdAt: "2026-07-20T00:00:00.000Z",
                }],
              };
            }
            return { results: [] };
          },
          async run() {
            return { success: true };
          },
        };
        return statement;
      },
    },
    statements,
  };
}

test("account export contains useful account data but no credentials or sessions", async () => {
  const env = exportEnv();
  const response = await exportAccountData(
    apiRequest("/api/user/export"),
    env,
  );
  const payload = await response.json();
  const serialized = JSON.stringify(payload);

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-disposition"),
    /^attachment; filename="jakh-account-export-\d{4}-\d{2}-\d{2}\.json"$/u,
  );
  assert.equal(payload.account.username, "tester");
  assert.equal(payload.privacy.analytics, "allowed");
  assert.equal(payload.progress.length, 1);
  assert.equal(payload.favorites.length, 1);
  assert.equal(payload.usageAnalytics.length, 1);
  assert.equal(payload.verifiedScores.length, 1);
  assert.equal(payload.suggestions.length, 1);
  assert.doesNotMatch(serialized, /must-never-be-exported/u);
  assert.doesNotMatch(serialized, /stored-session-token-hash/u);
  assert.doesNotMatch(serialized, /password_hash|password_salt|tokenHash|token_hash/u);
});

function deletionEnv(validPassword = true) {
  const captured = { batch: [], hasherCalls: 0 };
  const env = {
    PASSWORD_PEPPER: "password-pepper-longer-than-24-characters",
    IP_HASH_SALT: "ip-hash-salt-longer-than-24-characters",
    PASSWORD_HASHERS: hasherBinding(validPassword, () => {
      captured.hasherCalls += 1;
    }),
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
            if (sql.includes("JOIN users")) return SESSION_ROW;
            if (sql.includes("INSERT INTO rate_limits")) return { count: 1 };
            if (sql.includes("SELECT password_hash")) {
              return {
                password_hash: "B".repeat(43),
                password_salt: "C".repeat(22),
                password_iterations: 100_000,
              };
            }
            return null;
          },
          async run() {
            return { success: true };
          },
        };
      },
      async batch(statements) {
        captured.batch = statements;
        return statements.map(() => ({ success: true }));
      },
    },
  };
  return { env, captured };
}

test("permanent deletion requires the exact username and explicit acknowledgement", async () => {
  const { env, captured } = deletionEnv();
  await assert.rejects(
    deleteAccount(
      apiRequest("/api/user/account", "DELETE", {
        username: "Tester",
        currentPassword: "correct horse battery staple",
        confirmPermanentDeletion: true,
      }),
      env,
    ),
    (error) => error?.code === "ACCOUNT_DELETE_CONFIRMATION_REQUIRED",
  );
  assert.equal(captured.hasherCalls, 0);
  assert.equal(captured.batch.length, 0);
});

test("permanent deletion reauthenticates, deletes every account-owned table, and clears cookies", async () => {
  const { env, captured } = deletionEnv();
  const response = await deleteAccount(
    apiRequest("/api/user/account", "DELETE", {
      username: "tester",
      currentPassword: "correct horse battery staple",
      confirmPermanentDeletion: true,
    }),
    env,
  );
  const sql = captured.batch.map((statement) => statement.sql).join("\n");

  assert.equal(response.status, 200);
  assert.equal(captured.hasherCalls, 1);
  assert.equal(captured.batch.length, 8);
  for (const table of [
    "analytics_daily",
    "privacy_preferences",
    "verified_score_sessions",
    "suggestions",
    "favorites",
    "progress",
    "sessions",
    "users",
  ]) {
    assert.match(sql, new RegExp(`DELETE FROM ${table}`, "u"));
  }
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/u);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(
    payload.message,
    "Account and account-linked data permanently deleted",
  );
  assert.match(payload.deletedAt, /^\d{4}-\d{2}-\d{2}T/u);
});

function preferenceEnv(preference = null) {
  const captured = { batch: [] };
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
              if (sql.includes("JOIN users")) return SESSION_ROW;
              if (sql.includes("INSERT INTO rate_limits")) return { count: 1 };
              if (sql.includes("FROM privacy_preferences")) return preference;
              return null;
            },
            async run() {
              return { success: true };
            },
          };
        },
        async batch(statements) {
          captured.batch = statements;
          return statements.map(() => ({ success: true }));
        },
      },
    },
    captured,
  };
}

test("privacy preferences default to denied and accept only allowed or denied", async () => {
  const { env } = preferenceEnv();
  const getResponse = await getPrivacyPreferences(
    apiRequest("/api/user/privacy"),
    env,
  );
  assert.deepEqual(await getResponse.json(), {
    privacy: {
      analytics: "denied",
      usageAnalyticsEnabled: false,
      noticeVersion: "2026-07-31",
      consentUpdatedAt: null,
      needsRenewal: false,
    },
  });

  await assert.rejects(
    updatePrivacyPreferences(
      apiRequest("/api/user/privacy", "PUT", { analytics: "sometimes" }),
      env,
    ),
    (error) => error?.code === "PRIVACY_PREFERENCE_INVALID",
  );
});

test("denying analytics erases existing account usage analytics", async () => {
  const { env, captured } = preferenceEnv();
  const response = await updatePrivacyPreferences(
    apiRequest("/api/user/privacy", "PUT", { analytics: "denied" }),
    env,
  );
  const payload = await response.json();

  assert.equal(captured.batch.length, 2);
  assert.match(captured.batch[0].sql, /INSERT INTO privacy_preferences/u);
  assert.match(captured.batch[1].sql, /DELETE FROM analytics_daily/u);
  assert.equal(payload.privacy.analytics, "denied");
  assert.equal(payload.existingUsageAnalyticsDeleted, true);
});

test("analytics consent from an older privacy notice is denied until renewed", async () => {
  const stalePreference = {
    usage_analytics_enabled: 1,
    notice_version: "2025-01-01",
    consent_updated_at: "2025-01-01T00:00:00.000Z",
  };
  const { env } = preferenceEnv(stalePreference);
  const response = await getPrivacyPreferences(
    apiRequest("/api/user/privacy"),
    env,
  );
  assert.deepEqual((await response.json()).privacy, {
    analytics: "denied",
    usageAnalyticsEnabled: false,
    noticeVersion: "2026-07-31",
    consentUpdatedAt: "2025-01-01T00:00:00.000Z",
    needsRenewal: true,
  });
});

test("account time analytics use one consent-guarded atomic write", async () => {
  for (const allowed of [false, true]) {
    const analyticsStatements = [];
    const env = {
      IP_HASH_SALT: "ip-hash-salt-longer-than-24-characters",
      DB: {
        prepare(sql) {
          return {
            bind(...values) {
              this.values = values;
              return this;
            },
            async first() {
              if (sql.includes("JOIN users")) return SESSION_ROW;
              if (sql.includes("INSERT INTO rate_limits")) return { count: 1 };
              if (sql.includes("INSERT INTO analytics_daily")) {
                analyticsStatements.push({ sql, values: this.values });
                return allowed ? { user_id: "user-1" } : null;
              }
              return null;
            },
            async run() { return { success: true }; },
          };
        },
      },
    };
    const response = await analytics(
      apiRequest("/api/analytics/time", "POST", {
        pageSlug: "currencies",
        timeSpent: 30,
      }),
      env,
    );

    assert.deepEqual(await response.json(), {
      success: true,
      recorded: allowed,
    });
    assert.equal(analyticsStatements.length, 1);
    assert.match(analyticsStatements[0].sql, /WHERE EXISTS[\s\S]+usage_analytics_enabled = 1/u);
    assert.match(analyticsStatements[0].sql, /notice_version = \?/u);
    assert.equal(analyticsStatements[0].values.at(-1), "2026-07-31");
  }
});

test("retention cleanup is bounded and enforces 13-month analytics and 12-month suggestion limits", async () => {
  const captured = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            captured.push({ sql, values });
            return this;
          },
        };
      },
      async batch(statements) {
        assert.equal(statements.length, 3);
        return statements.map(() => ({ success: true }));
      },
    },
  };

  await cleanupPrivacyRetentionState(env);

  assert.equal(captured.length, 3);
  assert.ok(captured.every(({ sql }) => /LIMIT 500/u.test(sql)));
  assert.match(captured[0].sql, /DELETE FROM analytics_daily/u);
  assert.match(captured[1].sql, /SET ip_hash = NULL/u);
  assert.match(captured[2].sql, /DELETE FROM suggestions/u);
  const now = Date.now();
  const analyticsAgeDays = (now - Date.parse(`${captured[0].values[0]}T00:00:00.000Z`))
    / (24 * 60 * 60 * 1_000);
  const suggestionAgeDays = (now - Date.parse(captured[2].values[0]))
    / (24 * 60 * 60 * 1_000);
  assert.ok(analyticsAgeDays > 390 && analyticsAgeDays < 410);
  assert.ok(suggestionAgeDays > 360 && suggestionAgeDays < 380);
});

test("privacy migration uses cascade deletion and advances the schema", async () => {
  const migration = await readFile(
    new URL("../migrations/0002_privacy_preferences.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /REFERENCES users\(id\) ON DELETE CASCADE/u);
  assert.match(migration, /CHECK \(usage_analytics_enabled IN \(0, 1\)\)/u);
  assert.match(migration, /analytics_daily_activity_date_idx/u);
  assert.match(migration, /DELETE FROM analytics_daily/u);
  assert.match(migration, /CREATE TRIGGER IF NOT EXISTS analytics_daily_requires_current_consent/u);
  assert.match(migration, /usage_analytics_enabled = 1/u);
  assert.match(migration, /notice_version = '2026-07-31'/u);
  assert.match(migration, /ALTER TABLE suggestions/u);
  assert.match(migration, /suggestions_user_id_idx/u);
  assert.match(migration, /PRAGMA optimize/u);
  assert.match(migration, /VALUES \('schema_version', '2'\)/u);
});
