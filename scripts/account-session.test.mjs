import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const privacySource = read('privacy-page.js').replace(/\}\)\(\);\s*$/u,
  'globalThis.harness = { state, elements, apiRequest, loadAccount, expireAccount, exportAccountData, deleteAccount, bindEvents, updateAccountPresentation };\n})();');

function privacyHarness(fetch, lang = 'en') {
  const events = new Map();
  const context = vm.createContext({
    location: { hostname: 'riddlearabia.com', origin: 'https://riddlearabia.com' },
    document: { readyState: 'loading', addEventListener: (name, fn) => events.set(name, fn), visibilityState: 'visible' },
    window: { addEventListener: (name, fn) => events.set(name, fn) },
    Headers, URL, fetch,
  });
  vm.runInContext(privacySource, context);
  const h = context.harness;
  h.state.lang = lang; h.state.user = { username: 'audit' }; h.state.accountMode = 'signed-in';
  for (const name of ['accountStatusTitle', 'accountStatusText', 'accountControls', 'accountHomeLink',
    'privacyRequestSaveWithAccount', 'privacyRequestLinkStatus', 'accountAnalyticsStatus',
    'deleteAccountForm', 'exportStatus', 'deleteStatus', 'exportAccount', 'allowAccountAnalytics',
    'denyAccountAnalytics', 'allowDeviceAnalytics', 'denyDeviceAnalytics', 'clearDeviceData', 'privacyRequestForm']) {
    h.elements[name] = { textContent: '', dataset: {}, disabled: false, checked: true, reset() { this.resets = (this.resets || 0) + 1; }, addEventListener() {} };
  }
  return { ...h, events };
}
const response = (status, payload) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

test('an expired export clears identity, disables account controls, and offers a localized return-to-privacy sign-in', async () => {
  for (const lang of ['en', 'ar']) {
    const h = privacyHarness(async () => response(401, { code: 'UNAUTHORIZED' }), lang);
    await h.exportAccountData();
    assert.equal(h.state.user, null);
    assert.equal(h.state.accountMode, 'signed-out');
    assert.equal(h.elements.accountControls.disabled, true);
    assert.equal(h.elements.accountHomeLink.hidden, false);
    assert.equal(h.elements.privacyRequestSaveWithAccount.checked, false);
    assert.equal(h.elements.deleteAccountForm.resets, 1);
    assert.ok(h.elements.exportStatus.textContent.includes(lang === 'ar' ? 'سجّل' : 'Sign in'));
    const link = new URL(h.elements.accountHomeLink.href, 'https://riddlearabia.com');
    assert.equal(link.pathname, lang === 'ar' ? '/ar/mind-lab/' : '/mind-lab');
    assert.equal(link.searchParams.get('profile'), '1');
    assert.equal(link.searchParams.get('next'), lang === 'ar' ? '/ar/privacy/#account' : '/privacy#account');
  }
});

test('a wrong deletion confirmation password preserves a valid signed-in session', async () => {
  const h = privacyHarness(async () => response(401, { code: 'CURRENT_PASSWORD_INCORRECT' }));
  await assert.rejects(h.apiRequest('/user/account'), error => error.code === 'CURRENT_PASSWORD_INCORRECT');
  assert.equal(h.state.user.username, 'audit');
  assert.equal(h.state.accountMode, 'signed-in');
});

test('an older in-flight profile response cannot restore identity after cross-tab logout', async () => {
  let finish;
  const h = privacyHarness(() => new Promise(resolve => { finish = resolve; }));
  const loading = h.loadAccount();
  assert.equal(h.loadAccount(), loading, 'focus and visibility checks share one request');
  h.bindEvents();
  h.events.get('storage')({ key: 'jakh-auth-change', newValue: 'signed-out:123' });
  finish(response(200, { username: 'stale-owner' }));
  await loading;
  assert.equal(h.state.user, null);
  assert.equal(h.state.accountMode, 'signed-out');
  assert.equal(h.elements.accountControls.disabled, true);
});

