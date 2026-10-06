import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the real mounted client with controlled network completion and a small
// DOM adapter. No exported test hooks or network/browser dependencies are needed.
const source = (await readFile(new URL('../../puzzle-duel.js', import.meta.url), 'utf8')).replace('export function mount', 'function mount');
const hostSession = { code: 'ABCD2345', token: 'H'.repeat(43), name: 'Host', lang: 'en' };
const decode = text => String(text).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function snapshot(overrides = {}) {
  return { code: hostSession.code, lang: 'en', board: Array(81).fill(null), phase: 'playing', revision: 1,
    players: [{ id: 'host', name: 'Host', score: 0, tiles: 7 }, { id: 'guest', name: 'Guest', score: 0, tiles: 7 }],
    you: 'host', rack: [...'catersn'], turnId: 'host', remaining: 20, scoreless: 0, turns: 0,
    expiresAt: Date.now() + 86400000, lastMove: null, reason: null, winnerId: null, ...overrides };
}
function harness({ saved = { session: hostSession }, href = 'http://localhost:8765/play?game=duel', browser = {} } = {}) {
  const requests = [], timers = new Map(), listeners = new Map();
  let storage = structuredClone(saved), timerId = 0;
  const doc = { hidden: false, activeElement: null, addEventListener(type, listener) { listeners.set(type, listener); }, removeEventListener(type) { listeners.delete(type); } };
  class Element {
    constructor(tag, attrs) {
      this.tag = tag; this.attrs = attrs; this.value = decode(attrs.value || ''); this.disabled = Object.hasOwn(attrs, 'disabled'); this.open = Object.hasOwn(attrs, 'open');
      this.dataset = Object.fromEntries(Object.entries(attrs).filter(([name]) => name.startsWith('data-')).map(([name, value]) => [name.slice(5), value]));
      this.listeners = new Map(); this.textContent = ''; this.classList = { toggle() {} };
    }
    set innerHTML(value) { this.html = value; this.children = parse(value); }
    get innerHTML() { return this.html || ''; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    getAttribute(name) { return this.attrs[name] ?? null; }
    hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
    closest(selector) { return selector.split(',').some(part => this.matches(part.trim())) ? this : null; }
    matches(selector) {
      if (selector.startsWith('#')) return this.attrs.id === selector.slice(1);
      if (selector.startsWith('.')) return String(this.attrs.class || '').split(/\s/u).includes(selector.slice(1));
      const attribute = /^\[([^=\]]+)(?:="([^"]*)")?\]$/u.exec(selector);
      if (attribute) return Object.hasOwn(this.attrs, attribute[1]) && (attribute[2] === undefined || this.attrs[attribute[1]] === attribute[2]);
      return this.tag === selector;
    }
    focus() { doc.activeElement = this; }
    select() { this.focus(); }
    reportValidity() { return Boolean(this.value); }
    async emit(type, extra = {}) {
      if (this.disabled && type === 'click') return;
      const event = { target: this, currentTarget: this, preventDefault() { this.defaultPrevented = true; }, ...extra };
      const returned = this.listeners.get(type)?.(event);
      // Click handlers can await the controlled network; don't block the test.
      returned?.catch(error => { throw error; });
      await settle();
      return event;
    }
  }
  function parse(value) {
    const elements = [];
    for (const match of value.matchAll(/<(input|button|select|form|details|p|div|section)\b([^>]*)>/gu)) {
      const attrs = {};
      for (const attr of match[2].matchAll(/([a-zA-Z][\w-]*)(?:="([^"]*)")?/gu)) attrs[attr[1]] = attr[2] ?? '';
      const element = new Element(match[1], attrs);
      if (match[1] === 'select') {
        const inner = value.slice(match.index).split('</select>')[0];
        element.value = /<option value="([^"]+)" selected>/u.exec(inner)?.[1] || 'en';
      }
      elements.push(element);
    }
    return elements;
  }
  const root = {
    html: '', elements: [],
    set innerHTML(value) { this.html = value; this.elements = parse(value); },
    get innerHTML() { return this.html; },
    all() { return this.elements.flatMap(element => [element, ...(element.children || [])]); },
    querySelector(selector) { return this.all().find(element => element.matches(selector)) || null; },
    querySelectorAll(selector) { return this.all().filter(element => element.matches(selector)); },
  };
  const sandbox = {
    URL, Uint8Array, crypto, btoa, atob, AbortController, document: doc, location: new URL(href), navigator: {},
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null,
        resolve(data, status = 200) { resolve(new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })); }, reject });
      return promise;
    },
    ...browser,
  };
  vm.runInNewContext(`${source}\nglobalThis.mountClient = mount;`, sandbox, { filename: 'puzzle-duel.js' });
  const cleanup = sandbox.mountClient(root, { lang: 'en', t: en => en, load: () => structuredClone(storage), save: value => { storage = structuredClone(value); } });
  return { root, requests, cleanup, doc, timers, listeners,
    storage: () => structuredClone(storage), overwrite: value => { storage = structuredClone(value); },
    next(path) { const request = requests.find(r => !r.claimed && new URL(r.url).pathname.endsWith(path)); assert.ok(request, `Expected request ${path}`); request.claimed = true; return request; },
    async tick(delay) { const entry = [...timers].find(([, timer]) => timer.delay === delay); assert.ok(entry, `Expected timer ${delay}`); timers.delete(entry[0]); entry[1].callback(); await settle(); },
  };
}
async function settle() { await new Promise(resolve => setImmediate(resolve)); }
async function loaded(options) {
  const h = harness(options);
  h.next('/state').resolve(snapshot()); await settle();
  return h;
}

