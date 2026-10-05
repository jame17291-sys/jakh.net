import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const selectionSource = readFileSync(new URL('../battle-selection.js', import.meta.url), 'utf8').replace('export function createBattleSelection(', 'function createBattleSelection(');
const source = readFileSync(new URL('../battle-mode.js', import.meta.url), 'utf8')
  .replace("import { createBattleSelection } from './battle-selection.js';", '')
  .replace('export function createBattleMode(', 'function createBattleMode(');
const escapeHtml = value => String(value).replace(/[&<>"']/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const decode = value => String(value).replace(/&(?:amp|lt|gt|quot|#39);/gu, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[entity]));
const cards = (counts) => Object.entries(counts).flatMap(([difficulty, count]) => Array.from({ length: count }, (_, index) => ({ id: `${difficulty}-${index}`, difficulty, prepared: true })));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

function harness({ loadCards = async () => cards({ easy: 6, medium: 4 }), apiFetch = async () => ({ code: 'MATABC23', hostId: 'host' }), lang = 'en' } = {}) {
  const elements = new Map();
  class Element {
    constructor(id, tag, attrs = '') {
      this.id = id; this.tag = tag; this.attrs = new Map(); this.listeners = new Map(); this.textContent = '';
      this.disabled = /\sdisabled(?:\s|$)/u.test(attrs); this.value = decode(/\bvalue="([^"]*)"/u.exec(attrs)?.[1] || '');
      this.classes = new Set((/\bclass="([^"]*)"/u.exec(attrs)?.[1] || '').split(/\s+/u));
      this.classList = { add: value => this.classes.add(value), remove: value => this.classes.delete(value), contains: value => this.classes.has(value), toggle: (value, force) => { if (force ?? !this.classes.has(value)) this.classes.add(value); else this.classes.delete(value); } };
    }
    addEventListener(name, listener) { const listeners = this.listeners.get(name) || []; listeners.push(listener); this.listeners.set(name, listeners); }
    setAttribute(name, value) { this.attrs.set(name, value); }
    removeAttribute(name) { this.attrs.delete(name); }
    async trigger(name) { await Promise.all((this.listeners.get(name) || []).map(listener => listener({ target: this }))); }
    set innerHTML(html) {
      this.html = html;
      if (this.tag === 'select') {
        this.options = [...html.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gu)].map(([, attrs, label]) => ({ value: /\bvalue="([^"]*)"/u.exec(attrs)?.[1] || '', disabled: /\bdisabled\b/u.test(attrs), selected: /\bselected\b/u.test(attrs), textContent: label }));
        this.value = this.options.find(option => option.selected)?.value ?? this.options[0]?.value ?? '';
        return;
      }
      if (this.id === 'battleOverlay') for (const id of [...elements.keys()]) { if (id !== 'battleOverlay') elements.delete(id); }
      if (this.id === 'battleBody') for (const id of [...elements.keys()]) { if (!['battleOverlay', 'battleBody', 'battleTitle', 'battleExitBtn'].includes(id)) elements.delete(id); }
      for (const [, tag, attrs, id] of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/gu)) elements.set(id, new Element(id, tag, attrs));
      for (const [, id, options] of html.matchAll(/<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gu)) elements.get(id).innerHTML = options;
    }
    get innerHTML() { return this.html; }
  }
  elements.set('battleOverlay', new Element('battleOverlay', 'div', 'class="hidden"'));
  const requests = []; const sockets = [];
  const state = { lang, dbUser: null, catalog: { categories: [
    { slug: 'math', title: { en: 'Math', ar: 'الرياضيات' }, quickFireQuestionCount: 10 },
    { slug: 'logic-puzzles', title: { en: 'Logic', ar: 'المنطق' }, quickFireQuestionCount: 10 },
    { slug: 'science', title: { en: 'Science', ar: 'العلوم' }, quickFireQuestionCount: 0 },
  ] } };
  const context = vm.createContext({ document: { getElementById: id => elements.get(id) || null }, URL, clearInterval, setInterval,
    WebSocket: class { constructor(url) { this.url = url; sockets.push(this); } close() {} send() {} },
  });
  vm.runInContext(`${selectionSource}\n${source}`, context);
  const mode = context.createBattleMode({
    API_ORIGIN: 'https://api.riddlearabia.com', activateFocus() {}, deactivateFocus() {}, state, t: key => key,
    escapeHtml, localizedErrorMessage: error => error.message, shareOrCopy() {},
    loadBattleCategoryCards: loadCards, preparedQuickFire: card => card.prepared,
    apiFetch: async (path, options) => { requests.push({ path, payload: JSON.parse(options.body) }); return apiFetch(path, options); },
  });
  const get = id => { const element = elements.get(id); assert.ok(element, id); return element; };
  const name = async (value) => { get('battleNameInput').value = value; await get('battleNameInput').trigger('input'); };
  return { mode, state, get, requests, sockets, name };
}

