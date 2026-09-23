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

function runNavigation({ pathname, bodyClasses = [], dataPage = '', search = '', hash = '', alternate = 'https://riddlearabia.com/ar/mind-lab/' }) {
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
