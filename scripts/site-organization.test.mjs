import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { siteHeader, navigationScript } from './site-navigation-markup.mjs';
import { loadProductionQuarantine, publicCatalogProjection } from './publication-quarantine.mjs';
import { RIDDLE_ARABIA_SEO_PAGES } from './riddlearabia-seo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const catalog = publicCatalogProjection(JSON.parse(read('data/catalog.json')), loadProductionQuarantine(root));
const navigation = read('site-navigation.js');
const routeFile = (route) => route.endsWith('/') ? `${route.slice(1)}index.html` : `${route.slice(1)}.html`;
const editorialFiles = [
  'index.html', 'ar/index.html', 'play.html', 'ar/play/index.html',
  'collections.html', 'ar/collections/index.html', 'about.html', 'ar/about/index.html',
  ...RIDDLE_ARABIA_SEO_PAGES.flatMap((page) => [routeFile(page.paths.en), routeFile(page.paths.ar)]),
];

function primaryLinks(html) {
  const nav = html.match(/<nav\b[^>]*class="primary-navigation"[^>]*>([\s\S]*?)<\/nav>/u)?.[1];
  assert.ok(nav, 'missing primary navigation landmark');
  return [...nav.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/gu)].map(([, attributes, label]) => ({
    ...Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/gu)].map(([, name, value]) => [name, value])),
    label,
  }));
}

test('Arabic directory has localized status before the application hydrates', () => {
  assert.match(read('ar/mind-lab/index.html'), /id="directoryResultsLabel"[^>]*>51 موضوعًا في 5 أقسام\.<\/p>/u);
});

test('lazy-rendered cards reserve block height without an oversized intrinsic width', () => {
  const css = read('styles.css');
  assert.match(css, /contain-intrinsic-inline-size:\s*0/u);
  assert.match(css, /contain-intrinsic-block-size:\s*auto 420px/u);
  assert.doesNotMatch(css, /contain-intrinsic-size:\s*auto 420px/u);
});

test('one bilingual navigation contract names four real destinations and separate utilities', () => {
  for (const lang of ['en', 'ar']) {
    for (const active of ['home', 'library', 'games', 'daily']) {
      const header = siteHeader({ lang, alternate: lang === 'en' ? '/ar/mind-lab/' : '/mind-lab', active });
      const links = primaryLinks(header);
      assert.deepEqual(links.map((link) => link['data-nav']), ['home', 'library', 'games', 'daily']);
      assert.deepEqual(links.map((link) => link.href), lang === 'ar'
        ? ['/ar/', '/ar/mind-lab/', '/ar/play/', '/ar/daily/']
        : ['/', '/mind-lab', '/play', '/daily']);
      assert.deepEqual(links.filter((link) => link['aria-current']).map((link) => link['data-nav']), [active]);
      assert.equal(links[1].label, lang === 'ar' ? 'ألغاز واختبارات' : 'Riddles &amp; Quizzes');
      assert.match(header, /class="language-route-link"[^>]*hreflang="(?:en|ar)"[^>]*lang="(?:en|ar)"[^>]*dir="(?:ltr|rtl)"/u);
      assert.match(header, /<a id="openAuthBtn" data-site-profile href="[^"]+\?profile=1">/u);
      assert.doesNotMatch(header, /bottom-nav|hamburger|<button[^>]*aria-current/u);
    }
  }
  assert.match(navigationScript, /^<script defer src="\/site-navigation\.js"><\/script>$/u);
});

