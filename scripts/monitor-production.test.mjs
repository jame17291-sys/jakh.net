import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  API_RELEASE_CONTRACT,
  buildMonitorReport,
  HTML_ROUTES,
  INDEXABLE_SITEMAP_PATHS,
  PRE_NAVIGATION_HTML_ROUTES,
  PRE_NAVIGATION_SITEMAP_PATHS,
  QUARANTINED_CATEGORY_SLUGS,
  QUARANTINED_SITE_ROUTES,
  PRIMARY_SITE_ORIGIN,
  PRIMARY_API_ORIGIN,
  retiredSeoRedirectProbeDefinitions,
  runProductionMonitor,
  UNAUTHENTICATED_API_GET_ROUTES,
} from "./monitor-production.mjs";
import { navigationScript, siteHeader } from "./site-navigation-markup.mjs";
import { buildStaticSite } from "./build-static-site.mjs";

const FIXTURE_WORKER_VERSION = "11111111-1111-4111-8111-111111111111";

function quietLogger() {
  return { log() {}, error() {} };
}

function apiHeaders(origin, cacheControl = "no-store") {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
    "x-jakh-worker-version": FIXTURE_WORKER_VERSION,
    "referrer-policy": "no-referrer",
  };
  if (origin && origin !== "https://example.invalid") {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-credentials"] = "true";
    headers.vary = "Origin";
  }
  return headers;
}

