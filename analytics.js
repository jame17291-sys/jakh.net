(function () {
  const GA_ID = 'G-VQZQNK6VSV';
  const VISITOR_KEY = 'jakh-visitor-id';
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  function makeId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    return String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  }

  function getVisitorId() {
    try {
      let id = localStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = makeId();
        localStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch (_) {
      return null;
    }
  }

  function getPageSlug() {
    const body = document.body;
    if (body?.dataset?.category) return body.dataset.category;
    if (body?.dataset?.page === 'home') return 'home';
    const file = location.pathname.split('/').pop() || 'home';
    const slug = file.replace(/\.html$/i, '') || 'home';
    if (slug === 'index') return 'home';
    if (slug === 'game') {
      const game = new URLSearchParams(location.search).get('game');
      return game ? 'game-' + game.slice(0, 80) : 'game';
    }
    if (slug === 'topic') {
      const topic = new URLSearchParams(location.search).get('topic');
      return topic ? 'topic-' + topic.slice(0, 80) : 'topic';
    }
    return slug.slice(0, 120);
  }

  function recordSiteVisit() {
    const pageSlug = getPageSlug();
    const key = 'jakh-visit:' + location.pathname + location.search;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch (_) {}

    const payload = JSON.stringify({
      pageSlug,
      timeSpent: 5,
      visitorId: getVisitorId()
    });

    try {
      if (navigator.sendBeacon) {
        const body = new Blob([payload], { type: 'application/json' });
        if (navigator.sendBeacon('/api/analytics/time', body)) return;
      }
    } catch (_) {}

    fetch('/api/analytics/time', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(() => {});
  }

  function loadAnalytics() {
    if (document.querySelector('script[data-jakh-analytics]')) return;
    const script = document.createElement('script');
    script.async = true;
    script.dataset.jakhAnalytics = 'true';
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { transport_type: 'beacon' });
  }

  function schedule() {
    window.setTimeout(recordSiteVisit, 600);
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(loadAnalytics, { timeout: 4500 });
      return;
    }
    window.setTimeout(loadAnalytics, 2500);
  }

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
})();
