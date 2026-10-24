import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

import { createSiteHandler } from "../src/site-edge.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const distRoot = resolve(repositoryRoot, "site-worker/dist");
const siteManifest = JSON.parse(await readFile(resolve(repositoryRoot, "site-worker/generated/site-manifest.json"), "utf8"));
const ORIGIN = "https://riddlearabia.com";
const RUNTIME_ASSET = /\.(?:css|js|json|mjs)$/u;

// Stable URLs that are loaded at runtime on purpose. Each one is revalidated
// (never immutable) and has a reason. Everything else must be fingerprinted.
const DELIBERATELY_REVALIDATED = new Map([
  ["/sw.js", "a service worker must keep one stable script URL; it is served with max-age=0, must-revalidate"],
]);
// Template URLs cannot be fingerprinted statically. Category payloads are
// pinned through catalog.assetPath; these spellings are only the fallback for
// an unbuilt catalog (and the service worker's quarantine matcher).
const DELIBERATE_TEMPLATES = [
  /^\/data\/\$\{[A-Za-z.]+\}\.json$/u,
];

function digestMatches(pathname) {
  const record = siteManifest.files[pathname];
  const embedded = pathname.split("/").at(-1).match(/\.([a-f0-9]{16})\.[a-z]+$/u)?.[1];
  return Boolean(record && embedded && record.sha256.startsWith(embedded));
}

function sameOriginPath(reference, base) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(reference)) {
    const url = new URL(reference);
    return url.origin === ORIGIN ? url.pathname : null;
  }
  return new URL(reference, `${ORIGIN}${base}`).pathname;
}

