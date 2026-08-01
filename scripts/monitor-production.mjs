import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { loadProductionQuarantine } from "./publication-quarantine.mjs";

const DEFAULT_SITE_ORIGIN = "https://jakh.net";
const DEFAULT_API_ORIGIN = "https://api.jakh.net";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_SITE_MAX_MS = 5_000;
const DEFAULT_API_MAX_MS = 5_000;
const ALLOWED_ORIGIN = "https://jakh.net";
const DISALLOWED_ORIGIN = "https://example.invalid";
const MAX_CHECK_ATTEMPTS = 2;
const WORKER_VERSION_ID = /^[0-9A-Za-z][0-9A-Za-z._-]{5,127}$/u;

const checkedPublicationQuarantine = loadProductionQuarantine();

export const CONTENT_PUBLICATION_CONTRACT = Object.freeze({
  state: "safety-quarantine-active",
  quarantinedCategories: Object.freeze([...checkedPublicationQuarantine.categorySlugs]),
  quarantinedQuestions: checkedPublicationQuarantine.manifest.totalCards,
  publicQuestions: 3_275,
  manifestSha256: checkedPublicationQuarantine.policySha256,
});

export const API_RELEASE_CONTRACT = Object.freeze({
  service: "jakh-api",
  version: "1.4.0",
  schema: "8",
  targetSchema: "8",
  compatibleSchemas: ["6", "7", "8"],
  features: {
    registration: true,
    accountRecovery: true,
    accountDeletion: true,
  },
  contentPublication: CONTENT_PUBLICATION_CONTRACT,
});

class RetryableCheckError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "RetryableCheckError";
  }
}

export const HTML_ROUTES = [
  { name: "Home", path: "/", marker: "<title>JAKH Riddles", bilingualMarker: 'id="langSelect"' },
  { name: "Mind Lab", path: "/mind-lab", marker: "<title>Mind Lab", bilingualMarker: 'id="langSelect"' },
  { name: "Collections", path: "/collections", marker: "<title>Riddles &amp; Quiz Collections", bilingualMarker: "site-i18n.js" },
  { name: "Arabic riddles collection", path: "/ar/alghaz-ma-alhal/", marker: '<html lang="ar"', bilingualMarker: 'hreflang="en"' },
  { name: "Arabic science topic", path: "/ar/topics/science/", marker: '<html lang="ar" dir="rtl">', bilingualMarker: 'hreflang="en"' },
  { name: "About", path: "/about", marker: "<title>About JAKH", bilingualMarker: "site-i18n.js" },
  { name: "Privacy Centre", path: "/privacy", marker: "<title>Privacy Centre", bilingualMarker: "privacy-consent.js" },
  { name: "Game Hub", path: "/play", marker: "<title>10 Free Browser Games", bilingualMarker: 'id="langSelect"' },
  { name: "Science category", path: "/science", marker: "<title>Science Quiz", bilingualMarker: 'id="langSelect"' },
  { name: "Chess", path: "/chess", marker: "<title>Chess Online", bilingualMarker: "game-i18n.js" },
  { name: "Mastermind", path: "/mastermind", marker: "<title>Mastermind Online", bilingualMarker: "game-i18n.js" },
  { name: "Go", path: "/go", marker: "<title>Go Online", bilingualMarker: "game-i18n.js" },
  { name: "Reversi", path: "/reversi", marker: "<title>Reversi Online", bilingualMarker: "game-i18n.js" },
  { name: "Codenames", path: "/codenames", marker: "<title>Codenames Online", bilingualMarker: "game-i18n.js" },
  { name: "Catan", path: "/catan", marker: "<title>Catan Lite Online", bilingualMarker: "game-i18n.js" },
  { name: "Backgammon", path: "/backgammon", marker: "<title>Backgammon Online", bilingualMarker: "game-i18n.js" },
  { name: "SET", path: "/set", marker: "<title>SET Online", bilingualMarker: "game-i18n.js" },
  { name: "Hanabi", path: "/hanabi", marker: "<title>Hanabi Online", bilingualMarker: "game-i18n.js" },
  { name: "Diplomacy", path: "/diplomacy", marker: "<title>Diplomacy Lite Online", bilingualMarker: "game-i18n.js" },
];

export const UNAUTHENTICATED_API_GET_ROUTES = [
  { name: "profile", path: "/api/user/profile" },
  { name: "privacy preferences", path: "/api/user/privacy" },
  { name: "account export", path: "/api/user/export" },
  { name: "admin overview", path: "/api/admin/overview" },
];

