import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, randomToken, sha256, verifyPassword } from "../dist/security.js";

test("password hashing verifies only the correct password", async () => {
  const record = await hashPassword(
    "correct horse battery staple",
    "pepper-that-is-long-enough-for-tests",
    undefined,
    1_000,
  );
  assert.equal(record.hash.includes("correct horse"), false);
  assert.equal(await verifyPassword(
    "correct horse battery staple",
    "pepper-that-is-long-enough-for-tests",
    record.hash,
    record.salt,
    record.iterations,
  ), true);
  assert.equal(await verifyPassword(
    "wrong password",
    "pepper-that-is-long-enough-for-tests",
    record.hash,
    record.salt,
    record.iterations,
  ), false);
});

test("opaque tokens are unique and hash deterministically", async () => {
  const first = randomToken();
  const second = randomToken();
  assert.notEqual(first, second);
  assert.doesNotMatch(first, /[+/=]/u);
  assert.equal(await sha256(first), await sha256(first));
});