test('Battle offers only difficulty pools with five actual prepared cards and caps question counts', async () => {
  const h = harness();
  h.mode.openBattleModal('math');
  assert.equal(h.get('battleCreateBtn').disabled, true, 'availability must finish before creation');
  await settle();
  const options = h.get('battleDiffSelect').options;
  assert.equal(options.find(option => option.value === 'all').disabled, false);
  assert.equal(options.find(option => option.value === 'easy').disabled, false);
  assert.equal(options.find(option => option.value === 'medium').disabled, true);
  assert.equal(options.find(option => option.value === 'hard').disabled, true);
  assert.match(h.get('battleChoiceHint').textContent, /^10 prepared questions/u);
  assert.deepEqual(h.get('battleCountSelect').options.map(option => option.value), ['10']);
  await h.name('Jam');
  h.get('battleDiffSelect').value = 'easy';
  await h.get('battleDiffSelect').trigger('change');
  assert.deepEqual(h.get('battleCountSelect').options.map(option => option.value), ['6']);
  assert.match(h.get('battleChoiceHint').textContent, /^6 prepared questions/u);
  await h.get('battleCreateBtn').trigger('click');
  assert.deepEqual(h.requests[0].payload, { category: 'math', difficulty: 'easy', questionCount: 6 });
  assert.equal(h.sockets.length, 1);
});

test('the five-card minimum is playable; forged underfilled difficulty never calls room creation', async () => {
  const h = harness({ loadCards: async () => cards({ easy: 5, medium: 4 }) });
  h.mode.openBattleModal('logic-puzzles'); await settle(); await h.name('Jam');
  h.get('battleDiffSelect').value = 'medium';
  await h.get('battleCreateBtn').trigger('click');
  assert.equal(h.requests.length, 0);
  assert.equal(h.get('battleDiffSelect').value, 'all');
  h.get('battleDiffSelect').value = 'easy'; await h.get('battleDiffSelect').trigger('change');
  assert.equal(h.get('battleCountSelect').value, '5');
  await h.get('battleCreateBtn').trigger('click');
  assert.equal(h.requests[0].payload.questionCount, 5);
});

test('actual source availability overrides optimistic aggregate catalog totals', async () => {
  const h = harness({ loadCards: async () => cards({ easy: 4 }) });
  h.mode.openBattleModal('math'); await settle(); await h.name('Jam');
  assert.equal(h.get('battleCreateBtn').disabled, true);
  assert.match(h.get('battleChoiceHint').textContent, /needs 5 prepared questions/u);
  await h.get('battleCreateBtn').trigger('click');
  assert.equal(h.requests.length, 0);
});

test('duplicate, missing-id and unprepared records cannot inflate the minimum', async () => {
  const eligible = cards({ easy: 4 });
  const h = harness({ loadCards: async () => [...eligible, eligible[0], { difficulty: 'easy', prepared: true }, { id: 'draft', difficulty: 'easy', prepared: false }] });
  h.mode.openBattleModal('math'); await settle();
  assert.equal(h.get('battleCreateBtn').disabled, true);
});

