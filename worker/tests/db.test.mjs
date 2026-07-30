import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupExpiredSecurityState,
  createSession,
  sessionUser,
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
