import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../dist/index.js';
import { BattleRoom } from '../dist/battle-room.js';

function environment() {
  const objects = new Map(), counters = new Map();
  let lookups = 0;
  const env = {
    PASSWORD_PEPPER: 'test-word-duel-pepper-at-least-32-characters', IP_HASH_SALT: 'test-word-duel-salt-at-least-32-characters',
    ALLOWED_ORIGINS: 'https://riddlearabia.com', STATIC_ORIGIN: 'https://riddlearabia.com',
    DB: { prepare() { let key; return { bind(value) { key = value; return this; }, async first() { const count = (counters.get(key) || 0) + 1; counters.set(key, count); return { count }; }, async run() { return { success: true }; } }; } },
    BATTLE_ROOMS: {
      idFromName(code) { lookups++; return code; },
      get(code) {
        if (!objects.has(code)) {
          const storage = new Map();
          objects.set(code, new BattleRoom({ storage: {
            async get(key) { return structuredClone(storage.get(key)); }, async put(key, value) { storage.set(key, structuredClone(value)); },
            async deleteAll() { storage.clear(); }, async setAlarm() {},
          } }));
        }
        return objects.get(code);
      },
    },
  };
  return { env, objects, lookups: () => lookups };
}
function req(path, body, origin = 'https://riddlearabia.com') {
  return new Request(`https://api.riddlearabia.com/api/word-duel/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, 'cf-connecting-ip': '192.0.2.25' }, body: JSON.stringify(body) });
}
test('public route supports idempotent creation, private polling, guest join and CORS', async () => {
  const { env, objects } = environment();
  const body = { name: 'Host', lang: 'en', token: 'T'.repeat(43) };
  const first = await worker.fetch(req('create', body), env);
  assert.equal(first.status, 201); assert.equal(first.headers.get('access-control-allow-origin'), 'https://riddlearabia.com');
  const host = await first.json();
  assert.match(host.code, /^[A-HJ-NP-Z2-9]{8}$/u);
  const retry = await worker.fetch(req('create', body), env);
  const retried = await retry.json();
  assert.equal(retry.status, 200); assert.equal(retried.code, host.code); assert.equal(retried.you, host.you); assert.equal(objects.size, 1);
  assert.deepEqual([...objects.keys()], [`word-duel:${host.code}`]);
  const guestResponse = await worker.fetch(req(`${host.code}/join`, { name: 'Guest', token: 'G'.repeat(43) }), env);
  const guest = await guestResponse.json();
  assert.equal(guest.phase, 'playing'); assert.equal(guest.players.length, 2); assert.equal(guest.players[0].rack, undefined);
  const state = await (await worker.fetch(req(`${host.code}/state`, { token: body.token }), env)).json();
  assert.equal(state.you, host.you); assert.equal(state.phase, 'playing');
  const action = await worker.fetch(req(`${host.code}/action`, { token: body.token, revision: state.revision, kind: 'pass' }), env);
  assert.equal(action.status, 200); assert.equal((await action.json()).turnId, guest.you);
  const blocked = await worker.fetch(req(`${host.code}/state`, { token: body.token }, 'https://evil.example'), env);
  assert.equal(blocked.status, 403);
});
test('invalid create payloads never allocate an object, and random-room probes are capped before lookup', async () => {
  const { env, lookups } = environment();
  const invalid = await worker.fetch(req('create', { name: 'Host', lang: 'en', token: 'short' }), env);
  assert.equal(invalid.status, 400); assert.equal(lookups(), 0);
  for (let i = 0; i < 120; i++) {
    const response = await worker.fetch(req('ZZZZ2345/state', { token: 'G'.repeat(43) }), env);
    assert.equal(response.status, 404);
  }
  const before = lookups();
  const response = await worker.fetch(req('ZZZZ2345/state', { token: 'G'.repeat(43) }), env);
  assert.equal(response.status, 429); assert.equal(lookups(), before);
});
