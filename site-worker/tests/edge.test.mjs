import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

import {
  cachePolicy,
  canonicalRedirect,
  contentSecurityPolicy,
  createSiteHandler,
  fingerprintCompatibilitySource,
  isQuarantinedPath,
  negotiateHtmlEncoding,
  renamedGameRedirectTarget,
  retiredSeoRedirectTarget,
  validateMtaStsPolicy,
  visitorAcceptEncoding,
  withWorkerVersion,
} from "../src/site-edge.js";

import { RENAMED_GAME_ROUTES } from "../src/seo-route-migrations.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const siteManifest = JSON.parse(await readFile(resolve(repositoryRoot, "site-worker/generated/site-manifest.json"), "utf8"));
const mtaStsPolicy = await readFile(resolve(repositoryRoot, "site-worker/assets/mta-sts.txt"), "utf8");
const PRIMARY_ORIGIN = "https://riddlearabia.com";

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

test("primary physical aliases and www normalize in one query-preserving 301", async () => {
  const cases = [
    [`${PRIMARY_ORIGIN}/science.html?x=1`, `${PRIMARY_ORIGIN}/science?x=1`],
    [`${PRIMARY_ORIGIN}/ar/topics/science/index.html?x=1`, `${PRIMARY_ORIGIN}/ar/topics/science/?x=1`],
    [`${PRIMARY_ORIGIN}/ar/topics/science.html?x=1`, `${PRIMARY_ORIGIN}/ar/topics/science/?x=1`],
    [`${PRIMARY_ORIGIN}/ar?battle=ABCD1234`, `${PRIMARY_ORIGIN}/ar/?battle=ABCD1234`],
    [`${PRIMARY_ORIGIN}/ar/topics/classic-riddles?card=classic-riddles-001`, `${PRIMARY_ORIGIN}/ar/topics/classic-riddles/?card=classic-riddles-001`],
    [`${PRIMARY_ORIGIN}/ar/games/chess?ref=launch`, `${PRIMARY_ORIGIN}/ar/games/chess/?ref=launch`],
    ["https://www.riddlearabia.com/science.html?x=1", `${PRIMARY_ORIGIN}/science?x=1`],
    ["http://www.riddlearabia.com/index.html?x=1", `${PRIMARY_ORIGIN}/?x=1`],
    [`${PRIMARY_ORIGIN}/collections/?x=1`, `${PRIMARY_ORIGIN}/collections?x=1`],
    [`${PRIMARY_ORIGIN}/play/?x=1`, `${PRIMARY_ORIGIN}/play?x=1`],
    [`${PRIMARY_ORIGIN}/about/?x=1`, `${PRIMARY_ORIGIN}/about?x=1`],
    [`${PRIMARY_ORIGIN}/privacy/?x=1`, `${PRIMARY_ORIGIN}/privacy?x=1`],
  ];
  for (const [source, destination] of cases) {
    const response = await handler.fetch(new Request(source), environment());
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), destination);
    assertSecurityHeaders(response);
  }
  const direct = canonicalRedirect(siteManifest, new URL(`${PRIMARY_ORIGIN}/science`));
  assert.equal(direct, null);
});

test("detached domains cannot redirect to or serve the Riddle Arabia artifact", async () => {
  const cases = [
    "https://jakh.net/science.html?battle=ABCD1234",
    "https://www.jakh.net/ar/topics/science/index.html?x=1",
    "https://jakh.net/ar/topics/classic-riddles?card=classic-riddles-001",
    "http://jakh.net/collections/?ref=legacy",
    "https://unrelated.example/",
    "https://jakh.net/en/riddles-with-answers/",
    "https://jakh.net/survival",
  ];
  let assetFetches = 0;
  const env = environment({ ASSETS: { async fetch() { assetFetches++; throw new Error('detached host reached assets'); } } });
  for (const source of cases) {
    const response = await handler.fetch(new Request(source), env);
    assert.equal(response.status, 404, source);
    assert.equal(response.headers.get("location"), null, source);
    assert.equal(canonicalRedirect(siteManifest, new URL(source)), null);
    assertSecurityHeaders(response);
  }
  assert.equal(assetFetches, 0);
});

test("retired SEO entry points and pagination redirect once to their retained Riddle Arabia routes", async () => {
  const cases = [
    [`${PRIMARY_ORIGIN}/en/riddles-with-answers/?ref=google`, `${PRIMARY_ORIGIN}/riddles?ref=google`],
    [`${PRIMARY_ORIGIN}/en/kids-riddles-with-answers/index.html?x=1`, `${PRIMARY_ORIGIN}/family-riddles?x=1`],
    [`${PRIMARY_ORIGIN}/en/logic-puzzles-with-answers/?x=1`, `${PRIMARY_ORIGIN}/logic-challenges?x=1`],
    [`${PRIMARY_ORIGIN}/en/general-knowledge-quiz-questions/?x=1`, `${PRIMARY_ORIGIN}/general-knowledge?x=1`],
    [`${PRIMARY_ORIGIN}/en/spacetoon-quiz/?x=1`, `${PRIMARY_ORIGIN}/spacetoon-nostalgia?x=1`],
    [`${PRIMARY_ORIGIN}/en/football-rules-quiz/?x=1`, `${PRIMARY_ORIGIN}/football?x=1`],
    [`${PRIMARY_ORIGIN}/ar/alghaz-ma-alhal/?x=1`, `${PRIMARY_ORIGIN}/ar/alghaz/?x=1`],
    [`${PRIMARY_ORIGIN}/ar/alghaz-lil-atfal-ma-alhal/?x=1`, `${PRIMARY_ORIGIN}/ar/alghaz-atfal/?x=1`],
    [`${PRIMARY_ORIGIN}/ar/alghaz-mantiqiyya-ma-alhal/?x=1`, `${PRIMARY_ORIGIN}/ar/alghaz-mantiq/?x=1`],
    [`${PRIMARY_ORIGIN}/ar/asila-amma-wa-ajwiba/?x=1`, `${PRIMARY_ORIGIN}/ar/malumat-amma/?x=1`],
    [`${PRIMARY_ORIGIN}/ar/ikhtibar-spacetoon/?x=1`, `${PRIMARY_ORIGIN}/ar/hanin-spacetoon/?x=1`],
    [`${PRIMARY_ORIGIN}/ar/ikhtibar-qawanin-korat-alqadam/?x=1`, `${PRIMARY_ORIGIN}/ar/topics/football/?x=1`],
    [`${PRIMARY_ORIGIN}/science/page/2/index.html?x=1`, `${PRIMARY_ORIGIN}/science?x=1`],
    [`${PRIMARY_ORIGIN}/ar/topics/science/page/2/index.html?x=1`, `${PRIMARY_ORIGIN}/ar/topics/science/?x=1`],
  ];
  for (const [source, destination] of cases) {
    const response = await handler.fetch(new Request(source), environment());
    assert.equal(response.status, 301, source);
    assert.equal(response.headers.get("location"), destination, source);
    assert.equal(response.headers.get("cache-control"), "public, max-age=86400", source);
    assertSecurityHeaders(response);
  }
  assert.equal(retiredSeoRedirectTarget(siteManifest, "/missing/page/2/"), null);
  assert.equal(retiredSeoRedirectTarget(siteManifest, "/science/page/0/"), null);
});

