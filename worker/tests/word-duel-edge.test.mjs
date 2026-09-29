import assert from 'node:assert/strict';
import test from 'node:test';
import { BattleRoom } from '../dist/battle-room.js';
import { cleanDuelName } from '../dist/word-duel-room.js';
import { makeDeck, playAction, scorePlacement, vocabulary, letterValue } from '../dist/word-duel-rules.js';

function room(overrides = {}) {
  return { kind: 'word-duel', code: 'ABCD2345', lang: 'en', board: Array(81).fill(null),
    players: [{ id: 'host', name: 'Host', tokenHash: 'hash-a', rack: [...'catersn'], score: 0 }, { id: 'guest', name: 'Guest', tokenHash: 'hash-b', rack: [...'dogseat'], score: 0 }],
    bag: [...'aaeeiissttnn'], phase: 'playing', turn: 0, revision: 1, scoreless: 0, turns: 0, expiresAt: Date.now() + 86400000, createdAt: Date.now(), lastMove: null, ...overrides };
}
function context() {
  const data = new Map();
  return { data, getWebSockets: () => [], storage: { async get(key) { return structuredClone(data.get(key)); }, async put(key, value) { data.set(key, structuredClone(value)); }, async deleteAll() { data.clear(); }, async setAlarm(value) { data.set('alarm', value); } } };
}
const hostToken = 'H'.repeat(43), guestToken = 'G'.repeat(43);
function request(path, body, key = 'N'.repeat(43)) { return new Request(`https://duel.internal/word-duel/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-duel-client-key': key }, body: JSON.stringify(body) }); }
async function setup(lang = 'en') {
  const ctx = context(), object = new BattleRoom(ctx);
  const host = await (await object.fetch(request('init', { code: 'ABCD2345', name: 'Host', token: hostToken, lang }))).json();
  const guest = await (await object.fetch(request('join', { name: 'Guest', token: guestToken }))).json();
  return { ctx, object, host, guest };
}

test('concurrent creators and joiners reserve one host and exactly one guest', async () => {
  const ctx = context(), object = new BattleRoom(ctx);
  const create = () => request('init', { code: 'ABCD2345', name: 'Host', token: hostToken, lang: 'en' });
  const created = await Promise.all([object.fetch(create()), object.fetch(create())]);
  assert.deepEqual(created.map(r => r.status), [201, 200]);
  const [a, b] = await Promise.all(created.map(r => r.json())); assert.equal(a.you, b.you); assert.deepEqual(a.rack, b.rack);
  const joined = await Promise.all([guestToken, 'Q'.repeat(43)].map(token => object.fetch(request('join', { name: 'Guest', token }))));
  assert.deepEqual(joined.map(r => r.status), [200, 409]);
  const stored = ctx.data.get('word-duel-room'); assert.equal(stored.players.length, 2); assert.equal(stored.revision, 1);
  const retry = await (await object.fetch(request('join', { name: 'Changed', token: guestToken }))).json();
  assert.equal(retry.players[1].name, 'Guest'); assert.equal(retry.revision, 1);
});
test('same-revision move replay through the dispatcher never spends a second turn', async () => {
  const { ctx, object, host, guest } = await setup();
  const submit = token => object.fetch(request('action', { kind: 'pass', revision: 1, token, playerId: guest.you, score: 999999 }));
  const concurrent = await Promise.all([submit(hostToken), submit(hostToken), submit(guestToken)]);
  assert.deepEqual(concurrent.map(r => r.status), [200, 400, 400]);
  const state = ctx.data.get('word-duel-room'); assert.equal(state.turns, 1); assert.equal(state.turn, 1); assert.equal(state.revision, 2);
  assert.equal(state.lastMove.playerId, host.you); assert.equal(state.players[0].score, 0);
  const forged = await object.fetch(request('action', { kind: 'resign', revision: 2, token: 'F'.repeat(43), playerId: guest.you }));
  assert.equal(forged.status, 403); assert.deepEqual(ctx.data.get('word-duel-room'), state);
});
test('boundary coordinates, rack duplication, invalid words and forged score fields are atomic', () => {
  const initial = room(); const before = structuredClone(initial);
  const attempts = [
    { placements: [{ row: -1, col: 4, letter: 'a' }], code: 'INVALID_TILES' },
    { placements: [{ row: 4, col: 9, letter: 'a' }], code: 'INVALID_TILES' },
    { placements: [{ row: '4', col: 4, letter: 'a' }], code: 'INVALID_TILES' },
    { placements: [{ row: 4, col: 4, letter: 'ab' }], code: 'INVALID_TILES' },
    { placements: [{ row: 4, col: 4, letter: 'a' }, { row: 4, col: 5, letter: 'a' }], code: 'MISSING_TILE' },
    { placements: [{ row: 4, col: 4, letter: 'c' }, { row: 4, col: 5, letter: 'n' }], code: 'WORD_NOT_LISTED' },
    { placements: [{ row: 4, col: 4, letter: 'a' }], code: 'WORD_TOO_SHORT' },
  ];
  for (const { placements, code } of attempts) {
    assert.throws(() => playAction(initial, 'host', { revision: 1, kind: 'place', placements, score: 100000, rack: [...'zzzzzzz'] }), { code });
    assert.deepEqual(initial, before);
  }
  assert.throws(() => playAction(initial, 'host', { revision: '1', kind: 'pass' }), { code: 'STALE_REVISION' });
  assert.throws(() => playAction(initial, 'host', { revision: 1, kind: 'hack' }), { code: 'INVALID_ACTION' });
  const edge = room(); edge.board[8] = 'a';
  assert.throws(() => scorePlacement(edge, edge.players[0], [{ row: 1, col: 0, letter: 't' }]), { code: 'NOT_CONNECTED' });
});
test('a single crossing letter scores both words and seven-tile play awards its exact bonus', () => {
  const crossed = room(); crossed.board[39] = 'c'; crossed.board[41] = 't'; crossed.board[31] = 'b'; crossed.board[49] = 'r';
  const result = scorePlacement(crossed, crossed.players[0], [{ row: 4, col: 4, letter: 'a' }]);
  assert.deepEqual(result.words, ['cat', 'bar']); assert.equal(result.score, 20);
  const seven = room(); seven.players[0].rack = [...'reading'];
  const reading = [...'reading'].map((letter, i) => ({ row: 4, col: 1 + i, letter }));
  assert.equal(scorePlacement(seven, seven.players[0], reading).score, 33);
  const extend = room(); extend.board[39] = 'c'; extend.board[40] = 'a'; extend.board[41] = 'r';
  assert.equal(scorePlacement(extend, extend.players[0], [{ row: 4, col: 6, letter: 't' }]).score, 6);
});
test('exchange checks bag size and exact indices, and never redraws returned tiles in the same exchange', () => {
  const initial = room({ bag: [...'zzzzzzz'] });
  const next = playAction(initial, 'host', { kind: 'swap', revision: 1, indices: [0, 2, 5] });
  assert.equal(next.players[0].rack.filter(letter => letter === 'z').length, 3);
  assert.deepEqual([...next.bag, ...next.players[0].rack].sort(), [...initial.bag, ...initial.players[0].rack].sort());
  for (const indices of [[], [-1], [7], [0, 0], ['0'], null]) assert.throws(() => playAction(initial, 'host', { kind: 'swap', revision: 1, indices }), { code: 'INVALID_SWAP' });
  assert.throws(() => playAction(room({ bag: [...'aaaaaa'] }), 'host', { kind: 'swap', revision: 1, indices: [0] }), { code: 'BAG_TOO_SMALL' });
});
test('resignation works off-turn, ties are explicit, and the 80-move cap ends exactly once', () => {
  const initial = room(); initial.players[0].score = 20; initial.players[1].score = 10;
  const resign = playAction(initial, 'guest', { revision: 1, kind: 'resign' }, 1000);
  assert.equal(resign.phase, 'finished'); assert.equal(resign.winnerId, 'host'); assert.equal(resign.reason, 'resigned');
  assert.equal(resign.players[0].score, 20); assert.equal(resign.players[1].score, 10); assert.equal(resign.expiresAt, 3601000);
  assert.throws(() => playAction(resign, 'guest', { revision: 2, kind: 'resign' }), { code: 'NOT_PLAYING' });
  const tied = room({ scoreless: 5 }); tied.players[1].rack = [...tied.players[0].rack];
  const end = playAction(tied, 'host', { revision: 1, kind: 'pass' });
  assert.equal(end.winnerId, null); assert.equal(end.phase, 'finished'); assert.equal(end.reason, 'scoreless');
  const capped = playAction(room({ turns: 79 }), 'host', { revision: 1, kind: 'pass' });
  assert.equal(capped.phase, 'finished'); assert.equal(capped.turns, 80); assert.equal(capped.reason, 'turn-limit');
});
test('polling and join retries never extend expiry and exact-deadline requests delete all state', async () => {
  const { ctx, object } = await setup('ar');
  const before = ctx.data.get('word-duel-room').expiresAt;
  await object.fetch(request('state', { token: hostToken }));
  await object.fetch(request('join', { name: 'Retry', token: guestToken }));
  assert.equal(ctx.data.get('word-duel-room').expiresAt, before);
  const expired = ctx.data.get('word-duel-room'); expired.expiresAt = Date.now(); ctx.data.set('word-duel-room', expired);
  const response = await object.fetch(request('action', { token: hostToken, revision: 1, kind: 'pass' }));
  assert.equal(response.status, 410); assert.equal(ctx.data.size, 0);
});
test('room rate limits survive rehydration and old windows recover without renewing room expiry', async () => {
  const { ctx, object } = await setup();
  ctx.data.set('word-duel-rates', { ['N'.repeat(43)]: { start: Date.now(), count: 60 } });
  assert.equal((await new BattleRoom(ctx).fetch(request('state', { token: hostToken }))).status, 429);
  const expires = ctx.data.get('word-duel-room').expiresAt;
  ctx.data.set('word-duel-rates', { ['N'.repeat(43)]: { start: Date.now() - 60001, count: 100 } });
  assert.equal((await object.fetch(request('state', { token: hostToken }))).status, 200);
  assert.equal(ctx.data.get('word-duel-rates')['N'.repeat(43)].count, 1); assert.equal(ctx.data.get('word-duel-room').expiresAt, expires);
  const malformed = request('state', { token: hostToken }); malformed.headers.delete('x-duel-client-key');
  assert.equal((await object.fetch(malformed)).status, 403);
});
test('names discard directional controls and keep at most twenty Unicode characters', () => {
  assert.equal(cleanDuelName('  Host\u202e\u0000   Player  '), 'Host Player');
  assert.equal([...cleanDuelName('😀'.repeat(21))].length, 20); assert.equal(cleanDuelName({ name: 'Host' }), '');
});

function availableMove(state) {
  const rack = state.players[state.turn].rack;
  for (const word of vocabulary(state.lang)) {
    if (word.length < 2 || word.length > 9) continue;
    for (const vertical of [false, true]) for (let row = 0; row < 9; row++) for (let col = 0; col < 9; col++) {
      if ((vertical ? row : col) + word.length > 9) continue;
      const spare = [...rack], placements = []; let possible = true;
      for (let index = 0; index < word.length; index++) {
        const r = row + (vertical ? index : 0), c = col + (vertical ? 0 : index), occupied = state.board[r * 9 + c], letter = word[index];
        if (occupied) { if (occupied !== letter) { possible = false; break; } }
        else { const tile = spare.indexOf(letter); if (tile < 0) { possible = false; break; } spare.splice(tile, 1); placements.push({ row: r, col: c, letter }); }
      }
      if (!possible || !placements.length) continue;
      try { scorePlacement(state, state.players[state.turn], placements); return placements; } catch { /* Try another legal word. */ }
    }
  }
  return null;
}
test('complete English and Arabic games preserve every tile and finish within the advertised limit', () => {
  for (const lang of ['en', 'ar']) {
    const deck = makeDeck(lang); let state = room({ lang, bag: deck.bag });
    state.players.forEach((player, index) => { player.rack = deck.racks[index]; });
    const inventory = s => [...s.board.filter(Boolean), ...s.bag, ...s.players.flatMap(p => p.rack)].sort();
    const original = inventory(state); let placements = 0;
    while (state.phase === 'playing') {
      const move = availableMove(state);
      const before = structuredClone(state);
      const action = move ? { kind: 'place', placements: move } : { kind: 'pass' };
      const active = state.players[state.turn];
      state = playAction(state, active.id, { ...action, revision: state.revision });
      if (move) placements++;
      assert.deepEqual(inventory(state), original, `${lang}: no tiles are duplicated or lost`);
      assert.equal(state.revision, before.revision + 1); assert.equal(state.turns, before.turns + 1);
      assert.ok(state.players.every(player => player.rack.length <= 7));
      assert.ok(state.turns <= 80);
    }
    assert.ok(placements > 0, `${lang}: game includes successful word placement`);
    assert.equal(state.phase, 'finished'); assert.ok(['scoreless', 'empty-rack', 'turn-limit'].includes(state.reason));
    const scores = state.players.map(p => p.score); assert.ok(scores.every(Number.isInteger));
    if (state.winnerId) assert.equal(state.winnerId, state.players[scores[0] > scores[1] ? 0 : 1].id);
  }
});
