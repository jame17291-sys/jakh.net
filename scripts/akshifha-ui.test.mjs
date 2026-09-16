import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { mountAkshifha, PROGRESS_KEY } from '../akshifha.js';
import { CASES } from '../akshifha-cases.js';
import { AKSHIFHA_UI } from '../akshifha-copy.js';

// This is a lightweight interaction/DOM contract harness, not a browser,
// rendering, accessibility-tree, or native-share integration test.
const englishHtml = readFileSync(new URL('../akshifha.html', import.meta.url), 'utf8');

function harness({ language = 'en', search = '', storageValue, storageBlocked = false,
  analyticsAllowed = false, navigator = {}, html = englishHtml } = {}) {
  const nodes = new Map();
  const allNodes = [];
  const storage = new Map([['unrelated-user-setting', 'keep-me']]);
  if (storageValue !== undefined) storage.set(PROGRESS_KEY, storageValue);
  const storageWrites = [];
  const storageRemovals = [];
  const analytics = [];
  const assignments = [];
  const replacements = [];
  const consent = { allowed: analyticsAllowed };
  let currentUrl = new URL(`${language === 'ar' ? '/ar/games/akshifha/' : '/akshifha'}${search}`, 'http://127.0.0.1:49886');
  const document = { documentElement: { lang: language, dir: language === 'ar' ? 'rtl' : 'ltr' }, activeElement: null };
  class Element {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase(); this.attributes = {}; this.dataset = {}; this.children = [];
      this.listeners = {}; this.hidden = false; this.disabled = false; this.checked = false;
      this.value = ''; this.textContent = ''; this.className = '';
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'id') { this.id = String(value); nodes.set(this.id, this); }
      else if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = String(value);
      else if (['hidden', 'disabled', 'checked'].includes(name)) this[name] = true;
      else if (name === 'class') this.className = String(value);
      else if (['value', 'name', 'type'].includes(name)) this[name] = String(value);
    }
    getAttribute(name) { return this.attributes[name] ?? null; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
    append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    focus() { document.activeElement = this; }
    select() { this.wasSelected = true; }
  }
  for (const [, tagName, attributes] of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/giu)) {
    const node = new Element(tagName);
    for (const [, name, quoted, singleQuoted, bare] of attributes.matchAll(/([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu)) {
      node.setAttribute(name, quoted ?? singleQuoted ?? bare ?? '');
    }
    allNodes.push(node);
  }
  document.getElementById = id => nodes.get(id) || null;
  document.createElement = tagName => new Element(tagName);
  document.querySelectorAll = selector => {
    const attribute = selector.match(/^\[([^\]]+)\]$/u)?.[1];
    return attribute ? allNodes.filter(node => node.getAttribute(attribute) !== null) : [];
  };
  const window = {
    document, navigator,
    location: {
      get origin() { return currentUrl.origin; }, get search() { return currentUrl.search; },
      get pathname() { return currentUrl.pathname; },
      assign(value) { assignments.push(value); },
    },
    history: { replaceState(_state, _title, value) { replacements.push(value); currentUrl = new URL(value, currentUrl); } },
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error('Storage disabled'); return storage.get(key) ?? null; },
      setItem(key, value) { if (storageBlocked) throw new Error('Storage disabled'); storageWrites.push({ key, value }); storage.set(key, value); },
      removeItem(key) { if (storageBlocked) throw new Error('Storage disabled'); storageRemovals.push(key); storage.delete(key); },
      clear() { throw new Error('Never clear unrelated browser state'); },
    },
    JakhPrivacy: { analyticsAllowed: () => consent.allowed },
    gtag: (...args) => analytics.push(args),
  };
  const app = mountAkshifha(document, window);
  assert.ok(app, 'actual HTML provides all mount points');
  const node = id => { assert.ok(nodes.has(id), `missing #${id}`); return nodes.get(id); };
  const dispatch = (element, type, extra = {}) => {
    const event = { target: element, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    return Promise.all((element.listeners[type] || []).map(callback => callback(event)));
  };
  const click = id => dispatch(node(id), 'click');
  const evidence = () => node('ak-evidence').children.map(card => card.children[0]);
  const options = () => node('ak-options').children.map(label => label.children[0]);
  const selectEvidence = ids => {
    for (const input of evidence()) {
      if (input.checked && !ids.includes(input.value)) { input.checked = false; void dispatch(input, 'change'); }
    }
    for (const id of ids) {
      const input = evidence().find(candidate => candidate.value === id);
      assert.ok(input, `evidence ${id} exists`);
      if (!input.checked) { input.checked = true; void dispatch(input, 'change'); }
    }
  };
  const selectOption = id => {
    const input = options().find(candidate => candidate.value === id);
    assert.ok(input, `option ${id} exists`);
    for (const option of options()) option.checked = option === input;
    void dispatch(input, 'change');
  };
  const currentCase = () => CASES.find(item => item.id === app.getState().caseId);
  const submit = () => dispatch(node('ak-answer-form'), 'submit');
  const solve = async () => {
    const item = currentCase(); selectEvidence(item.solution.evidenceIds); selectOption(item.solution.optionId); await submit();
  };
  const chooseCase = id => {
    const button = node('ak-case-list').children.find(candidate => candidate.dataset.caseId === id);
    assert.ok(button); return dispatch(button, 'click');
  };
  return { app, node, click, dispatch, evidence, options, selectEvidence, selectOption, currentCase, submit, solve, chooseCase,
    storage, storageWrites, storageRemovals, analytics, consent, assignments, replacements, window, document };
}