export const QUARANTINED_CATEGORY_SLUGS = CONTENT_PUBLICATION_CONTRACT.quarantinedCategories;

export const QUARANTINED_SITE_ROUTES = Object.freeze(
  [
    ...QUARANTINED_CATEGORY_SLUGS.flatMap((slug) => [
      { name: `${slug} canonical page`, path: `/${slug}` },
      { name: `${slug} legacy HTML page`, path: `/${slug}.html` },
      { name: `${slug} question data`, path: `/data/${slug}.json` },
      { name: `${slug} Arabic page`, path: `/ar/topics/${slug}/` },
      { name: `${slug} Arabic HTML alias`, path: `/ar/topics/${slug}.html` },
    ]),
    { name: "percent-encoded canonical page", path: "/%73urvival" },
    { name: "percent-encoded legacy extension", path: "/survival%2ehtml" },
    { name: "percent-encoded Arabic page", path: "/ar/topics/%73urvival/" },
    { name: "percent-encoded Arabic HTML alias", path: "/ar/topics/survival%2ehtml" },
    { name: "percent-encoded data slug", path: "/data/%73urvival.json" },
    { name: "percent-encoded data extension", path: "/data/survival%2ejson" },
    { name: "data path suffix", path: "/data/survival.json/archive" },
    { name: "encoded data path suffix", path: "/data/survival.json%2farchive" },
    { name: "recursively encoded canonical page", path: "/%2573urvival" },
  ],
);