function staticBody(pathname, { siteOrigin, apiOrigin, legacySite = false, preNavigation = false, builtHtml = false }) {
  if (legacySite && ["/riddles", "/ar/alghaz/", "/brain-games"].includes(pathname)) return null;
  const route = (legacySite || preNavigation ? PRE_NAVIGATION_HTML_ROUTES : HTML_ROUTES)
    .find((candidate) => candidate.path === pathname);
  if (route) {
    if (builtHtml) {
      const relativePath = pathname === "/" ? "index.html"
        : pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : `${pathname.slice(1)}.html`;
      return readFileSync(resolve(builtHtml, relativePath), "utf8");
    }
    const categoryAttributes = pathname === "/science" ? ' data-page="category" data-category="science"' : "";
    const categoryMount = pathname === "/science" ? '<div id="cardGrid"></div>' : "";
    const navigation = legacySite || preNavigation ? "" : siteHeader({
      lang: pathname.startsWith("/ar/") ? "ar" : "en",
      alternate: pathname.startsWith("/ar/") ? "/" : "/ar/",
    }) + navigationScript;
    return `<!doctype html><html><head>${legacySite ? "<title>JAKH Riddles" : route.marker}</title></head><body${categoryAttributes}>${route.bilingualMarker}${navigation}${categoryMount}ok</body></html>`;
  }
  if (pathname === "/data/catalog.json") {
    return JSON.stringify({
      site: {
        totalQuestions: 3_275,
      },
      categories: Array.from({ length: 51 }, (_, index) => ({ slug: `category-${index}` })),
    });
  }
  if (pathname === "/data/card-index.json") {
    return JSON.stringify(Object.fromEntries(
      Array.from({ length: 3_275 }, (_, index) => [`public-card-${index}`, ["category-0", "easy"]]),
    ));
  }
  if (pathname === "/data/search-index.en.json" || pathname === "/data/search-index.ar.json") {
    const language = pathname.includes(".ar.") ? "ar" : "en";
    return JSON.stringify({
      version: 2,
      language,
      total: 3_275,
      categories: Array.from({ length: 51 }, (_, index) => `category-${index}`),
      cards: Array.from({ length: 3_275 }, (_, index) => [0, `public-card-${index}`, `q-${index}`, `a-${index}`]),
    });
  }
  if (pathname === "/manifest.webmanifest") {
    return JSON.stringify({
      name: legacySite ? "JAKH Riddles" : "Riddle Arabia",
      start_url: "/",
      icons: [{ src: "one.png" }, { src: "two.png" }],
    });
  }
  if (pathname === "/sitemap.xml") {
    const paths = legacySite ? ["/", "/science", "/en/riddles-with-answers"]
      : preNavigation ? PRE_NAVIGATION_SITEMAP_PATHS : INDEXABLE_SITEMAP_PATHS;
    const urls = paths.map((pathname) => new URL(pathname, siteOrigin).href);
    return `<urlset>${urls.map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;
  }
  if (pathname === "/.well-known/security.txt") {
    return [
      "Contact: https://github.com/jame17291-sys/jakh.net/security/advisories/new",
      "Expires: 2027-07-30T23:59:59Z",
      `Canonical: ${siteOrigin}/.well-known/security.txt`,
    ].join("\n");
  }
  if (pathname === "/assets/riddlearabia-og-image.png") {
    if (legacySite) return null;
    return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (legacySite && pathname === "/assets/og-image.jpg") return Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  if (pathname === "/app.js") return `const endpoint = '${apiOrigin}';`;
  if (pathname === "/site-navigation.js" && !legacySite && !preNavigation) return "document.querySelector('.primary-navigation');";
  if (pathname === "/site-i18n.js") return "window.JakhI18n = {};";
  if (pathname === "/game-i18n.js") return "window.JakhGameI18n = {};";
  if (pathname === "/privacy-consent.js") return "window.JakhPrivacy = {};";
  if (pathname === "/styles.css") return ":root { color-scheme: light; }";
  if (pathname === "/sw.js") return "self.addEventListener('fetch', () => {});";
  return null;
}

async function startFixture({ brokenCors = false, homeDelayMs = 0, apiSchema = "9", pagesMode = false, legacySite = false, preNavigation = false, productionSite = false, builtHtml = false } = {}) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://fixture.test");
    const requestOrigin = request.headers.origin;

    if (url.pathname === "/" && homeDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, homeDelayMs));
    }

    if (request.method === "OPTIONS" && url.pathname === "/api/user/profile") {
      const headers = apiHeaders(brokenCors ? undefined : requestOrigin);
      response.writeHead(204, {
        ...headers,
        "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
        "access-control-allow-headers": "Content-Type",
        "access-control-max-age": "86400",
      });
      response.end();
      return;
    }

    if (url.pathname === "/api/health" && requestOrigin === "https://example.invalid") {
      response.writeHead(403, apiHeaders());
      response.end(JSON.stringify({ error: "Origin is not allowed" }));
      return;
    }

    if (url.pathname === "/api/health") {
      response.writeHead(200, apiHeaders(brokenCors ? undefined : requestOrigin));
      response.end(JSON.stringify({
        ok: true,
        workerVersionId: FIXTURE_WORKER_VERSION,
        ...API_RELEASE_CONTRACT,
        schema: apiSchema,
        features: {
          registration: Number(apiSchema) >= 7,
          accountRecovery: Number(apiSchema) >= 7,
          accountDeletion: Number(apiSchema) >= 8,
          contentStudio: Number(apiSchema) >= 9,
        },
      }));
      return;
    }

    if (
      url.pathname === "/api/leaderboard"
      && QUARANTINED_CATEGORY_SLUGS.includes(url.searchParams.get("category"))
    ) {
      response.writeHead(503, {
        ...apiHeaders(brokenCors ? undefined : requestOrigin),
        "retry-after": "86400",
      });
      response.end(JSON.stringify({
        error: "Category is temporarily unavailable",
        code: "CATEGORY_QUARANTINED",
      }));
      return;
    }

    if (url.pathname === "/api/leaderboard") {
      response.writeHead(
        200,
        apiHeaders(brokenCors ? undefined : requestOrigin, "public, max-age=30"),
      );
      response.end(JSON.stringify({
        status: "active",
        scoreType: "server-checked",
        serverChecked: true,
        proctored: false,
        automationDisclaimer: "Server checking does not prevent lookups or automation.",
        leaderboard: [],
      }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/battle/create") {
      response.writeHead(503, {
        ...apiHeaders(brokenCors ? undefined : requestOrigin),
        "retry-after": "86400",
      });
      response.end(JSON.stringify({
        error: "Category is temporarily unavailable",
        code: "CATEGORY_QUARANTINED",
      }));
      return;
    }

    if (UNAUTHENTICATED_API_GET_ROUTES.some(({ path }) => path === url.pathname)) {
      response.writeHead(401, apiHeaders(brokenCors ? undefined : requestOrigin));
      response.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    if (QUARANTINED_SITE_ROUTES.some(({ path }) => path === url.pathname)) {
      if (pagesMode) {
        response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        response.end("<!doctype html><title>Page Not Found | JAKH Riddles</title>");
        return;
      }
      response.writeHead(410, {
        "cache-control": "no-store",
        "clear-site-data": '"cache"',
        "content-type": "text/plain; charset=utf-8",
        "x-jakh-content-quarantine": "active",
        "x-jakh-worker-version": FIXTURE_WORKER_VERSION,
        "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
      });
      response.end("Content temporarily unavailable.\n");
      return;
    }

    if (url.pathname === "/api/__jakh-production-monitor-missing__") {
      response.writeHead(404, apiHeaders());
      response.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const fixtureOrigin = `http://${request.headers.host}`;
    const body = staticBody(url.pathname, {
      siteOrigin: legacySite ? "https://jakh.net" : productionSite ? PRIMARY_SITE_ORIGIN : fixtureOrigin,
      apiOrigin: legacySite ? "https://api.jakh.net" : productionSite ? PRIMARY_API_ORIGIN : fixtureOrigin,
      legacySite,
      preNavigation,
      builtHtml,
    });
    if (body !== null) {
      const contentType = url.pathname.endsWith(".css")
        ? "text/css; charset=utf-8"
        : url.pathname.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : url.pathname.endsWith(".png")
            ? "image/png"
            : url.pathname.endsWith(".jpg")
              ? "image/jpeg"
            : url.pathname.endsWith(".xml")
              ? "application/xml; charset=utf-8"
              : url.pathname.endsWith(".txt")
                ? "text/plain; charset=utf-8"
          : url.pathname.endsWith(".json")
            ? "application/json; charset=utf-8"
            : url.pathname.endsWith(".webmanifest")
              ? "application/manifest+json; charset=utf-8"
              : "text/html; charset=utf-8";
      response.writeHead(200, {
        "content-type": contentType,
        ...(pagesMode ? {} : { "x-jakh-worker-version": FIXTURE_WORKER_VERSION }),
      });
      response.end(body);
      return;
    }

    response.writeHead(404, {
      "content-type": "text/html; charset=utf-8",
      ...(pagesMode ? {} : { "x-jakh-worker-version": FIXTURE_WORKER_VERSION }),
    });
    response.end("<!doctype html><title>Page Not Found | JAKH Riddles</title>");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function withFixture(options, run) {
  const fixture = await startFixture(options);
  try {
    return await run(fixture.origin);
  } finally {
    await fixture.close();
  }
}

function productionFixtureOptions(fixtureOrigin, overrides = {}) {
  const redirects = new Map(retiredSeoRedirectProbeDefinitions(PRIMARY_SITE_ORIGIN)
    .map((definition) => [definition.url, definition.location]));
  return {
    env: {}, scope: "site", siteOrigin: PRIMARY_SITE_ORIGIN, apiOrigin: PRIMARY_API_ORIGIN,
    siteContract: "release-baseline", expectedWorkerVersion: FIXTURE_WORKER_VERSION,
    legacySiteOrigins: [], maxCheckAttempts: 1, logger: quietLogger(), throwOnFailure: false,
    fetchImpl: (input, init) => {
      const url = new URL(input);
      assert.equal(url.origin, PRIMARY_SITE_ORIGIN);
      if (redirects.has(url.href)) return Promise.resolve(new Response(null, {
        status: 301, headers: {
          location: redirects.get(url.href), "cache-control": "public, max-age=86400",
          "x-jakh-worker-version": FIXTURE_WORKER_VERSION,
        },
      }));
      return fetch(new URL(`${url.pathname}${url.search}`, fixtureOrigin), init);
    },
    ...overrides,
  };
}

test("release baseline is restricted to the exact production predecessor in site scope", async () => {
  const baseline = productionFixtureOptions("http://127.0.0.1");
  for (const change of [
    { siteOrigin: "https://jakh.net" }, { apiOrigin: "https://api.jakh.net" },
    { scope: "all" }, { scope: "pages" }, { expectedWorkerVersion: "" },
  ]) {
    await assert.rejects(runProductionMonitor({ ...baseline, ...change }), /release-baseline requires/u);
  }
});

test("only an explicit version-bound baseline accepts the complete predecessor layout", async () => {
  await withFixture({ preNavigation: true, productionSite: true }, async (fixtureOrigin) => {
    const options = productionFixtureOptions(fixtureOrigin);
    const baseline = await runProductionMonitor(options);
    assert.deepEqual(baseline.failures, []);
    assert.equal(buildMonitorReport(baseline).monitor.navigationLayout, "pre-navigation");
    assert.equal(baseline.results.filter(({ name }) => name.startsWith("Site quarantine:")).length, QUARANTINED_SITE_ROUTES.length);
    assert.ok(baseline.results.every(({ workerVersionId }) => workerVersionId === FIXTURE_WORKER_VERSION));

    const candidate = await runProductionMonitor({ ...options, siteContract: "current" });
    for (const name of ["Site: Home", "Site: Riddles & Quizzes", "Site: Daily Challenge", "Site: sitemap", "Site: Shared navigation"]) {
      assert.ok(candidate.failures.some((failure) => failure.name === name), `${name} must reject the predecessor`);
    }

    const wrongVersion = await runProductionMonitor({ ...options, expectedWorkerVersion: "22222222-2222-4222-8222-222222222222" });
    assert.ok(wrongVersion.failures.some(({ name }) => name === "Site: version-bound navigation baseline"));
    const mixed = await runProductionMonitor({ ...options, fetchImpl: async (input, init) => {
      const response = await options.fetchImpl(input, init);
      if (new URL(input).pathname !== "/science") return response;
      return new Response((await response.text()) + siteHeader(), { status: response.status, headers: response.headers });
    } });
    assert.ok(mixed.failures.some(({ name, message }) => name === "Site: Science category" && /coherent/u.test(message)));

    const leaked = await runProductionMonitor({ ...options, fetchImpl: (input, init) => new URL(input).pathname === "/survival"
      ? Promise.resolve(new Response("held content", { headers: { "x-jakh-worker-version": FIXTURE_WORKER_VERSION } }))
      : options.fetchImpl(input, init) });
    assert.ok(leaked.failures.some(({ name }) => name.startsWith("Site quarantine:")));
  });
});

test("a current predecessor still requires the complete current navigation contract", async () => {
  await withFixture({ productionSite: true }, async (fixtureOrigin) => {
    const options = productionFixtureOptions(fixtureOrigin);
    const baseline = await runProductionMonitor(options);
    assert.deepEqual(baseline.failures, []);
    assert.equal(baseline.navigationLayout, "current");
    assert.ok(baseline.results.some(({ name }) => name === "Site: Daily Challenge"));
    const broken = await runProductionMonitor({ ...options, fetchImpl: async (input, init) => {
      const response = await options.fetchImpl(input, init);
      if (new URL(input).pathname !== "/daily") return response;
      return new Response((await response.text()).replace('data-nav="games"', 'data-nav="broken"'), {
        status: response.status, headers: response.headers,
      });
    } });
    assert.ok(broken.failures.some(({ name, message }) => name === "Site: Daily Challenge" && /games destination/u.test(message)));
  });
});

test("strict navigation probes pass every HTML route from a fresh real production build", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "riddlearabia-monitor-artifact-"));
  try {
    const outputDirectory = join(temporary, "dist");
    const manifest = await buildStaticSite({
      sourceRoot: resolve(import.meta.dirname, ".."), outputDirectory,
      manifestPath: join(temporary, "manifest.json"), manifestModulePath: join(temporary, "manifest.mjs"),
      adminApiOrigin: "https://api.riddlearabia.com/api", adminEnvironment: "production",
    });
    assert.match(manifest.fingerprints["/site-navigation.js"], /^\/site-navigation\.[a-f0-9]{16}\.js$/u);
    await withFixture({ builtHtml: outputDirectory }, async (fixtureOrigin) => {
      const summary = await runProductionMonitor({
        env: {}, scope: "site", siteOrigin: fixtureOrigin, apiOrigin: fixtureOrigin,
        expectedWorkerVersion: FIXTURE_WORKER_VERSION, maxCheckAttempts: 1,
        logger: quietLogger(), throwOnFailure: false,
      });
      assert.deepEqual(summary.failures, []);
      for (const route of HTML_ROUTES) {
        assert.ok(summary.results.some(({ name }) => name === `Site: ${route.name}`), `${route.path} must be tested`);
      }
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("cutover baseline accepts the old brand and sitemap while retaining version and quarantine checks", async () => {
  await withFixture({ legacySite: true }, async (fixtureOrigin) => {
    const baselineOptions = {
      env: {},
      scope: "site",
      siteContract: "legacy-cutover",
      siteOrigin: "https://jakh.net",
      apiOrigin: "https://api.jakh.net",
      expectedWorkerVersion: FIXTURE_WORKER_VERSION,
      maxCheckAttempts: 1,
      logger: quietLogger(),
      throwOnFailure: false,
      fetchImpl: (input, init) => {
        const url = new URL(input);
        assert.equal(url.origin, "https://jakh.net");
        return fetch(new URL(`${url.pathname}${url.search}`, fixtureOrigin), init);
      },
    };
    const baseline = await runProductionMonitor(baselineOptions);
    assert.deepEqual(baseline.failures, []);
    assert.equal(buildMonitorReport(baseline).monitor.siteContract, "legacy-cutover");
    assert.equal(baseline.results.filter(({ name }) => name.startsWith("Site quarantine:")).length, QUARANTINED_SITE_ROUTES.length);
    assert.ok(baseline.results.every(({ workerVersionId }) => workerVersionId === FIXTURE_WORKER_VERSION));

    const candidate = await runProductionMonitor({ ...baselineOptions, siteContract: "current" });
    assert.ok(candidate.failures.some(({ name }) => name === "Site: Home"));
    assert.ok(candidate.failures.some(({ name }) => name === "Site: sitemap"));
    assert.ok(candidate.failures.some(({ name }) => name === "Site: social preview image"));

    const wrongVersion = await runProductionMonitor({
      ...baselineOptions,
      expectedWorkerVersion: "22222222-2222-4222-8222-222222222222",
    });
    assert.ok(wrongVersion.failures.some(({ message }) => message.includes("expected 22222222")));

    const leaked = await runProductionMonitor({
      ...baselineOptions,
      fetchImpl: (input, init) => new URL(input).pathname === "/survival"
        ? new Response("held content", { headers: { "x-jakh-worker-version": FIXTURE_WORKER_VERSION } })
        : baselineOptions.fetchImpl(input, init),
    });
    assert.ok(leaked.failures.some(({ name }) => name.startsWith("Site quarantine:")));
  });
});

test("legacy baseline mode refuses candidate hosts, mixed scopes and unbound versions", async () => {
  const baselineOptions = {
    env: {}, scope: "site", siteContract: "legacy-cutover", siteOrigin: "https://jakh.net",
    apiOrigin: "https://api.jakh.net", expectedWorkerVersion: FIXTURE_WORKER_VERSION,
  };
  for (const change of [
    { siteOrigin: "https://riddlearabia.com" },
    { apiOrigin: "https://api.riddlearabia.com" },
    { scope: "all" },
    { scope: "pages" },
    { expectedWorkerVersion: "" },
  ]) {
    await assert.rejects(runProductionMonitor({ ...baselineOptions, ...change }), /legacy-cutover requires/u);
  }
});

test("production monitor passes all deterministic checks", async () => {
  await withFixture({}, async (fixtureOrigin) => {
    const summary = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      timeoutMs: 2_000,
      siteMaxMs: 1_000,
      apiMaxMs: 1_000,
      logger: quietLogger(),
    });

    assert.equal(summary.failures.length, 0);
    assert.equal(summary.results.length, HTML_ROUTES.length + 27 + QUARANTINED_SITE_ROUTES.length);
  });
});

test("production monitor scopes API and site release checks without cross-surface requests", async () => {
  await withFixture({}, async (fixtureOrigin) => {
    const api = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      scope: "api",
      timeoutMs: 2_000,
      siteMaxMs: 1_000,
      apiMaxMs: 1_000,
      logger: quietLogger(),
    });
    assert.ok(api.results.length > 0);
    assert.ok(api.results.every(({ name }) => name.startsWith("API")));
    assert.ok(api.results.some(({ name }) => name === "API quarantine: held Battle category"));

    const site = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      scope: "site",
      timeoutMs: 2_000,
      siteMaxMs: 1_000,
      apiMaxMs: 1_000,
      logger: quietLogger(),
    });
    assert.ok(site.results.length > 0);
    assert.ok(site.results.every(({ name }) => name.startsWith("Site")));
    assert.ok(site.results.some(({ name }) => name === "Site quarantine: recursively encoded canonical page"));
  });
});

