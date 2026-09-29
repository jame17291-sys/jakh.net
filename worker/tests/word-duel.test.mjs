import assert from 'node:assert/strict';
import test from 'node:test';
import { WordDuelRoom } from '../dist/word-duel-room.js';
import { makeDeck, normalizeWord, playAction, privateSnapshot, scorePlacement, vocabulary } from '../dist/word-duel-rules.js';

function room(overrides = {}) {
  return { code: 'ABCD2345', lang: 'en', board: Array(81).fill(null),
    players: [{ id: 'p1', name: 'One', tokenHash: 'secret1', rack: [...'catersn'], score: 0 }, { id: 'p2', name: 'Two', tokenHash: 'secret2', rack: [...'dogseat'], score: 0 }],
    bag: [...'aaeeiissttnn'], phase: 'playing', turn: 0, revision: 1, scoreless: 0, turns: 0, expiresAt: Date.now() + 100000, createdAt: Date.now(), lastMove: null, ...overrides };
}
const cat = [{ row: 4, col: 3, letter: 'c' }, { row: 4, col: 4, letter: 'a' }, { row: 4, col: 5, letter: 't' }];
test('opening words cover center, consume a private rack and score the word bonus once', () => {
  const initial = room();
  const next = playAction(initial, 'p1', { revision: 1, kind: 'place', placements: cat });
  assert.equal(next.players[0].score, 10);
  assert.deepEqual(next.board.slice(39, 42), ['c', 'a', 't']);
  assert.equal(next.players[0].rack.length, 7);
  assert.equal(next.bag.length, initial.bag.length - 3);
  assert.equal(next.turn, 1);
  assert.equal(next.revision, 2);
  assert.deepEqual(initial.board, Array(81).fill(null));
  assert.throws(() => scorePlacement(initial, initial.players[0], cat.map(p => ({ ...p, row: 3 }))), { code: 'CENTER_REQUIRED' });
});
test('turns, stale revisions and client-crafted letters are rejected without mutating state', () => {
  const initial = room();
  assert.throws(() => playAction(initial, 'p2', { revision: 1, kind: 'pass' }), { code: 'NOT_YOUR_TURN' });
  assert.throws(() => playAction(initial, 'p1', { revision: 0, kind: 'pass' }), { code: 'STALE_REVISION' });
  assert.throws(() => scorePlacement(initial, initial.players[0], [{ row: 4, col: 4, letter: 'z' }]), { code: 'MISSING_TILE' });
  assert.throws(() => scorePlacement(initial, initial.players[0], [cat[0], { ...cat[0], letter: 'a' }]), { code: 'OCCUPIED_CELL' });
  assert.throws(() => scorePlacement(initial, initial.players[0], [{ ...cat[0], row: 9 }]), { code: 'INVALID_TILES' });
  assert.equal(initial.revision, 1);
});
test('all cross words are validated, disconnected plays and gaps are rejected', () => {
  const initial = playAction(room(), 'p1', { revision: 1, kind: 'place', placements: cat });
  const player = initial.players[1];
  const at = scorePlacement(initial, player, [{ row: 5, col: 4, letter: 't' }]);
  assert.deepEqual(at.words, ['at']);
  assert.equal(at.score, 2); // center multiplier is consumed by the first move
  assert.throws(() => scorePlacement(initial, player, [{ row: 5, col: 4, letter: 'd' }]), { code: 'WORD_NOT_LISTED' });
  assert.throws(() => scorePlacement(initial, player, [{ row: 0, col: 0, letter: 'd' }, { row: 0, col: 1, letter: 'o' }, { row: 0, col: 2, letter: 'g' }]), { code: 'NOT_CONNECTED' });
  assert.throws(() => scorePlacement(initial, player, [{ row: 5, col: 4, letter: 'd' }, { row: 5, col: 6, letter: 'o' }]), { code: 'GAP' });
  assert.throws(() => scorePlacement(initial, player, [{ row: 5, col: 4, letter: 'd' }, { row: 6, col: 5, letter: 'o' }]), { code: 'NOT_STRAIGHT' });
  const cross = room();
  cross.board[31] = 'a'; cross.board[49] = 'a';
  assert.throws(() => scorePlacement(cross, cross.players[0], cat), { code: 'WORD_NOT_LISTED' }); // cat valid; aaa is not
});
test('Arabic uses the same authoritative rules and normalized letter vocabulary', () => {
  const initial = room({ lang: 'ar' });
  initial.players[0].rack = [...'قمراستن'];
  const placements = [...'قمر'].map((letter, index) => ({ row: 4, col: 3 + index, letter }));
  assert.deepEqual(scorePlacement(initial, initial.players[0], placements).words, ['قمر']);
  assert.equal(normalizeWord('أَرْض', 'ar'), 'ارض');
  assert.ok(vocabulary('ar').includes('ارض'));
  assert.ok(vocabulary('en').includes('cat'));
  for (const lang of ['en', 'ar']) {
    const deck = makeDeck(lang);
    assert.equal(deck.racks.length, 2);
    for (const rack of deck.racks) {
      assert.equal(rack.length, 7);
      assert.ok(vocabulary(lang).some(word => word.length === 3 && [...word].every((letter, index, letters) => rack.filter(l => l === letter).length >= letters.filter(l => l === letter).length)));
    }
  }
});
test('exchanges cannot duplicate tiles and scoreless turns finish with rack deductions', () => {
  const initial = room();
  assert.throws(() => playAction(initial, 'p1', { kind: 'swap', revision: 1, indices: [0, 0] }), { code: 'INVALID_SWAP' });
  const swapped = playAction(initial, 'p1', { kind: 'swap', revision: 1, indices: [0, 1] });
  const all = state => [...state.bag, ...state.players.flatMap(p => p.rack)].sort();
  assert.deepEqual(all(swapped), all(initial));
  let next = swapped;
  for (let i = 0; i < 5; i++) next = playAction(next, next.players[next.turn].id, { kind: 'pass', revision: next.revision });
  assert.equal(next.phase, 'finished');
  assert.equal(next.reason, 'scoreless');
  assert.ok(next.players.every(p => p.score < 0));
  assert.throws(() => playAction(next, 'p1', { kind: 'pass', revision: next.revision }), { code: 'NOT_PLAYING' });
});
test('empty bag and empty rack ends game, deducts remaining letters and transfers points', () => {
  const initial = room({ bag: [] }); initial.players[0].rack = [...'cat']; initial.players[1].rack = ['z'];
  const result = playAction(initial, 'p1', { kind: 'place', revision: 1, placements: cat });
  assert.equal(result.phase, 'finished'); assert.equal(result.reason, 'empty-rack');
  assert.equal(result.players[0].score, 18); assert.equal(result.players[1].score, -8);
  assert.equal(result.winnerId, 'p1');
});
test('private snapshots reveal neither opponent letters nor bag nor resume hashes', () => {
  const data = privateSnapshot(room(), 'p1');
  assert.deepEqual(data.rack, [...'catersn']);
  assert.equal(data.players[1].tiles, 7);
  assert.equal(data.players[1].rack, undefined);
  assert.equal(data.players[0].tokenHash, undefined);
  assert.equal(data.bag, undefined);
  assert.equal(JSON.stringify(data).includes('secret'), false);
  assert.throws(() => privateSnapshot(room(), 'outsider'), { code: 'UNAUTHORIZED' });
});

