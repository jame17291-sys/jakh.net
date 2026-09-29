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

test('creation and join limits run before room allocation and unauthenticated JSON is bounded', async () => {
  const { env, lookups } = environment();
  const body = { name: 'Host', lang: 'en', token: 'T'.repeat(43) };
  for (let i = 0; i < 12; i++) assert.ok([200, 201].includes((await worker.fetch(req('create', body), env)).status));
  const afterCreate = lookups();
  assert.equal((await worker.fetch(req('create', body), env)).status, 429); assert.equal(lookups(), afterCreate);
  for (let i = 0; i < 30; i++) assert.equal((await worker.fetch(req('ZZZZ2345/join', { name: 'Guest', token: 'G'.repeat(43) }), env)).status, 404);
  const afterJoin = lookups();
  assert.equal((await worker.fetch(req('ZZZZ2345/join', { name: 'Guest', token: 'G'.repeat(43) }), env)).status, 429); assert.equal(lookups(), afterJoin);
  const fresh = environment();
  const huge = await worker.fetch(req('create', { ...body, padding: 'x'.repeat(4096) }), fresh.env);
  assert.equal(huge.status, 413); assert.equal(fresh.lookups(), 0);
  const wrongType = req('create', body); wrongType.headers.set('content-type', 'text/plain');
  assert.equal((await worker.fetch(wrongType, fresh.env)).status, 415); assert.equal(fresh.lookups(), 0);
});
test('CORS rejects foreign or absent origins before reaching private room storage', async () => {
  const { env, lookups } = environment();
  for (const origin of [null, 'null', 'https://evil.example', 'https://riddlearabia.com.evil.example']) {
    const request = req('ABCD2345/state', { token: 'T'.repeat(43) });
    if (origin === null) request.headers.delete('origin'); else request.headers.set('origin', origin);
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 403); assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(lookups(), 0);
  const preflight = origin => new Request('https://api.riddlearabia.com/api/word-duel/create', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  const allowed = await worker.fetch(preflight('https://riddlearabia.com'), env);
  assert.equal(allowed.status, 204); assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://riddlearabia.com');
  assert.equal((await worker.fetch(preflight('https://evil.example'), env)).status, 403);
});
test('state requires the token in its private POST body and responses prohibit caching', async () => {
  const { env } = environment(), token = 'T'.repeat(43);
  const created = await worker.fetch(req('create', { name: '<img src=x onerror=alert(1)>', lang: 'ar', token }), env);
  const host = await created.json();
  assert.equal(created.headers.get('cache-control'), 'no-store'); assert.equal(created.headers.get('x-content-type-options'), 'nosniff');
  const missing = await worker.fetch(req(`${host.code}/state?token=${token}`, {}), env);
  assert.equal(missing.status, 403);
  const polling = await worker.fetch(req(`${host.code}/state`, { token }), env);
  const snapshot = await polling.json();
  assert.equal(polling.headers.get('cache-control'), 'no-store');
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes(token), false); assert.equal(serialized.includes('tokenHash'), false); assert.equal(Object.hasOwn(snapshot, 'bag'), false);
  assert.equal(snapshot.players[0].rack, undefined);
});
