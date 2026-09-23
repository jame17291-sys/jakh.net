import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";
import { createAppJwt, mintAutopilotAppToken } from "./autopilot-github-app.mjs";

const NOW = Date.parse("2026-09-23T03:23:00Z");
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" });
const ENV = { AUTOPILOT_GITHUB_APP_ID: "12345", AUTOPILOT_GITHUB_APP_INSTALLATION_ID: "23456", AUTOPILOT_GITHUB_APP_PRIVATE_KEY: PEM };
const TOKEN = `ghs_12345_${"signed.opaque.jwt".repeat(100)}`;
const PERMISSIONS = { contents: "write", pull_requests: "write", metadata: "read" };
const INSTALLATION = { id: 23456, app_id: 12345, account: { id: 281123018 }, repository_selection: "selected", suspended_at: null, permissions: PERMISSIONS };
const REPO = { id: 1227088138, full_name: "jame17291-sys/jakh.net", owner: { id: 281123018 }, private: false };
const MINT = { token: TOKEN, expires_at: new Date(NOW + 3600000).toISOString(), permissions: PERMISSIONS, repository_selection: "selected", repositories: [REPO] };
const response = (value, status = 200, headers = {}) => new Response(value === null ? null : JSON.stringify(value), { status, headers });
function mock({ installation = INSTALLATION, mint = MINT, revokeStatus = 204, fetchError } = {}) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (fetchError) throw fetchError;
    if (url === "https://api.github.com/app/installations/23456" && options.method === "GET") return response(installation);
    if (url === "https://api.github.com/app/installations/23456/access_tokens" && options.method === "POST") return response(mint, 201);
    if (url === "https://api.github.com/installation/token" && options.method === "DELETE") return response(null, revokeStatus);
    throw new Error("Unexpected mock route");
  };
  return { requests, fetchImpl };
}
function mint(options = {}) { return mintAutopilotAppToken({ env: ENV, now: () => NOW, ...options }); }

test("App JWT uses actual RSA SHA256 with fixed ten-minute lifetime and clock backdating", () => {
  const jwt = createAppJwt({ appId: ENV.AUTOPILOT_GITHUB_APP_ID, privateKey: PEM, now: () => NOW });
  const [header, claims, signature] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(claims, "base64url").toString()), { iss: "12345", iat: NOW / 1000 - 60, exp: NOW / 1000 + 540 });
  assert.equal(verify("RSA-SHA256", Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, "base64url")), true);
});

test("invalid config, traversal IDs, weak/non-RSA keys and crypto errors fail before network without echoing secrets", async () => {
  let requests = 0;
  const fetchImpl = async () => { requests++; throw new Error("unexpected"); };
  for (const key of ["AUTOPILOT_GITHUB_APP_ID", "AUTOPILOT_GITHUB_APP_INSTALLATION_ID"]) {
    for (const value of [undefined, "", "0", "-1", "1/evil", "001", "9007199254740993", 12345]) {
      await assert.rejects(mint({ env: { ...ENV, [key]: value }, fetchImpl }), /valid.*ID/u);
    }
  }
  const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" });
  const weak = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" });
  for (const privateKey of ["super-secret-not-a-key", ec, weak, "x".repeat(33000)]) {
    await assert.rejects(mint({ env: { ...ENV, AUTOPILOT_GITHUB_APP_PRIVATE_KEY: privateKey }, fetchImpl }), (error) => /RSA GitHub App/u.test(error.message) && !error.message.includes("super-secret"));
  }
  assert.equal(requests, 0);
});