test("topics retired by the 2026-10-25 merges redirect once to their successor and keep shared card links", async () => {
  const cases = [
    [`${PRIMARY_ORIGIN}/physical-and-life-sciences?card=physical-and-life-sciences-002`, `${PRIMARY_ORIGIN}/biology?card=physical-and-life-sciences-002`],
    [`${PRIMARY_ORIGIN}/physical-and-life-sciences?card=physical-and-life-sciences-003`, `${PRIMARY_ORIGIN}/science?card=physical-and-life-sciences-003`],
    [`${PRIMARY_ORIGIN}/science?card=science-048&utm_source=share`, `${PRIMARY_ORIGIN}/chemistry?card=science-048&utm_source=share`],
    [`${PRIMARY_ORIGIN}/science.html?card=science-048`, `${PRIMARY_ORIGIN}/chemistry?card=science-048`],
    [`${PRIMARY_ORIGIN}/ar/topics/biology/?card=biology-033`, `${PRIMARY_ORIGIN}/ar/topics/animal-kingdom/?card=biology-033`],
    [`${PRIMARY_ORIGIN}/ar/topics/world-habits-and-etiquette?card=world-habits-and-etiquette-047`, `${PRIMARY_ORIGIN}/ar/topics/psychology/?card=world-habits-and-etiquette-047`],
    [`${PRIMARY_ORIGIN}/physical-and-life-sciences.html?card=x`, `${PRIMARY_ORIGIN}/science?card=x`],
    [`${PRIMARY_ORIGIN}/physical-and-life-sciences/page/2/`, `${PRIMARY_ORIGIN}/science`],
    [`${PRIMARY_ORIGIN}/ar/topics/physical-and-life-sciences/?card=physical-and-life-sciences-001`, `${PRIMARY_ORIGIN}/ar/topics/science/?card=physical-and-life-sciences-001`],
    [`${PRIMARY_ORIGIN}/ar/topics/physical-and-life-sciences/index.html`, `${PRIMARY_ORIGIN}/ar/topics/science/`],
    [`${PRIMARY_ORIGIN}/ar/topics/physical-and-life-sciences.html`, `${PRIMARY_ORIGIN}/ar/topics/science/`],
    [`${PRIMARY_ORIGIN}/coding-and-design?card=coding-and-design-025&lang=ar`, `${PRIMARY_ORIGIN}/software-and-computing?card=coding-and-design-025&lang=ar`],
    [`${PRIMARY_ORIGIN}/ar/topics/coding-and-design/`, `${PRIMARY_ORIGIN}/ar/topics/software-and-computing/`],
    [`${PRIMARY_ORIGIN}/civil-engineering/`, `${PRIMARY_ORIGIN}/infrastructure-systems`],
    [`https://www.riddlearabia.com/ar/topics/civil-engineering/page/3/?card=civil-engineering-010`, `${PRIMARY_ORIGIN}/ar/topics/infrastructure-systems/?card=civil-engineering-010`],
  ];
  for (const [source, destination] of cases) {
    const response = await handler.fetch(new Request(source), environment());
    assert.equal(response.status, 301, source);
    assert.equal(response.headers.get("location"), destination, source);
    assert.equal(response.headers.get("cache-control"), "public, max-age=86400", source);
    assertSecurityHeaders(response);
    const next = await handler.fetch(new Request(destination), environment());
    assert.equal(next.status, 200, `${destination} serves the successor in one hop`);
  }
  for (const slug of ["physical-and-life-sciences", "coding-and-design", "civil-engineering"]) {
    assert.equal(siteManifest.routes[`/${slug}`], undefined);
    assert.equal(siteManifest.routes[`/ar/topics/${slug}/`], undefined);
    assert.equal(siteManifest.files[`/data/${slug}.json`], undefined);
  }
  // Cards that never moved, or a topic the card never left, are served as they are.
  for (const kept of [`${PRIMARY_ORIGIN}/science?card=science-001`, `${PRIMARY_ORIGIN}/biology?card=science-048`,
    `${PRIMARY_ORIGIN}/chemistry?card=science-048`, `${PRIMARY_ORIGIN}/ar/topics/science/?card=unknown-card`]) {
    assert.equal(canonicalRedirect(siteManifest, new URL(kept)), null, kept);
  }
  assert.equal(retiredSeoRedirectTarget(siteManifest, "/science"), null);
  assert.equal(retiredSeoRedirectTarget(siteManifest, "/coding-and-design-001"), null);
  assert.equal(retiredSeoRedirectTarget(siteManifest, "/ar/topics/software-and-computing/"), null);
});