test('failed source inspection keeps creation disabled and can be retried without losing the name', async () => {
  let attempts = 0;
  const h = harness({ loadCards: async () => { if (++attempts === 1) throw new Error('Network unavailable'); return cards({ easy: 7 }); } });
  h.mode.openBattleModal('math'); await h.name('Jam'); await settle();
  assert.equal(h.get('battleCreateBtn').disabled, true);
  assert.equal(h.get('battleRetryQuestionsBtn').classList.contains('hidden'), false);
  assert.equal(h.get('battleSetupError').textContent, 'Network unavailable');
  await h.get('battleRetryQuestionsBtn').trigger('click'); await settle();
  assert.equal(h.get('battleNameInput').value, 'Jam');
  assert.equal(h.get('battleCountSelect').value, '7');
  assert.equal(h.get('battleCreateBtn').disabled, false);
});

test('category loading races and language rerenders preserve the current selection and typed name', async () => {
  const math = deferred(); const logic = deferred();
  const h = harness({ loadCards: slug => slug === 'math' ? math.promise : logic.promise });
  h.mode.openBattleModal('math'); await h.name('Jam & family');
  h.get('battleCatSelect').value = 'logic-puzzles'; await h.get('battleCatSelect').trigger('change');
  h.state.lang = 'ar'; h.mode.renderBattleUI();
  assert.equal(h.get('battleNameInput').value, 'Jam & family');
  assert.equal(h.get('battleCatSelect').value, 'logic-puzzles');
  logic.resolve(cards({ medium: 5 })); await settle();
  assert.equal(h.get('battleDiffSelect').options.find(option => option.value === 'medium').disabled, false);
  math.resolve(cards({ easy: 20 })); await settle();
  assert.equal(h.get('battleCountSelect').value, '5');
  assert.equal(h.get('battleNameInput').value, 'Jam & family');
  assert.match(h.get('battleChoiceHint').textContent, /^5 /u);
});

test('switching create and join tabs preserves the name, room code, topic and valid difficulty', async () => {
  const h = harness({ loadCards: async () => cards({ easy: 5, medium: 5 }) });
  h.mode.openBattleModal('logic-puzzles'); await settle(); await h.name('Jam');
  h.get('battleDiffSelect').value = 'medium'; await h.get('battleDiffSelect').trigger('change');
  await h.get('battleTabJoin').trigger('click');
  h.get('battleCodeInput').value = 'log-abc23'; await h.get('battleCodeInput').trigger('input');
  await h.get('battleTabCreate').trigger('click');
  assert.equal(h.get('battleNameInput').value, 'Jam');
  assert.equal(h.get('battleCatSelect').value, 'logic-puzzles');
  assert.equal(h.get('battleDiffSelect').value, 'medium');
  assert.equal(h.get('battleCountSelect').value, '5');
  await h.get('battleTabJoin').trigger('click');
  assert.equal(h.get('battleCodeInput').value, 'LOGABC23');
});

test('an unprepared requested topic is not silently replaced with another topic', async () => {
  let loaded = 0;
  const h = harness({ loadCards: async () => { loaded++; return cards({ easy: 10 }); } });
  h.mode.openBattleModal('science'); await settle();
  assert.equal(h.get('battleCatSelect').value, '');
  assert.equal(h.get('battleCreateBtn').disabled, true);
  assert.equal(loaded, 0);
  assert.match(h.get('battleChoiceHint').textContent, /Choose an available topic/u);
});

test('real creation errors remain visible and restore valid retry controls', async () => {
  const h = harness({ apiFetch: async () => { throw new Error('Service unavailable'); } });
  h.mode.openBattleModal('math'); await settle(); await h.name('Jam');
  await h.get('battleCreateBtn').trigger('click');
  assert.equal(h.get('battleSetupError').textContent, 'Service unavailable');
  assert.equal(h.get('battleSetupError').classList.contains('hidden'), false);
  assert.equal(h.get('battleCreateBtn').disabled, false);
  h.state.lang = 'ar'; h.mode.renderBattleUI();
  assert.equal(h.get('battleSetupError').textContent, 'Service unavailable');
  assert.equal(h.get('battleNameInput').value, 'Jam');
});

