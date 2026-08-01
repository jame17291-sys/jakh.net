import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  cachePolicy,
  canonicalRedirect,
  contentSecurityPolicy,
  createSiteHandler,
  fingerprintCompatibilitySource,
  isQuarantinedPath,
  validateMtaStsPolicy,
} from "../src/site-edge.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const siteManifest = JSON.parse(await readFile(resolve(repositoryRoot, "site-worker/generated/site-manifest.json"), "utf8"));
const mtaStsPolicy = await readFile(resolve(repositoryRoot, "site-worker/assets/mta-sts.txt"), "utf8");

function contentType(pathname) {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function environment(overrides = {}) {
  return {
    MTA_STS_ENABLED: "false",
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url);
        const path = siteManifest.routes[url.pathname] || url.pathname;
        const exists = Boolean(siteManifest.files[path]);
        return new Response(exists ? `asset:${path}` : "missing", {
          status: exists ? 200 : 404,
          headers: { "content-type": exists ? contentType(path) : "text/html; charset=utf-8" },
        });
      },
    },
    ...overrides,
  };
}

const handler = createSiteHandler({ siteManifest, mtaStsPolicy });

function assertSecurityHeaders(response) {
  assert.match(response.headers.get("strict-transport-security"), /max-age=/u);
  assert.match(response.headers.get("content-security-policy"), /frame-ancestors 'none'/u);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-jakh-site-version"), siteManifest.buildId);
}

test("physical aliases and www normalize in one query-preserving 301", async () => {
  const cases = [
    ["https://jakh.net/science.html?x=1", "https://jakh.net/science?x=1"],
    ["https://jakh.net/ar/topics/science/index.html?x=1", "https://jakh.net/ar/topics/science/?x=1"],
    ["https://jakh.net/ar/topics/science.html?x=1", "https://jakh.net/ar/topics/science/?x=1"],
    ["https://www.jakh.net/science.html?x=1", "https://jakh.net/science?x=1"],
    ["http://www.jakh.net/index.html?x=1", "https://jakh.net/?x=1"],
  ];
  for (const [source, destination] of cases) {
    const response = await handler.fetch(new Request(source), environment());
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), destination);
    assertSecurityHeaders(response);
  }
  const direct = canonicalRedirect(siteManifest, new URL("https://jakh.net/science"));
  assert.equal(direct, null);
});

test("quarantined paths return policy-complete 410 responses before asset access", async () => {
  let assetFetches = 0;
  const blockedEnvironment = environment({
    ASSETS: {
      async fetch() {
        assetFetches += 1;
        throw new Error("quarantine reached ASSETS");
      },
    },
  });
  const paths = [
    "/survival",
    "/SURVIVAL.html?card=1",
    "/survival/page/2/index.html",
    "/ar/topics/law-middle-east/",
    "/ar/topics/law-middle-east.html",
    "/ar/topics/law-middle-east.html/archive",
    "/ar/topics/law-middle-east%2ehtml",
    "/ar//topics//medical-questions//page/2/",
    "/data/pharmacy.json?old=1",
    "/data/pharmacy.json/",
    "/data/pharmacy.json/archive",
    "/data/pharmacy.json%2farchive",
    "/survival%3Fx=1",
    "/survival%23fragment",
    "/data/survival.json%3Fx=1",
    "/data/survival.json%23fragment",
    "/science%00/safe",
    "/%73urvival",
    "/survival%2ehtml",
    "/ar/topics/%73urvival/",
    "/data/%73urvival.json",
    "/data/survival%2ejson",
    "/safe/%252e%252e/economics-and-finance",
    "/%25252573urvival",
    "/data/%ZZ.json",
  ];
  for (const pathname of paths) {
    const response = await handler.fetch(new Request(`https://jakh.net${pathname}`), blockedEnvironment);
    assert.equal(response.status, 410, pathname);
    assert.equal(response.headers.get("cache-control"), "no-store", pathname);
    assert.equal(response.headers.get("x-jakh-content-quarantine"), "active", pathname);
    assert.equal(response.headers.get("clear-site-data"), '"cache"', pathname);
    assert.match(response.headers.get("x-robots-tag"), /noindex.*nofollow.*noarchive.*nosnippet/u, pathname);
    assertSecurityHeaders(response);
  }
  const head = await handler.fetch(new Request("https://jakh.net/data/%73urvival.json", { method: "HEAD" }), blockedEnvironment);
  assert.equal(head.status, 410);
  assert.equal(await head.text(), "");
  assert.equal(assetFetches, 0);

  assert.equal(isQuarantinedPath(siteManifest, "/survival-guide"), false);
  assert.equal(isQuarantinedPath(siteManifest, "/science?next=/survival"), false);
});

