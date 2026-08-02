import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const browserRegressionSource = fs.readFileSync(path.join(root, 'scripts/browser-regression.mjs'), 'utf8');
const quarantineManifest = JSON.parse(fs.readFileSync(
  path.join(root, 'docs/content-review/production-quarantine.json'),
  'utf8',
));
const quarantinedCategories = new Set(quarantineManifest.categories.map(({ slug }) => slug));
const origin = 'https://jakh.net';
const fixedNow = '2026-08-01T12:00:00.000Z';

function contentTypeFor(pathname) {
  if (pathname.endsWith('.css')) return 'text/css';
  if (pathname.endsWith('.js')) return 'text/javascript';
  if (pathname.endsWith('.json')) return 'application/json';
  if (pathname.endsWith('.webmanifest')) return 'application/manifest+json';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.ico')) return 'image/x-icon';
  if (pathname.endsWith('.woff2')) return 'font/woff2';
  return 'text/html';
}

function createHarness({
  failedCacheOpenNames = [],
  failedCachePutPaths = [],
  failedPaths = [],
  rejectedPaths = [],
} = {}) {
  const listeners = new Map();
  const stores = new Map();
  const fetches = [];
  const failures = new Set(failedPaths);
  const openFailures = new Set(failedCacheOpenNames);
  const putFailures = new Set(failedCachePutPaths);
  const rejections = new Set(rejectedPaths);
  let online = true;
  let skipWaitingCount = 0;

  function keyOf(request) {
    const raw = typeof request === 'string' ? request : request.url;
    return new URL(raw, origin).href;
  }

  class MemoryCache {
    constructor(name) {
      this.name = name;
      this.entries = new Map();
    }

    async put(request, response) {
      if (putFailures.has(new URL(keyOf(request)).pathname)) {
        throw new Error(`Cache write unavailable for ${new URL(keyOf(request)).pathname}`);
      }
      this.entries.set(keyOf(request), response.clone());
    }

    async match(request) {
      return this.entries.get(keyOf(request))?.clone();
    }

    async keys() {
      return [...this.entries.keys()].map((key) => new Request(key));
    }

    async delete(request) {
      return this.entries.delete(keyOf(request));
    }
  }

  const fakeCaches = {
    async open(name) {
      if (openFailures.has(name)) throw new Error(`Cache unavailable: ${name}`);
      if (!stores.has(name)) stores.set(name, new MemoryCache(name));
      return stores.get(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };

  class FixedDate extends Date {
    constructor(value) {
      super(value === undefined ? fixedNow : value);
    }

    static now() {
      return new Date(fixedNow).getTime();
    }
  }

  const fakeSelf = {
    location: { origin },
    clients: { async claim() {} },
    async skipWaiting() { skipWaitingCount += 1; },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };

  const context = vm.createContext({
    Date: FixedDate,
    Promise,
    Request,
    Response,
    Set,
    URL,
    caches: fakeCaches,
    fetch: async (request) => {
      const url = new URL(typeof request === 'string' ? request : request.url, origin);
      fetches.push(url.href);
      if (!online || failures.has(url.pathname)) throw new Error(`Network unavailable for ${url.pathname}`);
      const response = new Response(`network:${url.pathname}${url.search}`, {
        headers: {
          'content-type': rejections.has(url.pathname) ? 'text/plain' : contentTypeFor(url.pathname),
        },
      });
      Object.defineProperty(response, 'type', { value: 'basic' });
      return response;
    },
    self: fakeSelf,
  });
  new vm.Script(workerSource, { filename: 'sw.js' }).runInContext(context);

  async function dispatchWithLifetime(type, event = {}) {
    const lifetimes = [];
    const listener = listeners.get(type);
    assert.ok(listener, `missing ${type} listener`);
    listener({
      ...event,
      waitUntil(value) { lifetimes.push(Promise.resolve(value)); },
    });
    assert.ok(lifetimes.length > 0, `${type} must extend event lifetime`);
    await Promise.all(lifetimes);
  }

  async function dispatchFetch(pathname, mode = 'same-origin') {
    let responsePromise;
    const lifetimes = [];
    const request = {
      method: 'GET',
      mode,
      url: new URL(pathname, origin).href,
    };
    listeners.get('fetch')?.({
      request,
      respondWith(value) { responsePromise = Promise.resolve(value); },
      waitUntil(value) { lifetimes.push(Promise.resolve(value)); },
    });
    assert.ok(responsePromise, `service worker did not handle ${pathname}`);
    const response = await responsePromise;
    await Promise.all(lifetimes);
    return response;
  }

  function handled(request) {
    let didRespond = false;
    listeners.get('fetch')?.({
      request,
      respondWith() { didRespond = true; },
      waitUntil() {},
    });
    return didRespond;
  }

  return {
    dispatchFetch,
    dispatchWithLifetime,
    evaluate(expression) { return vm.runInContext(expression, context); },
    fetches,
    handled,
    setOnline(value) { online = value; },
    get skipWaitingCount() { return skipWaitingCount; },
    stores,
  };
}

function cacheName(harness, expression) {
  return harness.evaluate(expression);
}

function expectedDailyPath(date, catalog) {
  const eligible = catalog.categories.filter((category) => (
    category.count >= 15
    && category.mode !== 'story'
    && !quarantinedCategories.has(category.slug)
  ));
  const isoDate = date.toISOString().split('T')[0];
  const hash = isoDate
    .split('')
    .reduce((value, character) => ((value * 31) + character.charCodeAt(0)) | 0, 0);
  return `/data/${eligible[Math.abs(hash) % eligible.length].slug}.json`;
}

test('required install fails closed and does not request activation', async () => {
  for (const options of [
    { failedPaths: ['/styles.css'] },
    { failedPaths: ['/privacy.css'] },
    { rejectedPaths: ['/manifest.webmanifest'] },
    { failedCachePutPaths: ['/styles.css'] },
  ]) {
    const harness = createHarness(options);
    const coreName = cacheName(harness, 'CORE_CACHE');
    await assert.rejects(harness.dispatchWithLifetime('install'));
    assert.equal(harness.skipWaitingCount, 0);
    assert.equal(harness.stores.has(coreName), false, 'failed install left a partial core cache');
  }
});

test('complete install guarantees the bilingual core shell, ten games, and current daily data', async () => {
  const harness = createHarness();
  await harness.dispatchWithLifetime('install');
  assert.equal(harness.skipWaitingCount, 1);

  const coreName = cacheName(harness, 'CORE_CACHE');
  const core = harness.stores.get(coreName);
  assert.ok(core, 'core cache was not created');
  const paths = new Set((await core.keys()).map((request) => new URL(request.url).pathname));
  for (const requiredPath of [
    '/',
    '/offline',
    '/app.js',
    '/privacy.css',
    '/styles.css',
    '/manifest.webmanifest',
    '/data/catalog.json',
    '/science',
    '/data/science.json',
    '/assets/icon-192.png',
    '/assets/icon-512.png',
    '/backgammon',
    '/catan',
    '/chess',
    '/codenames',
    '/diplomacy',
    '/go',
    '/hanabi',
    '/mastermind',
    '/reversi',
    '/set',
    '/ar/',
    '/ar/mind-lab/',
    '/ar/collections/',
    '/ar/play/',
    '/ar/about/',
    '/ar/privacy/',
    '/ar/games/backgammon/',
    '/ar/games/catan/',
    '/ar/games/chess/',
    '/ar/games/codenames/',
    '/ar/games/diplomacy/',
    '/ar/games/go/',
    '/ar/games/hanabi/',
    '/ar/games/mastermind/',
    '/ar/games/reversi/',
    '/ar/games/set/',
  ]) {
    assert.ok(paths.has(requiredPath), `required core asset missing: ${requiredPath}`);
  }
});

test('optional upcoming daily warm failures do not weaken the required install', async () => {
  const probe = createHarness();
  const optionalPaths = JSON.parse(probe.evaluate('JSON.stringify(installDailyPaths().slice(1))'));
  assert.ok(optionalPaths.length > 0, 'test date must have at least one distinct upcoming daily dataset');

  for (const options of [
    { failedPaths: [optionalPaths[0]] },
    { failedCacheOpenNames: [cacheName(probe, 'DATA_CACHE')] },
  ]) {
    const harness = createHarness(options);
    await harness.dispatchWithLifetime('install');
    assert.equal(harness.skipWaitingCount, 1);
    const coreName = cacheName(harness, 'CORE_CACHE');
    assert.ok(harness.stores.has(coreName), 'optional failure removed the required shell');
  }
});

test('offline navigation returns compatible cached documents or the dedicated fallback', async () => {
  const harness = createHarness();
  await harness.dispatchWithLifetime('install');
  harness.setOnline(false);

  assert.equal(await (await harness.dispatchFetch('/?daily=1', 'navigate')).text(), 'network:/');
  assert.equal(await (await harness.dispatchFetch('/catan.html?lang=ar', 'navigate')).text(), 'network:/catan');
  assert.equal(
    await (await harness.dispatchFetch('/ar/games/catan/?source=offline', 'navigate')).text(),
    'network:/ar/games/catan/',
  );
  assert.equal(
    await (await harness.dispatchFetch('/ar/privacy/?source=offline', 'navigate')).text(),
    'network:/ar/privacy/',
  );
  assert.equal(
    await (await harness.dispatchFetch('/never-visited-category?filter=hard', 'navigate')).text(),
    'network:/offline',
  );
});

test('runtime caches are capped and same-origin version queries share one key', async () => {
  const harness = createHarness();
  await harness.dispatchWithLifetime('install');

  await harness.dispatchFetch('/runtime.js?v=one');
  harness.setOnline(false);
  assert.equal(
    await (await harness.dispatchFetch('/runtime.js?v=two')).text(),
    'network:/runtime.js?v=one',
  );
  harness.setOnline(true);

  for (let index = 0; index < 110; index += 1) {
    await harness.dispatchFetch(`/assets/runtime-${index}.png?v=${index}`);
  }
  for (let index = 0; index < 80; index += 1) {
    await harness.dispatchFetch(`/data/runtime-${index}.json?v=${index}`);
  }
  for (let index = 0; index < 70; index += 1) {
    await harness.dispatchFetch(`/runtime-page-${index}?v=${index}`, 'navigate');
  }

  const expectations = [
    ['ASSET_CACHE', 96],
    ['DATA_CACHE', 64],
    ['NAVIGATION_CACHE', 64],
  ];
  for (const [expression, maximum] of expectations) {
    const name = cacheName(harness, expression);
    const cache = harness.stores.get(name);
    assert.ok(cache, `${name} was not created`);
    const keys = await cache.keys();
    assert.ok(keys.length <= maximum, `${name} grew to ${keys.length} entries`);
    assert.ok(keys.every((request) => new URL(request.url).search === ''), `${name} retained query variants`);
  }

  assert.equal(harness.handled({
    method: 'GET',
    mode: 'same-origin',
    url: 'https://example.com/runtime.js?v=1',
  }), false, 'cross-origin asset was intercepted');
  assert.equal(harness.handled({
    method: 'GET',
    mode: 'same-origin',
    url: `${origin}/api/health`,
  }), false, 'online-only API request was intercepted');
});

test('quarantined routes and data fail closed before every online or offline cache lookup', async () => {
  const harness = createHarness();
  await harness.dispatchWithLifetime('install');
  const fetchCount = harness.fetches.length;
  for (const pathname of [
    '/survival',
    '/SURVIVAL.html?card=survival-1',
    '/survival/page/2/',
    '/ar/topics/survival/',
    '/ar/topics/survival.html',
    '/ar/topics/survival.html/archive',
    '/ar/topics/survival%2ehtml',
    '/ar/topics/medical-questions/page/5/',
    '/data/pharmacy.json?v=old',
    '/data/pharmacy.json/',
    '/data/pharmacy.json/archive',
    '/data/pharmacy.json%2farchive',
    '/survival%3Fx=1',
    '/survival%23fragment',
    '/data/survival.json%3Fx=1',
    '/data/survival.json%23fragment',
    '/science%00/safe',
    '/%73urvival',
    '/survival%2ehtml',
    '/ar//topics//%73urvival/',
    '/data/%73urvival.json',
    '/data/survival%2ejson',
    '/safe/%252e%252e/law-middle-east',
    '/%25252573urvival',
    '/data/%ZZ.json',
  ]) {
    const response = await harness.dispatchFetch(
      pathname,
      pathname.includes('/data/') ? 'same-origin' : 'navigate',
    );
    assert.equal(response.status, 410, pathname);
    assert.equal(response.headers.get('cache-control'), 'no-store', pathname);
    assert.equal(response.headers.get('clear-site-data'), '"cache"', pathname);
    assert.equal(response.headers.get('x-jakh-content-quarantine'), 'active', pathname);
    assert.match(response.headers.get('x-robots-tag'), /noindex/u, pathname);
  }
  assert.equal(harness.fetches.length, fetchCount, 'quarantine guard reached the network');

  harness.setOnline(false);
  const offline = await harness.dispatchFetch('/data/economics-and-finance.json');
  assert.equal(offline.status, 410);

  const safePrefix = await harness.dispatchFetch('/survival-guide', 'navigate');
  assert.notEqual(safePrefix.status, 410);
});

test('activation removes quarantined entries even if a prior cache populated them', async () => {
  const harness = createHarness();
  await harness.dispatchWithLifetime('install');
  await harness.dispatchFetch('/science', 'navigate');
  for (const cache of harness.stores.values()) {
    await cache.put(
      new Request(`${origin}/data/medical-questions.json`),
      new Response('held-data', { headers: { 'content-type': 'application/json' } }),
    );
    await cache.put(
      new Request(`${origin}/ar/topics/law-middle-east/`),
      new Response('held-page', { headers: { 'content-type': 'text/html' } }),
    );
  }
  await harness.dispatchWithLifetime('activate');
  for (const cache of harness.stores.values()) {
    const paths = (await cache.keys()).map((request) => new URL(request.url).pathname);
    assert.equal(paths.includes('/data/medical-questions.json'), false);
    assert.equal(paths.includes('/ar/topics/law-middle-east/'), false);
  }
});

test('daily dependency routing mirrors the catalog for representative dates', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog.json'), 'utf8'));
  const expectedSlugs = catalog.categories
    .filter((category) => (
      category.count >= 15
      && category.mode !== 'story'
      && !quarantinedCategories.has(category.slug)
    ))
    .map((category) => category.slug);
  const harness = createHarness();
  const workerSlugs = JSON.parse(harness.evaluate('JSON.stringify(DAILY_CATEGORY_SLUGS)'));
  assert.deepEqual(workerSlugs, expectedSlugs);
  assert.deepEqual(
    new Set(JSON.parse(harness.evaluate('JSON.stringify(QUARANTINED_CATEGORY_SLUGS)'))),
    quarantinedCategories,
  );

  for (const isoDate of [
    '2026-08-01T12:00:00.000Z',
    '2026-12-31T12:00:00.000Z',
    '2027-01-01T12:00:00.000Z',
    '2030-06-15T12:00:00.000Z',
  ]) {
    const date = new Date(isoDate);
    const actual = harness.evaluate(`dailyDataPath(new Date(${JSON.stringify(isoDate)}))`);
    assert.equal(actual, expectedDailyPath(date, catalog));
  }
});

test('all direct game entries use the shared registration path', () => {
  const runtime = fs.readFileSync(path.join(root, 'game-i18n.js'), 'utf8');
  assert.match(runtime, /serviceWorker\.register\('\/sw\.js', \{ scope: '\/' \}\)/u);
  assert.doesNotMatch(runtime, /getRegistration\(/u);
  assert.doesNotMatch(workerSource, /type\s*===\s*['"]SKIP_WAITING['"]/u);
  assert.doesNotMatch(workerSource, /\bCLEAR_CACHE\b/u);

  const games = JSON.parse(createHarness().evaluate('JSON.stringify(GAME_DOCUMENTS)'));
  const arabicShared = JSON.parse(createHarness().evaluate('JSON.stringify(ARABIC_SHARED_DOCUMENTS)'));
  assert.equal(games.length, 10);
  assert.deepEqual(arabicShared, [
    '/ar/',
    '/ar/mind-lab/',
    '/ar/collections/',
    '/ar/play/',
    '/ar/about/',
    '/ar/privacy/',
    ...games.map((route) => `/ar/games${route}/`),
  ]);
  assert.equal(new Set(arabicShared).size, 16);
  for (const route of arabicShared) {
    const directory = route === '/ar/' ? path.join(root, 'ar') : path.join(root, route.slice(1));
    assert.equal(fs.existsSync(path.join(directory, 'index.html')), true, `${route} has no physical page`);
  }
  for (const route of games) {
    const file = `${route.slice(1)}.html`;
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /<script[^>]+src=["'][^"']*game-i18n\.js(?:\?[^"']*)?["']/iu, `${file} lacks game-i18n.js`);
    assert.doesNotMatch(source, /getRegistration\(/u, `${file} retains a getRegistration-only bootstrap`);
    assert.doesNotMatch(source, /serviceWorker\.register\(/u, `${file} duplicates shared registration`);
  }
});

test('browser release gate waits for claimed service-worker control without a navigation reload', () => {
  const suiteStart = browserRegressionSource.indexOf(
    'await runTest("service worker cold-offline shell and direct game entry"',
  );
  const suiteEnd = browserRegressionSource.indexOf('\n    console.log(', suiteStart);
  assert.ok(suiteStart >= 0 && suiteEnd > suiteStart, 'cold-offline browser suite is missing');
  const coldOfflineSuite = browserRegressionSource.slice(suiteStart, suiteEnd);
  assert.match(
    coldOfflineSuite,
    /navigator\.serviceWorker\.ready[\s\S]+controller\?\.state === "activated"/u,
  );
  assert.match(coldOfflineSuite, /\/chess\?offline_probe=1/u);
  assert.match(coldOfflineSuite, /chessNavigation\.fromServiceWorker\(\), true/u);
  assert.doesNotMatch(coldOfflineSuite, /waitForFunction\(async/u);
  assert.doesNotMatch(coldOfflineSuite, /\bpage\.reload\(/u);
});