test("a deep link to a TV show dropped from the game redirects to the TV topic page", async () => {
  const cases = [
    [`${PRIMARY_ORIGIN}/tv-shows-trivia?sub=The+Wire&season=3`, `${PRIMARY_ORIGIN}/tv-shows-trivia`],
    [`${PRIMARY_ORIGIN}/tv-shows-trivia?sub=the-wire&utm_source=share`, `${PRIMARY_ORIGIN}/tv-shows-trivia?utm_source=share`],
    [`${PRIMARY_ORIGIN}/tv-shows-trivia.html?sub=THE%20WIRE`, `${PRIMARY_ORIGIN}/tv-shows-trivia`],
    [`${PRIMARY_ORIGIN}/ar/topics/tv-shows-trivia/?sub=The%20Wire`, `${PRIMARY_ORIGIN}/ar/topics/tv-shows-trivia/`],
    [`${PRIMARY_ORIGIN}/ar/topics/tv-shows-trivia?sub=the-wire`, `${PRIMARY_ORIGIN}/ar/topics/tv-shows-trivia/`],
  ];
  for (const [source, destination] of cases) {
    const response = await handler.fetch(new Request(source), environment());
    assert.equal(response.status, 301, source);
    assert.equal(new URL(response.headers.get("location")).href, new URL(destination).href, source);
  }
  for (const kept of [`${PRIMARY_ORIGIN}/tv-shows-trivia?sub=Friends`, `${PRIMARY_ORIGIN}/ar/topics/tv-shows-trivia/?sub=maraya`, `${PRIMARY_ORIGIN}/science?sub=The+Wire`]) {
    assert.equal(canonicalRedirect(siteManifest, new URL(kept)), null, kept);
  }
});

test("every renamed game address redirects once to its new English or Arabic page, keeping the query", async () => {
  assert.deepEqual(RENAMED_GAME_ROUTES.map(({ from, to }) => [from.en, to.en]), [
    ["/catan", "/island-traders"],
    ["/codenames", "/spy-words"],
    ["/hanabi", "/fireworks"],
    ["/set", "/triple-match"],
    ["/mastermind", "/code-breaker"],
    ["/diplomacy", "/alliances"],
    ["/connections", "/four-groups"],
  ]);
  for (const { from, to } of RENAMED_GAME_ROUTES) {
    const arabicBare = from.ar.replace(/\/$/u, "");
    const cases = [
      [`${PRIMARY_ORIGIN}${from.en}?ref=search`, `${PRIMARY_ORIGIN}${to.en}?ref=search`],
      [`${PRIMARY_ORIGIN}${from.en}/?x=1`, `${PRIMARY_ORIGIN}${to.en}?x=1`],
      [`${PRIMARY_ORIGIN}${from.en}.html?x=1`, `${PRIMARY_ORIGIN}${to.en}?x=1`],
      [`http://www.riddlearabia.com${from.en}?x=1`, `${PRIMARY_ORIGIN}${to.en}?x=1`],
      [`${PRIMARY_ORIGIN}${from.ar}?ref=search`, `${PRIMARY_ORIGIN}${to.ar}?ref=search`],
      [`${PRIMARY_ORIGIN}${arabicBare}?x=1`, `${PRIMARY_ORIGIN}${to.ar}?x=1`],
      [`${PRIMARY_ORIGIN}${from.ar}index.html?x=1`, `${PRIMARY_ORIGIN}${to.ar}?x=1`],
      [`${PRIMARY_ORIGIN}${arabicBare}.html?x=1`, `${PRIMARY_ORIGIN}${to.ar}?x=1`],
      [`https://www.riddlearabia.com${from.ar}`, `${PRIMARY_ORIGIN}${to.ar}`],
    ];
    for (const [source, destination] of cases) {
      const response = await handler.fetch(new Request(source), environment());
      assert.equal(response.status, 301, source);
      assert.equal(response.headers.get("location"), destination, source);
      assert.equal(response.headers.get("cache-control"), "public, max-age=86400", source);
      assertSecurityHeaders(response);
      const final = await handler.fetch(new Request(destination), environment());
      assert.equal(final.status, 200, destination);
      assert.equal(final.headers.get("location"), null, destination);
    }
    for (const current of [to.en, to.ar]) {
      assert.equal(canonicalRedirect(siteManifest, new URL(`${PRIMARY_ORIGIN}${current}`)), null, current);
      assert.equal(renamedGameRedirectTarget(siteManifest, current), null, current);
    }
  }
  // Puzzle state on the former address survives the single hop.
  const shared = await handler.fetch(new Request(`${PRIMARY_ORIGIN}/connections?date=2026-09-30&variant=mini`), environment());
  assert.equal(shared.headers.get("location"), `${PRIMARY_ORIGIN}/four-groups?date=2026-09-30&variant=mini`);
  // Similar but unrelated paths are not captured by the renamed-game map.
  for (const path of ["/settings", "/catan-lite", "/ar/games/set-x/", "/Catan"]) {
    assert.equal(renamedGameRedirectTarget(siteManifest, path), null, path);
  }
});

