import assert from "node:assert/strict";
import test from "node:test";
import { verifyDomainControls } from "./verify-domain-controls.mjs";

const domain = "example.test";
const VALID_RSA_2048_SPKI = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw6FvTq9jCYO/7saXyJrTqtLL+bBBiKvkTenIM74g+S257bWzpAQG2jhKsEB5ME6TOAtBGu7WjagTCDeZV3m+bspzdLyP6CXU7jl5ur3MY9PBLN4fnS8hj7vbtojTX69QSsk3aZF5ay5DTMO05QABv8VUTaIp6xvvPZyqn3VS+tI7QdKu6qqoNJPZVLsU3QpD4Bk45Wm8D35psuumDzuHdbOjrCJS2pB0oTkkSyKpY2ksXW0Aneyrh0nnbESlOD3KepIbAPk0d2iOO+DNodQOWmTvHDX7eeVpK98H2H0A0pQPvRnIlMVdGHgkgYLhNqoIYsouc0xF5IzvLyMw8j+M5QIDAQAB";
const WEAK_RSA_1024_SPKI = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQChxy3ibuzakq2AOmtCad5j4AJ7Z6r48qGiqxJVzSnVMdLZY9Qk6qsk3Zb/bPNl/2fSVMEBlmzW9wEesqDGKJJrHnUk726rFBefohpFSIsTz4xiOjB4V87M0I8mxau28uoiaSzRvXFL+xBmq0SmDaBEVOnNYP1X0hVki5C5cyuuxwIDAQAB";
const VALID_ED25519_SPKI = "MCowBQYDK2VwAyEAfBvWIyEnQTqUcZ9nU8z/LWqFCGY/TlJkLOU0yxKMh5U=";

function dnsFixture(overrides = {}) {
  const records = new Map([
    [`${domain}|DS`, { authenticated: true, answers: [{ data: "12345 13 2 ABCD", type: 43 }] }],
    [`${domain}|DNSKEY`, { authenticated: true, answers: [{ data: "257 3 13 KEY", type: 48 }] }],
    [`${domain}|CAA`, { authenticated: true, answers: [{ data: '0 issue "letsencrypt.org"', type: 257 }] }],
    [`${domain}|MX`, { authenticated: true, answers: [{ data: "10 mx.example.test.", type: 15 }] }],
    [`${domain}|TXT`, { authenticated: true, answers: [{ data: '"v=spf1 include:_spf.example.test -all"', type: 16 }] }],
    [`_dmarc.${domain}|TXT`, { authenticated: true, answers: [{ data: '"v=DMARC1; p=reject; adkim=s; aspf=s"', type: 16 }] }],
    [`_mta-sts.${domain}|TXT`, { authenticated: true, answers: [{ data: '"v=STSv1; id=20260801"', type: 16 }] }],
    [`_smtp._tls.${domain}|TXT`, { authenticated: true, answers: [{ data: '"v=TLSRPTv1; rua=mailto:tls@example.test"', type: 16 }] }],
    [`google._domainkey.${domain}|TXT`, { authenticated: true, answers: [{ data: `"v=DKIM1; k=rsa; p=${VALID_RSA_2048_SPKI}"`, type: 16 }] }],
  ]);
  for (const host of [domain, `www.${domain}`, `api.${domain}`]) {
    records.set(`${host}|A`, { authenticated: true, answers: [{ data: "192.0.2.10", type: 1 }] });
    records.set(`${host}|AAAA`, { authenticated: true, answers: [{ data: "2001:db8::10", type: 28 }] });
    records.set(`${host}|CNAME`, { authenticated: true, answers: [] });
  }
  for (const [key, value] of Object.entries(overrides)) records.set(key, value);
  return async (name, type) => records.get(`${name}|${type}`) || { authenticated: true, answers: [] };
}

