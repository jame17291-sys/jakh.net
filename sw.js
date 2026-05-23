const CACHE_NAME = 'jakh-v119';
const ASSET_CACHE = 'jakh-assets-v119';

// Only precache stable, unversioned assets. Versioned JS/CSS are fetched
// network-first so updated game/runtime code does not sit behind an old cache.
const PRECACHE_ASSETS = [
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
      fetch(request, { cache: 'no-store' }).catch(async () => {
        const cached = await caches.match('/index.html');
        return cached || new Response(
          '<!doctype html><title>Offline</title><main style="font-family:system-ui;padding:2rem">You are offline. Reconnect and refresh jakh.net.</main>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
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

  // CSS/JS must be network-first. Serving an old visual bundle first is what
  // causes the page to paint one background and then correct itself.
  if (
    url.pathname.match(/\.(js|css)$/) &&
    url.origin === self.location.origin
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        try {
          const response = await fetch(request, { cache: 'no-store' });
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch (_) {
          const cached = await cache.match(request);
          if (cached) return cached;
          throw _;
        }
      })
    );
    return;
  }

  // Stale-while-revalidate for static media so visual refreshes propagate
  // while repeat visits stay fast.
  if (
    url.pathname.match(/\.(svg|png|jpg|webp|woff2)$/) &&
    url.origin === self.location.origin
  ) {
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
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'JAKH';
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
  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    );
  }
});