test("production monitor requires one-hop legacy redirects to the new primary site", async () => {
  await withFixture({}, async (fixtureOrigin) => {
    const legacyOrigins = ["https://jakh.net", "https://www.jakh.net"];
    const fetchImpl = async (input, options) => {
      const url = new URL(input);
      if (legacyOrigins.includes(url.origin)) {
        return new Response(null, {
          status: 301,
          headers: {
            "cache-control": "public, max-age=86400",
            "location": `${fixtureOrigin}${url.pathname}${url.search}`,
            "x-jakh-worker-version": FIXTURE_WORKER_VERSION,
          },
        });
      }
      return fetch(input, options);
    };
    const summary = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      legacySiteOrigins: legacyOrigins,
      scope: "site",
      fetchImpl,
      timeoutMs: 2_000,
      siteMaxMs: 1_000,
      logger: quietLogger(),
    });

    assert.equal(summary.failures.length, 0);
    assert.equal(
      summary.results.filter(({ name }) => name.includes("direct redirect")).length,
      legacyOrigins.length,
    );
  });
});

test("production monitor reserves route-migration probes for the production Riddle Arabia host", () => {
  assert.deepEqual(retiredSeoRedirectProbeDefinitions("http://127.0.0.1:8787"), []);
  const definitions = retiredSeoRedirectProbeDefinitions(PRIMARY_SITE_ORIGIN);
  assert.equal(definitions.length, 12);
  assert.deepEqual(definitions[0], {
    name: "Site: retired SEO /en/riddles-with-answers direct redirect",
    url: "https://riddlearabia.com/en/riddles-with-answers?retired_seo_redirect_probe=riddlearabia",
    location: "https://riddlearabia.com/riddles?retired_seo_redirect_probe=riddlearabia",
  });
  assert.deepEqual(definitions.at(-1), {
    name: "Site: retired SEO /ar/ikhtibar-qawanin-korat-alqadam direct redirect",
    url: "https://riddlearabia.com/ar/ikhtibar-qawanin-korat-alqadam?retired_seo_redirect_probe=riddlearabia",
    location: "https://riddlearabia.com/ar/topics/football/?retired_seo_redirect_probe=riddlearabia",
  });
});