test('main journeys and every public topic have the same server-rendered navigation', () => {
  const files = [
    ...editorialFiles, 'mind-lab.html', 'ar/mind-lab/index.html', 'daily.html', 'ar/daily/index.html',
    ...catalog.categories.flatMap(({ slug }) => [`${slug}.html`, `ar/topics/${slug}/index.html`]),
  ];
  for (const file of new Set(files)) {
    const html = read(file);
    assert.equal((html.match(/class="primary-navigation"/gu) || []).length, 1, file);
    const links = primaryLinks(html);
    assert.equal(links.length, 4, file);
    assert.equal(links.filter((link) => link['aria-current'] === 'page').length, file.includes('about') ? 0 : 1, file);
    assert.match(html, /class="language-route-link"/u, file);
    assert.match(html, /<script[^>]*\bsrc="\/site-navigation\.js"/u, file);
    assert.doesNotMatch(html, /id="bottomNav"|class="hamburger"/u, file);
  }
});

test('static home, games hub, and editorial pages do not load the question application or data', () => {
  for (const file of new Set(editorialFiles)) {
    const html = read(file);
    const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gu)].map(([, source]) => source);
    assert.equal(scriptSources.some((source) => /(?:^|\/)(?:app|directory-ui|search-leaderboard|content-overrides|battle-mode)\.js(?:\?|$)/u.test(source)), false, file);
    assert.doesNotMatch(html, /<link\b[^>]*\brel="(?:preload|prefetch|modulepreload)"[^>]*\bhref="\/data\//u, file);
    assert.doesNotMatch(html, /fetch\([^)]*(?:\/data\/|\/api\/)/u, file);
    assert.doesNotMatch(html, /id="dailyChallengeMount"|id="authModal"/u, file);
  }
  assert.doesNotMatch(navigation, /\bfetch\s*\(|\bimport\s*\(|XMLHttpRequest|new\s+WebSocket/u);
});

function runNavigation({ pathname, bodyClasses = [], dataPage = '', puzzlePage = '', search = '', hash = '', alternate = 'https://riddlearabia.com/ar/mind-lab/' }) {
  const links = ['home', 'library', 'games', 'daily'].map((key) => ({
    dataset: { nav: key },
    attributes: { 'aria-current': 'page' },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  }));
  const language = {
    url: alternate,
    listeners: {},
    get href() { return this.url; },
    set href(value) { this.url = new URL(value, 'https://riddlearabia.com').href; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
  };
  const location = { pathname, search, hash, replace: (url) => { location.redirect = url; } };
  const document = {
    body: {
      hasAttribute: name => name === 'data-puzzle-page' && Boolean(puzzlePage),
      matches: (selectors) => selectors.split(',').some((selector) => {
        const value = selector.trim();
        if (value.startsWith('.')) return bodyClasses.includes(value.slice(1));
        return value === `[data-page="${dataPage}"]`;
      }),
    },
    querySelectorAll: (selector) => selector === '.language-route-link' ? [language] : links,
  };
  const context = vm.createContext({
    document, navigator: {}, URL, URLSearchParams,
    location,
    fetch() { assert.fail('navigation must not request content or account data'); },
  });
  vm.runInContext(navigation, context);
  return { active: links.filter((link) => link.attributes['aria-current']).map((link) => link.dataset.nav), language, location };
}

test('client navigation keeps the right parent selected throughout both language journeys', () => {
  const cases = [
    ['/', [], '', 'home'], ['/ar/', [], '', 'home'],
    ['/mind-lab', ['page-mind-lab'], 'home', 'library'],
    ['/ar/mind-lab/', ['page-mind-lab'], 'home', 'library'],
    ['/collections', ['riddlearabia-collections'], '', 'library'],
    ['/ar/collections/', ['riddlearabia-collections'], '', 'library'],
    ['/riddles', ['riddlearabia-experience'], '', 'library'],
    ['/classic-riddles', [], 'category', 'library'],
    ['/ar/topics/classic-riddles/', [], 'category', 'library'],
    ['/play', [], '', 'games'], ['/ar/play/', [], '', 'games'],
    ['/brain-games', ['riddlearabia-experience'], '', 'games'],
    ['/akshifha', [], '', 'games'], ['/ar/games/chess/', [], '', 'games'],
    ['/daily', [], '', 'daily'], ['/ar/daily/', [], '', 'daily'],
    ['/about', ['standards-page'], '', null],
  ];
  for (const [pathname, bodyClasses, dataPage, expected] of cases) {
    assert.deepEqual(runNavigation({ pathname, bodyClasses, dataPage }).active, expected ? [expected] : [], pathname);
  }
});

test('language links preserve the selected activity without copying unrelated query parameters', () => {
  const { language, location } = runNavigation({
    pathname: '/akshifha',
    search: '?case=the-first-van&mode=practice&card=1&profile=1&difficulty=easy&subcategory=logic&utm_source=campaign&redirect=https%3A%2F%2Fother.test',
    hash: '#questions',
    alternate: 'https://riddlearabia.com/ar/games/akshifha/',
  });
  const target = new URL(language.href, 'https://riddlearabia.com');
  assert.equal(target.pathname, '/ar/games/akshifha/');
  assert.equal(target.hash, '#questions');
  for (const [key, value] of Object.entries({ case: 'the-first-van', mode: 'practice', card: '1', profile: '1', difficulty: 'easy', subcategory: 'logic' })) assert.equal(target.searchParams.get(key), value);
  assert.equal(target.searchParams.has('utm_source'), false);
  assert.equal(target.searchParams.has('redirect'), false);
  location.search = '?case=another-case&mode=daily';
  language.listeners.click();
  const refreshed = new URL(language.href);
  assert.equal(refreshed.searchParams.get('case'), 'another-case');
  assert.equal(refreshed.searchParams.get('mode'), 'daily');
  assert.equal(refreshed.searchParams.has('card'), false, 'the language link must not retain a previously selected card');
});

test('clean puzzle language links keep date and difficulty without copying conflicting identity or private seat data', () => {
  const { active, language, location } = runNavigation({
    pathname:'/sudoku', puzzlePage:'sudoku', alternate:'https://riddlearabia.com/ar/games/sudoku/',
    search:'?game=word&date=2026-09-30&edition=2&difficulty=hard&token=PRIVATE&answer=SPOILER',
  });
  assert.deepEqual(active,['games']);
  const target=new URL(language.href);
  assert.equal(target.pathname,'/ar/games/sudoku/');
  assert.deepEqual(Object.fromEntries(target.searchParams),{date:'2026-09-30',edition:'2',difficulty:'hard'});
  location.search='?date=2026-09-29&edition=2&difficulty=easy';language.listeners.click();
  assert.equal(new URL(language.href).searchParams.get('date'),'2026-09-29');
  assert.equal(new URL(language.href).searchParams.get('difficulty'),'easy');
});

test('legacy home invitation and daily URLs reach the new dedicated destinations', () => {
  for (const [pathname, search, hash, destination] of [
    ['/', '?battle=SCI7X2KQ', '', '/mind-lab?battle=SCI7X2KQ'],
    ['/ar/', '', '#battle/SCI7X2KQ', '/ar/mind-lab/?battle=SCI7X2KQ'],
    ['/', '?daily=1', '', '/daily'],
    ['/ar/', '?daily=1', '', '/ar/daily/'],
  ]) assert.equal(runNavigation({ pathname, search, hash }).location.redirect, destination);
});

test('privacy choices links retain the current page language without changing consent', () => {
  const privacy = read('privacy-consent.js');
  const helper = privacy.match(/function privacyChoicesHref\(\) \{[\s\S]*?\n  \}/u)?.[0];
  assert.ok(helper);
  for (const [lang, expected] of [['en', '/privacy#choices'], ['ar', '/ar/privacy/#choices']]) {
    const context = vm.createContext({ document: { documentElement: { lang } } });
    vm.runInContext(`${helper}\nthis.href = privacyChoicesHref();`, context);
    assert.equal(context.href, expected);
  }
  assert.match(privacy, /href="\$\{privacyChoicesHref\(\)\}">\$\{copy\.choices\}/u);
  assert.match(privacy, /showChoices: \(\) => \{\s*location\.assign\(privacyChoicesHref\(\)\);/u);
  assert.doesNotMatch(helper, /setAnalyticsConsent|setItem|applyPreference/u);
});

test('Privacy Centre initializes without the retired language select and preserves its opposite-language link', () => {
  const privacy = read('privacy-page.js');
  const extract = (name) => {
    const start = privacy.indexOf(`  function ${name}(`);
    const end = privacy.indexOf('\n  }', start);
    assert.ok(start >= 0 && end > start, name);
    return privacy.slice(start, end + 4);
  };
  assert.doesNotMatch(privacy, /elements\.language|privacyLanguage/u);
  const bound = [];
  const elementNames = ['allowDeviceAnalytics', 'denyDeviceAnalytics', 'clearDeviceData', 'allowAccountAnalytics', 'denyAccountAnalytics', 'exportAccount', 'deleteAccountForm', 'privacyRequestForm'];
  const languageLink = {
    href: '/privacy#choices',
    matches: (selector) => selector === '.language-route-link',
    getAttribute() { return this.href; },
    setAttribute(_name, value) { this.href = value; },
  };
  const topicLink = { ...languageLink, href: '/mind-lab', matches: () => false };
  const context = vm.createContext({
    state: { lang: 'ar' },
    PRIVACY_ROUTES: { en: '/privacy', ar: '/ar/privacy/' },
    LANGUAGE_KEY: 'jakh-privacy-language', URL,
    elements: Object.fromEntries(elementNames.map((name) => [name, { addEventListener: (event) => bound.push(`${name}:${event}`) }])),
    document: {
      documentElement: { lang: 'ar', dir: 'rtl' },
      querySelectorAll: () => [languageLink, topicLink],
      addEventListener: () => {}, dispatchEvent: () => {},
    },
    location: { origin: 'https://riddlearabia.com', href: 'https://riddlearabia.com/ar/privacy/#choices', pathname: '/ar/privacy/' },
    localStorage: { setItem() {}, getItem() { return 'en'; } },
    navigator: { language: 'en' },
    CustomEvent: class {},
    updateMetadata() {}, updateDeviceStatus() {}, updateAccountPresentation() {},
    setDeviceAnalytics() {}, clearDeviceData() {}, updateAccountAnalytics() {}, exportAccountData() {},
    deleteAccount() {}, submitPrivacyRequest() {}, handleConsentChange() {},
  });
  vm.runInContext([
    ...['normalizePrivacyPath', 'privacyRouteLanguage', 'localizePrivacyLinks', 'setLanguage', 'bindEvents', 'initialLanguage'].map(extract),
    'this.lang = initialLanguage(); bindEvents(); setLanguage(this.lang, false);',
  ].join('\n'), context);
  assert.equal(context.lang, 'ar', 'the explicit Arabic route wins over a saved English preference');
  assert.equal(context.document.documentElement.dir, 'rtl');
  assert.equal(languageLink.href, '/privacy#choices');
  assert.equal(topicLink.href, '/ar/mind-lab/');
  assert.equal(bound.length, elementNames.length, 'every consent/account control is still bound');
});

test('topic pages prioritize practice and collapse optional filters without duplicate hero artwork', () => {
  for (const { slug } of catalog.categories) {
    for (const file of [`${slug}.html`, `ar/topics/${slug}/index.html`]) {
      const html = read(file);
      assert.doesNotMatch(html, /id="categoryImage"|id="categoryBanner"/u, file);
      if (slug === 'tv-shows-trivia') {
        assert.match(html, /data-tv="mixed"/u, `${file}: immediate quiz entry`);
        assert.equal((html.match(/data-tv="play-show"/gu) || []).length, 10, `${file}: all shows visible`);
        assert.ok(html.indexOf('data-tv="mixed"') < html.indexOf('data-tv="practice"'), `${file}: solo precedes practice`);
        assert.doesNotMatch(html, /class="question-filters"/u, `${file}: detailed filters belong in practice`);
        continue;
      }
      const filters = html.match(/<details\b([^>]*)class="question-filters"([^>]*)>([\s\S]*?)<\/details>/u);
      assert.ok(filters, `${file}: missing collapsible filters`);
      assert.doesNotMatch(`${filters[1]} ${filters[2]}`, /\bopen\b/u, file);
      assert.match(filters[3], /<summary[^>]*>[^<]+<\/summary>/u, file);
      const start = html.indexOf('href="#cardGrid"');
      assert.ok(start >= 0 && start < html.indexOf('class="question-filters"'), file);
      assert.match(html, /id="cardGrid"[^>]*tabindex="-1"/u, file);
    }
  }
});

function deviceClearHarness({ lang = 'en', registrations = [], accepted = true, failure = '', serviceWorker = true } = {}) {
  const calls = [], timers = new Map();
  const location = { hostname: 'riddlearabia.com', protocol: 'https:', origin: 'https://riddlearabia.com', replace(url) { calls.push(['replace', url]); } };
  const context = vm.createContext({
    location, URL, console,
    document: { readyState: 'loading', addEventListener() {} },
    navigator: serviceWorker ? { serviceWorker: { async getRegistrations() { calls.push(['registrations']); if (failure === 'registrations') throw new Error('Unavailable'); return registrations; } } } : {},
    window: { confirm() { calls.push(['confirm']); return accepted; }, JakhPrivacy: { setAnalyticsConsent(...args) { calls.push(['analytics', ...args]); } }, caches: {} },
    localStorage: { clear() { calls.push(['local']); if (failure === 'local') throw new Error('Storage unavailable'); } },
    sessionStorage: { clear() { calls.push(['session']); if (failure === 'session') throw new Error('Storage unavailable'); } },
    caches: { async keys() { calls.push(['cache-keys']); if (failure === 'caches') throw new Error('Caches unavailable'); return ['jakh-core', 'jakh-assets']; }, async delete(name) { calls.push(['cache-delete', name]); return true; } },
    setTimeout(callback) { const id = timers.size + 1; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
  });
  const source = read('privacy-page.js').replace(/\}\)\(\);\s*$/u, 'globalThis.privacyTest = { clearDeviceData, state, elements, copy };\n})();');
  vm.runInContext(source, context);
  const api = context.privacyTest; api.state.lang = lang;
  api.elements.clearDeviceData = { disabled: false };
  api.elements.deviceClearStatus = { textContent: '', dataset: {} };
  return { api, calls, timers, run: () => api.clearDeviceData() };
}

test('device-wide clear revokes every browser push subscription before erasing saved seats and redirects in the current language', async () => {
  for (const lang of ['en', 'ar']) {
    const order = [];
    const registrations = [1, 2].map(id => {
      let subscription = { async unsubscribe() { order.push(`unsubscribe-${id}`); subscription = null; return id === 1; } };
      return { pushManager: { async getSubscription() { order.push(`read-${id}`); return subscription; } } };
    });
    registrations.push({});
    const h = deviceClearHarness({ lang, registrations });
    await h.run();
    assert.equal(order.filter(value => value.startsWith('unsubscribe')).length, 2);
    assert.equal(order.filter(value => value.startsWith('read')).length, 4, 'revocation is verified even when unsubscribe returns false');
    assert.deepEqual(h.calls.filter(([name]) => name === 'analytics'), [['analytics', false, 'clear-device']]);
    assert.deepEqual(h.calls.filter(([name]) => name === 'local' || name === 'session'), [['local'], ['session']]);
    assert.deepEqual(h.calls.at(-1), ['replace', `https://riddlearabia.com${lang === 'ar' ? '/ar/privacy/' : '/privacy'}#choices`]);
    assert.equal(h.api.elements.clearDeviceData.disabled, false); assert.equal(h.timers.size, 0);
  }
});

test('saved seats stay intact while push revocation is pending and double clicks cannot start a second clear', async () => {
  let finish;
  let subscription = { unsubscribe() { return new Promise(resolve => { finish = () => { subscription = null; resolve(true); }; }); } };
  const h = deviceClearHarness({ registrations: [{ pushManager: { async getSubscription() { return subscription; } } }] });
  const pending = h.run(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.api.elements.clearDeviceData.disabled, true);
  assert.equal(h.calls.some(([name]) => ['local', 'session', 'analytics', 'replace'].includes(name)), false);
  await h.run(); assert.equal(h.calls.filter(([name]) => name === 'confirm').length, 1);
  finish(); await pending; assert.equal(h.calls.some(([name]) => name === 'local'), true);
});

test('failed or unverifiable push revocation preserves device data and gives an actionable bilingual error without reloading', async () => {
  for (const lang of ['en', 'ar']) {
    for (const failure of ['registrations', 'unsubscribe', 'still-active', 'timeout']) {
      const subscription = { async unsubscribe() { if (failure === 'unsubscribe') throw new Error('Offline'); return false; } };
      const h = deviceClearHarness({ lang, failure, registrations: [{ pushManager: { async getSubscription() { if (failure === 'timeout') return new Promise(() => {}); return subscription; } } }] });
      const pending = h.run();
      if (failure === 'timeout') { await new Promise(resolve => setImmediate(resolve)); [...h.timers.values()][0](); }
      await pending;
      assert.equal(h.calls.some(([name]) => ['local', 'session', 'analytics', 'replace'].includes(name)), false, failure);
      assert.equal(h.api.elements.deviceClearStatus.textContent, h.api.copy[lang].devicePushClearFailed);
      assert.equal(h.api.elements.deviceClearStatus.dataset.tone, 'error');
      assert.equal(h.api.elements.clearDeviceData.disabled, false); assert.equal(h.timers.size, 0);
    }
  }
});

test('device clear handles browsers without push, respects cancellation and reports partial storage cleanup truthfully', async () => {
  const cancelled = deviceClearHarness({ accepted: false }); await cancelled.run(); assert.deepEqual(cancelled.calls, [['confirm']]);
  const noPush = deviceClearHarness({ serviceWorker: false }); await noPush.run(); assert.equal(noPush.calls.at(-1)[0], 'replace');
  const noSubscription = deviceClearHarness({ registrations: [{ pushManager: { async getSubscription() { return null; } } }] }); await noSubscription.run(); assert.equal(noSubscription.calls.at(-1)[0], 'replace');
  for (const failure of ['local', 'session', 'caches']) {
    const h = deviceClearHarness({ failure }); await h.run();
    assert.equal(h.calls.some(([name]) => name === 'replace'), false);
    assert.equal(h.api.elements.deviceClearStatus.textContent, h.api.copy.en.deviceClearIncomplete);
    assert.equal(h.api.elements.deviceClearStatus.dataset.tone, 'error'); assert.equal(h.api.elements.clearDeviceData.disabled, false);
  }
});

test('the privacy notice explains optional reminder retention and browser-only game records in both languages', () => {
  for (const file of ['privacy.html', 'ar/privacy/index.html']) {
    const html = read(file);
    assert.match(html, /Optional Word Duel reminders/u); assert.match(html, /تذكيرات مبارزة الكلمات الاختيارية/u);
    assert.match(html, /Notifications travel encrypted through your browser’s push service/u);
    assert.match(html, /تمر الإشعارات مشفّرة/u);
    assert.match(html, /are not account records, and do not sync between devices/u);
    assert.match(html, /ليست سجلات حساب ولا تتزامن بين الأجهزة/u);
  }
});