test("unlisted paths cannot rely on static-asset URL normalization", async () => {
  const requestedPaths = [];
  const normalizingEnvironment = environment({
    ASSETS: {
      async fetch(request) {
        const pathname = new URL(request.url).pathname;
        requestedPaths.push(pathname);
        return new Response(pathname === "/404.html" ? "custom missing" : "normalized content", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    },
  });
  const response = await handler.fetch(
    new Request("https://jakh.net/ar/topics/science%2ehtml%2farchive"),
    normalizingEnvironment,
  );
  assert.equal(response.status, 404);
  assert.equal(await response.text(), "custom missing");
  assert.deepEqual(requestedPaths, ["/404.html"]);
  assertSecurityHeaders(response);
});

test("success, 404, method errors, and conditional responses all carry policy", async () => {
  const success = await handler.fetch(new Request("https://jakh.net/"), environment());
  assert.equal(success.status, 200);
  assert.match(success.headers.get("cache-control"), /max-age=0, must-revalidate/u);
  assert.match(success.headers.get("etag"), /^W\/["'][a-f0-9]{64}["']$/u);
  assertSecurityHeaders(success);
  assert.doesNotMatch(success.headers.get("content-security-policy"), /script-src[^;]*unsafe-inline/u);

  const conditional = await handler.fetch(new Request("https://jakh.net/", {
    headers: { "if-none-match": success.headers.get("etag") },
  }), environment());
  assert.equal(conditional.status, 304);
  assert.equal(conditional.headers.get("cache-control"), success.headers.get("cache-control"));
  assertSecurityHeaders(conditional);

  const missing = await handler.fetch(new Request("https://jakh.net/definitely-missing"), environment());
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "no-store");
  assertSecurityHeaders(missing);

  const explicit404 = await handler.fetch(new Request("https://jakh.net/404.html"), environment());
  assert.equal(explicit404.status, 404);
  assertSecurityHeaders(explicit404);

  const method = await handler.fetch(new Request("https://jakh.net/", { method: "POST" }), environment());
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("cache-control"), "no-store");
  assertSecurityHeaders(method);
});

test("cache policy is immutable only when the filename carries its own digest", () => {
  const record = { sha256: "abcdef1234567890".padEnd(64, "0") };
  assert.equal(cachePolicy({ pathname: "/app.js", status: 200, contentType: "text/javascript", record }), "public, max-age=3600, must-revalidate");
  assert.equal(cachePolicy({ pathname: "/app.abcdef123456.js", status: 200, contentType: "text/javascript", record }), "public, max-age=31536000, immutable");
  assert.equal(cachePolicy({ pathname: "/app-abcdef123456.js", status: 200, contentType: "text/javascript", record }), "public, max-age=3600, must-revalidate");
  assert.equal(cachePolicy({ pathname: "/app.abcdef123456.extra.js", status: 200, contentType: "text/javascript", record }), "public, max-age=3600, must-revalidate");
  assert.equal(cachePolicy({ pathname: "/app.000000000000.js", status: 200, contentType: "text/javascript", record }), "public, max-age=3600, must-revalidate");
  assert.equal(cachePolicy({ pathname: "/page", status: 200, contentType: "text/html", record }), "public, max-age=0, must-revalidate");
  assert.equal(cachePolicy({ pathname: "/missing", status: 404, contentType: "text/html", record: null }), "no-store");
});

test("prior fingerprint requests fall back safely to stable compatibility assets", async () => {
  for (const stable of Object.keys(siteManifest.fingerprints)) {
    const extensionAt = stable.lastIndexOf(".");
    const prior = `${stable.slice(0, extensionAt)}.0000000000000000${stable.slice(extensionAt)}`;
    assert.equal(fingerprintCompatibilitySource(siteManifest, prior), stable);
    const response = await handler.fetch(new Request(`https://jakh.net${prior}`), environment());
    assert.equal(response.status, 200, prior);
    assert.equal(response.headers.get("cache-control"), "no-store", prior);
    assert.equal(response.headers.get("x-jakh-compatibility-fallback"), stable, prior);
    assert.equal(await response.text(), `asset:${stable}`, prior);

    const conditional = await handler.fetch(new Request(`https://jakh.net${prior}`, {
      headers: { "if-none-match": response.headers.get("etag") },
    }), environment());
    assert.equal(conditional.status, 304, prior);
    assert.equal(conditional.headers.get("cache-control"), "no-store", prior);
    assert.equal(conditional.headers.get("x-jakh-compatibility-fallback"), stable, prior);
  }

  const current = siteManifest.fingerprints["/search-leaderboard.js"];
  assert.equal(fingerprintCompatibilitySource(siteManifest, current), null);
  const currentResponse = await handler.fetch(new Request(`https://jakh.net${current}`), environment());
  assert.match(currentResponse.headers.get("cache-control"), /immutable/u);
  assert.equal(currentResponse.headers.has("x-jakh-compatibility-fallback"), false);

  const unknown = await handler.fetch(
    new Request("https://jakh.net/unknown.0000000000000000.js"),
    environment(),
  );
  assert.equal(unknown.status, 404);
});

test("handler rejects a fingerprint mapping whose filename does not match its bytes", () => {
  const malformed = structuredClone(siteManifest);
  const target = malformed.fingerprints["/app.js"];
  malformed.fingerprints["/app.js"] = target.replace(/\.[a-f0-9]{16}\.js$/u, ".0000000000000000.js");
  malformed.files[malformed.fingerprints["/app.js"]] = malformed.files[target];
  assert.throws(() => createSiteHandler({ siteManifest: malformed, mtaStsPolicy }), /Fingerprint does not match asset bytes/u);
});

test("handler rejects quarantine policy drift or held paths in the release graph", () => {
  const categoryDrift = structuredClone(siteManifest);
  categoryDrift.publication.quarantinedCategories[0] = "survival-guide";
  assert.throws(
    () => createSiteHandler({ siteManifest: categoryDrift, mtaStsPolicy }),
    /does not match the reviewed production policy/u,
  );

  const heldFile = structuredClone(siteManifest);
  heldFile.files["/data/%73urvival.json"] = { sha256: "0".repeat(64), bytes: 1 };
  assert.throws(
    () => createSiteHandler({ siteManifest: heldFile, mtaStsPolicy }),
    /Quarantined path is present in site files/u,
  );

  const heldRoute = structuredClone(siteManifest);
  heldRoute.routes["/safe/%252e%252e/survival"] = "/index.html";
  assert.throws(
    () => createSiteHandler({ siteManifest: heldRoute, mtaStsPolicy }),
    /Quarantined path is present in site routes/u,
  );
});

test("CSP includes only the current page's generated inline hashes", () => {
  const policy = contentSecurityPolicy(siteManifest, "/", 200);
  for (const hash of siteManifest.inlineScripts["/"]) assert.match(policy, new RegExp(hash.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(policy, /script-src-attr 'none'/u);
  assert.match(policy, /connect-src[^;]+api\.jakh\.net/u);
});

test("MTA-STS handler is valid but fail-closed until mail-owner activation", async () => {
  assert.equal(validateMtaStsPolicy(mtaStsPolicy), true);
  assert.equal(validateMtaStsPolicy("version: STSv1\nmode: enforce\nmax_age: 86400\n"), false);
  const disabled = await handler.fetch(new Request("https://mta-sts.jakh.net/.well-known/mta-sts.txt"), environment());
  assert.equal(disabled.status, 404);
  assertSecurityHeaders(disabled);

  const enabled = await handler.fetch(
    new Request("https://mta-sts.jakh.net/.well-known/mta-sts.txt"),
    environment({ MTA_STS_ENABLED: "true" }),
  );
  assert.equal(enabled.status, 200);
  assert.equal(await enabled.text(), mtaStsPolicy);
  assert.match(enabled.headers.get("content-type"), /^text\/plain/u);
  assertSecurityHeaders(enabled);
});
