import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

function functionSource(name) {
  const start = app.indexOf(`async function ${name}(`) >= 0
    ? app.indexOf(`async function ${name}(`)
    : app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = app.indexOf('\n}', start);
  assert.ok(end > start, `unterminated ${name}`);
  return app.slice(start, end + 2);
}

function load(context, names) {
  vm.runInContext(names.map(functionSource).join('\n'), context);
  return context;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

test('authorized admin entry joins the shared utilities and is removed when access changes', () => {
  const links = new Map();
  const profile = {};
  const utilities = {
    insertBefore(link, reference) {
      assert.equal(reference, profile);
      links.set(link.id, link);
    },
  };
  const context = load(vm.createContext({
    state: { lang: 'en', dbUser: null },
    els: { openAuthBtn: profile },
    t: key => key,
    document: {
      querySelector: selector => selector === '.site-utilities' ? utilities : null,
      getElementById: id => links.get(id),
      createElement: () => ({ setAttribute() {}, remove() { links.delete(this.id); } }),
    },
  }), ['syncAdminEntry']);
  context.syncAdminEntry();
  assert.equal(links.size, 0);
  for (const role of ['ADMIN', 'OWNER']) {
    context.state.dbUser = { role };
    context.syncAdminEntry();
    assert.equal(links.size, 1);
    assert.equal(links.get('adminNavBtn').href, '/admin');
  }
  context.state.lang = 'ar';
  context.syncAdminEntry();
  assert.equal(links.get('adminNavBtn').href, '/admin?lang=ar');
  context.state.dbUser = { role: 'USER' };
  context.syncAdminEntry();
  assert.equal(links.size, 0);
});

test('runtime titles and descriptions preserve static SEO metadata in both languages', () => {
  for (const [page, route, english, arabic] of [
    ['home', '/', 'index.html', 'ar/index.html'],
    ['home', '/mind-lab', 'mind-lab.html', 'ar/mind-lab/index.html'],
    ['play', '/play', 'play.html', 'ar/play/index.html'],
  ]) {
    for (const lang of ['en', 'ar']) {
      const source = readFileSync(new URL(`../${lang === 'ar' ? arabic : english}`, import.meta.url), 'utf8');
      const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&#39;', "'");
      const title = decode(source.match(/<title>(.*?)<\/title>/u)[1]);
      const description = decode(source.match(/<meta name="description" content="([^"]+)"/u)[1]);
      const metadata = new Map();
      const context = load(vm.createContext({
        state: { page, lang },
        sharedLanguageRoute: () => ({ en: route }),
        document: { querySelector: selector => ({ setAttribute: (_name, value) => metadata.set(selector, value) }) },
      }), ['updateDocumentTitle']);
      context.updateDocumentTitle();
      assert.equal(context.document.title, title, `${route} ${lang}: title survives hydration`);
      for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) assert.equal(metadata.get(selector), title);
      for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) assert.equal(metadata.get(selector), description);
    }
  }
});

function accountHarness({ lang = 'ar', healthFails = false } = {}) {
  const session = deferred();
  const started = deferred();
  const calls = [];
  const attributes = new Map();
  const modal = { hidden: true, classList: { contains: () => modal.hidden } };
  const body = {
    innerHTML: '',
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key),
  };
  let lookups = 0;
  const context = vm.createContext({
    state: { lang, dbUser: null, apiAvailable: false, apiChecked: false },
    els: {},
    sessionInitialized: false,
    cloudCapabilitiesPromise: null,
    t: key => key === 'authSessionLoading' ? (lang === 'ar' ? 'جارٍ التحقق من حسابك…' : 'Checking your account…') : key,
    escapeHtml: value => value,
    loadAuthEnhancements: async () => ({ ensureAuthModalShell: () => {
      calls.push('shell'); context.els.authModal = modal; context.els.authModalBody = body;
    } }),
    cacheEls: () => calls.push('cache'),
    applyStaticCopy: () => { assert.ok(context.els.authModal); calls.push('localize'); },
    openModal: () => { assert.ok(calls.includes('localize')); modal.hidden = false; calls.push('open'); },
    renderAuthModal: () => calls.push(context.state.dbUser ? 'account' : 'signin'),
    detectApiAvailability: async () => {
      calls.push('health');
      if (healthFails) throw new Error('Offline');
      return true;
    },
    checkCloudSession: async () => {
      lookups += 1;
      if (lookups === 1) { started.resolve(); await session.promise; }
      context.state.dbUser = { id: 'existing-user', username: 'Reader' };
    },
    flushCloudQueue: async () => calls.push('flush'),
    mergeGuestProgress: async () => calls.push('merge'),
    loadStreak: async () => calls.push('streak'),
    hydrateCloudFeatureUi: () => calls.push('hydrate-ui'),
  });
  load(context, ['openAuthModal', 'hydrateCloudCapabilities']);
  return { context, calls, modal, body, attributes, session, started };
}