test('regaining focus refreshes the session, and unrelated storage events do not', async () => {
  let requests = 0;
  const h = privacyHarness(async () => { requests++; return response(401, { code: 'UNAUTHORIZED' }); });
  h.bindEvents();
  h.events.get('storage')({ key: 'unrelated' });
  assert.equal(requests, 0);
  h.events.get('focus')();
  await h.loadAccount();
  assert.equal(requests, 1);
  assert.equal(h.state.accountMode, 'signed-out');
});

function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const end = source.indexOf('\n}', start);
  return source.slice(start, end + 2);
}

test('post-login destinations allow only supported local admin and privacy routes', () => {
  for (const [next, expected] of [
    ['/admin?lang=ar', '/admin?lang=ar'], ['/privacy#account', '/privacy#account'],
    ['/ar/privacy/#account', '/ar/privacy/#account'], ['https://attacker.invalid/admin', ''],
    ['//attacker.invalid/admin', ''], ['/admin/../other', ''], ['/mind-lab', ''],
  ]) {
    const context = vm.createContext({ URL, location: { origin: 'https://riddlearabia.com', href: `https://riddlearabia.com/mind-lab?profile=1&next=${encodeURIComponent(next)}` } });
    vm.runInContext(`${extract(read('app.js'), 'postAuthDestination')}\nthis.result=postAuthDestination();`, context);
    assert.equal(context.result, expected);
  }
});

test('the admin gate opens the real profile form and preserves the console language', () => {
  const source = read('admin.js');
  const start = source.indexOf('  function signInHref()');
  const end = source.indexOf('\n  }', start);
  for (const lang of ['en', 'ar']) {
    const context = vm.createContext({ URL, state: { lang }, location: { origin: 'https://riddlearabia.com' } });
    vm.runInContext(`${source.slice(start, end + 4)}\nthis.result=signInHref();`, context);
    const link = new URL(context.result, 'https://riddlearabia.com');
    assert.equal(link.pathname, lang === 'ar' ? '/ar/mind-lab/' : '/mind-lab');
    assert.equal(link.searchParams.get('profile'), '1');
    assert.equal(link.searchParams.get('next'), `/admin${lang === 'ar' ? '?lang=ar' : ''}`);
  }
});

function adminFunction(name) {
  const source = read('admin.js');
  let start = source.indexOf(`  async function ${name}(`);
  if (start < 0) start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}

test('a password-only administrator stays behind the MFA gate without loading protected records', async () => {
  for (const verified of [false, true]) {
    const calls = [];
    const context = vm.createContext({
      state: {}, els: { adminApp: { hidden: true } }, ADMIN_ROLES: new Set(['OWNER', 'ADMIN']),
      AdminApiError: Error,
      api: async path => { calls.push(path); return path === '/user/profile' ? { role: 'OWNER' } : { verified }; },
      renderGate() {}, setConnection() {}, renderIdentity() {},
      showApp() { calls.push('show'); }, refreshVisible() { calls.push('protected-records'); },
    });
    vm.runInContext(adminFunction('establishAccess'), context);
    await context.establishAccess();
    assert.equal(calls.includes('protected-records'), verified);
    assert.equal(calls.includes('show'), verified);
    if (!verified) assert.equal(context.state.gateMode, 'mfa');
  }
});

test('Autopilot never shows a healthy state from an enabled switch alone', () => {
  const context = vm.createContext({});
  vm.runInContext(adminFunction('autopilotExecutionPresentation'), context);
  for (const status of [undefined, 'awaiting_first_run', 'running', 'stale', 'needs_attention']) {
    const result = context.autopilotExecutionPresentation({ enabled: true, execution: { status } });
    assert.notEqual(result.tone, 'is-good', String(status));
  }
  assert.equal(context.autopilotExecutionPresentation({ enabled: true, execution: { status: 'healthy' } }).tone, 'is-good');
  assert.equal(context.autopilotExecutionPresentation({ enabled: false, execution: { status: 'healthy' } }).label, 'autopilotPaused');
});
