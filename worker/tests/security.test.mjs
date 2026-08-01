import assert from "node:assert/strict";
import test from "node:test";
import {
  clientIp,
  getSessionToken,
  hashPassword,
  normalizeLoginIdentifier,
  randomToken,
  sessionCookie,
  sha256,
  verifyPassword,
} from "../dist/security.js";

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

test("production sessions accept only a valid __Host token", () => {
  const token = "A".repeat(43);
  assert.equal(getSessionToken(new Request("https://api.jakh.net/api/user/profile", {
    headers: { cookie: `jakh_session=${token}` },
  })), null);
  assert.equal(getSessionToken(new Request("https://api.jakh.net/api/user/profile", {
    headers: { cookie: `__Host-jakh_session=${token}` },
  })), token);
  assert.equal(getSessionToken(new Request("https://api.jakh.net/api/user/profile", {
    headers: { cookie: "__Host-jakh_session=invalid" },
  })), null);
  assert.equal(getSessionToken(new Request("http://localhost:8787/api/user/profile", {
    headers: { cookie: `jakh_session=${token}` },
  })), token);
  assert.equal(getSessionToken(new Request("http://api.jakh.net/api/user/profile", {
    headers: { cookie: `jakh_session=${token}` },
  }), "http://127.0.0.1:8765"), token);
});

test("session cookies use strict first-party protections", () => {
  const cookie = sessionCookie(
    new Request("https://api.jakh.net/api/auth/login"),
    "A".repeat(43),
  );
  assert.match(cookie, /^__Host-jakh_session=/u);
  assert.match(cookie, /; HttpOnly;/u);
  assert.match(cookie, /; Secure;/u);
  assert.match(cookie, /; SameSite=Strict;/u);
  assert.match(cookie, /; Priority=High;/u);
});

test("login accepts a canonical username or email without weakening registration rules", () => {
  assert.deepEqual(normalizeLoginIdentifier("Jameel"), {
    column: "username_key",
    value: "jameel",
  });
  assert.deepEqual(normalizeLoginIdentifier(" Jame17291@Gmail.com "), {
    column: "email",
    value: "jame17291@gmail.com",
  });
  assert.throws(
    () => normalizeLoginIdentifier("not an email@example"),
    (error) => error?.status === 400 && error?.code === "INVALID_EMAIL",
  );
});

test("IPv6 clients share a canonical /64 rate-limit network", () => {
  const first = clientIp(new Request("https://api.jakh.net", {
    headers: { "cf-connecting-ip": "2001:db8:abcd:1234::1" },
  }));
  const second = clientIp(new Request("https://api.jakh.net", {
    headers: { "cf-connecting-ip": "2001:0DB8:ABCD:1234:ffff::9" },
  }));
  assert.equal(first, "2001:0db8:abcd:1234::/64");
  assert.equal(second, first);
  assert.equal(clientIp(new Request("https://api.jakh.net", {
    headers: { "cf-connecting-ip": "203.0.113.8" },
  })), "203.0.113.8");
  assert.equal(clientIp(new Request("https://api.jakh.net", {
    headers: { "cf-connecting-ip": "::ffff:203.0.113.8" },
  })), "203.0.113.8");
  assert.equal(clientIp(new Request("https://api.jakh.net", {
    headers: { "cf-connecting-ip": "2001:db8:abcd:1234::192.0.2.1" },
  })), "2001:0db8:abcd:1234::/64");
});
