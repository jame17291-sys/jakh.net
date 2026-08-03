import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  API_RELEASE_CONTRACT,
  buildMonitorReport,
  HTML_ROUTES,
  QUARANTINED_CATEGORY_SLUGS,
  QUARANTINED_SITE_ROUTES,
  runProductionMonitor,
  UNAUTHENTICATED_API_GET_ROUTES,
} from "./monitor-production.mjs";

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
  if (origin === "https://jakh.net") {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-credentials"] = "true";
    headers.vary = "Origin";
  }
  return headers;
}

function staticBody(pathname) {
  const route = HTML_ROUTES.find((candidate) => candidate.path === pathname);
  if (route) {
    const seoCards = pathname === "/science"
      ? `${'<article class="riddle-card"></article>'.repeat(20)}<script type="application/ld+json">{"hasPart":[]}</script>`
      : "";
    return `<!doctype html><html><head>${route.marker}</title></head><body>${route.bilingualMarker}${seoCards}ok</body></html>`;
  }
  if (pathname === "/data/catalog.json") {
    return JSON.stringify({
      site: {
        totalQuestions: 3_275,
        publication: {
          state: "safety-quarantine-active",
          publicCategories: 51,
          publicQuestions: 3_275,
          quarantinedQuestions: 278,
          policySha256: API_RELEASE_CONTRACT.contentPublication.manifestSha256,
        },
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
      name: "JAKH Riddles",
      start_url: "/",
      icons: [{ src: "one.png" }, { src: "two.png" }],
    });
  }
  if (pathname === "/sitemap.xml") {
    const urls = [
      "https://jakh.net/collections",
      "https://jakh.net/ar/alghaz-ma-alhal/",
      "https://jakh.net/ar/topics/science/",
      "https://jakh.net/privacy",
      ...Array.from({ length: 136 }, (_, index) => `https://jakh.net/test-${index}`),
    ];
    return `<urlset>${urls.map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;
  }
  if (pathname === "/.well-known/security.txt") {
    return [
      "Contact: https://github.com/jame17291-sys/jakh.net/security/advisories/new",
      "Expires: 2027-07-30T23:59:59Z",
      "Canonical: https://jakh.net/.well-known/security.txt",
    ].join("\n");
  }
  if (pathname === "/assets/og-image.jpg") {
    return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  }
  if (pathname === "/app.js") return "const endpoint = 'https://api.jakh.net';";
  if (pathname === "/site-i18n.js") return "window.JakhI18n = {};";
  if (pathname === "/game-i18n.js") return "window.JakhGameI18n = {};";
  if (pathname === "/privacy-consent.js") return "window.JakhPrivacy = {};";
  if (pathname === "/styles.css") return ":root { color-scheme: light; }";
  if (pathname === "/sw.js") return "self.addEventListener('fetch', () => {});";
  return null;
}

async function startFixture({ brokenCors = false, homeDelayMs = 0, apiSchema = "8", pagesMode = false } = {}) {
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
        error: "Category is temporarily unavailable pending safety review",
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
        error: "Category is temporarily unavailable pending safety review",
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

    const body = staticBody(url.pathname);
    if (body !== null) {
      const contentType = url.pathname.endsWith(".css")
        ? "text/css; charset=utf-8"
        : url.pathname.endsWith(".js")
          ? "text/javascript; charset=utf-8"
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
    assert.equal(summary.results.length, 45 + QUARANTINED_SITE_ROUTES.length);
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
  await withFixture({ apiSchema: "6" }, async (fixtureOrigin) => {
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
      siteOrigin: "https://jakh.net",
      apiOrigin: "https://api.jakh.net",
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
      siteOrigin: "https://jakh.net",
      apiOrigin: "https://api.jakh.net",
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
      if (pathname === "/assets/og-image.jpg" && attempt === 1) {
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
    assert.equal(attempts.get("/assets/og-image.jpg"), 2);
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

test("production monitor fails after one retry when a transient status persists", async () => {
  await withFixture({}, async (fixtureOrigin) => {
    let socialPreviewAttempts = 0;
    const fetchImpl = async (input, options) => {
      if (new URL(input).pathname === "/assets/og-image.jpg") {
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
      if (new URL(input).pathname === "/assets/og-image.jpg") {
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
