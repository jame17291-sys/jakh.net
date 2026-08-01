const CACHE_VERSION = 'v81';
const CORE_CACHE = `jakh-core-${CACHE_VERSION}`;
const NAVIGATION_CACHE = `jakh-navigation-${CACHE_VERSION}`;
const ASSET_CACHE = `jakh-assets-${CACHE_VERSION}`;
const DATA_CACHE = `jakh-data-${CACHE_VERSION}`;
const CURRENT_CACHES = new Set([
  CORE_CACHE,
  NAVIGATION_CACHE,
  ASSET_CACHE,
  DATA_CACHE,
]);

const MAX_NAVIGATION_CACHE_ENTRIES = 64;
const MAX_ASSET_CACHE_ENTRIES = 96;
const MAX_DATA_CACHE_ENTRIES = 64;
const OFFLINE_FALLBACK_PATH = '/offline';

const GAME_DOCUMENTS = [
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
];

const ARABIC_SHARED_DOCUMENTS = [
  '/ar/',
  '/ar/mind-lab/',
  '/ar/collections/',
  '/ar/play/',
  '/ar/about/',
  '/ar/privacy/',
  ...GAME_DOCUMENTS.map((route) => `/ar/games${route}/`),
];

// This order mirrors the catalog categories eligible for the Home daily card.
// scripts/service-worker-contract.test.mjs prevents this compact install-time
// dependency list from drifting away from data/catalog.json.
const DAILY_CATEGORY_SLUGS = [
  'currencies',
  'linguistics',
  'tech-retro',
  'automotive',
  'survival',
  'fictional-worlds',
  'superheroes',
  'pop-culture',
  'true-crime',
  'mythology-legends',
  'art-and-painters',
  'biology',
  'books-and-quotes',
  'business-and-management',
  'chemistry',
  'civil-engineering',
  'classic-riddles',
  'logic-puzzles',
  'coding-and-design',
  'electrical-engineering',
  'flag-questions',
  'football',
  'geography',
  'geology',
  'history',
  'infrastructure-systems',
  'kids-riddles',
  'law-middle-east',
  'math',
  'mechanical-engineering',
  'medical-questions',
  'middle-east-history',
  'pharmacy',
  'philosophy',
  'physical-and-life-sciences',
  'psychology',
  'relationship-questions',
  'science',
  'social-sciences',
  'software-and-computing',
  'space-and-astrology',
  'tv-shows-trivia',
  'world-habits-and-etiquette',
  'environment-and-ecology',
  'ancient-civilizations',
  'inventions-and-minds',
  'animal-kingdom',
  'economics-and-finance',
  'architecture-and-landmarks',
  'music-and-performing-arts',
  'food-and-cuisines',
  'cinema-and-film-history',
  'future-tech-and-energy',
  'anime',
  'ayam-tayebeen',
];

const REQUIRED_CORE_ASSETS = [
  '/',
  '/mind-lab',
  '/play',
  '/collections',
  '/about',
  '/privacy',
  '/science',
  OFFLINE_FALLBACK_PATH,
  '/app.js',
  '/site-i18n.js',
  '/game-i18n.js',
  '/privacy-consent.js',
  '/privacy-page.js',
  '/privacy.css',
  '/styles.css',
  '/manifest.webmanifest',
  '/assets/logo.webp',
  '/assets/logo.png',
  '/assets/favicon.svg',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/favicon.ico',
  '/data/catalog.json',
  '/data/science.json',
  ...GAME_DOCUMENTS,
  ...ARABIC_SHARED_DOCUMENTS,
];

const CONTENT_TYPES_BY_EXTENSION = {
  css: ['text/css'],
  ico: ['image/x-icon', 'image/vnd.microsoft.icon'],
  html: ['text/html'],
  jpeg: ['image/jpeg'],
  jpg: ['image/jpeg'],
  js: ['application/javascript', 'text/javascript'],
  json: ['application/json'],
  png: ['image/png'],
  svg: ['image/svg+xml'],
  webmanifest: ['application/manifest+json', 'application/json'],
  webp: ['image/webp'],
  woff2: ['font/woff2'],
};

