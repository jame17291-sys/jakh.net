import assert from "node:assert/strict";
import test from "node:test";
import { health, syncUserData } from "../dist/routes.js";

function healthEnv(schemaVersion = "1") {
  return {
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
    version: "1.1.1",
    schema: "1",
  });
});

test("health rejects stale schemas and incomplete security configuration", async () => {
  const stale = await health(healthEnv("0"));
  assert.equal(stale.status, 503);

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
});

function syncEnv() {
  const captured = { batch: [] };
  const DB = {
    prepare(sql) {
      return {
        sql,
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
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
  return new Request("https://api.jakh.net/api/user/sync", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "__Host-jakh_session=test-session-token",
      "cf-connecting-ip": "203.0.113.20",
    },
    body: JSON.stringify(body),
  });
}

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