function deferred() {
  let resolve; let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

test('actual exported UI mounts the authored HTML and completes all five cases in both languages', async () => {
  for (const language of ['en', 'ar']) {
    const game = harness({ language });
    assert.equal(game.node('ak-loading').hidden, true);
    assert.equal(game.node('ak-game').hidden, false);
    assert.equal(game.node('akLanguage').value, language);
    for (const item of CASES) {
      await game.chooseCase(item.id);
      assert.equal(game.app.getState().mode, 'practice');
      assert.equal(game.node('ak-case-title').textContent, item.title[language]);
      assert.equal(game.node('ak-result').hidden, true);
      assert.equal(game.node('ak-check').disabled, true);
      assert.equal(game.evidence().some(input => input.parentElement.dataset.proof === 'true'), false);
      await game.solve();
      assert.deepEqual(game.app.getState(), {
        caseId: item.id, mode: 'practice', day: game.app.getState().day,
        attempts: 1, hintsUsed: 0, finished: true, revealed: false,
        selected: item.solution.evidenceIds, choice: item.solution.optionId,
      });
      assert.equal(game.node('ak-result').hidden, false);
      assert.equal(game.node('ak-result-title').textContent, AKSHIFHA_UI[language].akSolved);
      assert.equal(game.node('ak-explanation').textContent, item.explanation[language]);
      assert.equal(game.node('ak-proof').children.length, 2);
      assert.ok(game.evidence().every(input => input.disabled));
      assert.ok(game.options().every(input => input.disabled));
      assert.equal(game.document.activeElement, game.node('ak-result-title'));
    }
    assert.equal(Object.keys(JSON.parse(game.storage.get(PROGRESS_KEY)).cases).length, 5);
    assert.equal(game.storageWrites.length, 5);
  }
});

test('invalid selection does not count, only two clues stay selected, and completion is idempotent', async () => {
  const game = harness();
  await game.submit();
  assert.equal(game.app.getState().attempts, 0);
  game.selectEvidence([game.currentCase().evidence[0].id]);
  game.selectOption(game.currentCase().solution.optionId);
  await game.submit();
  assert.equal(game.app.getState().attempts, 0);
  game.selectEvidence(game.currentCase().evidence.slice(0, 3).map(item => item.id));
  assert.equal(game.app.getState().selected.length, 2);
  assert.equal(game.evidence().filter(input => input.checked).length, 2);
  assert.ok(game.evidence().filter(input => !input.checked).every(input => input.disabled));
  await game.solve();
  await game.submit();
  await game.click('ak-reveal-yes');
  assert.equal(game.app.getState().attempts, 1);
  assert.equal(game.app.getState().revealed, false);
  assert.equal(game.storageWrites.length, 1);
});

test('a wrong pair or conclusion stays playable, then a correct answer counts one further attempt', async () => {
  const game = harness({ search: `?case=${CASES[0].id}` });
  const item = game.currentCase();
  game.selectEvidence(item.solution.evidenceIds);
  game.selectOption(item.options.find(option => option.id !== item.solution.optionId).id);
  await game.submit();
  assert.equal(game.app.getState().attempts, 1);
  assert.equal(game.app.getState().finished, false);
  assert.equal(game.node('ak-feedback').dataset.wrong, 'true');
  assert.equal(game.node('ak-result').hidden, true);
  assert.equal(game.storageWrites.length, 0);
  await game.solve();
  assert.equal(game.app.getState().attempts, 2);
  assert.equal(game.app.getState().finished, true);
  assert.equal(JSON.parse(game.storage.get(PROGRESS_KEY)).cases[item.id].attempts, 2);
});

test('hint disclosure is capped at two and assisted results remain distinct from independent solves', async () => {
  const game = harness();
  for (let count = 0; count < 5; count += 1) await game.click('ak-hint');
  assert.equal(game.app.getState().hintsUsed, 2);
  assert.equal(game.node('ak-hints').children.length, 2);
  assert.equal(game.node('ak-hints-box').hidden, false);
  assert.equal(game.node('ak-hint').disabled, true);
  await game.solve();
  assert.equal(game.node('ak-result-title').textContent, AKSHIFHA_UI.en.akAssisted);
  await game.click('ak-hint');
  assert.equal(game.app.getState().hintsUsed, 2);
});

test('explanation requires a visible confirmation flow and is recorded and shared honestly', async () => {
  const game = harness();
  await game.click('ak-reveal');
  assert.equal(game.node('ak-reveal-confirm').hidden, false);
  assert.equal(game.app.getState().finished, false);
  assert.equal(game.document.activeElement, game.node('ak-reveal-yes'));
  await game.click('ak-reveal-no');
  assert.equal(game.node('ak-reveal-confirm').hidden, true);
  assert.equal(game.app.getState().finished, false);
  await game.click('ak-reveal'); await game.click('ak-reveal-yes');
  assert.equal(game.app.getState().revealed, true);
  assert.equal(game.app.getState().attempts, 0);
  assert.equal(game.node('ak-result-title').textContent, AKSHIFHA_UI.en.akRevealed);
  assert.equal(JSON.parse(game.storage.get(PROGRESS_KEY)).cases[game.currentCase().id].revealed, true);
  await game.click('ak-share');
  assert.match(game.node('ak-share-text').value, /read the explanation/u);
  assert.doesNotMatch(game.node('ak-share-text').value, /I solved/u);
});

test('storage errors and corrupt local progress never block play or sharing', async () => {
  for (const config of [{ storageBlocked: true }, { storageValue: '{broken' }, { storageValue: JSON.stringify({ version: 100, cases: {}, score: 999999 }) }]) {
    const game = harness(config);
    assert.equal(game.node('ak-game').hidden, false);
    await game.solve();
    assert.equal(game.app.getState().finished, true);
    await game.click('ak-share');
    assert.equal(game.node('ak-share-manual').hidden, false);
    if (config.storageBlocked) {
      assert.equal(game.node('ak-storage-notice').hidden, false);
      assert.equal(game.node('ak-storage-notice').textContent, AKSHIFHA_UI.en.akStorageUnavailable);
    }
  }
});

test('reset confirmation removes only the game key and leaves unrelated settings untouched', async () => {
  const game = harness();
  await game.solve(); await game.click('ak-reset');
  assert.equal(game.node('ak-reset-confirm').hidden, false);
  await game.click('ak-reset-no');
  assert.ok(game.storage.has(PROGRESS_KEY));
  assert.equal(game.storageRemovals.length, 0);
  await game.click('ak-reset'); await game.click('ak-reset-yes');
  assert.deepEqual(game.storageRemovals, [PROGRESS_KEY]);
  assert.equal(game.storage.has(PROGRESS_KEY), false);
  assert.equal(game.storage.get('unrelated-user-setting'), 'keep-me');
  assert.equal(game.node('ak-progress-count').textContent, '0 of 5 cases explored');
  assert.equal(game.node('ak-reset-confirm').hidden, true);
});

test('replay resets answer selections, proof, hints, feedback, share controls, and attempts', async () => {
  const game = harness();
  const id = game.currentCase().id;
  await game.click('ak-hint'); await game.solve(); await game.click('ak-share');
  assert.equal(game.node('ak-share-manual').hidden, false);
  await game.click('ak-replay');
  assert.equal(game.currentCase().id, id);
  assert.equal(game.app.getState().mode, 'practice');
  assert.deepEqual(game.app.getState().selected, []);
  assert.equal(game.app.getState().choice, '');
  assert.equal(game.app.getState().attempts, 0);
  assert.equal(game.app.getState().hintsUsed, 0);
  assert.equal(game.app.getState().finished, false);
  assert.equal(game.app.getState().revealed, false);
  assert.equal(game.node('ak-result').hidden, true);
  assert.equal(game.node('ak-hints-box').hidden, true);
  assert.equal(game.node('ak-share-manual').hidden, true);
  assert.equal(game.node('ak-share-text').value, '');
  assert.equal(game.node('ak-share-status').textContent, '');
  assert.equal(game.node('ak-check').disabled, true);
  assert.equal(game.node('ak-hint').disabled, false);
  assert.ok(game.evidence().every(input => !input.checked && !input.disabled && input.parentElement.dataset.proof !== 'true'));
  assert.ok(game.options().every(input => !input.checked && !input.disabled));
  assert.equal(game.document.activeElement, game.node('ak-case-title'));
  assert.match(game.replacements.at(-1), /mode=practice/u);
});

test('native sharing cannot start before completion and cancellation never claims success', async () => {
  const shares = [];
  const cancelled = new Error('Cancelled'); cancelled.name = 'AbortError';
  const game = harness({ analyticsAllowed: true, navigator: { share: async value => { shares.push(value); throw cancelled; } } });
  await game.click('ak-share'); assert.equal(shares.length, 0);
  await game.solve(); await game.click('ak-share');
  assert.equal(shares.length, 1);
  assert.equal(game.node('ak-share-status').textContent, AKSHIFHA_UI.en.akShareCancelled);
  assert.equal(game.node('ak-share-manual').hidden, true);
  assert.equal(game.node('ak-share').disabled, false);
  assert.equal(game.analytics.filter(([, event]) => event === 'akshifha_share').length, 0);
  assert.equal(game.app.getState().finished, true);
});

test('native success shares the exact case on the public host without solutions or competitive scores', async () => {
  const shares = [];
  const game = harness({ analyticsAllowed: true, search: `?case=${CASES[2].id}&day=2026-09-16`, navigator: { share: async value => { shares.push(value); } } });
  await game.solve(); await game.click('ak-share');
  assert.equal(shares.length, 1);
  const target = new URL(shares[0].url);
  assert.equal(target.origin, 'https://riddlearabia.com');
  assert.equal(target.searchParams.get('case'), CASES[2].id);
  assert.equal(target.searchParams.get('day'), '2026-09-16');
  assert.deepEqual([...target.searchParams.keys()], ['case', 'day']);
  for (const spoiler of [game.currentCase().title.en, game.currentCase().explanation.en, ...game.currentCase().solution.evidenceIds]) assert.ok(!shares[0].text.includes(spoiler));
  assert.equal(game.node('ak-share-status').textContent, AKSHIFHA_UI.en.akShared);
  assert.equal(game.analytics.filter(([, event]) => event === 'akshifha_share').length, 1);
});

test('clipboard success is distinct from a manual fallback and failed clipboard operations remain usable', async () => {
  const copies = [];
  const copied = harness({ navigator: { clipboard: { writeText: async value => { copies.push(value); } } } });
  await copied.solve(); await copied.click('ak-share');
  assert.equal(copies.length, 1);
  assert.equal(copied.node('ak-share-status').textContent, AKSHIFHA_UI.en.akCopied);
  assert.equal(copied.node('ak-share-manual').hidden, true);
  for (const navigator of [{}, { clipboard: { writeText: async () => { throw new Error('Permission denied'); } } }, { share: async () => { throw new Error('Unsupported'); } }]) {
    const game = harness({ navigator });
    await game.solve(); await game.click('ak-share');
    assert.equal(game.node('ak-share-status').textContent, AKSHIFHA_UI.en.akShareUnavailable);
    assert.equal(game.node('ak-share-manual').hidden, false);
    assert.match(game.node('ak-share-text').value, /https:\/\/riddlearabia\.com\//u);
    assert.equal(game.node('ak-share-text').wasSelected, true);
    assert.equal(game.document.activeElement, game.node('ak-share-text'));
  }
});

test('a stale asynchronous share cannot alter a new round or log a share for the wrong case', async () => {
  for (const action of ['native-success', 'native-failure', 'clipboard-success', 'clipboard-failure']) {
    const pending = deferred();
    const navigator = action.startsWith('native') ? { share: () => pending.promise } : { clipboard: { writeText: () => pending.promise } };
    const game = harness({ navigator, analyticsAllowed: true });
    await game.solve();
    const sharing = game.click('ak-share');
    assert.equal(game.node('ak-share').disabled, true);
    await game.click('ak-next');
    const newState = game.app.getState();
    assert.equal(newState.finished, false);
    assert.equal(game.node('ak-share').disabled, false);
    if (action.endsWith('failure')) pending.reject(new Error('Late failure'));
    else pending.resolve();
    await sharing;
    assert.deepEqual(game.app.getState(), newState);
    assert.equal(game.node('ak-share-status').textContent, '');
    assert.equal(game.node('ak-share-manual').hidden, true);
    assert.equal(game.node('ak-share').disabled, false);
    assert.equal(game.analytics.filter(([, event]) => event === 'akshifha_share').length, 0);
  }
});

test('language switching navigates to physical language routes and preserves the exact case', async () => {
  for (const language of ['en', 'ar']) {
    for (const mode of ['practice', 'challenge']) {
      const search = `?case=${CASES[3].id}${mode === 'practice' ? '&mode=practice' : '&day=2026-09-16'}`;
      const game = harness({ language, search });
      const select = game.node('akLanguage'); select.value = language === 'en' ? 'ar' : 'en';
      await game.dispatch(select, 'change');
      assert.equal(game.assignments.length, 1);
      const target = new URL(game.assignments[0], 'https://riddlearabia.com');
      assert.equal(target.pathname, language === 'en' ? '/ar/games/akshifha/' : '/akshifha');
      assert.equal(target.searchParams.get('case'), CASES[3].id);
      if (mode === 'practice') assert.equal(target.searchParams.get('mode'), 'practice');
      else assert.equal(target.searchParams.get('day'), '2026-09-16');
    }
  }
});

test('generated Arabic HTML is physically RTL, uses shared root assets, and mounts a complete Arabic round', async () => {
  const html = readFileSync(new URL('../ar/games/akshifha/index.html', import.meta.url), 'utf8');
  assert.match(html, /<html\s+lang="ar"\s+dir="rtl"/u);
  assert.match(html, /<script\s+type="module"\s+src="\/akshifha\.js"/u);
  assert.match(html, /href="\/akshifha\.css"/u);
  assert.match(html, /href="https:\/\/riddlearabia\.com\/ar\/games\/akshifha\/"/u);
  const game = harness({ language: 'ar', html, search: `?case=${CASES[4].id}` });
  assert.equal(game.document.documentElement.dir, 'rtl');
  assert.equal(game.node('ak-title').textContent, AKSHIFHA_UI.ar.akTitle);
  assert.equal(game.node('ak-case-title').textContent, CASES[4].title.ar);
  await game.solve();
  assert.equal(game.node('ak-result-title').textContent, AKSHIFHA_UI.ar.akSolved);
  assert.equal(game.node('ak-explanation').textContent, CASES[4].explanation.ar);
  await game.click('ak-share');
  assert.match(game.node('ak-share-text').value, /\/ar\/games\/akshifha\//u);
  assert.doesNotMatch(game.node('ak-share-text').value, /I solved/u);
});

test('analytics are strictly consent-gated and contain game events, not evidence or chosen answers', async () => {
  for (const allowed of [undefined, null, false, 'true', 1]) {
    const game = harness({ analyticsAllowed: allowed });
    await game.click('ak-hint'); await game.solve(); await game.click('ak-share'); await game.click('ak-next');
    assert.deepEqual(game.analytics, []);
  }
  const game = harness({ analyticsAllowed: true });
  await game.click('ak-hint'); await game.solve();
  assert.ok(game.analytics.some(([, name]) => name === 'akshifha_start'));
  assert.ok(game.analytics.some(([, name]) => name === 'akshifha_hint'));
  assert.equal(game.analytics.filter(([, name]) => name === 'akshifha_complete').length, 1);
  for (const [kind, name, payload] of game.analytics) {
    assert.equal(kind, 'event'); assert.match(name, /^akshifha_/u);
    assert.equal(payload.language, 'en');
    assert.ok(CASES.some(item => item.id === payload.case_id));
    for (const key of ['evidence', 'selected', 'choice', 'answer', 'email', 'user_id', 'score']) assert.equal(Object.hasOwn(payload, key), false);
  }
  game.consent.allowed = false;
  const previous = game.analytics.length;
  await game.click('ak-next'); await game.solve();
  assert.equal(game.analytics.length, previous);
});

test('analytics absence or failures do not block gameplay', async () => {
  const game = harness({ analyticsAllowed: true });
  delete game.window.JakhPrivacy;
  await game.click('ak-hint');
  game.window.JakhPrivacy = { analyticsAllowed: () => true };
  game.window.gtag = () => { throw new Error('Measurement unavailable'); };
  await game.solve();
  assert.equal(game.app.getState().finished, true);
});

test('a failing consent provider prevents analytics but cannot interrupt a round', async () => {
  const game = harness();
  game.window.JakhPrivacy = { analyticsAllowed: () => { throw new Error('Consent storage unavailable'); } };
  await game.click('ak-hint');
  await game.solve();
  assert.equal(game.app.getState().finished, true);
  assert.deepEqual(game.analytics, []);
  await game.click('ak-next');
  assert.equal(game.app.getState().finished, false);
  assert.deepEqual(game.analytics, []);
});

test('malformed challenge inputs disclose fallback without preventing completion', async () => {
  const game = harness({ search: '?case=missing&day=2026-02-29&score=100000' });
  assert.equal(game.node('ak-link-notice').hidden, false);
  assert.equal(game.app.getState().mode, 'daily');
  assert.equal(game.app.getState().attempts, 0);
  await game.solve();
  assert.equal(game.app.getState().finished, true);
});