test("production monitor follows the focused sitemap inventory", () => {
  assert.equal(INDEXABLE_SITEMAP_PATHS.length, 52);
  assert.equal(new Set(INDEXABLE_SITEMAP_PATHS).size, INDEXABLE_SITEMAP_PATHS.length);
  assert.ok(INDEXABLE_SITEMAP_PATHS.includes("/riddles"));
  assert.ok(INDEXABLE_SITEMAP_PATHS.includes("/ar/alghaz/"));
  assert.ok(INDEXABLE_SITEMAP_PATHS.includes("/brain-games"));
  assert.deepEqual(
    INDEXABLE_SITEMAP_PATHS.filter((path) => ["/akshifha", "/chess", "/backgammon"].includes(path)),
    ["/akshifha", "/chess", "/backgammon"],
  );
  assert.ok(INDEXABLE_SITEMAP_PATHS.includes("/mastermind"));
  assert.equal(INDEXABLE_SITEMAP_PATHS.some((path) => path.startsWith("/en/")), false);
  assert.equal(INDEXABLE_SITEMAP_PATHS.some((path) => /\/page\/\d+\//u.test(path)), false);
});

test("production monitor reports a legacy redirect that does not target the primary site", async () => {
  await withFixture({}, async (fixtureOrigin) => {
    const fetchImpl = async (input, options) => {
      const url = new URL(input);
      if (url.origin === "https://jakh.net") {
        return new Response(null, {
          status: 301,
          headers: {
            "cache-control": "public, max-age=86400",
            "location": "https://www.jakh.net/science",
            "x-jakh-worker-version": FIXTURE_WORKER_VERSION,
          },
        });
      }
      return fetch(input, options);
    };
    const summary = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      legacySiteOrigins: ["https://jakh.net"],
      scope: "site",
      fetchImpl,
      timeoutMs: 2_000,
      siteMaxMs: 1_000,
      logger: quietLogger(),
      throwOnFailure: false,
    });

    assert.match(
      summary.failures.find(({ name }) => name.includes("legacy jakh.net direct redirect"))?.message || "",
      /legacy redirect target/u,
    );
  });
});