test('Profile waits on the shared pending session, localizes its lazy shell, and shows the existing account', async () => {
  for (const lang of ['en', 'ar']) {
    const { context, calls, body, attributes, session, started } = accountHarness({ lang });
    const hydration = context.hydrateCloudCapabilities();
    await started.promise;
    const opening = context.openAuthModal({ preventDefault: () => calls.push('prevent-default') });
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(calls.indexOf('shell') < calls.indexOf('localize'));
    assert.equal(calls.filter(call => call === 'health').length, 1, 'concurrent profile and startup share one lookup');
    assert.equal(calls.includes('signin'), false, 'do not claim a signed-in visitor needs to log in while the session is pending');
    assert.match(body.innerHTML, lang === 'ar' ? /جارٍ التحقق/u : /Checking your account/u);
    assert.equal(attributes.get('aria-busy'), 'true');
    session.resolve();
    await Promise.all([opening, hydration]);
    assert.equal(calls.includes('signin'), false);
    assert.equal(calls.filter(call => call === 'account').length, 1);
    assert.equal(attributes.has('aria-busy'), false);
    assert.equal(context.state.apiChecked, true);
  }
});

test('a slow Profile lookup never reopens a dismissed dialog and failures still allow sign-in', async () => {
  const pending = accountHarness();
  const opening = pending.context.openAuthModal();
  await pending.started.promise;
  pending.modal.hidden = true;
  pending.session.resolve();
  await opening;
  assert.equal(pending.modal.hidden, true);
  assert.equal(pending.calls.filter(call => call === 'open').length, 1);
  assert.equal(pending.calls.includes('account'), false);
  const offline = accountHarness({ healthFails: true });
  await offline.context.openAuthModal();
  assert.equal(offline.calls.includes('signin'), true);
  assert.equal(offline.context.state.apiAvailable, false);
  assert.equal(offline.context.state.apiChecked, true);
});

test('local category modes and mode deep links initialize without waiting for cloud health', async () => {
  for (const mode of ['quick-fire', 'battle']) {
    const calls = [];
    const cloud = deferred();
    const context = vm.createContext({
      state: { page: 'category', categorySlug: 'classic-riddles' },
      location: { pathname: '/classic-riddles', search: `?mode=${mode}` },
      URLSearchParams,
      document: { getElementById: () => null },
      initializeFromStorage: () => true,
      requestPathIsQuarantined: () => false,
      categoryIsQuarantined: () => false,
      cacheEls() {}, applyDocumentLanguage() {}, bindCommonEvents() {},
      applyCapabilityVisibility() {}, createTimedQuizModal() {},
      loadCatalog: async () => calls.push('catalog'),
      loadCategoryIfNeeded: async () => calls.push('cards'),
      loadCardIndex: async () => calls.push('index'),
      applyStaticCopy() {}, rerender() {}, injectBackToTop() {}, checkNewAchievements() {},
      renderCategoryPlayModes: () => calls.push('local-modes'),
      hydrateCloudCapabilities: () => { calls.push('cloud'); return cloud.promise; },
      startTimedQuiz: () => calls.push('quick-fire'),
      openBattleModal: (slug, tab) => calls.push(`${slug}:${tab}`),
    });
    load(context, ['init']);
    await context.init();
    assert.ok(calls.indexOf('local-modes') > calls.indexOf('cards'));
    assert.ok(calls.indexOf('local-modes') < calls.indexOf('cloud'));
    assert.ok(calls.includes(mode === 'quick-fire' ? 'quick-fire' : 'classic-riddles:create'));
    assert.doesNotMatch(functionSource('init'), /await\s+hydrateCloudCapabilities/u);
    cloud.resolve();
  }
});