test('client ignores corrupted saved sessions and never starts an unauthenticated poll', () => {
  for (const saved of [null, 5, [], { session: null }, { session: { code: hostSession.code, token: 'short' } }]) {
    const h = harness({ saved }); assert.match(h.root.html, /Create a room/u); assert.equal(h.requests.length, 0); h.cleanup();
  }
});
test('a delayed poll cannot overwrite a newer accepted move', async () => {
  const h = await loaded();
  await h.tick(4000); const stale = h.next('/state');
  await h.root.querySelector('#pd-duel-pass').emit('click');
  const move = h.next('/action'); assert.equal(move.body.revision, 1);
  move.resolve(snapshot({ revision: 2, turns: 1, turnId: 'guest', lastMove: { kind: 'pass', playerId: 'host', words: [], score: 0, cells: [] } })); await settle();
  assert.match(h.root.html, /Waiting for Guest/u);
  stale.resolve(snapshot()); await settle();
  assert.match(h.root.html, /Waiting for Guest/u); assert.match(h.root.html, /Move 1\/80/u);
  h.cleanup();
});
test('an old room response or error cannot replace a newly created room', async () => {
  for (const fail of [false, true]) {
    const h = await loaded(); await h.tick(4000); const oldPoll = h.next('/state');
    await h.root.querySelector('#pd-duel-menu').emit('click');
    h.root.querySelector('#pd-duel-name').value = 'New host';
    await h.root.querySelector('#pd-duel-form').emit('submit');
    h.next('/create').resolve(snapshot({ code: 'WXYZ2345', phase: 'waiting', revision: 0 })); await settle();
    if (fail) oldPoll.reject(new Error('Old connection failed')); else oldPoll.resolve(snapshot({ revision: 99 }));
    await settle(); assert.match(h.root.html, /WXYZ2345/u); assert.doesNotMatch(h.root.html, /ABCD2345/u);
    assert.equal(h.storage().session.code, 'WXYZ2345'); h.cleanup();
  }
});
test('late failed create after unmount cannot overwrite a newer saved seat', async () => {
  const h = harness({ href: 'http://localhost:8765/play?game=duel&duelRoom=WXYZ2345' });
  h.root.querySelector('#pd-duel-name').value = 'New host'; await h.root.querySelector('#pd-duel-form').emit('submit');
  const create = h.next('/create'); h.cleanup();
  assert.equal(create.options.signal.aborted, true);
  const newer = { session: { ...hostSession, code: 'WXYZ2345', token: 'Z'.repeat(43) } };
  h.overwrite(newer);
  create.resolve({ error: 'Unavailable', code: 'DUEL_UNAVAILABLE' }, 503); await settle();
  assert.deepEqual(h.storage(), newer);
});
test('an in-flight room poll never discards text being entered in the room menu', async () => {
  for (const fail of [false, true]) {
    const h = await loaded(); await h.tick(4000); const poll = h.next('/state');
    await h.root.querySelector('#pd-duel-menu').emit('click');
    h.root.querySelector('#pd-duel-name').value = 'Typing a new name';
    h.root.querySelector('#pd-duel-code').value = 'WXYZ2345';
    if (fail) poll.reject(new Error('Lost connection')); else poll.resolve(snapshot({ revision: 2, turns: 1 }));
    await settle();
    assert.equal(h.root.querySelector('#pd-duel-name').value, 'Typing a new name');
    assert.equal(h.root.querySelector('#pd-duel-code').value, 'WXYZ2345'); h.cleanup();
  }
});
test('failed join can retry with the same private token after a lost response', async () => {
  const h = harness({ saved: { session: null } });
  h.root.querySelector('#pd-duel-name').value = 'Guest'; h.root.querySelector('#pd-duel-code').value = 'ABCD2345';
  await h.root.querySelector('#pd-duel-join').emit('click'); const first = h.next('/join');
  first.reject(new Error('Response lost')); await settle();
  await h.root.querySelector('#pd-duel-join').emit('click'); const second = h.next('/join');
  assert.equal(second.body.token, first.body.token); assert.equal(h.storage().session.token, first.body.token);
  second.resolve(snapshot({ you: 'guest', turnId: 'host' })); await settle(); assert.match(h.root.html, /Waiting for Host/u); h.cleanup();
});
test('lost move response refreshes authoritative state without replaying the mutation', async () => {
  const h = await loaded(); await h.root.querySelector('#pd-duel-pass').emit('click');
  h.next('/action').reject(new Error('Response lost')); await settle();
  h.next('/state').resolve(snapshot({ revision: 2, turns: 1, turnId: 'guest' })); await settle();
  assert.match(h.root.html, /Waiting for Guest/u); assert.equal(h.requests.filter(r => r.url.endsWith('/action')).length, 1); h.cleanup();
});
test('a room that expires during a move returns immediately to the room menu', async () => {
  const h = await loaded(); await h.root.querySelector('#pd-duel-pass').emit('click');
  h.next('/action').resolve({ error: 'Expired', code: 'ROOM_EXPIRED' }, 410); await settle();
  assert.match(h.root.html, /Create a room/u); assert.match(h.root.html, /This room expired/u);
  assert.equal(h.root.querySelector('#pd-duel-pass'), null); h.cleanup();
});
test('temporary disconnect disables moves then restores the same draft on reconnect', async () => {
  const h = await loaded();
  await h.root.querySelector('[data-rack="0"]').emit('click'); await h.root.querySelector('[data-cell="40"]').emit('click');
  assert.equal(h.root.querySelectorAll('.pd-duel-draft').length, 1);
  await h.tick(4000); h.next('/state').reject(new Error('Offline')); await settle();
  assert.equal(h.root.querySelector('#pd-duel-submit').disabled, true);
  await h.tick(8000); h.next('/state').resolve(snapshot()); await settle();
  assert.equal(h.root.querySelectorAll('.pd-duel-draft').length, 1);
  assert.equal(h.root.querySelector('#pd-duel-submit').disabled, false); h.cleanup();
});
test('board shortcuts preserve browser modifier keys and cleanup removes listeners', async () => {
  const h = await loaded();
  const cell = h.root.querySelector('[data-cell="40"]');
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
    const event = await cell.emit('keydown', { key: 'r', [modifier]: true });
    assert.equal(event.defaultPrevented, undefined); assert.equal(h.root.querySelectorAll('.pd-duel-draft').length, 0);
  }
  h.cleanup();
  const second = harness(); second.next('/state').resolve(snapshot()); await settle();
  second.cleanup();
  assert.equal(second.listeners.has('visibilitychange'), false);
});

