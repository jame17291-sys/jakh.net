import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { HTML_ROUTES, runProductionMonitor } from "./monitor-production.mjs";

function quietLogger() {
  return { log() {}, error() {} };
}

function apiHeaders(origin, cacheControl = "no-store") {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
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
  if (route) return `<!doctype html><html><head>${route.marker}</title></head><body>ok</body></html>`;
  if (pathname === "/data/catalog.json") {
    return JSON.stringify({
      categories: Array.from({ length: 56 }, (_, index) => ({ slug: `category-${index}` })),
    });
  }
  if (pathname === "/manifest.webmanifest") {
    return JSON.stringify({
      name: "JAKH Riddles",
      start_url: "/",
      icons: [{ src: "one.png" }, { src: "two.png" }],
    });
  }
  if (pathname === "/app.js") return "const endpoint = 'https://api.jakh.net';";
  if (pathname === "/styles.css") return ":root { color-scheme: light; }";
  if (pathname === "/sw.js") return "self.addEventListener('fetch', () => {});";
  return null;
}

async function startFixture({ brokenCors = false, homeDelayMs = 0 } = {}) {
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
        service: "jakh-api",
        version: "test",
        schema: "1",
      }));
      return;
    }

    if (url.pathname === "/api/leaderboard") {
      response.writeHead(
        200,
        apiHeaders(brokenCors ? undefined : requestOrigin, "public, max-age=30"),
      );
      response.end(JSON.stringify({
        leaderboard: [{ rank: 1, username: "player", avatar: "👤", score: 5 }],
      }));
      return;
    }

    if (url.pathname === "/api/user/profile") {
      response.writeHead(401, apiHeaders(brokenCors ? undefined : requestOrigin));
      response.end(JSON.stringify({ error: "Unauthorized" }));
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
          : url.pathname.endsWith(".json")
            ? "application/json; charset=utf-8"
            : url.pathname.endsWith(".webmanifest")
              ? "application/manifest+json; charset=utf-8"
              : "text/html; charset=utf-8";
      response.writeHead(200, { "content-type": contentType });
      response.end(body);
      return;
    }

    response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
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
    assert.equal(summary.results.length, 26);
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
