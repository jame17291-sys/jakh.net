import assert from "node:assert/strict";
import test from "node:test";
import {
  hashPasswordInHasher,
  PasswordHasher,
  verifyPasswordInHasher,
} from "../dist/password-hasher.js";

function localBinding(pepper) {
  const hasher = new PasswordHasher({}, { PASSWORD_PEPPER: pepper });
  const stub = { fetch: (request) => hasher.fetch(request) };
  return {
    PASSWORD_HASHERS: {
      idFromName: (name) => name,
      get: () => stub,
    },
  };
}

test("password hashing helpers execute through the Durable Object", async () => {
  const env = localBinding("pepper-that-is-long-enough-for-tests");
  const record = await hashPasswordInHasher(env, "correct horse battery staple");

  assert.equal(record.iterations, 100_000);
  assert.equal(
    await verifyPasswordInHasher(
      env,
      "correct horse battery staple",
      record.hash,
      record.salt,
      record.iterations,
    ),
    true,
  );
  assert.equal(
    await verifyPasswordInHasher(
      env,
      "wrong password",
      record.hash,
      record.salt,
      record.iterations,
    ),
    false,
  );
});

test("phase A can read the future 600,000-iteration format without writing it by default", async () => {
  const env = localBinding("pepper-that-is-long-enough-for-tests");
  const record = await hashPasswordInHasher(
    env,
    "correct horse battery staple",
    undefined,
    600_000,
  );

  assert.equal(record.iterations, 600_000);
  assert.equal(
    await verifyPasswordInHasher(
      env,
      "correct horse battery staple",
      record.hash,
      record.salt,
      record.iterations,
    ),
    true,
  );
});

test("password hasher rejects unsupported work factors", async () => {
  const env = localBinding("pepper-that-is-long-enough-for-tests");

  await assert.rejects(
    hashPasswordInHasher(env, "correct horse battery staple", undefined, 1_000_000),
    /status 400/u,
  );
});
