const CACHE_NAME = 'jakh-v4';
const ASSET_CACHE = 'jakh-assets-v4';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.webmanifest',
  '/assets/logo.svg',
  '/assets/favicon.svg',
  '/assets/og-image.webp',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(ASSET_CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS))
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

  // Cache-first for JS, CSS, SVG, images, JSON data files
  if (
    url.pathname.match(/\.(js|css|svg|png|jpg|webp|woff2|json)$/) &&
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
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