const SCRIPT_REFERENCES = [
  /\bimport\s*\(\s*(['"`])([^'"`]+)\1/gu,
  /\bfrom\s*(['"])([^'"]+)\1/gu,
  /\bimport\s*(['"])([^'"]+)\1/gu,
  /\bfetch(?:Json)?\s*\(\s*(['"`])([^'"`]+)\1/gu,
  /\bregister\s*\(\s*(['"`])([^'"`]+)\1/gu,
  /(['"`])(\/[A-Za-z0-9._/${}-]+\.(?:css|js|json|mjs))\1/gu,
];

function scriptReferences(source) {
  const found = new Set();
  for (const pattern of SCRIPT_REFERENCES) {
    for (const match of source.matchAll(pattern)) {
      const reference = match[2];
      if (reference.startsWith("$") || /^[a-z]+:/iu.test(reference)) continue;
      if (reference.includes("${") || RUNTIME_ASSET.test(reference.split(/[?#]/u)[0])) found.add(reference);
    }
  }
  return found;
}

async function runtimeReferenceGraph() {
  const references = new Map();
  const queue = [];
  const visited = new Set();
  const record = (reference, from) => {
    if (!references.has(reference)) references.set(reference, new Set());
    references.get(reference).add(from);
  };
  const enqueue = (pathname) => {
    if (/\.m?js$/u.test(pathname) && !visited.has(pathname)) {
      visited.add(pathname);
      queue.push(pathname);
    }
  };
  for (const route of Object.values(siteManifest.routes)) {
    const html = await readFile(resolve(distRoot, route.slice(1)), "utf8");
    for (const match of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/giu)) {
      const pathname = sameOriginPath(match[1], route);
      if (!pathname || !RUNTIME_ASSET.test(pathname)) continue;
      record(match[1].startsWith("/") ? match[1] : pathname, route);
      enqueue(pathname);
    }
    for (const match of html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/giu)) {
      for (const reference of scriptReferences(match[1])) {
        record(reference, `${route} (inline)`);
        if (!reference.includes("${")) enqueue(sameOriginPath(reference, route));
      }
    }
  }
  while (queue.length) {
    const pathname = queue.shift();
    assert.ok(siteManifest.files[pathname], `runtime script ${pathname} is not part of the release`);
    const source = await readFile(resolve(distRoot, pathname.slice(1)), "utf8");
    for (const reference of scriptReferences(source)) {
      record(reference, pathname);
      if (!reference.includes("${")) enqueue(sameOriginPath(reference, pathname));
    }
  }
  return references;
}

test("every runtime fetch, import, script and stylesheet is fingerprinted or deliberately revalidated", async () => {
  const references = await runtimeReferenceGraph();
  assert.ok(references.size > 50, "the scan must see the real release graph");
  const violations = [];
  for (const [reference, sources] of references) {
    const from = [...sources].slice(0, 3).join(", ");
    if (reference.includes("${")) {
      if (!DELIBERATE_TEMPLATES.some((pattern) => pattern.test(reference))) violations.push(`${reference} (template) <- ${from}`);
      continue;
    }
    if (/[?#]/u.test(reference)) violations.push(`${reference} uses a query/hash version instead of a content hash <- ${from}`);
    const pathname = reference.split(/[?#]/u)[0].startsWith("/")
      ? reference.split(/[?#]/u)[0]
      : sameOriginPath(reference, [...sources][0]);
    if (DELIBERATELY_REVALIDATED.has(pathname)) continue;
    if (!digestMatches(pathname)) violations.push(`${pathname} is mutable and not deliberately revalidated <- ${from}`);
  }
  assert.deepEqual(violations, []);
  for (const pathname of DELIBERATELY_REVALIDATED.keys()) {
    assert.ok(references.has(pathname), `${pathname} is allow-listed but no longer referenced; remove it`);
  }
});

test("deliberately revalidated runtime URLs are never cached as immutable", async () => {
  const handler = createSiteHandler({
    siteManifest,
    mtaStsPolicy: await readFile(resolve(repositoryRoot, "site-worker/assets/mta-sts.txt"), "utf8"),
  });
  const env = {
    MTA_STS_ENABLED: "false",
    ASSETS: { async fetch() { return new Response("asset", { headers: { "content-type": "text/javascript" } }); } },
  };
  for (const pathname of DELIBERATELY_REVALIDATED.keys()) {
    const response = await handler.fetch(new Request(`${ORIGIN}${pathname}`), env);
    assert.match(response.headers.get("cache-control"), /max-age=0, must-revalidate/u, pathname);
  }
  const index = await handler.fetch(new Request(`${ORIGIN}${siteManifest.fingerprints["/data/card-index.json"]}`), env);
  assert.equal(index.headers.get("cache-control"), "public, max-age=31536000, immutable");
});

test("the public card index and page translations are pinned per release", async () => {
  const fingerprinted = siteManifest.fingerprints["/data/card-index.json"];
  assert.match(fingerprinted, /^\/data\/card-index\.[a-f0-9]{16}\.json$/u);
  const stable = await readFile(resolve(distRoot, "data/card-index.json"));
  assert.ok(stable.equals(await readFile(resolve(distRoot, fingerprinted.slice(1)))), "the pinned index must be the projected public index");
  const application = await readFile(resolve(distRoot, siteManifest.fingerprints["/app.js"].slice(1)), "utf8");
  assert.ok(application.includes(`fetch('${fingerprinted}'`), "the app must request the pinned card index");
  assert.ok(application.includes(`import('${siteManifest.fingerprints["/content-overrides.js"]}')`));
  assert.doesNotMatch(application, /force-cache/u, "a pinned URL needs no cache override, and a stable one must not get one");
  for (const [stable, pages] of Object.entries({
    "/site-i18n.js": 1, "/game-i18n.js": 10, "/privacy-page.js": 2,
  })) {
    const pinned = siteManifest.fingerprints[stable];
    assert.ok(digestMatches(pinned), stable);
    let referencing = 0;
    for (const route of Object.values(siteManifest.routes)) {
      const html = await readFile(resolve(distRoot, route.slice(1)), "utf8");
      if (html.includes(`src="${pinned}"`)) referencing += 1;
      assert.doesNotMatch(html, new RegExp(`src="[^"]*${stable.slice(1).replace(".", "\\.")}\\?v=`, "u"), `${route} keeps a hand-typed version`);
    }
    assert.ok(referencing >= pages, `${stable} is pinned on ${referencing} pages`);
  }
});

function appFunction(source, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`, "u"));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}

test("returning visitors with an old cached card index still see newly published questions", async () => {
  const fingerprinted = siteManifest.fingerprints["/data/card-index.json"];
  const fresh = JSON.parse(await readFile(resolve(distRoot, fingerprinted.slice(1)), "utf8"));
  const [newestId] = Object.keys(fresh).slice(-1);
  const old = Object.fromEntries(Object.entries(fresh).filter(([id]) => id !== newestId));
  // The browser HTTP cache and an older service worker both still hold the
  // index from a previous visit under the stable URL.
  const browserCache = new Map([["/data/card-index.json", old]]);
  const requested = [];
  const application = await readFile(resolve(distRoot, siteManifest.fingerprints["/app.js"].slice(1)), "utf8");
  const page = vm.createContext({
    categoryIsQuarantined: () => false,
    fetch: async (url, init = {}) => {
      requested.push({ url, cache: init.cache });
      const pathname = new URL(url, ORIGIN).pathname;
      const body = browserCache.get(pathname) ?? (pathname === fingerprinted ? fresh : null);
      assert.ok(body, `unexpected request ${pathname}`);
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    },
  });
  vm.runInContext(`let cardIndexPromise; let publicCardIds = new Set(); let publicCardIndexReady = false;
${appFunction(application, "loadCardIndex")}
globalThis.publicState = () => ({ ids: publicCardIds, ready: publicCardIndexReady });`, page);
  await page.loadCardIndex();
  const { ids, ready } = page.publicState();
  assert.equal(ready, true);
  assert.equal(ids.has(newestId), true, "a question published after the first visit must be visible and saveable");
  assert.equal(ids.size, Object.keys(fresh).length);
  assert.deepEqual(requested, [{ url: fingerprinted, cache: undefined }]);
});
