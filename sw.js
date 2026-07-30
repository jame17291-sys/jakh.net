const CACHE_NAME = 'jakh-v57';
const ASSET_CACHE = 'jakh-assets-v57';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/mind-lab.html',
  '/play.html',
  '/app.js',
  '/styles.css',
  '/manifest.webmanifest',
  '/assets/logo.webp',
  '/assets/logo.png',
  '/assets/favicon.svg',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(ASSET_CACHE).then((cache) =>
      Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          cache.add(url).catch(() => {})
        )
      )
    )
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

  // Never cache API calls
  if (url.pathname.startsWith('/api/')) return;

  // Network-first for HTML navigation
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch (_) {
          return (await caches.match(request, { ignoreSearch: true })) || caches.match('/index.html');
        }
      })
    );
    return;
  }

  // Stale-while-revalidate for JSON data files so catalog updates propagate
  if (url.origin === self.location.origin && url.pathname.match(/\.json$/)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        }).catch(() => null);
        return cached || networkFetch;
      })
    );
    return;
  }

  // Network-first for JS/CSS so deploys are visible immediately, with cache
  // fallback for offline use.
  if (
    url.pathname.match(/\.(js|css)$/) &&
    url.origin === self.location.origin
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
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
    url.pathname.match(/\.(svg|png|jpg|webp|ico|woff2)$/) &&
    url.origin === self.location.origin
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }
});


// Allow the page to trigger a full cache flush (e.g. after a forced update)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