function context() {
  const data = new Map();
  return { data, storage: { async get(key) { return structuredClone(data.get(key)); }, async put(key, value) { data.set(key, structuredClone(value)); }, async deleteAll() { data.clear(); }, async setAlarm(value) { data.set('alarm', value); } } };
}
const hostToken = 'A'.repeat(43), guestToken = 'B'.repeat(43);
function request(path, body, key = 'C'.repeat(43)) { return new Request(`https://word-duel.internal/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-duel-client-key': key }, body: JSON.stringify(body) }); }
async function pair() {
  const ctx = context(), object = new WordDuelRoom(ctx);
  const host = await (await object.fetch(request('init', { code: 'ABCD2345', name: '<Host>', lang: 'en', token: hostToken }))).json();
  const guest = await (await object.fetch(request('join', { name: 'Guest', token: guestToken }))).json();
  return { ctx, object, host, guest };
}
test('two devices join, retries resume same seats, third players and token forgery fail', async () => {
  const { ctx, object, host, guest } = await pair();
  assert.equal(host.phase, 'waiting'); assert.equal(guest.phase, 'playing');
  const retry = await (await object.fetch(request('join', { name: 'Retry', token: guestToken }))).json();
  assert.equal(retry.you, guest.you); assert.equal(retry.players.length, 2);
  assert.equal((await object.fetch(request('join', { name: 'Third', token: 'D'.repeat(43) }))).status, 409);
  assert.equal((await object.fetch(request('state', { token: 'D'.repeat(43) }))).status, 403);
  const restored = new WordDuelRoom(ctx);
  const snapshot = await (await restored.fetch(request('state', { token: hostToken }))).json();
  assert.equal(snapshot.you, host.you);
  assert.equal(snapshot.players[1].rack, undefined);
  const stored = ctx.data.get('room');
  assert.notEqual(stored.players[0].tokenHash, hostToken);
});
test('concurrent same-revision submissions commit exactly one move', async () => {
  const { object } = await pair();
  const responses = await Promise.all([1, 2].map(() => object.fetch(request('action', { token: hostToken, revision: 1, kind: 'pass' }))));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
  const state = await (await object.fetch(request('state', { token: hostToken }))).json();
  assert.equal(state.revision, 2); assert.equal(state.turns, 1);
});
test('malformed JSON, oversized messages, expiry and request floods fail safely', async () => {
  const { ctx, object } = await pair();
  const malformed = await object.fetch(new Request('https://word-duel.internal/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' }));
  assert.equal(malformed.status, 400);
  assert.equal((await object.fetch(request('state', { token: hostToken, extra: 'x'.repeat(5000) }))).status, 413);
  let response;
  for (let i = 0; i < 61; i++) response = await object.fetch(request('state', { token: hostToken }, 'Z'.repeat(43)));
  assert.equal(response.status, 429);
  const stored = ctx.data.get('room'); stored.expiresAt = Date.now() - 1; ctx.data.set('room', stored);
  assert.equal((await object.fetch(request('state', { token: hostToken }))).status, 410);
  assert.equal(ctx.data.has('room'), false);
});
test('expiry alarm purges both room and network counters', async () => {
  const { ctx } = await pair();
  const stored = ctx.data.get('room'); stored.expiresAt = Date.now() - 1; ctx.data.set('room', stored);
  await new WordDuelRoom(ctx).alarm();
  assert.equal(ctx.data.size, 0);
});