test("legacy Pages mode proves the exact projection while accepting content-safe 404 holds", async () => {
  await withFixture({ pagesMode: true }, async (fixtureOrigin) => {
    const pages = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      scope: "pages",
      timeoutMs: 2_000,
      siteMaxMs: 1_000,
      apiMaxMs: 1_000,
      logger: quietLogger(),
    });
    assert.equal(pages.failures.length, 0);
    assert.ok(pages.results.length > QUARANTINED_SITE_ROUTES.length);
    assert.ok(pages.results.every(({ name }) => name.startsWith("Site")));
    assert.ok(pages.results.some(({ name, status }) => (
      name === "Site quarantine: medical-questions question data" && status === 404
    )));
    assert.ok(pages.results.some(({ name }) => name === "Site: public card index"));
    assert.ok(pages.results.some(({ name }) => name === "Site: ar public search index"));
  });
});

test("only a compatibility-triggered monitor accepts a supported pre-migration schema", async () => {
  await withFixture({ apiSchema: "8" }, async (fixtureOrigin) => {
    const compatibility = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      timeoutMs: 2_000,
      siteMaxMs: 1_000,
      apiMaxMs: 1_000,
      allowCompatibleSchema: true,
      logger: quietLogger(),
    });
    assert.equal(compatibility.failures.length, 0);

    const strict = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      timeoutMs: 2_000,
      siteMaxMs: 1_000,
      apiMaxMs: 1_000,
      logger: quietLogger(),
      throwOnFailure: false,
    });
    assert.ok(strict.failures.some(({ name }) => name === "API: health and allowed CORS"));
  });
});

