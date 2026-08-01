const CACHE_NAME = 'jakh-v77';
const ASSET_CACHE = 'jakh-assets-v77';
const MAX_NAVIGATION_CACHE_ENTRIES = 64;

const PRECACHE_ASSETS = [
  '/',
  '/mind-lab',
  '/play',
  '/collections',
  '/about',
  '/privacy',
  '/app.js',
  '/site-i18n.js',
  '/game-i18n.js',
  '/privacy-consent.js',
  '/privacy-page.js',
  '/styles.css',
  '/manifest.webmanifest',
  '/assets/logo.webp',
  '/assets/logo.png',
  '/assets/favicon.svg',
  '/favicon.ico',
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
    .some(directive => directive.trim().toLowerCase() === 'no-store');
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
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/u, '');
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

async function cacheResponse(cache, request, response, pathname) {
  if (!isCacheableResponse(response, pathname)) return false;
  try {
    await cache.put(request, response.clone());
    return true;
  } catch (_) {
    return false;
  }
}

async function trimCache(cache, maximumEntries) {
  try {
    const keys = await cache.keys();
    const staleKeys = keys.slice(0, Math.max(0, keys.length - maximumEntries));
    await Promise.all(staleKeys.map(key => cache.delete(key)));
  } catch (_) {}
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      self.skipWaiting(),
      caches.open(ASSET_CACHE).then((cache) =>
        Promise.allSettled(
          PRECACHE_ASSETS.map(async (path) => {
            const url = new URL(path, self.location.origin);
            const request = new Request(url.href, {
              cache: 'reload',
              credentials: 'same-origin',
            });
            const response = await fetch(request);
            await cacheResponse(cache, request, response, url.pathname);
          })
        )
      ),
    ])
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle cache-safe, same-origin GET requests.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Never cache API calls.
  if (url.pathname.startsWith('/api/')) return;

  // Network-first for HTML navigation, using one query-free canonical cache key.
  if (request.mode === 'navigate') {
    const cacheKey = navigationCacheRequest(request);
    if (!cacheKey) return;
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (await cacheResponse(cache, cacheKey, response, '/')) {
            await trimCache(cache, MAX_NAVIGATION_CACHE_ENTRIES);
          }
          return response;
        } catch (_) {
          return (await cache.match(cacheKey))
            || (await caches.match(cacheKey))
            || caches.match('/');
        }
      })
    );
    return;
  }

  // Stale-while-revalidate for JSON data files so catalog updates propagate
  if (url.pathname.match(/\.json$/u)) {
    const networkFetch = caches.open(ASSET_CACHE).then(async (cache) => {
      const response = await fetch(request);
      await cacheResponse(cache, request, response, url.pathname);
      return response;
    });
    event.waitUntil(networkFetch.catch(() => {}));
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        return cached || networkFetch;
      })
    );
    return;
  }

  // Network-first for JS/CSS so deploys are visible immediately, with cache
  // fallback for offline use.
  if (
    url.pathname.match(/\.(js|css)$/u)
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          await cacheResponse(cache, request, response, url.pathname);
          return response;
        } catch (_) {
          const cached = await cache.match(request, { ignoreSearch: true });
          if (cached) return cached;
          throw _;
        }
      })
    );
    return;
  }

  // Cache-first for static media assets.
  if (
    url.pathname.match(/\.(svg|png|jpe?g|webp|ico|woff2)$/u)
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        await cacheResponse(cache, request, response, url.pathname);
        return response;
      })
    );
    return;
  }
});


// Allow the page to trigger a full cache flush (e.g. after a forced update)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    );
  }
});