function positiveInteger(value, fallback, label) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function origin(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${label} must not include a path, query, or fragment`);
  }
  return parsed.origin;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function expectStatus(response, status) {
  if (response.status === status) return;
  const message = `expected HTTP ${status}, received ${response.status}`;
  if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
    throw new RetryableCheckError(message);
  }
  throw new Error(message);
}

function expectContentType(response, pattern) {
  const value = response.headers.get("content-type") || "";
  expect(pattern.test(value), `unexpected Content-Type "${value || "missing"}"`);
}

function expectCors(response, expectedOrigin) {
  expect(
    response.headers.get("access-control-allow-origin") === expectedOrigin,
    `missing Access-Control-Allow-Origin for ${expectedOrigin}`,
  );
  expect(
    response.headers.get("access-control-allow-credentials") === "true",
    "missing Access-Control-Allow-Credentials",
  );
  const vary = (response.headers.get("vary") || "")
    .split(",")
    .map((token) => token.trim().toLowerCase());
  expect(vary.includes("*") || vary.includes("origin"), "Vary does not include Origin");
}

function expectApiSecurityHeaders(response) {
  expect(
    response.headers.get("x-content-type-options") === "nosniff",
    "missing X-Content-Type-Options: nosniff",
  );
  expect(
    response.headers.get("referrer-policy") === "no-referrer",
    "missing Referrer-Policy: no-referrer",
  );
}

function expectApiQuarantine(resource) {
  expectStatus(resource.response, 503);
  expectContentType(resource.response, /application\/json/iu);
  expectCors(resource.response, ALLOWED_ORIGIN);
  expectApiSecurityHeaders(resource.response);
  expect(resource.response.headers.get("cache-control") === "no-store", "API quarantine response is cacheable");
  expect(resource.response.headers.get("retry-after") === "86400", "API quarantine Retry-After is missing");
  const payload = parseJson(resource);
  expect(payload.code === "CATEGORY_QUARANTINED", "API quarantine code is missing");
  expect(payload.code !== "BATTLE_CREATE_FAILED", "held Battle request reached room allocation");
}

function decodeBody(buffer) {
  return new TextDecoder().decode(buffer);
}

async function fetchResource(fetchImpl, url, timeoutMs, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(options.headers);
  headers.set("user-agent", "jakh-production-monitor/1.0");
  const startedAt = performance.now();

  try {
    const response = await fetchImpl(url, {
      ...options,
      headers,
      redirect: options.redirect || "follow",
      signal: controller.signal,
    });
    const body = await response.arrayBuffer();
    return {
      response,
      body,
      text: decodeBody(body),
      elapsedMs: performance.now() - startedAt,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new RetryableCheckError(`request timed out after ${timeoutMs}ms`, { cause: error });
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new RetryableCheckError(message, { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(resource) {
  try {
    return JSON.parse(resource.text);
  } catch {
    throw new Error("response is not valid JSON");
  }
}

function assertBudget(resource, maxMs, maxBytes) {
  if (maxBytes) {
    expect(
      resource.body.byteLength <= maxBytes,
      `response is ${resource.body.byteLength} bytes (budget ${maxBytes} bytes)`,
    );
  }
  if (resource.elapsedMs > maxMs) {
    throw new RetryableCheckError(
      `response took ${Math.round(resource.elapsedMs)}ms (budget ${maxMs}ms)`,
    );
  }
}

function formatBytes(bytes) {
  if (bytes < 1_024) return `${bytes} B`;
  return `${(bytes / 1_024).toFixed(1)} KiB`;
}

function loadConfig(options) {
  const env = options.env || process.env;
  const scope = options.scope || env.JAKH_MONITOR_SCOPE || "all";
  if (!new Set(["all", "api", "site", "pages"]).has(scope)) {
    throw new Error("monitor scope must be all, api, site, or pages");
  }
  return {
    siteOrigin: origin(options.siteOrigin || env.JAKH_SITE_ORIGIN || DEFAULT_SITE_ORIGIN, "site origin"),
    apiOrigin: origin(options.apiOrigin || env.JAKH_API_ORIGIN || DEFAULT_API_ORIGIN, "API origin"),
    timeoutMs: positiveInteger(
      options.timeoutMs ?? env.JAKH_MONITOR_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      "timeout",
    ),
    siteMaxMs: positiveInteger(
      options.siteMaxMs ?? env.JAKH_SITE_MAX_MS,
      DEFAULT_SITE_MAX_MS,
      "site performance budget",
    ),
    apiMaxMs: positiveInteger(
      options.apiMaxMs ?? env.JAKH_API_MAX_MS,
      DEFAULT_API_MAX_MS,
      "API performance budget",
    ),
    allowCompatibleSchema:
      options.allowCompatibleSchema === true
      || env.JAKH_MONITOR_ALLOW_COMPATIBLE_SCHEMA === "true",
    scope,
  };
}

export async function runProductionMonitor(options = {}) {
  const config = loadConfig(options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const logger = options.logger || console;
  const results = [];
  const failures = [];

  async function check(name, run) {
    const checkScope = name.startsWith("API") ? "api" : "site";
    const selectedScope = config.scope === "pages" ? "site" : config.scope;
    if (selectedScope !== "all" && selectedScope !== checkScope) return;
    for (let attempt = 1; attempt <= MAX_CHECK_ATTEMPTS; attempt += 1) {
      try {
        const resource = await run();
        if (config.scope === "pages" && checkScope === "site") {
          expect(
            resource.response.headers.get("x-jakh-site-version") === null,
            "legacy Pages probe unexpectedly reached the jakh-site Worker",
          );
          expect(
            resource.response.headers.get("x-jakh-worker-version") === null,
            "legacy Pages probe unexpectedly received a Worker runtime identity",
          );
        }
        const headerWorkerVersionId = resource.response.headers.get("x-jakh-worker-version");
        if (checkScope === "api") {
          expect(WORKER_VERSION_ID.test(headerWorkerVersionId || ""), "API response lacks a valid Worker version ID");
          if (resource.workerVersionId) {
            expect(resource.workerVersionId === headerWorkerVersionId, "API response body and header Worker versions differ");
          }
        }
        const workerVersionId = resource.workerVersionId || headerWorkerVersionId || null;
        if (checkScope === "site" && config.scope !== "pages") {
          expect(WORKER_VERSION_ID.test(workerVersionId || ""), "site response lacks a valid Worker version ID");
        }
        results.push({
          name,
          status: resource.response.status,
          elapsedMs: resource.elapsedMs,
          bytes: resource.body.byteLength,
          attempts: attempt,
          workerVersionId,
        });
        return;
      } catch (error) {
        if (error instanceof RetryableCheckError && attempt < MAX_CHECK_ATTEMPTS) continue;
        failures.push({
          name,
          message: error instanceof Error ? error.message : String(error),
          attempts: attempt,
        });
        return;
      }
    }
  }

  await Promise.all(HTML_ROUTES.map((route) =>
    check(`Site: ${route.name}`, async () => {
      const resource = await fetchResource(
        fetchImpl,
        new URL(route.path, config.siteOrigin),
        config.timeoutMs,
      );
      expectStatus(resource.response, 200);
      expectContentType(resource.response, /^text\/html\b/iu);
      expect(resource.text.includes(route.marker), `missing page marker "${route.marker}"`);
      expect(
        resource.text.includes(route.bilingualMarker),
        `missing bilingual marker "${route.bilingualMarker}"`,
      );
      if (route.path === "/science") {
        const cardCount = (resource.text.match(/class="riddle-card"/gu) || []).length;
        expect(cardCount === 20, `science source contains ${cardCount} static cards instead of 20`);
        expect(resource.text.includes('"hasPart"'), "science Quiz schema has no hasPart questions");
      }
      assertBudget(resource, config.siteMaxMs, 150_000);
      return resource;
    }),
  ));

  await check("Site: catalog data", async () => {
    const resource = await fetchResource(
      fetchImpl,
      new URL("/data/catalog.json", config.siteOrigin),
      config.timeoutMs,
    );
    expectStatus(resource.response, 200);
    expectContentType(resource.response, /application\/json/iu);
    const catalog = parseJson(resource);
    expect(Array.isArray(catalog.categories), "catalog categories is not an array");
    expect(catalog.categories.length === 51, `catalog contains ${catalog.categories.length} categories instead of 51`);
    expect(
      catalog.categories.every((category) => typeof category?.slug === "string" && category.slug),
      "catalog contains a category without a slug",
    );
    const categorySlugs = new Set(catalog.categories.map((category) => category.slug));
    expect(
      QUARANTINED_CATEGORY_SLUGS.every((slug) => !categorySlugs.has(slug)),
      "catalog exposes a quarantined category",
    );
    expect(catalog.site?.totalQuestions === 3_275, "catalog public question total is not 3275");
    expect(
      catalog.site?.publication?.state === "safety-quarantine-active"
        && catalog.site.publication.publicCategories === 51
        && catalog.site.publication.publicQuestions === 3_275
        && catalog.site.publication.quarantinedQuestions === 278
        && catalog.site.publication.policySha256 === CONTENT_PUBLICATION_CONTRACT.manifestSha256,
      "catalog publication quarantine contract is missing or invalid",
    );
    assertBudget(resource, config.siteMaxMs, 150_000);
    return resource;
  });

  await Promise.all(QUARANTINED_SITE_ROUTES.map((route) =>
    check(`Site quarantine: ${route.name}`, async () => {
      const resource = await fetchResource(
        fetchImpl,
        new URL(route.path, config.siteOrigin),
        config.timeoutMs,
      );
      if (config.scope === "pages") {
        expectStatus(resource.response, 404);
        expectContentType(resource.response, /^text\/html\b/iu);
        expect(
          [...checkedPublicationQuarantine.cardIds].every((cardId) => !resource.text.includes(cardId)),
          "Pages 404 body exposes a quarantined card",
        );
        expect(
          [...checkedPublicationQuarantine.categorySlugs].every((slug) => (
            !new RegExp(`(?:href|src)=["'][^"']*(?:/|%2f)${slug}(?:[/.?%#"']|$)`, "iu").test(resource.text)
          )),
          "Pages 404 body links to a quarantined category",
        );
      } else {
        expectStatus(resource.response, 410);
        expectContentType(resource.response, /^text\/plain\b/iu);
        expect(resource.response.headers.get("cache-control") === "no-store", "quarantine response is cacheable");
        expect(
          resource.response.headers.get("x-jakh-content-quarantine") === "active",
          "quarantine marker header is missing",
        );
        const robots = (resource.response.headers.get("x-robots-tag") || "").toLowerCase();
        for (const directive of ["noindex", "nofollow", "noarchive", "nosnippet"]) {
          expect(robots.includes(directive), `quarantine robots policy is missing ${directive}`);
        }
        expect(
          resource.response.headers.get("clear-site-data") === '"cache"',
          "quarantine response does not clear browser caches",
        );
      }
      assertBudget(resource, config.siteMaxMs, 10_000);
      return resource;
    }),
  ));

  await check("Site: public card index", async () => {
    const resource = await fetchResource(
      fetchImpl,
      new URL("/data/card-index.json", config.siteOrigin),
      config.timeoutMs,
    );
    expectStatus(resource.response, 200);
    expectContentType(resource.response, /application\/json/iu);
    const index = parseJson(resource);
    expect(index && typeof index === "object" && !Array.isArray(index), "card index is not an object");
    expect(Object.keys(index).length === 3_275, `card index contains ${Object.keys(index).length} cards instead of 3275`);
    expect(
      checkedPublicationQuarantine.cardIds.size > 0
        && [...checkedPublicationQuarantine.cardIds].every((cardId) => !Object.hasOwn(index, cardId)),
      "card index exposes a quarantined card",
    );
    assertBudget(resource, config.siteMaxMs, 300_000);
    return resource;
  });

  for (const language of ["en", "ar"]) {
    await check(`Site: ${language} public search index`, async () => {
      const resource = await fetchResource(
        fetchImpl,
        new URL(`/data/search-index.${language}.json`, config.siteOrigin),
        config.timeoutMs,
      );
      expectStatus(resource.response, 200);
      expectContentType(resource.response, /application\/json/iu);
      const shard = parseJson(resource);
      expect(shard.language === language, `${language} search language marker is invalid`);
      expect(shard.total === 3_275, `${language} search total is not 3275`);
      expect(Array.isArray(shard.categories) && shard.categories.length === 51, `${language} search categories are not 51`);
      expect(Array.isArray(shard.cards) && shard.cards.length === 3_275, `${language} search cards are not 3275`);
      expect(
        shard.cards.every((row) => Array.isArray(row) && !checkedPublicationQuarantine.cardIds.has(row[1])),
        `${language} search exposes a quarantined card`,
      );
      assertBudget(resource, config.siteMaxMs, 800_000);
      return resource;
    });
  }

  await check("Site: web manifest", async () => {
    const resource = await fetchResource(
      fetchImpl,
      new URL("/manifest.webmanifest", config.siteOrigin),
      config.timeoutMs,
    );
    expectStatus(resource.response, 200);
    expectContentType(resource.response, /(?:application\/manifest\+json|application\/json)/iu);
    const manifest = parseJson(resource);
    expect(manifest.name === "JAKH Riddles", "manifest name is not JAKH Riddles");
    expect(manifest.start_url === "/", "manifest start_url is not /");
    expect(Array.isArray(manifest.icons) && manifest.icons.length >= 2, "manifest icons are incomplete");
    assertBudget(resource, config.siteMaxMs, 20_000);
    return resource;
  });

  await check("Site: sitemap", async () => {
    const resource = await fetchResource(
      fetchImpl,
      new URL("/sitemap.xml", config.siteOrigin),
      config.timeoutMs,
    );
    expectStatus(resource.response, 200);
    expectContentType(resource.response, /(?:application|text)\/xml/iu);
    const urls = [...resource.text.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
    expect(urls.length >= 140, `sitemap contains only ${urls.length} URLs`);
    expect(!urls.some((url) => /\.html(?:$|[?#])/u.test(url)), "sitemap contains a .html URL");
    expect(urls.includes("https://jakh.net/collections"), "sitemap is missing collections");
    expect(urls.includes("https://jakh.net/ar/alghaz-ma-alhal/"), "sitemap is missing Arabic riddles");
    expect(urls.includes("https://jakh.net/ar/topics/science/"), "sitemap is missing Arabic science");
    expect(urls.includes("https://jakh.net/privacy"), "sitemap is missing the Privacy Centre");
    expect(
      QUARANTINED_CATEGORY_SLUGS.every((slug) => (
        !urls.some((url) => {
          const pathname = new URL(url).pathname.toLowerCase();
          return pathname === `/${slug}`
            || pathname === `/${slug}.html`
            || pathname.startsWith(`/${slug}/`)
            || pathname === `/ar/topics/${slug}`
            || pathname.startsWith(`/ar/topics/${slug}/`);
        })
      )),
      "sitemap exposes a quarantined route",
    );
    assertBudget(resource, config.siteMaxMs, 300_000);
    return resource;
  });

  await check("Site: security contact", async () => {
    const resource = await fetchResource(
      fetchImpl,
      new URL("/.well-known/security.txt", config.siteOrigin),
      config.timeoutMs,
    );
    expectStatus(resource.response, 200);
    expectContentType(resource.response, /^text\/plain\b/iu);
    expect(
      resource.text.includes("Contact: https://github.com/jame17291-sys/jakh.net/security/advisories/new"),
      "security.txt is missing the vulnerability-reporting contact",
    );
    expect(
      resource.text.includes("Canonical: https://jakh.net/.well-known/security.txt"),
      "security.txt is missing its canonical URL",
    );
    expect(/^Expires: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/mu.test(resource.text),
      "security.txt is missing a valid UTC expiry");
    assertBudget(resource, config.siteMaxMs, 10_000);
    return resource;
  });

  await check("Site: social preview image", async () => {
    const resource = await fetchResource(
      fetchImpl,
      new URL("/assets/og-image.jpg", config.siteOrigin),
      config.timeoutMs,
    );
    expectStatus(resource.response, 200);
    expectContentType(resource.response, /^image\/jpeg\b/iu);
    const signature = new Uint8Array(resource.body.slice(0, 3));
    expect(
      signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff,
      "social preview image does not have a JPEG signature",
    );
    assertBudget(resource, config.siteMaxMs, 400_000);
    return resource;
  });

  const assetChecks = [
    {
      name: "JavaScript",
      path: "/app.js",
      type: /(?:text|application)\/javascript/iu,
      marker: "https://api.jakh.net",
      maxBytes: 350_000,
    },
    {
      name: "Static page translations",
      path: "/site-i18n.js",
      type: /(?:text|application)\/javascript/iu,
      marker: "window.JakhI18n",
      maxBytes: 50_000,
    },
    {
      name: "Game translations",
      path: "/game-i18n.js",
      type: /(?:text|application)\/javascript/iu,
      marker: "window.JakhGameI18n",
      maxBytes: 50_000,
    },
    {
      name: "Privacy consent controls",
      path: "/privacy-consent.js",
      type: /(?:text|application)\/javascript/iu,
      marker: "window.JakhPrivacy",
      maxBytes: 30_000,
    },
    {
      name: "CSS",
      path: "/styles.css",
      type: /^text\/css\b/iu,
      marker: ":root",
      maxBytes: 250_000,
    },
    {
      name: "Service worker",
      path: "/sw.js",
      type: /(?:text|application)\/javascript/iu,
      marker: "self.addEventListener('fetch'",
      maxBytes: 50_000,
    },
  ];

  await Promise.all(assetChecks.map((asset) =>
    check(`Site: ${asset.name}`, async () => {
      const resource = await fetchResource(
        fetchImpl,
        new URL(asset.path, config.siteOrigin),
        config.timeoutMs,
      );
      expectStatus(resource.response, 200);
      expectContentType(resource.response, asset.type);
      expect(resource.text.includes(asset.marker), `missing asset marker "${asset.marker}"`);
      assertBudget(resource, config.siteMaxMs, asset.maxBytes);
      return resource;
    }),
  ));

  await check("Site: custom 404", async () => {
    const resource = await fetchResource(
      fetchImpl,
      new URL("/__jakh-production-monitor-missing__.html", config.siteOrigin),
      config.timeoutMs,
    );
    expectStatus(resource.response, 404);
    expectContentType(resource.response, /^text\/html\b/iu);
    expect(resource.text.includes("<title>Page Not Found"), "custom 404 page marker is missing");
    assertBudget(resource, config.siteMaxMs, 150_000);
    return resource;
  });

  await check("API: health and allowed CORS", async () => {
    const resource = await fetchResource(
      fetchImpl,
      new URL("/api/health", config.apiOrigin),
      config.timeoutMs,
      { headers: { origin: ALLOWED_ORIGIN } },
    );
    expectStatus(resource.response, 200);
    expectContentType(resource.response, /application\/json/iu);
    expectCors(resource.response, ALLOWED_ORIGIN);
    expectApiSecurityHeaders(resource.response);
    expect(resource.response.headers.get("cache-control") === "no-store", "health response is cacheable");
    const health = parseJson(resource);
    expect(health.ok === true, "health response is not ok");
    expect(WORKER_VERSION_ID.test(health.workerVersionId || ""), "API health lacks a valid Worker version ID");
    expect(
      resource.response.headers.get("x-jakh-worker-version") === health.workerVersionId,
      "API health body and response header identify different Worker versions",
    );
    resource.workerVersionId = health.workerVersionId;
    expect(
      health.service === API_RELEASE_CONTRACT.service,
      `unexpected API service "${health.service || "missing"}"`,
    );
    expect(
      health.version === API_RELEASE_CONTRACT.version,
      `unexpected API version "${health.version || "missing"}"`,
    );
    const schemaIsAllowed = config.allowCompatibleSchema
      ? API_RELEASE_CONTRACT.compatibleSchemas.includes(health.schema)
      : health.schema === API_RELEASE_CONTRACT.schema;
    expect(schemaIsAllowed, `unexpected API schema "${health.schema || "missing"}"`);
    expect(
      health.targetSchema === API_RELEASE_CONTRACT.targetSchema,
      `unexpected API target schema "${health.targetSchema || "missing"}"`,
    );
    expect(
      Array.isArray(health.compatibleSchemas)
        && health.compatibleSchemas.length === API_RELEASE_CONTRACT.compatibleSchemas.length
        && health.compatibleSchemas.every(
          (schema, index) => schema === API_RELEASE_CONTRACT.compatibleSchemas[index],
        ),
      "unexpected API compatible schema contract",
    );
    const schemaNumber = Number(health.schema);
    const expectedFeatures = config.allowCompatibleSchema
      ? {
          registration: schemaNumber >= 7,
          accountRecovery: schemaNumber >= 7,
          accountDeletion: schemaNumber >= 8,
        }
      : API_RELEASE_CONTRACT.features;
    expect(
      health.features
        && Object.entries(expectedFeatures).every(
          ([feature, ready]) => health.features[feature] === ready,
        ),
      config.allowCompatibleSchema
        ? "API feature readiness is inconsistent with its actual schema"
        : "one or more final-schema API features are not ready",
    );
    const publication = health.contentPublication;
    expect(publication?.state === CONTENT_PUBLICATION_CONTRACT.state, "API content quarantine is not active");
    expect(
      publication.quarantinedQuestions === CONTENT_PUBLICATION_CONTRACT.quarantinedQuestions
        && publication.publicQuestions === CONTENT_PUBLICATION_CONTRACT.publicQuestions
        && publication.manifestSha256 === CONTENT_PUBLICATION_CONTRACT.manifestSha256,
      "API content quarantine totals or policy digest differ from the release source",
    );
    const actualQuarantinedCategories = Array.isArray(publication.quarantinedCategories)
      ? [...publication.quarantinedCategories].sort()
      : [];
    const expectedQuarantinedCategories = [...CONTENT_PUBLICATION_CONTRACT.quarantinedCategories].sort();
    expect(
      actualQuarantinedCategories.length === expectedQuarantinedCategories.length
        && actualQuarantinedCategories.every(
          (slug, index) => slug === expectedQuarantinedCategories[index],
        ),
      "API quarantined categories differ from the release source",
    );
    assertBudget(resource, config.apiMaxMs, 20_000);
    return resource;
  });

  await check("API: leaderboard", async () => {
    const resource = await fetchResource(
      fetchImpl,
      new URL("/api/leaderboard", config.apiOrigin),
      config.timeoutMs,
      { headers: { origin: ALLOWED_ORIGIN } },
    );
    expectStatus(resource.response, 200);
    expectContentType(resource.response, /application\/json/iu);
    expectCors(resource.response, ALLOWED_ORIGIN);
    expectApiSecurityHeaders(resource.response);
    const payload = parseJson(resource);
    expect(payload.status === "active", "server-checked public rankings are not active");
    expect(payload.scoreType === "server-checked", "leaderboard score type is not server checked");
    expect(payload.serverChecked === true, "leaderboard does not declare server-side answer checking");
    expect(payload.proctored === false, "leaderboard must not claim proctoring");
    expect(
      typeof payload.automationDisclaimer === "string" && payload.automationDisclaimer.trim().length > 0,
      "leaderboard is missing its automation disclaimer",
    );
    expect(Array.isArray(payload.leaderboard), "leaderboard response is not an array");
    expect(
      payload.leaderboard.every((entry) => entry && Number.isInteger(entry.rank)),
      "leaderboard contains an invalid ranked entry",
    );
    assertBudget(resource, config.apiMaxMs, 50_000);
    return resource;
  });

  await check("API quarantine: held leaderboard category", async () => {
    const resource = await fetchResource(
      fetchImpl,
      new URL("/api/leaderboard?category=medical-questions", config.apiOrigin),
      config.timeoutMs,
      { headers: { origin: ALLOWED_ORIGIN } },
    );
    expectApiQuarantine(resource);
    assertBudget(resource, config.apiMaxMs, 20_000);
    return resource;
  });

  await check("API quarantine: held Battle category", async () => {
    const resource = await fetchResource(
      fetchImpl,
      new URL("/api/battle/create", config.apiOrigin),
      config.timeoutMs,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ALLOWED_ORIGIN,
        },
        body: JSON.stringify({
          category: "medical-questions",
          difficulty: "all",
          questionCount: 5,
        }),
      },
    );
    expectApiQuarantine(resource);
    const payload = parseJson(resource);
    expect(payload.code === "CATEGORY_QUARANTINED", "held Battle request was not denied by policy");
    expect(payload.hostId === undefined && payload.roomCode === undefined, "held Battle request allocated a room");
    assertBudget(resource, config.apiMaxMs, 20_000);
    return resource;
  });

  await Promise.all(UNAUTHENTICATED_API_GET_ROUTES.map((route) =>
    check(`API: unauthenticated ${route.name}`, async () => {
      const resource = await fetchResource(
        fetchImpl,
        new URL(route.path, config.apiOrigin),
        config.timeoutMs,
        { headers: { origin: ALLOWED_ORIGIN } },
      );
      expectStatus(resource.response, 401);
      expectContentType(resource.response, /application\/json/iu);
      expectCors(resource.response, ALLOWED_ORIGIN);
      expectApiSecurityHeaders(resource.response);
      expect(resource.response.headers.get("cache-control") === "no-store", "authentication error is cacheable");
      expect(resource.response.headers.get("set-cookie") === null, "unauthenticated request set a cookie");
      expect(parseJson(resource).error === "Unauthorized", "unexpected authentication error response");
      assertBudget(resource, config.apiMaxMs, 20_000);
      return resource;
    }),
  ));

  await check("API: allowed CORS preflight", async () => {
    const resource = await fetchResource(
      fetchImpl,
      new URL("/api/user/profile", config.apiOrigin),
      config.timeoutMs,
      {
        method: "OPTIONS",
        headers: {
          origin: ALLOWED_ORIGIN,
          "access-control-request-method": "GET",
        },
      },
    );
    expectStatus(resource.response, 204);
    expectCors(resource.response, ALLOWED_ORIGIN);
    const methods = (resource.response.headers.get("access-control-allow-methods") || "")
      .split(",")
      .map((method) => method.trim());
    expect(methods.includes("GET"), "CORS preflight does not allow GET");
    expect(
      resource.response.headers.get("access-control-max-age") === "86400",
      "CORS preflight max age changed",
    );
    assertBudget(resource, config.apiMaxMs, 1_000);
    return resource;
  });

  await check("API: disallowed origin", async () => {
    const resource = await fetchResource(
      fetchImpl,
      new URL("/api/health", config.apiOrigin),
      config.timeoutMs,
      { headers: { origin: DISALLOWED_ORIGIN } },
    );
    expectStatus(resource.response, 403);
    expectContentType(resource.response, /application\/json/iu);
    expectApiSecurityHeaders(resource.response);
    expect(
      resource.response.headers.get("access-control-allow-origin") === null,
      "disallowed origin received an Access-Control-Allow-Origin header",
    );
    expect(parseJson(resource).error === "Origin is not allowed", "unexpected disallowed-origin response");
    assertBudget(resource, config.apiMaxMs, 20_000);
    return resource;
  });

  await check("API: unknown route", async () => {
    const resource = await fetchResource(
      fetchImpl,
      new URL("/api/__jakh-production-monitor-missing__", config.apiOrigin),
      config.timeoutMs,
    );
    expectStatus(resource.response, 404);
    expectContentType(resource.response, /application\/json/iu);
    expectApiSecurityHeaders(resource.response);
    expect(parseJson(resource).error === "Not found", "unexpected API 404 response");
    assertBudget(resource, config.apiMaxMs, 20_000);
    return resource;
  });

  for (const result of results) {
    const retry = result.attempts > 1 ? `  recovered on attempt ${result.attempts}` : "";
    logger.log(
      `PASS  ${result.name.padEnd(36)} ${String(result.status).padEnd(3)} `
      + `${Math.round(result.elapsedMs).toString().padStart(5)}ms  ${formatBytes(result.bytes)}${retry}`,
    );
  }
  for (const failure of failures) {
    const attempts = failure.attempts > 1 ? ` after ${failure.attempts} attempts` : "";
    logger.error(`FAIL  ${failure.name}${attempts}: ${failure.message}`);
  }

  const summary = { config, results, failures };
  if (failures.length && options.throwOnFailure !== false) {
    throw new Error(`Production monitor failed: ${failures.length} of ${results.length + failures.length} checks failed`);
  }

  logger.log(
    `Production monitor ${failures.length ? "failed" : "passed"}: `
    + `${results.length} passed, ${failures.length} failed.`,
  );
  return summary;
}

export function buildMonitorReport(summary, generatedAt = new Date()) {
  return {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    status: summary.failures.length ? "failure" : "success",
    monitor: {
      scope: summary.config?.scope ?? null,
      siteOrigin: summary.config?.siteOrigin ?? null,
      apiOrigin: summary.config?.apiOrigin ?? null,
      allowCompatibleSchema: summary.config?.allowCompatibleSchema === true,
    },
    totalChecks: summary.results.length + summary.failures.length,
    passedChecks: summary.results.length,
    failedChecks: summary.failures.length,
    contentPublicationContract: CONTENT_PUBLICATION_CONTRACT,
    apiReleaseContract: API_RELEASE_CONTRACT,
    results: summary.results,
    failures: summary.failures,
  };
}

export async function writeMonitorReport(path, summary, generatedAt) {
  const report = buildMonitorReport(summary, generatedAt);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runProductionMonitor({ throwOnFailure: false }).then(async (summary) => {
    const reportPath = process.env.JAKH_MONITOR_RESULT_PATH;
    if (reportPath) await writeMonitorReport(reportPath, summary);
    if (summary.failures.length) process.exitCode = 1;
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