test("handler refuses a release that still deploys a renamed game's old address or lacks its new page", () => {
  const stillDeployed = structuredClone(siteManifest);
  stillDeployed.routes["/catan"] = stillDeployed.routes["/island-traders"];
  assert.throws(
    () => createSiteHandler({ siteManifest: stillDeployed, mtaStsPolicy }),
    /Renamed game address is still deployed: \/catan/u,
  );
  const oldArabicAlias = structuredClone(siteManifest);
  oldArabicAlias.aliases["/ar/games/connections.html"] = "/ar/games/four-groups/";
  assert.throws(
    () => createSiteHandler({ siteManifest: oldArabicAlias, mtaStsPolicy }),
    /Renamed game address is still deployed: \/ar\/games\/connections\.html/u,
  );
  const missingDestination = structuredClone(siteManifest);
  delete missingDestination.routes["/ar/games/fireworks/"];
  assert.throws(
    () => createSiteHandler({ siteManifest: missingDestination, mtaStsPolicy }),
    /Renamed game redirect target is absent from release routes: \/ar\/games\/hanabi\/ -> \/ar\/games\/fireworks\//u,
  );
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
    const response = await handler.fetch(new Request(`${PRIMARY_ORIGIN}${pathname}`), blockedEnvironment);
    assert.equal(response.status, 410, pathname);
    // HTML keeps the site-wide no-transform guard (docs/HTML-DELIVERY-POLICY.md).
    assert.match(response.headers.get("cache-control"), /^no-store(?:, no-transform)?$/u, pathname);
    assert.equal(response.headers.get("x-jakh-content-quarantine"), "active", pathname);
    assert.equal(response.headers.get("clear-site-data"), '"cache"', pathname);
    assert.match(response.headers.get("x-robots-tag"), /noindex.*nofollow.*noarchive.*nosnippet/u, pathname);
    assertSecurityHeaders(response);
  }
  const heldCopy = await handler.fetch(new Request(`${PRIMARY_ORIGIN}/survival`), blockedEnvironment);
  assert.match(heldCopy.headers.get("content-type"), /^text\/html;/u);
  const heldPage = await heldCopy.text();
  assert.match(heldPage, /<html lang="en" dir="ltr">/u);
  assert.match(heldPage, /This content is temporarily unavailable\./u);
  assert.match(heldPage, /هذا المحتوى غير متاح مؤقتًا/u);
  assert.doesNotMatch(heldPage, /<script|src=/iu, "held page loads nothing");
  for (const slug of siteManifest.publication.quarantinedCategories) {
    assert.ok(!heldPage.includes(slug), `held page never names or links ${slug}`);
  }
  const arabicHeld = await handler.fetch(new Request(`${PRIMARY_ORIGIN}/ar/topics/pharmacy/`), blockedEnvironment);
  assert.equal(arabicHeld.status, 410);
  const arabicPage = await arabicHeld.text();
  assert.match(arabicPage, /<html lang="ar" dir="rtl">/u);
  assert.ok(arabicPage.indexOf("غير متاح") < arabicPage.indexOf("temporarily unavailable"), "Arabic first on Arabic paths");
  const heldData = await handler.fetch(new Request(`${PRIMARY_ORIGIN}/data/pharmacy.json`), blockedEnvironment);
  assert.match(heldData.headers.get("content-type"), /^text\/plain;/u);
  assert.equal(await heldData.text(), "This content is temporarily unavailable.\n");
  assert.doesNotMatch(await handler.fetch(new Request(`${PRIMARY_ORIGIN}/survival`), blockedEnvironment).then((response) => response.text()), /review/iu);
  const head = await handler.fetch(new Request(`${PRIMARY_ORIGIN}/data/%73urvival.json`, { method: "HEAD" }), blockedEnvironment);
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
    new Request(`${PRIMARY_ORIGIN}/ar/topics/science%2ehtml%2farchive`),
    normalizingEnvironment,
  );
  assert.equal(response.status, 404);
  assert.equal(await response.text(), "custom missing");
  assert.deepEqual(requestedPaths, ["/404.html"]);
  assertSecurityHeaders(response);
});

test("success, 404, method errors, and conditional responses all carry policy", async () => {
  const success = await handler.fetch(new Request(`${PRIMARY_ORIGIN}/`), environment());
  assert.equal(success.status, 200);
  assert.match(success.headers.get("cache-control"), /max-age=0, must-revalidate/u);
  assert.match(success.headers.get("etag"), /^W\/["'][a-f0-9]{64}["']$/u);
  assertSecurityHeaders(success);
  assert.doesNotMatch(success.headers.get("content-security-policy"), /script-src[^;]*unsafe-inline/u);

  const conditional = await handler.fetch(new Request(`${PRIMARY_ORIGIN}/`, {
    headers: { "if-none-match": success.headers.get("etag") },
  }), environment());
  assert.equal(conditional.status, 304);
  assert.equal(conditional.headers.get("cache-control"), success.headers.get("cache-control"));
  assertSecurityHeaders(conditional);

  const missing = await handler.fetch(new Request(`${PRIMARY_ORIGIN}/definitely-missing`), environment());
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), "no-store, no-transform");
  assertSecurityHeaders(missing);

  const explicit404 = await handler.fetch(new Request(`${PRIMARY_ORIGIN}/404.html`), environment());
  assert.equal(explicit404.status, 404);
  assertSecurityHeaders(explicit404);

  const method = await handler.fetch(new Request(`${PRIMARY_ORIGIN}/`, { method: "POST" }), environment());
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
  assert.equal(cachePolicy({ pathname: "/admin", status: 200, contentType: "text/html", record }), "no-store");
  assert.equal(cachePolicy({ pathname: "/admin.html", status: 304, contentType: "text/html", record }), "no-store");
  assert.equal(cachePolicy({ pathname: "/admin.abcdef123456.js", status: 200, contentType: "text/javascript", record }), "public, max-age=31536000, immutable");
  assert.equal(cachePolicy({ pathname: "/page", status: 200, contentType: "text/html", record }), "public, max-age=0, must-revalidate");
  assert.equal(cachePolicy({ pathname: "/missing", status: 404, contentType: "text/html", record: null }), "no-store");
});