function expectedContentTypes(pathname) {
  const extension = pathname.match(/\.([a-z0-9]+)$/iu)?.[1]?.toLowerCase();
  return extension ? (CONTENT_TYPES_BY_EXTENSION[extension] || []) : ['text/html'];
}

function hasNoStore(response) {
  const cacheControl = response.headers.get('cache-control') || '';
  return cacheControl
    .split(',')
    .some((directive) => directive.trim().toLowerCase() === 'no-store');
}

function isCacheableResponse(response, pathname) {
  if (!response || response.status !== 200 || response.type !== 'basic' || hasNoStore(response)) {
    return false;
  }
  const contentType = (response.headers.get('content-type') || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  return expectedContentTypes(pathname).includes(contentType);
}

function normalizeNavigationPath(pathname) {
  let normalized = pathname.replace(/\/{2,}/gu, '/');
  normalized = normalized.replace(/\/index\.html$/iu, '/');
  normalized = normalized.replace(/\.html$/iu, '');
  if (normalized === '/ar' || normalized.startsWith('/ar/')) {
    normalized = `${normalized.replace(/\/+$/u, '')}/`;
  } else if (normalized.length > 1) {
    normalized = normalized.replace(/\/+$/u, '');
  }
  return normalized || '/';
}

function navigationCacheRequest(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  url.pathname = normalizeNavigationPath(url.pathname);
  url.search = '';
  url.hash = '';
  return new Request(url.href, {
    method: 'GET',
    headers: { Accept: 'text/html' },
    credentials: 'same-origin',
  });
}

function staticCacheRequest(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  url.search = '';
  url.hash = '';
  return new Request(url.href, {
    method: 'GET',
    credentials: 'same-origin',
  });
}

function requestForPath(path, options = {}) {
  const url = new URL(path, self.location.origin);
  return new Request(url.href, {
    method: 'GET',
    credentials: 'same-origin',
    ...options,
  });
}

function dailyDataPath(date) {
  const isoDate = date.toISOString().split('T')[0];
  const hash = isoDate
    .split('')
    .reduce((value, character) => ((value * 31) + character.charCodeAt(0)) | 0, 0);
  const slug = DAILY_CATEGORY_SLUGS[Math.abs(hash) % DAILY_CATEGORY_SLUGS.length];
  return `/data/${slug}.json`;
}

function installDailyPaths(startDate = new Date()) {
  const paths = [];
  for (let day = 0; day < 7; day += 1) {
    const date = new Date(startDate.getTime());
    date.setUTCDate(date.getUTCDate() + day);
    const path = dailyDataPath(date);
    if (!paths.includes(path)) paths.push(path);
  }
  return paths;
}

async function fetchValidatedOfflineAsset(path) {
  const request = requestForPath(path, { cache: 'reload' });
  const response = await fetch(request);
  if (!isCacheableResponse(response, new URL(request.url).pathname)) {
    throw new Error(`Offline asset rejected: ${path}`);
  }
  return { request: staticCacheRequest(request), response };
}

async function putInstallEntries(cacheName, entries) {
  const cache = await caches.open(cacheName);
  await Promise.all(entries.map(({ request, response }) => cache.put(request, response.clone())));
}

async function warmOptionalDailyAssets(paths) {
  try {
    const cache = await caches.open(DATA_CACHE);
    await Promise.allSettled(paths.map(async (path) => {
      const { request, response } = await fetchValidatedOfflineAsset(path);
      await cache.put(request, response.clone());
    }));
    await trimCache(cache, MAX_DATA_CACHE_ENTRIES);
  } catch (_) {}
}

async function installOfflineShell() {
  const [requiredDailyPath, ...optionalDailyPaths] = installDailyPaths();
  const requiredPaths = [...new Set([...REQUIRED_CORE_ASSETS, requiredDailyPath])];
  try {
    // Fetch and validate the entire required set before writing any response.
    // A failure rejects installation and removes the unusable versioned cache.
    const entries = await Promise.all(requiredPaths.map(fetchValidatedOfflineAsset));
    await putInstallEntries(CORE_CACHE, entries);
  } catch (error) {
    await caches.delete(CORE_CACHE);
    throw error;
  }

  // Upcoming daily datasets improve short offline stretches, but none is part
  // of the guaranteed shell and one failed warm request cannot block install.
  await warmOptionalDailyAssets(optionalDailyPaths);
  await self.skipWaiting();
}

async function cacheResponse(cache, request, response, pathname, maximumEntries) {
  if (!isCacheableResponse(response, pathname)) return false;
  try {
    await cache.put(request, response.clone());
    await trimCache(cache, maximumEntries);
    return true;
  } catch (_) {
    return false;
  }
}

async function trimCache(cache, maximumEntries) {
  try {
    const keys = await cache.keys();
    const staleKeys = keys.slice(0, Math.max(0, keys.length - maximumEntries));
    await Promise.all(staleKeys.map((key) => cache.delete(key)));
  } catch (_) {}
}

async function matchCore(request) {
  const core = await caches.open(CORE_CACHE);
  return core.match(request);
}

self.addEventListener('install', (event) => {
  event.waitUntil(installOfflineShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('jakh-') && !CURRENT_CACHES.has(key))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Cloud APIs, WebSockets, non-GET requests, and third-party resources remain
  // explicitly online-only and never enter JAKH caches.
  if (
    request.method !== 'GET'
    || url.origin !== self.location.origin
    || url.pathname.startsWith('/api/')
  ) return;

  if (request.mode === 'navigate') {
    const cacheKey = navigationCacheRequest(request);
    if (!cacheKey) return;
    event.respondWith((async () => {
      const cache = await caches.open(NAVIGATION_CACHE);
      try {
        const response = await fetch(request);
        await cacheResponse(
          cache,
          cacheKey,
          response,
          normalizeNavigationPath(url.pathname),
          MAX_NAVIGATION_CACHE_ENTRIES,
        );
        return response;
      } catch (_) {
        return (await cache.match(cacheKey))
          || (await matchCore(cacheKey))
          || (await matchCore(requestForPath(OFFLINE_FALLBACK_PATH)));
      }
    })());
    return;
  }

  if (url.pathname.endsWith('.json')) {
    const cacheKey = staticCacheRequest(request);
    const networkFetch = caches.open(DATA_CACHE).then(async (cache) => {
      const response = await fetch(request);
      await cacheResponse(cache, cacheKey, response, url.pathname, MAX_DATA_CACHE_ENTRIES);
      return response;
    });
    event.waitUntil(networkFetch.catch(() => {}));
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      return (await cache.match(cacheKey))
        || (await matchCore(cacheKey))
        || networkFetch;
    })());
    return;
  }

  if (url.pathname.match(/\.(js|css|webmanifest)$/u)) {
    const cacheKey = staticCacheRequest(request);
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      try {
        const response = await fetch(request);
        await cacheResponse(cache, cacheKey, response, url.pathname, MAX_ASSET_CACHE_ENTRIES);
        return response;
      } catch (error) {
        const cached = (await cache.match(cacheKey)) || (await matchCore(cacheKey));
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  if (url.pathname.match(/\.(svg|png|jpe?g|webp|ico|woff2)$/u)) {
    const cacheKey = staticCacheRequest(request);
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = (await cache.match(cacheKey)) || (await matchCore(cacheKey));
      if (cached) return cached;
      const response = await fetch(request);
      await cacheResponse(cache, cacheKey, response, url.pathname, MAX_ASSET_CACHE_ENTRIES);
      return response;
    })());
  }
});