test("production monitor emits a stable structured report for alert routing", () => {
  const summary = {
    config: {
      scope: "all",
      siteOrigin: "https://riddlearabia.com",
      apiOrigin: "https://api.riddlearabia.com",
      legacySiteOrigins: ["https://jakh.net", "https://www.jakh.net"],
      allowCompatibleSchema: false,
      expectedWorkerVersion: null,
    },
    results: [{
      name: "Site: Home",
      status: 200,
      elapsedMs: 42,
      bytes: 100,
      attempts: 1,
      workerVersionId: FIXTURE_WORKER_VERSION,
    }],
    failures: [{ name: "API: health", message: "expected HTTP 200, received 503", attempts: 2 }],
  };
  const report = buildMonitorReport(summary, new Date("2026-08-01T08:00:00.000Z"));

  assert.deepEqual(report, {
    schemaVersion: 1,
    generatedAt: "2026-08-01T08:00:00.000Z",
    status: "failure",
    monitor: {
      scope: "all",
      siteContract: "current",
      navigationLayout: "current",
      siteOrigin: "https://riddlearabia.com",
      apiOrigin: "https://api.riddlearabia.com",
      legacySiteOrigins: ["https://jakh.net", "https://www.jakh.net"],
      allowCompatibleSchema: false,
      expectedWorkerVersion: null,
    },
    totalChecks: 2,
    passedChecks: 1,
    failedChecks: 1,
    contentPublicationContract: API_RELEASE_CONTRACT.contentPublication,
    apiReleaseContract: API_RELEASE_CONTRACT,
    results: summary.results,
    failures: summary.failures,
  });
});