test("admin documents are never cached while fingerprinted admin assets stay immutable", async () => {
  const admin = await handler.fetch(new Request(`${PRIMARY_ORIGIN}/admin`), environment());
  assert.equal(admin.status, 200);
  assert.equal(admin.headers.get("cache-control"), "no-store, no-transform");
  assert.match(admin.headers.get("etag"), /^W\/['"][a-f0-9]{64}['"]$/u);
  assertSecurityHeaders(admin);

  const conditional = await handler.fetch(new Request(`${PRIMARY_ORIGIN}/admin`, {
    headers: { "if-none-match": admin.headers.get("etag") },
  }), environment());
  assert.equal(conditional.status, 304);
  assert.equal(conditional.headers.get("cache-control"), "no-store, no-transform");
  assertSecurityHeaders(conditional);

  const fingerprintedAdmin = siteManifest.fingerprints["/admin.js"];
  assert.match(fingerprintedAdmin || "", /^\/admin\.[a-f0-9]{16}\.js$/u);
  const asset = await handler.fetch(new Request(`${PRIMARY_ORIGIN}${fingerprintedAdmin}`), environment());
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assertSecurityHeaders(asset);
});

test("prior fingerprint requests fall back safely to stable compatibility assets", async () => {
  for (const stable of Object.keys(siteManifest.fingerprints)) {
    const extensionAt = stable.lastIndexOf(".");
    const prior = `${stable.slice(0, extensionAt)}.0000000000000000${stable.slice(extensionAt)}`;
    assert.equal(fingerprintCompatibilitySource(siteManifest, prior), stable);
    const response = await handler.fetch(new Request(`${PRIMARY_ORIGIN}${prior}`), environment());
    assert.equal(response.status, 200, prior);
    assert.equal(response.headers.get("cache-control"), "no-store", prior);
    assert.equal(response.headers.get("x-jakh-compatibility-fallback"), stable, prior);
    assert.equal(await response.text(), `asset:${stable}`, prior);

    const conditional = await handler.fetch(new Request(`${PRIMARY_ORIGIN}${prior}`, {
      headers: { "if-none-match": response.headers.get("etag") },
    }), environment());
    assert.equal(conditional.status, 304, prior);
    assert.equal(conditional.headers.get("cache-control"), "no-store", prior);
    assert.equal(conditional.headers.get("x-jakh-compatibility-fallback"), stable, prior);
  }

  const current = siteManifest.fingerprints["/search-leaderboard.js"];
  assert.equal(fingerprintCompatibilitySource(siteManifest, current), null);
  const currentResponse = await handler.fetch(new Request(`${PRIMARY_ORIGIN}${current}`), environment());
  assert.match(currentResponse.headers.get("cache-control"), /immutable/u);
  assert.equal(currentResponse.headers.has("x-jakh-compatibility-fallback"), false);

  const unknown = await handler.fetch(
    new Request(`${PRIMARY_ORIGIN}/unknown.0000000000000000.js`),
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

test("handler rejects a retired SEO redirect whose curated destination is absent", () => {
  const missingDestination = structuredClone(siteManifest);
  delete missingDestination.routes["/riddles"];
  assert.throws(
    () => createSiteHandler({ siteManifest: missingDestination, mtaStsPolicy }),
    /Retired SEO redirect target is absent from release routes: \/en\/riddles-with-answers -> \/riddles/u,
  );
});

test("handler rejects a retired topic redirect whose successor is absent or whose route is still deployed", () => {
  const missingSuccessor = structuredClone(siteManifest);
  delete missingSuccessor.routes["/ar/topics/science/"];
  assert.throws(
    () => createSiteHandler({ siteManifest: missingSuccessor, mtaStsPolicy }),
    /Retired topic redirect target is absent from release routes: \/ar\/topics\/physical-and-life-sciences\/ -> \/ar\/topics\/science\//u,
  );
  const stillDeployed = structuredClone(siteManifest);
  stillDeployed.routes["/coding-and-design"] = "/coding-and-design.html";
  assert.throws(
    () => createSiteHandler({ siteManifest: stillDeployed, mtaStsPolicy }),
    /Retired topic route is still in the release graph: \/coding-and-design/u,
  );
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
  assert.match(policy, /connect-src[^;]+api\.riddlearabia\.com/u);

  const stagingManifest = structuredClone(siteManifest);
  stagingManifest.adminRuntime = {
    apiOrigin: "https://api.staging.riddlearabia.com/api",
    environment: "staging",
  };
  const stagingAdminPolicy = contentSecurityPolicy(stagingManifest, "/admin", 200);
  assert.match(stagingAdminPolicy, /connect-src[^;]+https:\/\/api\.staging\.riddlearabia\.com/u);
  const stagingPublicPolicy = contentSecurityPolicy(stagingManifest, "/", 200);
  assert.doesNotMatch(stagingPublicPolicy, /api\.staging\.riddlearabia\.com/u);
});

test("HTML refuses CDN script transformations without relaxing CSP or changing asset caching", async () => {
  for (const pathname of ["/", "/admin", "/privacy", "/kids-riddles", "/definitely-missing"]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await handler.fetch(new Request(`${PRIMARY_ORIGIN}${pathname}`, { method }), environment());
      assert.match(response.headers.get("cache-control"), /(?:^|,\s*)no-transform(?:,|$)/u, pathname);
      const scriptDirective = response.headers.get("content-security-policy").split(";").find(part => part.trim().startsWith("script-src "));
      assert.doesNotMatch(scriptDirective, /unsafe-inline|cloudflareinsights\.com|\*/u);
      const etag = response.headers.get("etag");
      if (etag) {
        const conditional = await handler.fetch(new Request(`${PRIMARY_ORIGIN}${pathname}`, { headers: { "if-none-match": etag } }), environment());
        assert.equal(conditional.status, 304);
        assert.equal(conditional.headers.get("cache-control"), response.headers.get("cache-control"));
      }
    }
  }
  const asset = await handler.fetch(new Request(`${PRIMARY_ORIGIN}${siteManifest.fingerprints["/app.js"]}`), environment());
  assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000, immutable");
  const methodError = await handler.fetch(new Request(`${PRIMARY_ORIGIN}/`, { method: "POST" }), environment());
  assert.equal(methodError.headers.get("cache-control"), "no-store");
});

test("MTA-STS handler is valid but fail-closed until mail-owner activation", async () => {
  assert.equal(validateMtaStsPolicy(mtaStsPolicy), true);
  assert.equal(validateMtaStsPolicy("version: STSv1\nmode: enforce\nmax_age: 86400\n"), false);
  const disabled = await handler.fetch(new Request("https://mta-sts.riddlearabia.com/.well-known/mta-sts.txt"), environment());
  assert.equal(disabled.status, 404);
  assertSecurityHeaders(disabled);

  const enabled = await handler.fetch(
    new Request("https://mta-sts.riddlearabia.com/.well-known/mta-sts.txt"),
    environment({ MTA_STS_ENABLED: "true" }),
  );
  assert.equal(enabled.status, 200);
  assert.equal(await enabled.text(), mtaStsPolicy);
  assert.match(enabled.headers.get("content-type"), /^text\/plain/u);
  assertSecurityHeaders(enabled);

  const legacyEnabled = await handler.fetch(
    new Request("https://mta-sts.jakh.net/.well-known/mta-sts.txt"),
    environment({ MTA_STS_ENABLED: "true" }),
  );
  assert.equal(legacyEnabled.status, 404);
  assert.equal(legacyEnabled.headers.get("location"), null);
});

// ---------------------------------------------------------------------------
// Build-time HTML compression. The Worker never compresses at request time
// (Free-plan CPU budget, PR #161); it only picks a stored copy.

const distRoot = resolve(repositoryRoot, "site-worker/dist");
const largestPage = Object.entries(siteManifest.routes)
  .filter(([route]) => route !== "/__404__")
  .map(([route, physical]) => [route, physical, siteManifest.files[physical].bytes])
  .sort((left, right) => right[2] - left[2])[0];

function storedContentType(pathname) {
  if (pathname.endsWith(".gz")) return "application/gzip";
  return contentType(pathname);
}

// Serves the real built bytes, like the Workers static-assets binding, and
// records every request so tests can prove which file was read.
function builtEnvironment({ override } = {}) {
  const requests = [];
  const bodies = new Map();
  return {
    requests,
    bodies,
    env: {
      MTA_STS_ENABLED: "false",
      ASSETS: {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          requests.push({ pathname, headers: Object.fromEntries(request.headers) });
          const custom = override?.(pathname, request);
          if (custom) return custom;
          if (!siteManifest.files[pathname]) return new Response("missing", { status: 404 });
          const bytes = await readFile(resolve(distRoot, pathname.slice(1)));
          const response = new Response(bytes, {
            headers: { "content-type": storedContentType(pathname), "content-length": String(bytes.length) },
          });
          bodies.set(pathname, response.body);
          return response;
        },
      },
    },
  };
}

function visitorRequest(pathname, { clientAcceptEncoding, header = "br, gzip", method = "GET", headers = {} } = {}) {
  const request = new Request(`${PRIMARY_ORIGIN}${pathname}`, {
    method,
    headers: header === null ? headers : { "accept-encoding": header, ...headers },
  });
  if (clientAcceptEncoding !== undefined) {
    Object.defineProperty(request, "cf", { value: { clientAcceptEncoding } });
  }
  return request;
}

function withoutRuntimeCompression(t) {
  const original = { CompressionStream: globalThis.CompressionStream, DecompressionStream: globalThis.DecompressionStream };
  const refuse = class {
    constructor() {
      throw new Error("the Worker must not compress or decompress at request time");
    }
  };
  globalThis.CompressionStream = refuse;
  globalThis.DecompressionStream = refuse;
  t.after(() => Object.assign(globalThis, original));
}

function decode(encoding, bytes) {
  if (encoding === "br") return brotliDecompressSync(bytes);
  if (encoding === "gzip") return gunzipSync(bytes);
  return bytes;
}

test("the production build lists br and gzip copies for its HTML pages", () => {
  assert.equal(siteManifest.htmlPrecompression.enabled, true);
  assert.deepEqual(siteManifest.htmlPrecompression.encodings, ["br", "gzip"]);
  for (const page of ["/index.html", "/ar/alghaz/index.html", "/404.html", "/admin.html", largestPage[1]]) {
    const variants = siteManifest.htmlPrecompression.variants[page];
    assert.ok(variants?.br && variants?.gzip, `${page} has both compressed copies`);
  }
});

test("HTML is served from its stored compressed copy, byte-exact, with no request-time compression", async (t) => {
  withoutRuntimeCompression(t);
  const pages = [["/", "/index.html"], ["/ar/alghaz/", "/ar/alghaz/index.html"], ["/admin", "/admin.html"], largestPage.slice(0, 2)];
  for (const [pathname, physical] of pages) {
    const stored = await readFile(resolve(distRoot, physical.slice(1)));
    const { env, requests, bodies } = builtEnvironment();
    const identity = await handler.fetch(visitorRequest(pathname, { clientAcceptEncoding: "identity" }), env);
    assert.equal(identity.headers.get("content-encoding"), null, pathname);
    assert.ok(Buffer.from(await identity.arrayBuffer()).equals(stored), `${pathname} identity bytes`);

    for (const [clientAcceptEncoding, encoding] of [
      ["gzip, deflate, br, zstd", "br"],
      ["gzip, deflate, br", "br"],
      ["gzip, deflate", "gzip"],
      ["br;q=0, gzip", "gzip"],
      ["gzip;q=1, br;q=0.5", "gzip"],
      ["x-gzip", "gzip"],
    ]) {
      const response = await handler.fetch(visitorRequest(pathname, { clientAcceptEncoding }), env);
      const label = `${pathname} (${clientAcceptEncoding})`;
      assert.equal(response.status, 200, label);
      assert.equal(response.headers.get("content-encoding"), encoding, label);
      assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8", label);
      assert.match(response.headers.get("vary") || "", /accept-encoding/iu, label);
      assert.equal(response.headers.get("content-length"), null, label);
      assert.equal(response.headers.get("etag"), identity.headers.get("etag"), label);
      for (const name of ["cache-control", "content-security-policy", "x-jakh-site-version", "x-frame-options", "x-robots-tag"]) {
        assert.equal(response.headers.get(name), identity.headers.get(name), `${label} ${name}`);
      }
      assertSecurityHeaders(response);
      const copy = siteManifest.htmlPrecompression.variants[physical][encoding];
      assert.equal(requests.at(-1).pathname, copy, `${label} reads the stored copy`);
      assert.deepEqual(Object.keys(requests.at(-1).headers), [], `${label} asks for the copy without visitor headers`);
      // The stored stream is handed through untouched: no buffering, no transform.
      assert.equal(response.body, bodies.get(copy), `${label} passes the stored body stream through`);
      const decoded = decode(encoding, Buffer.from(await response.arrayBuffer()));
      assert.ok(decoded.equals(stored), `${label} decodes to the exact stored HTML, so CSP hashes still match`);
    }
  }
});

test("compressed HTML is chosen only when the visitor's own Accept-Encoding allows it", async () => {
  const { env } = builtEnvironment();
  const cases = [
    // Cloudflare replaced the header and kept the visitor's value.
    [{ clientAcceptEncoding: "gzip, deflate, br" }, "br"],
    [{ clientAcceptEncoding: "" }, null],
    [{ clientAcceptEncoding: "identity" }, null],
    [{ clientAcceptEncoding: "*" }, null],
    [{ clientAcceptEncoding: "deflate" }, null],
    [{ clientAcceptEncoding: "br;q=0, gzip;q=0" }, null],
    [{ clientAcceptEncoding: "gzip;q=0.000, br;q=1.5" }, null],
    // No original value: Cloudflare's own canonical header proves nothing.
    [{ clientAcceptEncoding: null, header: "br, gzip" }, null],
    [{ clientAcceptEncoding: null, header: "gzip" }, null],
    [{ clientAcceptEncoding: null, header: "gzip, deflate, br" }, "br"],
    // Off Cloudflare (tests, local preview) the header is the visitor's own.
    [{ header: "br" }, "br"],
    [{ header: "gzip" }, "gzip"],
    [{ header: null }, null],
  ];
  for (const [options, expected] of cases) {
    const response = await handler.fetch(visitorRequest("/", options), env);
    assert.equal(response.status, 200, JSON.stringify(options));
    assert.equal(response.headers.get("content-encoding"), expected, JSON.stringify(options));
    assert.match(response.headers.get("vary") || "", /accept-encoding/iu, `${JSON.stringify(options)}: every form varies`);
  }
  assert.equal(negotiateHtmlEncoding("gzip, br", ["br", "gzip"]), "br", "brotli wins a tie");
  assert.equal(negotiateHtmlEncoding("GZIP;Q=0.8, BR;Q=0.4", ["br", "gzip"]), "gzip");
  assert.equal(negotiateHtmlEncoding("br, br;q=0", ["br", "gzip"]), null, "a repeated coding keeps its most cautious quality");
  assert.equal(visitorAcceptEncoding(visitorRequest("/", { clientAcceptEncoding: "zstd", header: "br, gzip" })), "zstd");
});

test("HEAD, Range, conditional, 404 and quarantine responses keep their behaviour", async (t) => {
  withoutRuntimeCompression(t);
  const { env, requests } = builtEnvironment();
  const br = { clientAcceptEncoding: "gzip, deflate, br" };

  const head = await handler.fetch(visitorRequest("/ar/alghaz/", { ...br, method: "HEAD" }), env);
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-encoding"), null, "HEAD describes the stored page as today");
  assert.match(head.headers.get("vary") || "", /accept-encoding/iu);
  assert.equal(await head.text(), "");

  const range = await handler.fetch(visitorRequest("/ar/alghaz/", { ...br, headers: { range: "bytes=0-99" } }), env);
  assert.equal(range.headers.get("content-encoding"), null, "a byte range is never taken from a compressed copy");

  const full = await handler.fetch(visitorRequest("/ar/alghaz/", br), env);
  const etag = full.headers.get("etag");
  assert.match(etag, /^W\/"[a-f0-9]{64}"$/u);
  const conditional = await handler.fetch(visitorRequest("/ar/alghaz/", { ...br, headers: { "if-none-match": etag } }), env);
  assert.equal(conditional.status, 304);
  assert.equal(conditional.headers.get("etag"), etag, "a 304 repeats the ETag");
  assert.match(conditional.headers.get("vary") || "", /accept-encoding/iu, "a 304 repeats the Vary of the 200");
  assert.equal(conditional.headers.get("content-encoding"), null);
  assert.equal(conditional.headers.get("cache-control"), full.headers.get("cache-control"));

  const stored404 = await readFile(resolve(distRoot, "404.html"));
  for (const pathname of ["/definitely-missing", "/404", "/404.html"]) {
    const missing = await handler.fetch(visitorRequest(pathname, br), env);
    assert.equal(missing.status, 404, pathname);
    assert.equal(missing.headers.get("cache-control"), "no-store, no-transform", pathname);
    assert.equal(missing.headers.get("etag"), null, pathname);
    assertSecurityHeaders(missing);
    assert.ok(decode(missing.headers.get("content-encoding"), Buffer.from(await missing.arrayBuffer())).equals(stored404), pathname);
  }

  const before = requests.length;
  const held = await handler.fetch(visitorRequest("/survival", br), env);
  assert.equal(held.status, 410);
  assert.equal(held.headers.get("content-encoding"), null);
  assert.equal(held.headers.get("x-jakh-content-quarantine"), "active");
  assert.equal(requests.length, before, "quarantine still answers before any asset access");
});

test("compressed copies are internal files, never public URLs", async () => {
  const [page, variants] = Object.entries(siteManifest.htmlPrecompression.variants).find(([path]) => path !== "/404.html");
  const stored404 = await readFile(resolve(distRoot, "404.html"));
  for (const copy of [variants.br, variants.gzip]) {
    for (const pathname of [copy, copy.toUpperCase(), copy.replace("/__precompressed/", "/__Precompressed/"), `${copy}?x=1`]) {
      for (const method of ["GET", "HEAD"]) {
        const { env, requests } = builtEnvironment();
        const response = await handler.fetch(visitorRequest(pathname, { clientAcceptEncoding: "identity", method }), env);
        assert.equal(response.status, 404, `${method} ${pathname} (copy of ${page})`);
        assert.equal(response.headers.get("content-encoding"), null);
        assert.deepEqual(requests.map((request) => request.pathname), ["/404.html"], `${pathname} only reads the 404 page`);
        if (method === "GET") assert.ok(Buffer.from(await response.arrayBuffer()).equals(stored404));
      }
    }
  }
});

test("a missing or unexpected compressed copy falls back to the stored page", async () => {
  const stored = await readFile(resolve(distRoot, "index.html"));
  const copy = siteManifest.htmlPrecompression.variants["/index.html"].br;
  const brokenCopies = {
    "missing": () => new Response("missing", { status: 404 }),
    "server error": () => new Response("error", { status: 500 }),
    "re-encoded by the asset server": () => new Response("x", { headers: { "content-encoding": "gzip" } }),
    "wrong length": () => new Response("short", { headers: { "content-length": "5" } }),
    "thrown": () => { throw new Error("asset binding unavailable"); },
  };
  for (const [label, broken] of Object.entries(brokenCopies)) {
    const { env } = builtEnvironment({ override: (pathname) => pathname === copy ? broken() : null });
    const response = await handler.fetch(visitorRequest("/", { clientAcceptEncoding: "gzip, deflate, br" }), env);
    assert.equal(response.status, 200, label);
    assert.equal(response.headers.get("content-encoding"), null, label);
    assert.match(response.headers.get("vary") || "", /accept-encoding/iu, label);
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(stored), label);
  }
});

test("turning precompression off in the manifest serves every page uncompressed", async () => {
  const disabled = structuredClone(siteManifest);
  disabled.htmlPrecompression.enabled = false;
  disabled.htmlPrecompression.variants = {};
  const offHandler = createSiteHandler({ siteManifest: disabled, mtaStsPolicy });
  const { env, requests } = builtEnvironment();
  for (const pathname of ["/", "/ar/alghaz/", "/definitely-missing"]) {
    const response = await offHandler.fetch(visitorRequest(pathname, { clientAcceptEncoding: "gzip, deflate, br" }), env);
    assert.equal(response.headers.get("content-encoding"), null, pathname);
    assert.equal(response.headers.get("vary"), null, pathname);
  }
  assert.equal(requests.some(({ pathname }) => pathname.startsWith("/__precompressed/")), false);
});

test("handler rejects compressed copies that are routable, misnamed or held", () => {
  const variantsFor = (manifest) => manifest.htmlPrecompression.variants;
  const misnamed = structuredClone(siteManifest);
  variantsFor(misnamed)["/index.html"].br = variantsFor(misnamed)["/ar/alghaz/index.html"].br;
  assert.throws(() => createSiteHandler({ siteManifest: misnamed, mtaStsPolicy }), /Invalid precompressed br copy of \/index\.html/u);

  const absent = structuredClone(siteManifest);
  delete absent.files[variantsFor(absent)["/index.html"].gzip];
  assert.throws(() => createSiteHandler({ siteManifest: absent, mtaStsPolicy }), /Invalid precompressed gzip copy/u);

  const held = structuredClone(siteManifest);
  variantsFor(held)["/survival.html"] = variantsFor(held)["/index.html"];
  assert.throws(() => createSiteHandler({ siteManifest: held, mtaStsPolicy }), /not a deployed HTML file: \/survival\.html/u);

  const routable = structuredClone(siteManifest);
  routable.routes["/compressed-home"] = variantsFor(routable)["/index.html"].br;
  assert.throws(() => createSiteHandler({ siteManifest: routable, mtaStsPolicy }), /Precompressed copy is routable/u);

  const switchedOff = structuredClone(siteManifest);
  switchedOff.htmlPrecompression.enabled = false;
  assert.throws(() => createSiteHandler({ siteManifest: switchedOff, mtaStsPolicy }), /listed while precompression is off/u);
});

test("405 responses name the allowed methods and 304 responses keep their ETag", async () => {
  for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
    const response = await handler.fetch(new Request(`${PRIMARY_ORIGIN}/`, { method }), environment());
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get("allow"), "GET, HEAD", method);
    assertSecurityHeaders(response);
  }
  for (const pathname of ["/", "/privacy", siteManifest.fingerprints["/app.js"], "/sw.js"]) {
    const first = await handler.fetch(new Request(`${PRIMARY_ORIGIN}${pathname}`), environment());
    const etag = first.headers.get("etag");
    assert.match(etag, /^W\/"[a-f0-9]{64}"$/u, pathname);
    const conditional = await handler.fetch(new Request(`${PRIMARY_ORIGIN}${pathname}`, { headers: { "if-none-match": etag } }), environment());
    assert.equal(conditional.status, 304, pathname);
    assert.equal(conditional.headers.get("etag"), etag, pathname);
  }
});

test("the Worker version header is added to the same Response object", () => {
  const response = new Response("body", { headers: { "content-encoding": "br" } });
  assert.equal(withWorkerVersion(response, "v1"), response, "re-wrapping would drop encodeBody: manual");
  assert.equal(response.headers.get("x-jakh-worker-version"), "v1");
  assert.equal(withWorkerVersion(response, undefined), response);
  class ImmutableHeaders extends Headers {
    set() {
      throw new TypeError("immutable headers");
    }
  }
  const fetched = { status: 200, statusText: "OK", body: null, headers: new ImmutableHeaders({ "content-type": "text/plain" }) };
  const copied = withWorkerVersion(fetched, "v2");
  assert.notEqual(copied, fetched);
  assert.equal(copied.headers.get("x-jakh-worker-version"), "v2");
  assert.equal(copied.headers.get("content-type"), "text/plain");
});
