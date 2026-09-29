import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BattleRoom } from '../dist/battle-room.js';

const token = 'T'.repeat(43);
function context() {
  const data = new Map();
  return { data, getWebSockets() { return []; }, storage: {
    async get(key) { return structuredClone(data.get(key)); },
    async put(key, value) { data.set(key, structuredClone(value)); },
    async deleteAll() { data.clear(); },
    async setAlarm(value) { data.set('alarm', value); },
  } };
}
function req(path, body) {
  return new Request(`https://room.internal/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-duel-client-key': 'N'.repeat(43) }, body: JSON.stringify(body) });
}
const duel = { code: 'ABCD2345', lang: 'en', name: 'Host', token };
const battle = { code: 'SCI23456', category: 'science', difficulty: 'all', hostToken: 'host', questions: [{ id: 'science-001', question: { en: 'Question', ar: 'سؤال' }, answer: { en: 'Answer', ar: 'جواب' }, options: { en: ['Answer', 'B', 'C', 'D'], ar: ['جواب', 'ب', 'ج', 'د'] }, correctIndex: 0 }] };

test('Word Duel dispatcher cannot overwrite or delete an existing quiz battle', async () => {
  const ctx = context(), object = new BattleRoom(ctx);
  assert.equal((await object.fetch(req('init', battle))).status, 201);
  const before = structuredClone(ctx.data);
  assert.equal((await object.fetch(req('word-duel/init', duel))).status, 409);
  assert.equal((await object.fetch(req('word-duel/state', { token }))).status, 409);
  assert.deepEqual(ctx.data, before);
  assert.equal(ctx.data.has('word-duel-room'), false);
  await new BattleRoom(ctx).alarm();
  assert.deepEqual(ctx.data.get('room'), before.get('room'));
  assert.equal(ctx.data.get('alarm'), before.get('alarm'));
});

test('legacy initialization cannot overwrite a Word Duel instance or expose its private data', async () => {
  const ctx = context(), object = new BattleRoom(ctx);
  assert.equal((await object.fetch(req('word-duel/init', duel))).status, 201);
  const before = structuredClone(ctx.data);
  assert.equal((await object.fetch(req('init', battle))).status, 409);
  const socketAttempt = await object.fetch(new Request('https://room.internal/connect', { headers: { upgrade: 'websocket', 'x-jakh-client-key': 'N'.repeat(43) } }));
  assert.equal(socketAttempt.status, 404);
  assert.deepEqual(ctx.data, before);
  assert.equal(ctx.data.has('room'), false); // Previous Worker alarms/quiz lookups see no room.
});

test('rehydrated dispatchers preserve live rooms, expire through alarms and recover after cleanup', async () => {
  const ctx = context();
  await new BattleRoom(ctx).fetch(req('word-duel/init', duel));
  const live = ctx.data.get('word-duel-room');
  await new BattleRoom(ctx).alarm();
  assert.deepEqual(ctx.data.get('word-duel-room'), live);
  assert.equal(ctx.data.get('alarm'), live.expiresAt);
  live.expiresAt = Date.now() - 1;
  ctx.data.set('word-duel-room', live);
  await new BattleRoom(ctx).alarm();
  assert.equal(ctx.data.size, 0);
  await new BattleRoom(ctx).alarm(); // A stale alarm after deletion is harmless.
  assert.equal((await new BattleRoom(ctx).fetch(req('word-duel/init', duel))).status, 201);
  assert.equal(ctx.data.get('word-duel-room').kind, 'word-duel');
});

test('access rejects expired rooms even if a previous Worker ignored their alarm', async () => {
  const ctx = context(), object = new BattleRoom(ctx);
  await object.fetch(req('word-duel/init', duel));
  const expired = ctx.data.get('word-duel-room'); expired.expiresAt = Date.now() - 1;
  ctx.data.set('word-duel-room', expired);
  const response = await new BattleRoom(ctx).fetch(req('word-duel/state', { token }));
  assert.equal(response.status, 410); assert.equal(ctx.data.size, 0);
  assert.equal((await object.fetch(req('word-duel/init', duel))).status, 201);
});

test('Word Duel preserves the original deployed classes and migration boundary for rollback', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(config.migrations, [{ tag: 'v1', new_sqlite_classes: ['BattleRoom', 'PasswordHasher'] }]);
  assert.deepEqual(config.durable_objects.bindings, [{ name: 'BATTLE_ROOMS', class_name: 'BattleRoom' }, { name: 'PASSWORD_HASHERS', class_name: 'PasswordHasher' }]);
  const entrypoint = await import('../dist/index.js');
  assert.equal(entrypoint.WordDuelRoom, undefined);
});