test('finishing a pending move preserves room-menu edits and re-enables room actions', async () => {
  for (const status of [200, 400, 410]) {
    const h = await loaded(); await h.root.querySelector('#pd-duel-pass').emit('click');
    const move = h.next('/action'); await h.root.querySelector('#pd-duel-menu').emit('click');
    const name = h.root.querySelector('#pd-duel-name'), code = h.root.querySelector('#pd-duel-code');
    name.value = 'Typing a new name'; code.value = 'WXYZ2345'; name.focus();
    assert.equal(h.root.querySelector('#pd-duel-create').disabled, true);
    move.resolve(status === 200 ? snapshot({ revision: 2, turns: 1, turnId: 'guest' }) : { error: 'Rejected', code: status === 410 ? 'ROOM_EXPIRED' : 'NOT_YOUR_TURN' }, status);
    await settle();
    assert.equal(h.root.querySelector('#pd-duel-name'), name); assert.equal(h.doc.activeElement, name);
    assert.equal(name.value, 'Typing a new name'); assert.equal(code.value, 'WXYZ2345');
    assert.equal(h.root.querySelector('#pd-duel-create').disabled, false);
    assert.equal(h.root.querySelector('#pd-duel-create').textContent, 'Create a room');
    assert.equal(h.root.querySelector('#pd-duel-join').disabled, false); h.cleanup();
  }
});
test('resuming during an unchanged background poll immediately shows the saved room', async () => {
  const h = await loaded(); await h.tick(4000); const poll = h.next('/state');
  await h.root.querySelector('#pd-duel-menu').emit('click');
  await h.root.querySelector('#pd-duel-resume').emit('click');
  assert.ok(h.root.querySelector('#pd-duel-pass')); assert.equal(h.root.querySelector('#pd-duel-form'), null);
  poll.resolve(snapshot()); await settle();
  assert.ok(h.root.querySelector('#pd-duel-pass')); assert.match(h.root.html, /Your turn/u); h.cleanup();
});