test("production monitor reports broken CORS without hiding other results", async () => {
  await withFixture({ brokenCors: true }, async (fixtureOrigin) => {
    const summary = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      timeoutMs: 2_000,
      siteMaxMs: 1_000,
      apiMaxMs: 1_000,
      logger: quietLogger(),
      throwOnFailure: false,
    });

    assert.ok(summary.failures.length >= 4);
    assert.ok(summary.failures.some(({ name }) => name === "API: health and allowed CORS"));
    assert.ok(summary.failures.some(({ name }) => name === "API: allowed CORS preflight"));
    assert.ok(summary.results.some(({ name }) => name === "API: disallowed origin"));
  });
});

test("production monitor recovers once from transient network, status, and latency failures", async () => {
  await withFixture({}, async (fixtureOrigin) => {
    const attempts = new Map();
    const fetchImpl = async (input, options) => {
      const pathname = new URL(input).pathname;
      const attempt = (attempts.get(pathname) || 0) + 1;
      attempts.set(pathname, attempt);

      if (pathname === "/data/catalog.json" && attempt === 1) {
        throw new TypeError("simulated connection reset");
      }
      if (pathname === "/assets/riddlearabia-og-image.png" && attempt === 1) {
        return new Response("temporarily unavailable", { status: 503 });
      }
      if (pathname === "/" && attempt === 1) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return fetch(input, options);
    };

    const summary = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      fetchImpl,
      timeoutMs: 2_000,
      siteMaxMs: 30,
      apiMaxMs: 1_000,
      logger: quietLogger(),
    });

    assert.equal(summary.failures.length, 0);
    assert.equal(attempts.get("/"), 2);
    assert.equal(attempts.get("/data/catalog.json"), 2);
    assert.equal(attempts.get("/assets/riddlearabia-og-image.png"), 2);
    assert.equal(summary.results.find(({ name }) => name === "Site: Home")?.attempts, 2);
    assert.equal(summary.results.find(({ name }) => name === "Site: catalog data")?.attempts, 2);
    assert.equal(summary.results.find(({ name }) => name === "Site: social preview image")?.attempts, 2);
  });
});

test("production monitor waits for every API route to converge on the expected Worker version", async () => {
  await withFixture({}, async (fixtureOrigin) => {
    const attempts = new Map();
    const staleWorkerVersion = "22222222-2222-4222-8222-222222222222";
    const fetchImpl = async (input, options = {}) => {
      const url = new URL(input);
      const method = options.method || "GET";
      const key = `${method} ${url.pathname}${url.search}`;
      const attempt = (attempts.get(key) || 0) + 1;
      attempts.set(key, attempt);
      const response = await fetch(input, options);
      if (!url.pathname.startsWith("/api/") || url.pathname === "/api/health" || attempt > 1) {
        return response;
      }
      const headers = new Headers(response.headers);
      headers.set("x-jakh-worker-version", staleWorkerVersion);
      const body = response.status === 204 ? null : await response.arrayBuffer();
      return new Response(body, { status: response.status, headers });
    };

    const summary = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      scope: "api",
      expectedWorkerVersion: FIXTURE_WORKER_VERSION,
      maxCheckAttempts: 3,
      retryDelayMs: 1,
      fetchImpl,
      timeoutMs: 2_000,
      apiMaxMs: 1_000,
      logger: quietLogger(),
    });

    assert.equal(summary.failures.length, 0);
    assert.ok(summary.results.some(({ attempts: resultAttempts }) => resultAttempts === 2));
    assert.ok(summary.results.every(({ workerVersionId }) => workerVersionId === FIXTURE_WORKER_VERSION));
  });
});