test('server content changes trigger a fresh availability check and preserve the real error', async () => {
  let loads = 0;
  const error = Object.assign(new Error('More prepared questions required'), { code: 'BATTLE_CONTENT_NOT_READY' });
  const h = harness({ loadCards: async () => cards({ easy: ++loads === 1 ? 10 : 4 }), apiFetch: async () => { throw error; } });
  h.mode.openBattleModal('math'); await settle(); await h.name('Jam');
  await h.get('battleCreateBtn').trigger('click'); await settle();
  assert.equal(loads, 2);
  assert.equal(h.get('battleCreateBtn').disabled, true);
  assert.equal(h.get('battleSetupError').textContent, error.message);
  assert.match(h.get('battleChoiceHint').textContent, /needs 5 prepared questions/u);
});

test('forged out-of-range requested counts never reach the server', async () => {
  const h = harness(); h.mode.openBattleModal('math'); await settle(); await h.name('Jam');
  h.get('battleCountSelect').value = '20';
  await h.get('battleCreateBtn').trigger('click');
  assert.equal(h.requests.length, 0);
  assert.equal(h.get('battleCountSelect').value, '10');
});

test('closing the modal invalidates in-flight availability and room creation responses', async () => {
  const source = deferred(); const h = harness({ loadCards: () => source.promise });
  h.mode.openBattleModal('math'); h.mode.closeBattleModal(); source.resolve(cards({ easy: 10 })); await settle();
  assert.equal(h.get('battleOverlay').classList.contains('hidden'), true);
  assert.equal(h.get('battleCreateBtn').disabled, true);
  const create = deferred(); const second = harness({ apiFetch: () => create.promise });
  second.mode.openBattleModal('math'); await settle(); await second.name('Jam');
  const pending = second.get('battleCreateBtn').trigger('click');
  second.mode.closeBattleModal(); create.resolve({ code: 'MATABC23', hostId: 'host' }); await pending;
  assert.equal(second.sockets.length, 0);
});

test('duplicate creation clicks share one request while pending', async () => {
  const create = deferred(); const h = harness({ apiFetch: () => create.promise });
  h.mode.openBattleModal('math'); await settle(); await h.name('Jam');
  const pending = h.get('battleCreateBtn').trigger('click');
  await h.get('battleCreateBtn').trigger('click');
  assert.equal(h.requests.length, 1);
  create.reject(new Error('Try later')); await pending;
  assert.equal(h.get('battleCreateBtn').disabled, false);
});

test('a pending Create availability failure does not appear on the Join form', async () => {
  const source = deferred(); const h = harness({ loadCards: () => source.promise });
  h.mode.openBattleModal('math'); await h.name('Jam');
  await h.get('battleTabJoin').trigger('click');
  source.reject(new Error('Question source unavailable')); await settle();
  assert.equal(h.get('battleSetupError').classList.contains('hidden'), true);
  assert.equal(h.get('battleJoinBtn').disabled, false);
  await h.get('battleTabCreate').trigger('click');
  assert.equal(h.get('battleSetupError').textContent, 'Question source unavailable');
  assert.equal(h.get('battleCreateBtn').disabled, true);
});

test('creation stays pending through WebSocket connection and recovers on a socket error', async () => {
  const h = harness(); h.mode.openBattleModal('math'); await settle(); await h.name('Jam');
  await h.get('battleCreateBtn').trigger('click');
  assert.equal(h.get('battleCreateBtn').disabled, true);
  assert.equal(h.get('battleTabJoin').disabled, true);
  await h.get('battleCreateBtn').trigger('click');
  assert.equal(h.requests.length, 1);
  h.sockets[0].onerror();
  assert.equal(h.get('battleCreateBtn').disabled, false);
  assert.equal(h.get('battleTabJoin').disabled, false);
  assert.match(h.get('battleSetupError').textContent, /Connection failed/u);
});
