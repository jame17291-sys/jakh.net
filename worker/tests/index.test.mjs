import assert from "node:assert/strict";
import test from "node:test";
import handler from "../dist/index.js";

function env() {
  return {
    PASSWORD_PEPPER: "password-pepper-longer-than-24-characters",
    IP_HASH_SALT: "ip-hash-salt-longer-than-24-characters",
    ALLOWED_ORIGINS: "https://jakh.net,https://www.jakh.net",
    BATTLE_ROOMS: {},
    PASSWORD_HASHERS: {},
    DB: {
      prepare() {
        throw new Error("This request must not reach D1");
      },
      batch() {
        throw new Error("This request must not reach D1");
      },
    },
  };
}

test("missing-origin GET cannot trigger the stateful streak route", async () => {
  const response = await handler.fetch(
    new Request("https://api.jakh.net/api/user/streak"),
    env(),
    {},
  );

  assert.equal(response.status, 404);
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

test("scheduled dispatch keeps cleanup inside the event lifetime", async () => {
  const promises = [];
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
        assert.equal(items.length, 2);
        return items.map(() => ({ success: true }));
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
});