test("installation token request grants exactly one repository and two write permissions, supports long opaque tokens, and revokes once", async () => {
  const setup = mock();
  const session = await mint(setup);
  assert.equal(session.token, TOKEN);
  assert.equal(session.expiresAt, MINT.expires_at);
  assert.equal(JSON.stringify(session).includes(TOKEN), false);
  assert.equal(Object.keys(session).includes("token"), false);
  assert.equal(setup.requests.length, 2);
  assert.deepEqual(JSON.parse(setup.requests[1].options.body), { repository_ids: [1227088138], permissions: { contents: "write", pull_requests: "write" } });
  assert.equal(setup.requests[0].options.headers.authorization, setup.requests[1].options.headers.authorization);
  assert.ok(setup.requests[0].options.headers.authorization.startsWith("Bearer ey"));
  for (const request of setup.requests) assert.equal(request.options.redirect, "error");
  await Promise.all([session.revoke(), session.revoke()]);
  await session.revoke();
  assert.equal(setup.requests.length, 3);
  assert.equal(setup.requests[2].options.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(setup.requests[2].url, "https://api.github.com/installation/token");
});

test("wrong installation, App, owner, suspension, all-repository install, or excessive App permission never mints", async () => {
  for (const patch of [{ id: 1 }, { app_id: 1 }, { account: { id: 1 } }, { suspended_at: "2026-01-01" }, { suspended_at: undefined }, { repository_selection: "all" },
    { permissions: { ...PERMISSIONS, administration: "write" } }, { permissions: { ...PERMISSIONS, actions: "write" } },
    { permissions: { ...PERMISSIONS, contents: "read" } }, { permissions: { ...PERMISSIONS, metadata: "write" } }]) {
    const setup = mock({ installation: { ...INSTALLATION, ...patch } });
    await assert.rejects(mint(setup), /installation must/u);
    assert.equal(setup.requests.length, 1);
  }
});

test("invalid token scope or expiry is revoked before rejecting, including missing repository proof", async () => {
  for (const patch of [{ repositories: [] }, { repositories: undefined }, { repositories: [REPO, REPO] }, { repositories: [{ ...REPO, id: 1 }] },
    { repositories: [{ ...REPO, full_name: "someone/fork" }] }, { repositories: [{ ...REPO, owner: { id: 1 } }] }, { repositories: [{ ...REPO, private: true }] },
    { permissions: { ...PERMISSIONS, issues: "write" } }, { permissions: { ...PERMISSIONS, contents: "read" } }, { repository_selection: "all" },
    { expires_at: "bad" }, { expires_at: new Date(NOW + 60000).toISOString() }, { expires_at: new Date(NOW + 3700000).toISOString() }]) {
    const setup = mock({ mint: { ...MINT, ...patch } });
    await assert.rejects(mint(setup), /short lived.*public website repository/u);
    assert.equal(setup.requests.at(-1).options.method, "DELETE");
    assert.equal(setup.requests.length, 3);
  }
});

test("unsafe/missing opaque credentials are never placed into request headers", async () => {
  for (const token of [null, "", "short", "valid-sized-but\r\nheader-injection", "x".repeat(20001)]) {
    const setup = mock({ mint: { ...MINT, token } });
    await assert.rejects(mint(setup), /invalid installation credential/u);
    assert.equal(setup.requests.length, 2);
  }
});

test("HTTP, network and malformed JSON failures never expose key, JWT, response body or credential", async () => {
  const failures = [
    async () => { throw new Error(TOKEN); },
    async () => response({ secret: TOKEN }, 403),
    async () => new Response(`not-json-${TOKEN}`),
    async () => response({}, 200, { "content-length": "300000" }),
    async () => new Response("x".repeat(300000)),
    async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(TOKEN)); } })),
  ];
  for (const fetchImpl of failures) {
    await assert.rejects(mint({ fetchImpl }), error => !error.message.includes(TOKEN) && !error.message.includes(PEM) && !error.message.includes("eyJ"));
  }
});

test("failed revocation remains retryable; validation cleanup failure is explicit and secret-free", async () => {
  const setup = mock({ revokeStatus: 403 });
  const session = await mint(setup);
  await assert.rejects(session.revoke(), /HTTP 403/u);
  await assert.rejects(session.revoke(), /HTTP 403/u);
  assert.equal(setup.requests.filter(({ options }) => options.method === "DELETE").length, 2);
  const invalid = mock({ mint: { ...MINT, repositories: [] }, revokeStatus: 403 });
  await assert.rejects(mint(invalid), error => /credential cleanup failed/u.test(error.message) && !error.message.includes(TOKEN));
});