test("production monitor waits for every static route to converge on the expected Worker version", async () => {
  await withFixture({}, async (fixtureOrigin) => {
    const attempts = new Map();
    const staleWorkerVersion = "22222222-2222-4222-8222-222222222222";
    const fetchImpl = async (input, options = {}) => {
      const url = new URL(input);
      const key = `${options.method || "GET"} ${url.pathname}${url.search}`;
      const attempt = (attempts.get(key) || 0) + 1;
      attempts.set(key, attempt);
      const response = await fetch(input, options);
      if (url.pathname.startsWith("/api/") || attempt > 1) return response;
      const headers = new Headers(response.headers);
      headers.set("x-jakh-worker-version", staleWorkerVersion);
      const body = await response.arrayBuffer();
      return new Response(body, { status: response.status, headers });
    };

    const summary = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      scope: "site",
      expectedWorkerVersion: FIXTURE_WORKER_VERSION,
      maxCheckAttempts: 3,
      retryDelayMs: 1,
      fetchImpl,
      timeoutMs: 2_000,
      siteMaxMs: 1_000,
      logger: quietLogger(),
    });

    assert.equal(summary.failures.length, 0);
    assert.ok(summary.results.every(({ attempts: resultAttempts }) => resultAttempts === 2));
    assert.ok(summary.results.every(({ workerVersionId }) => workerVersionId === FIXTURE_WORKER_VERSION));
  });
});

test("production monitor fails after one retry when a transient status persists", async () => {
  await withFixture({}, async (fixtureOrigin) => {
    let socialPreviewAttempts = 0;
    const fetchImpl = async (input, options) => {
      if (new URL(input).pathname === "/assets/riddlearabia-og-image.png") {
        socialPreviewAttempts += 1;
        return new Response("temporarily unavailable", { status: 503 });
      }
      return fetch(input, options);
    };

    const summary = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      fetchImpl,
      timeoutMs: 2_000,
      siteMaxMs: 1_000,
      apiMaxMs: 1_000,
      logger: quietLogger(),
      throwOnFailure: false,
    });

    assert.equal(socialPreviewAttempts, 2);
    assert.deepEqual(
      summary.failures.find(({ name }) => name === "Site: social preview image"),
      {
        name: "Site: social preview image",
        message: "expected HTTP 200, received 503",
        attempts: 2,
      },
    );
  });
});

test("production monitor does not retry a contract failure", async () => {
  await withFixture({}, async (fixtureOrigin) => {
    let socialPreviewAttempts = 0;
    const fetchImpl = async (input, options) => {
      if (new URL(input).pathname === "/assets/riddlearabia-og-image.png") {
        socialPreviewAttempts += 1;
        return new Response("not a jpeg", {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      }
      return fetch(input, options);
    };

    const summary = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      fetchImpl,
      timeoutMs: 2_000,
      siteMaxMs: 1_000,
      apiMaxMs: 1_000,
      logger: quietLogger(),
      throwOnFailure: false,
    });

    assert.equal(socialPreviewAttempts, 1);
    assert.match(
      summary.failures.find(({ name }) => name === "Site: social preview image")?.message || "",
      /unexpected Content-Type/u,
    );
  });
});

test("production monitor enforces its response-time budget", async () => {
  await withFixture({ homeDelayMs: 80 }, async (fixtureOrigin) => {
    const summary = await runProductionMonitor({
      siteOrigin: fixtureOrigin,
      apiOrigin: fixtureOrigin,
      timeoutMs: 2_000,
      siteMaxMs: 30,
      apiMaxMs: 1_000,
      logger: quietLogger(),
      throwOnFailure: false,
    });

    const homeFailure = summary.failures.find(({ name }) => name === "Site: Home");
    assert.match(homeFailure?.message || "", /response took \d+ms \(budget 30ms\)/u);
  });
});
