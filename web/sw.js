const CACHE_NAME = 'jakh-v42';
const ASSET_CACHE = 'jakh-assets-v42';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.webmanifest',
  '/assets/logo.webp',
  '/assets/logo.png',
  '/assets/favicon.svg',
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
      fetch(request).catch(() => caches.match('/index.html'))
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

  // Cache-first for JS, CSS, SVG, images, fonts
  if (
    url.pathname.match(/\.(js|css|svg|png|jpg|webp|woff2)$/) &&
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

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'JAKH Riddles';
  const body = data.body || "Today's daily challenge is ready!";
  const icon = '/assets/icon-192.png';
  const badge = '/assets/icon-192.png';
  event.waitUntil(
    self.registration.showNotification(title, { body, icon, badge, data: { url: data.url || '/' } })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const match = list.find(c => c.url === self.location.origin + targetUrl);
      if (match) return match.focus();
      const any = list.find(c => 'focus' in c);
      if (any) { any.focus(); return any.navigate(targetUrl); }
      return clients.openWindow(targetUrl);
    })
  );
});

// Allow the page to trigger a full cache flush (e.g. after a forced update)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