function webFixture(url, init = {}) {
  const parsed = new URL(url);
  if (parsed.hostname === `mta-sts.${domain}`) {
    return Promise.resolve(new Response(
      "version: STSv1\nmode: enforce\nmx: mx.example.test\nmax_age: 604800\n",
      { status: 200, headers: { "content-type": "text/plain" } },
    ));
  }
  if (parsed.hostname === `www.${domain}`) {
    return Promise.resolve(new Response(null, {
      status: 301,
      headers: { location: `https://${domain}/` },
    }));
  }
  if (parsed.hostname === `api.${domain}`) {
    return Promise.resolve(new Response(JSON.stringify({ ok: true, service: "jakh-api" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
  }
  assert.equal(init.method, "HEAD");
  return Promise.resolve(new Response(null, { status: 200 }));
}

test("strict domain policy passes only with complete explicit DNS, mail, IPv6, and routing evidence", async () => {
  const result = await verifyDomainControls({
    domain,
    strict: true,
    dkimSelectors: ["google"],
    dnsQuery: dnsFixture(),
    fetchImpl: webFixture,
  });
  assert.equal(result.passed, true);
  assert.deepEqual(result.failedChecks, []);
  assert.deepEqual(result.warnings, []);
  assert.ok(result.checks.every(({ status }) => status === "pass"));
});

test("strict mode fails missing hardening and never guesses a DKIM selector", async () => {
  const empty = async () => ({ authenticated: false, answers: [] });
  const result = await verifyDomainControls({
    domain,
    strict: true,
    dkimSelectors: [],
    dnsQuery: empty,
    fetchImpl: webFixture,
  });
  assert.equal(result.passed, false);
  assert.ok(result.failedChecks.includes("DNSSEC delegation and validation"));
  assert.ok(result.failedChecks.includes("CAA issuance policy"));
  assert.ok(result.failedChecks.includes("explicit DKIM selector evidence"));
  assert.equal(result.checks.some(({ name }) => name.startsWith("DKIM selector ")), false);
});

test("an iodef-only CAA record is not mistaken for an issuance restriction", async () => {
  const fixture = dnsFixture({
    [`${domain}|CAA`]: {
      authenticated: true,
      answers: [{ data: '0 iodef "mailto:security@example.test"', type: 257 }],
    },
  });
  const result = await verifyDomainControls({
    domain,
    strict: true,
    dkimSelectors: ["google"],
    dnsQuery: fixture,
    fetchImpl: webFixture,
  });
  assert.ok(result.failedChecks.includes("CAA issuance policy"));
});

test("MTA-STS policy must cover every published MX host", async () => {
  const fixture = dnsFixture({
    [`${domain}|MX`]: {
      authenticated: true,
      answers: [{ data: "10 unlisted.example.test.", type: 15 }],
    },
  });
  const result = await verifyDomainControls({
    domain,
    strict: true,
    dkimSelectors: ["google"],
    dnsQuery: fixture,
    fetchImpl: webFixture,
  });
  assert.ok(result.failedChecks.includes("valid MTA-STS HTTPS policy"));
});

test("apex DKIM placement and duplicate SPF are baseline failures even outside strict mode", async () => {
  const fixture = dnsFixture({
    [`${domain}|TXT`]: {
      authenticated: true,
      answers: [
        { data: '"v=spf1 -all"', type: 16 },
        { data: '"v=spf1 ~all"', type: 16 },
        { data: '"v=DKIM1; p=MISPLACED"', type: 16 },
      ],
    },
  });
  const result = await verifyDomainControls({
    domain,
    strict: false,
    dkimSelectors: ["google"],
    dnsQuery: fixture,
    fetchImpl: webFixture,
  });
  assert.equal(result.passed, false);
  assert.ok(result.failedChecks.includes("single syntactically bounded SPF policy"));
  assert.ok(result.failedChecks.includes("DKIM is not published at the zone apex"));
});

test("DKIM rejects invalid base64 public-key material", async () => {
  const fixture = dnsFixture({
    [`google._domainkey.${domain}|TXT`]: {
      authenticated: true,
      answers: [{ data: '"v=DKIM1; k=rsa; p=%%%not-base64%%%"', type: 16 }],
    },
  });
  const result = await verifyDomainControls({
    domain,
    strict: true,
    dkimSelectors: ["google"],
    dnsQuery: fixture,
    fetchImpl: webFixture,
  });
  assert.ok(result.failedChecks.includes("DKIM selector google"));
  assert.match(
    result.checks.find(({ name }) => name === "DKIM selector google").detail,
    /not valid base64/u,
  );
});

test("DKIM rejects an RSA key below 2048 bits", async () => {
  const fixture = dnsFixture({
    [`google._domainkey.${domain}|TXT`]: {
      authenticated: true,
      answers: [{ data: `"v=DKIM1; k=rsa; p=${WEAK_RSA_1024_SPKI}"`, type: 16 }],
    },
  });
  const result = await verifyDomainControls({
    domain,
    strict: true,
    dkimSelectors: ["google"],
    dnsQuery: fixture,
    fetchImpl: webFixture,
  });
  assert.ok(result.failedChecks.includes("DKIM selector google"));
  assert.match(
    result.checks.find(({ name }) => name === "DKIM selector google").detail,
    /modulusBits=1024; minimum=2048/u,
  );
});

test("DKIM treats an empty p tag as a revoked key", async () => {
  const fixture = dnsFixture({
    [`google._domainkey.${domain}|TXT`]: {
      authenticated: true,
      answers: [{ data: '"v=DKIM1; k=rsa; p="', type: 16 }],
    },
  });
  const result = await verifyDomainControls({
    domain,
    strict: true,
    dkimSelectors: ["google"],
    dnsQuery: fixture,
    fetchImpl: webFixture,
  });
  assert.ok(result.failedChecks.includes("DKIM selector google"));
  assert.match(
    result.checks.find(({ name }) => name === "DKIM selector google").detail,
    /revoked \(empty p tag\)/u,
  );
});

test("DKIM accepts valid RSA-2048 and Ed25519 SubjectPublicKeyInfo", async () => {
  const fixture = dnsFixture({
    [`ed._domainkey.${domain}|TXT`]: {
      authenticated: true,
      answers: [{ data: `"v=DKIM1; k=ed25519; p=${VALID_ED25519_SPKI}"`, type: 16 }],
    },
  });
  const result = await verifyDomainControls({
    domain,
    strict: true,
    dkimSelectors: ["google", "ed"],
    dnsQuery: fixture,
    fetchImpl: webFixture,
  });
  assert.equal(result.passed, true);
  assert.match(
    result.checks.find(({ name }) => name === "DKIM selector google").detail,
    /keyType=rsa; modulusBits=2048; validSpki=true/u,
  );
  assert.match(
    result.checks.find(({ name }) => name === "DKIM selector ed").detail,
    /keyType=ed25519; validSpki=true/u,
  );
});