function pushBrowser({ key = 'B'.repeat(87), oldKey, permission = 'default' } = {}) {
  const calls = { permission: 0, subscribe: 0, unsubscribe: 0 };
  const newSubscription = { options: { applicationServerKey: Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0)) }, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: { p256dh: key, auth: 'A'.repeat(22) } }), async unsubscribe() { calls.unsubscribe++; return true; } };
  const oldSubscription = oldKey ? { ...newSubscription, options: { applicationServerKey: oldKey } } : null;
  const registration = { pushManager: { async getSubscription() { return oldSubscription; }, async subscribe() { calls.subscribe++; return newSubscription; } } };
  return { calls, browser: { PushManager: function PushManager() {}, Notification: { permission, async requestPermission() { calls.permission++; return 'granted'; } }, navigator: { serviceWorker: { async register() { return registration; }, ready: Promise.resolve(registration) } } } };
}
test('rematch invitations require explicit acceptance in the client and keep completed results in device history', async () => {
  const h = await loaded(); await h.tick(4000);
  const result = { matchNumber: 1, finishedAt: Date.now() - 1000, winnerId: 'host', players: [{ id: 'host', name: 'Host', score: 22 }, { id: 'guest', name: 'Guest', score: 10 }] };
  h.next('/state').resolve(snapshot({ phase: 'finished', revision: 2, matchNumber: 1, winnerId: 'host', results: [result] })); await settle();
  assert.ok(h.root.querySelector('#pd-duel-rematch-request')); assert.equal(h.storage().history.length, 1); assert.equal(h.storage().history[0].outcome, 'win');
  await h.root.querySelector('#pd-duel-rematch-request').emit('click'); const request = h.next('/rematch');
  assert.equal(request.body.decision, 'request'); assert.equal(request.body.matchNumber, 1); assert.equal(request.body.revision, 2);
  request.resolve(snapshot({ phase: 'finished', revision: 3, matchNumber: 1, winnerId: 'host', results: [result], rematch: { requestedBy: 'host', status: 'pending' } })); await settle();
  assert.match(h.root.html, /Waiting for your friend/u); assert.equal(h.root.querySelector('#pd-duel-rematch-accept'), null);
  await h.tick(8000); h.next('/state').resolve(snapshot({ revision: 4, matchNumber: 2, results: [result], turnId: 'guest' })); await settle();
  assert.equal(h.root.querySelector('#pd-duel-rematch-request'), null); assert.equal(h.storage().history.length, 1); assert.match(h.root.html, /Waiting for Guest/u);
  await h.root.querySelector('#pd-duel-clear-history').emit('click'); assert.equal(h.storage().history.length, 0);
  await h.tick(4000); h.next('/state').resolve(snapshot({ revision: 5, matchNumber: 2, results: [result] })); await settle();
  assert.equal(h.storage().history.length, 0); h.cleanup();
});
test('incoming rematch consent sends accept only after the player clicks it', async () => {
  const h = harness(); h.next('/state').resolve(snapshot({ phase: 'finished', revision: 3, matchNumber: 1, rematch: { requestedBy: 'guest', status: 'pending' } })); await settle();
  assert.ok(h.root.querySelector('#pd-duel-rematch-accept')); assert.equal(h.requests.some(request => request.url.endsWith('/rematch')), false);
  await h.root.querySelector('#pd-duel-rematch-accept').emit('click'); assert.equal(h.next('/rematch').body.decision, 'accept'); h.cleanup();
});
test('match history is bounded and corrupt records are ignored without exposing private seat tokens', async () => {
  const old = { id: 'ABCD2345:1', code: 'ABCD2345', matchNumber: 1, finishedAt: Date.now() - 1000, outcome: 'win', players: [{ name: 'Host', score: 22 }, { name: 'Guest', score: 10 }] };
  const h = harness({ saved: { session: null, history: [null, {}, ...Array.from({ length: 40 }, (_, i) => ({ ...old, id: `ABCD2345:${i + 1}`, matchNumber: i + 1 }))] } });
  assert.match(h.root.html, /this device/u); assert.match(h.root.html, /\(30\)/u); assert.doesNotMatch(h.root.html, /HHHHHH/u); h.cleanup();
});
test('notifications never request permission before user opt-in and room opt-out keeps the shared browser subscription', async () => {
  const setup = pushBrowser(); const h = await loaded({ browser: setup.browser });
  h.next('/push-config').resolve({ enabled: true, publicKey: 'B'.repeat(87) }); await settle(); assert.equal(setup.calls.permission, 0);
  await h.root.querySelector('#pd-duel-push-toggle').emit('click'); assert.equal(setup.calls.permission, 1); assert.equal(setup.calls.subscribe, 1);
  const request = h.next('/reminders'); assert.equal(request.body.enabled, true);
  request.resolve(snapshot({ remindersEnabled: true, reminderRevision: 1 })); await settle();
  await h.root.querySelector('#pd-duel-push-toggle').emit('click'); const off = h.next('/reminders'); assert.equal(off.body.enabled, false);
  off.resolve(snapshot({ remindersEnabled: false, reminderRevision: 2 })); await settle(); assert.equal(setup.calls.unsubscribe, 0); assert.equal(setup.calls.permission, 1); h.cleanup();
});
test('equal-board reminder updates preserve a staged word and stale poll cannot undo opt-in', async () => {
  const setup = pushBrowser({ permission: 'granted' }); const h = await loaded({ browser: setup.browser }); h.next('/push-config').resolve({ enabled: true, publicKey: 'B'.repeat(87) }); await settle();
  await h.root.querySelector('[data-rack="0"]').emit('click'); await h.root.querySelector('[data-cell="40"]').emit('click');
  await h.tick(4000); const stale = h.next('/state');
  await h.root.querySelector('#pd-duel-push-toggle').emit('click'); h.next('/reminders').resolve(snapshot({ remindersEnabled: true, reminderRevision: 1 })); await settle();
  stale.resolve(snapshot({ remindersEnabled: false, reminderRevision: 0 })); await settle();
  assert.match(h.root.querySelector('#pd-duel-reminders').innerHTML, /Turn reminders off/u);
  await h.tick(4000); h.next('/state').resolve(snapshot({ remindersEnabled: false, reminderRevision: 2 })); await settle();
  assert.match(h.root.querySelector('#pd-duel-reminders').innerHTML, /Enable on this device/u);
  assert.equal(h.root.querySelectorAll('.pd-duel-draft').length, 1); h.cleanup();
});
test('enabling after VAPID rotation renews the incompatible browser endpoint', async () => {
  const setup = pushBrowser({ permission: 'granted', oldKey: new Uint8Array(65).fill(255) }); const h = await loaded({ browser: setup.browser });
  h.next('/push-config').resolve({ enabled: true, publicKey: 'B'.repeat(87) }); await settle();
  await h.root.querySelector('#pd-duel-push-toggle').emit('click'); assert.equal(setup.calls.unsubscribe, 1); assert.equal(setup.calls.subscribe, 1); assert.equal(setup.calls.permission, 0);
  assert.equal(h.next('/reminders').body.enabled, true); h.cleanup();
});

test('a reminder response with a newer move updates the board and clears an obsolete draft', async () => {
  const setup = pushBrowser({ permission: 'granted' }); const h = await loaded({ browser: setup.browser });
  h.next('/push-config').resolve({ enabled: true, publicKey: 'B'.repeat(87) }); await settle();
  await h.root.querySelector('[data-rack="0"]').emit('click'); await h.root.querySelector('[data-cell="40"]').emit('click');
  await h.root.querySelector('#pd-duel-push-toggle').emit('click');
  h.next('/reminders').resolve(snapshot({ revision: 2, turns: 1, turnId: 'guest', remindersEnabled: true, reminderRevision: 1 })); await settle();
  assert.equal(h.root.querySelectorAll('.pd-duel-draft').length, 0); assert.match(h.root.html, /Waiting for Guest/u); h.cleanup();
});
