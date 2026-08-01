import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupExpiredSecurityState,
  createSession,
  PRIVILEGED_SESSION_MAX_AGE_MS,
  sessionUser,
  touchPrivilegedSession,
} from "../dist/db.js";

test("invalid session tokens are rejected without touching D1", async () => {
  let databaseCalls = 0;
  const env = {
    DB: {
      prepare() {
        databaseCalls += 1;
        throw new Error("Invalid tokens must not reach D1");
      },
    },
  };
  const request = new Request("https://api.jakh.net/api/user/profile", {
    headers: { cookie: "__Host-jakh_session=invalid" },
  });

  assert.equal(await sessionUser(request, env), null);
  assert.equal(databaseCalls, 0);
});

test("unknown valid-looking sessions cause one read and no delete", async () => {
  const statements = [];
  const env = {
    DB: {
      prepare(sql) {
        statements.push(sql);
        return {
          bind() {
            return this;
          },
          async first() {
            return null;
          },
          async run() {
            throw new Error("Unknown sessions must not cause a delete");
          },
        };
      },
    },
  };
  const request = new Request("https://api.jakh.net/api/user/profile", {
    headers: { cookie: `__Host-jakh_session=${"A".repeat(43)}` },
  });

  assert.equal(await sessionUser(request, env), null);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /SELECT/u);
});

test("scheduled maintenance deletes expired rows in bounded batches", async () => {
  const statements = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            statements.push({ sql, values });
            return this;
          },
        };
      },
      async batch(items) {
        assert.equal(items.length, 2);
        return items.map(() => ({ success: true }));
      },
    },
  };

  await cleanupExpiredSecurityState(env);

  assert.equal(statements.length, 2);
  assert.ok(statements.every(({ sql }) => /LIMIT 500/u.test(sql)));
  assert.match(statements[0].sql, /DELETE FROM sessions/u);
  assert.match(statements[1].sql, /DELETE FROM rate_limits/u);
});

test("session pruning uses a stable newest-first tiebreaker", async () => {
  const statements = [];
  const env = {
    DB: {
      prepare(sql) {
        const statement = {
          sql,
          bind() {
            return this;
          },
        };
        statements.push(statement);
        return statement;
      },
      async batch(items) {
        assert.equal(items.length, 2);
        return items.map(() => ({ success: true }));
      },
    },
  };

  const token = await createSession(env, "user-1");

  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  assert.match(statements[1].sql, /ORDER BY created_at DESC, rowid DESC/u);
});

function privilegedUser(overrides = {}) {
  return {
    id: "owner-1",
    username: "owner",
    email: "owner@example.test",
    avatar: "👤",
    role: "OWNER",
    tokenHash: "stored-session-hash",
    sessionCreatedAt: new Date(Date.now() - 60_000).toISOString(),
    adminLastActiveAt: null,
    ...overrides,
  };
}

test("privileged activity is tracked separately from normal session activity", async () => {
  const statements = [];
  const env = {
    DB: {
      prepare(sql) {
        const statement = {
          sql,
          values: [],
          bind(...values) {
            this.values = values;
            return this;
          },
          async run() { return { success: true }; },
        };
        statements.push(statement);
        return statement;
      },
    },
  };

  await touchPrivilegedSession(env, privilegedUser());
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /UPDATE sessions SET admin_last_active_at/u);
  assert.equal(statements[0].values[1], "stored-session-hash");
});

test("expired privileged activity invalidates the underlying session and step-up", async () => {
  const batches = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          sql,
          bind(...values) {
            this.values = values;
            return this;
          },
        };
      },
      async batch(statements) {
        batches.push(statements);
        return statements.map(() => ({ success: true }));
      },
    },
  };
  const expired = privilegedUser({
    sessionCreatedAt: new Date(Date.now() - PRIVILEGED_SESSION_MAX_AGE_MS - 1).toISOString(),
  });

  await assert.rejects(
    touchPrivilegedSession(env, expired),
    (error) => error?.status === 401 && error?.code === "ADMIN_SESSION_EXPIRED",
  );
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 2);
  assert.match(batches[0][0].sql, /DELETE FROM admin_step_ups/u);
  assert.match(batches[0][1].sql, /DELETE FROM sessions/u);
});
