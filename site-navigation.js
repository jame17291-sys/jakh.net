/* Navigation needs no content, account, search, or game downloads. */
(() => {
  'use strict';
  const path = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  const query = new URLSearchParams(location.search);
  if (path === '/' || path === '/ar') {
    const prefix = path === '/ar' ? '/ar' : '';
    const battleCode = query.get('battle') || location.hash.match(/^#battle\/([A-Z0-9-]+)$/i)?.[1];
    if (battleCode) {
      location.replace(`${prefix}/mind-lab${prefix ? '/' : ''}?battle=${encodeURIComponent(battleCode)}`);
      return;
    }
    if (query.get('daily') === '1') {
      location.replace(`${prefix}/daily${prefix ? '/' : ''}`);
      return;
    }
  }
  const active = path === '/' || path === '/ar' ? 'home'
    : /^(?:\/ar\/topics)?\/kids-riddles(?:\/|$)/.test(path) ? 'kids'
    : /\/(?:daily)$/.test(path) ? 'daily'
    : document.body?.hasAttribute?.('data-puzzle-page') ? 'games'
    : /\/(?:play|brain-games|alab-al-dimagh|akshifha|chess|backgammon|mastermind|go|reversi|codenames|catan|set|hanabi|diplomacy)$/.test(path) ? 'games'
    : document.body.matches('[data-page="category"], .page-mind-lab, .riddlearabia-experience, .riddlearabia-collections') ? 'library'
    : '';
  document.querySelectorAll('.primary-navigation [data-nav]').forEach(link => {
    if (link.dataset.nav === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('.language-route-link').forEach(link => {
    // Preserve a selected case/card without rewriting the explicit opposite-language route.
    const refreshTarget = () => {
    const target = new URL(link.href);
    target.search = '';
    for (const [key, value] of new URLSearchParams(location.search)) {
      if (key === 'game' && document.body?.hasAttribute?.('data-puzzle-page')) continue;
      const kidsFilter = document.body?.classList?.contains('kids-page') && ['search', 'age', 'area', 'minutes', 'materialGroup', 'format', 'reading', 'adult', 'screenFree', 'noPrinter'].includes(key);
      if (kidsFilter || ['case', 'mode', 'day', 'card', 'profile', 'difficulty', 'subcategory', 'battle', 'join', 'game', 'variant', 'date', 'edition', 'duelRoom'].includes(key)) target.searchParams.set(key, value);
    }
    target.hash = location.hash;
    link.href = target.pathname + target.search + target.hash;
    };
    refreshTarget();
    link.addEventListener('click', refreshTarget);
  });
  if ('serviceWorker' in navigator && !document.querySelector('script[src*="/app."]')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', {scope: '/'}).catch(() => {});
    }, {once: true});
  }
})();
