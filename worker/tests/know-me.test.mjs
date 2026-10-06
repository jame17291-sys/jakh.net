import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import worker from '../dist/index.js';
import { BattleRoom } from '../dist/battle-room.js';
import { KnowMeRoom } from '../dist/know-me-room.js';
import { buildKnowMeSelection, cleanKnowMeName, KNOW_ME_TTL_MS, knowMeSnapshot, validateKnowMeAnswers } from '../dist/know-me-rules.js';

const source = JSON.parse(await readFile(new URL('../../data/party-games.json', import.meta.url), 'utf8'));
const choices = source.knowMe.questions.slice(0, 10).map((question, index) => ({ id: question.id, answerIndex: index % 4 }));
const answerKeys = choices.map(question => question.answerIndex);
const hostToken = 'H'.repeat(43), guestToken = 'G'.repeat(43);
const code = 'ABCDEFGH2345';
const createBody = () => ({ token: hostToken, name: 'Host', lang: 'en', questions: structuredClone(choices) });

function context(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getWebSockets: () => [], storage: {
    async get(key) { return structuredClone(data.get(key)); },
    async put(key, value) { data.set(key, structuredClone(value)); },
    async deleteAll() { data.clear(); },
    async setAlarm(value) { data.set('alarm', value); },
  } };
}
function internal(path, body, key = 'N'.repeat(43)) {
  return new Request(`https://quiz.internal/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-know-me-client-key': key }, body: JSON.stringify(body) });
}
async function setup() {
  const ctx = context(), object = new KnowMeRoom(ctx);
  const response = await object.fetch(internal('init', { ...createBody(), code }));
  assert.equal(response.status, 201);
  return { ctx, object, created: await response.json() };
}
function environment() {
  const objects = new Map(), counters = new Map();
  let lookups = 0;
  const env = {
    PASSWORD_PEPPER: 'test-know-me-pepper-at-least-32-characters', IP_HASH_SALT: 'test-know-me-salt-at-least-32-characters',
    ALLOWED_ORIGINS: 'https://riddlearabia.com', STATIC_ORIGIN: 'https://riddlearabia.com',
    DB: { prepare() { let key; return { bind(value) { key = value; return this; }, async first() { const count = (counters.get(key) || 0) + 1; counters.set(key, count); return { count }; }, async run() { return { success: true }; } }; } },
    BATTLE_ROOMS: {
      idFromName(name) { lookups++; return name; },
      get(name) { if (!objects.has(name)) { const ctx = context(); objects.set(name, { ctx, room: new BattleRoom(ctx) }); } return objects.get(name).room; },
    },
  };
  return { env, objects, counters, lookups: () => lookups };
}
function external(path, body, origin = 'https://riddlearabia.com') {
  return new Request(`https://api.riddlearabia.com/api/know-me/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, 'cf-connecting-ip': '192.0.2.25' }, body: JSON.stringify(body) });
}

test('Worker projection exactly matches the canonical bilingual Know Me source', async () => {
  const projected = JSON.parse(await readFile(new URL('../src/know-me-catalog.json', import.meta.url), 'utf8'));
  assert.deepEqual(projected, { version: source.version, questions: source.knowMe.questions });
  assert.equal(projected.questions.length, 60);
  assert.ok(projected.questions.every(question => !Object.hasOwn(question, 'answer') && !Object.hasOwn(question, 'correctIndex')));
  const built = buildKnowMeSelection(choices);
  assert.deepEqual(built.answers, answerKeys);
  built.questions.forEach((question, index) => {
    assert.deepEqual(question.question, source.knowMe.questions[index].text);
    for (const lang of ['en', 'ar']) assert.deepEqual(question.options[lang], source.knowMe.questions[index].options.map(option => option[lang]));
  });
});

test('quiz selection rejects unknown, duplicate, malformed and incomplete question IDs and choices', () => {
  for (const value of [null, {}, [], choices.slice(0, 9), [...choices, choices[0]], [null, ...choices.slice(1)], [[], ...choices.slice(1)], [{ id: 'km-unknown-01', answerIndex: 0 }, ...choices.slice(1)], [choices[1], ...choices.slice(1)]]) {
    assert.throws(() => buildKnowMeSelection(value), { code: 'INVALID_QUIZ_QUESTIONS' });
  }
  for (const value of [null, {}, [], answerKeys.slice(0, 9), [...answerKeys, 0], ['0', ...answerKeys.slice(1)], [NaN, ...answerKeys.slice(1)], [-1, ...answerKeys.slice(1)], [4, ...answerKeys.slice(1)], [0.5, ...answerKeys.slice(1)]]) {
    assert.throws(() => validateKnowMeAnswers(value), { code: 'INVALID_QUIZ_ANSWERS' });
  }
  const invalid = structuredClone(choices); invalid[0].answerIndex = '0';
  assert.throws(() => buildKnowMeSelection(invalid), { code: 'INVALID_QUIZ_ANSWERS' });
});

test('nicknames normalize whitespace, reject markup and enforce a Unicode character bound', () => {
  assert.equal(cleanKnowMeName('  Jameel\u202e\u0000   Player  '), 'Jameel Player');
  assert.equal(cleanKnowMeName('جميل'), 'جميل');
  assert.equal(cleanKnowMeName('😀'.repeat(24)), '😀'.repeat(24));
  for (const name of ['😀'.repeat(25), '<img src=x>', ' ', {}, null]) assert.equal(cleanKnowMeName(name), '');
});

test('two phones get bilingual questions, authoritative score and no private answer material', async () => {
  const { ctx, object, created } = await setup();
  assert.equal(created.role, 'owner'); assert.equal(created.result, null); assert.equal(created.questions.length, 10);
  const publicState = await (await object.fetch(internal('state', { token: guestToken }))).json();
  assert.equal(publicState.role, 'guest'); assert.equal(publicState.result, null);
  assert.deepEqual(publicState.questions, created.questions);
  const result = await (await object.fetch(internal('submit', { token: guestToken, name: 'Friend', answers: answerKeys, score: 99999 }))).json();
  assert.equal(result.role, 'player'); assert.deepEqual(result.result, { score: 10, total: 10, rank: 1 });
  assert.deepEqual(result.leaderboard.map(({ name, score, rank }) => ({ name, score, rank })), [{ name: 'Friend', score: 10, rank: 1 }]);
  for (const snapshot of [created, publicState, result]) {
    const serialized = JSON.stringify(snapshot);
    assert.equal(serialized.includes(hostToken), false); assert.equal(serialized.includes(guestToken), false);
    for (const key of ['answers', 'ownerTokenHash', 'tokenHash', 'correctIndex', 'answerIndex']) assert.equal(serialized.includes(`"${key}"`), false);
  }
  const stored = ctx.data.get('know-me-room');
  assert.deepEqual(stored.answers, answerKeys); assert.notEqual(stored.ownerTokenHash, hostToken);
  assert.notEqual(stored.players[0].tokenHash, guestToken); assert.equal(stored.players[0].answers, undefined);
});

test('lost create and submit responses resume immutable originals without extending retention', async () => {
  const { ctx, object, created } = await setup();
  const original = structuredClone(ctx.data.get('know-me-room'));
  const retryCreate = await object.fetch(internal('init', { ...createBody(), code, name: 'Changed', questions: choices.map(choice => ({ ...choice, answerIndex: 3 })) }));
  assert.equal(retryCreate.status, 200); assert.deepEqual(await retryCreate.json(), created);
  assert.equal(ctx.data.get('know-me-room').expiresAt, original.expiresAt);
  const submitted = await (await object.fetch(internal('submit', { token: guestToken, name: 'Friend', answers: answerKeys }))).json();
  const retried = await (await new KnowMeRoom(ctx).fetch(internal('submit', { token: guestToken, name: 'Changed', answers: Array(10).fill(3) }))).json();
  assert.deepEqual(retried, submitted); assert.equal(ctx.data.get('know-me-room').players.length, 1);
  assert.equal(ctx.data.get('know-me-room').players[0].name, 'Friend');
  assert.equal(ctx.data.get('know-me-room').expiresAt, original.expiresAt);
  assert.equal(original.expiresAt - original.createdAt, KNOW_ME_TTL_MS);
});

test('concurrent submissions from one browser commit one immutable score', async () => {
  const { ctx, object } = await setup();
  const responses = await Promise.all([answerKeys, Array(10).fill(3)].map(answers => object.fetch(internal('submit', { token: guestToken, name: 'Friend', answers }))));
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  const [a, b] = await Promise.all(responses.map(response => response.json()));
  assert.deepEqual(a.result, b.result); assert.equal(a.result.score, 10); assert.equal(ctx.data.get('know-me-room').players.length, 1);
});

test('leaderboard ranks ties equally, never trusts forged scores and remains visible to link holders', async () => {
  const { object } = await setup();
  const wrong = answerKeys.map(answer => (answer + 1) % 4);
  await object.fetch(internal('submit', { token: guestToken, name: 'Wrong', answers: wrong, score: 10 }));
  await object.fetch(internal('submit', { token: 'A'.repeat(43), name: 'Perfect', answers: answerKeys }));
  await object.fetch(internal('submit', { token: 'B'.repeat(43), name: 'Also perfect', answers: answerKeys }));
  const state = await (await object.fetch(internal('state', { token: 'C'.repeat(43) }))).json();
  assert.deepEqual(state.leaderboard.map(player => [player.score, player.rank]), [[10, 1], [10, 1], [0, 3]]);
  assert.equal(state.role, 'guest'); assert.equal(state.result, null);
});

test('invalid or owner submissions do not write scores; participant caps permit retries but stop new players', async () => {
  const { ctx, object } = await setup();
  assert.equal((await object.fetch(internal('submit', { token: hostToken, name: 'Host', answers: answerKeys }))).status, 400);
  assert.equal((await object.fetch(internal('submit', { token: guestToken, name: '', answers: answerKeys }))).status, 400);
  assert.equal((await object.fetch(internal('submit', { token: guestToken, name: 'Friend', answers: [] }))).status, 400);
  assert.equal(ctx.data.get('know-me-room').players.length, 0);
  for (let index = 0; index < 50; index++) {
    const token = `${index}`.padEnd(43, 'T');
    assert.equal((await object.fetch(internal('submit', { token, name: `Player ${index}`, answers: answerKeys }))).status, 200);
  }
  assert.equal(ctx.data.get('know-me-room').players.length, 50);
  assert.equal((await object.fetch(internal('submit', { token: '0'.padEnd(43, 'T') }))).status, 200);
  const full = await object.fetch(internal('submit', { token: guestToken, name: 'Extra', answers: answerKeys }));
  assert.equal(full.status, 409); assert.equal((await full.json()).code, 'QUIZ_FULL');
});

test('close is owner-only, deletes all stored quiz state immediately and permits harmless lost-response retry', async () => {
  const { ctx, object } = await setup();
  const forbidden = await object.fetch(internal('close', { token: guestToken }));
  assert.equal(forbidden.status, 403); assert.equal((await forbidden.json()).code, 'QUIZ_OWNER_REQUIRED');
  assert.ok(ctx.data.has('know-me-room'));
  assert.deepEqual(await (await object.fetch(internal('close', { token: hostToken }))).json(), { closed: true });
  assert.equal(ctx.data.size, 0);
  assert.deepEqual(await (await new KnowMeRoom(ctx).fetch(internal('close', { token: hostToken }))).json(), { closed: true });
  assert.equal((await object.fetch(internal('state', { token: guestToken }))).status, 404);
});

test('the expiry alarm purges answers, names and counters and active alarms retain the fixed deadline', async () => {
  const { ctx, object } = await setup();
  const room = ctx.data.get('know-me-room');
  await object.alarm(); assert.deepEqual(ctx.data.get('know-me-room'), room); assert.equal(ctx.data.get('alarm'), room.expiresAt);
  room.expiresAt = Date.now() - 1; ctx.data.set('know-me-room', room);
  await new KnowMeRoom(ctx).alarm(); assert.equal(ctx.data.size, 0);
  await object.alarm(); assert.equal(ctx.data.size, 0);
});

test('access purges expired rooms even when an old Worker did not handle the alarm', async () => {
  for (const path of ['state', 'submit', 'init', 'close']) {
    const { ctx, object } = await setup();
    const room = ctx.data.get('know-me-room'); room.expiresAt = Date.now(); ctx.data.set('know-me-room', room);
    const response = await object.fetch(internal(path, { ...createBody(), code }));
    assert.equal(response.status, path === 'close' ? 200 : 410); assert.equal(ctx.data.size, 0);
  }
});

test('room-local network limits are bounded, persist across rehydration and recover without renewing expiry', async () => {
  const { ctx, object } = await setup();
  const expiresAt = ctx.data.get('know-me-room').expiresAt;
  ctx.data.set('know-me-rates', { ['N'.repeat(43)]: { start: Date.now(), count: 120 } });
  assert.equal((await new KnowMeRoom(ctx).fetch(internal('state', { token: guestToken }))).status, 429);
  ctx.data.set('know-me-rates', { ['N'.repeat(43)]: { start: Date.now() - 60001, count: 500 } });
  assert.equal((await object.fetch(internal('state', { token: guestToken }))).status, 200);
  assert.equal(ctx.data.get('know-me-rates')['N'.repeat(43)].count, 1); assert.equal(ctx.data.get('know-me-room').expiresAt, expiresAt);
  ctx.data.set('know-me-rates', Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`${index}`.padEnd(43, 'X'), { start: Date.now(), count: 1 }])));
  assert.equal((await object.fetch(internal('state', { token: guestToken }))).status, 429);
  const badHeader = internal('state', { token: guestToken }); badHeader.headers.delete('x-know-me-client-key');
  assert.equal((await object.fetch(badHeader)).status, 403);
});

test('malformed JSON, oversized data, bad paths, absent tokens and wrong methods fail safely', async () => {
  const { object } = await setup();
  for (const token of [undefined, '', 'short', '@'.repeat(43)]) assert.equal((await object.fetch(internal('state', { token }))).status, 403);
  assert.equal((await object.fetch(new Request('https://quiz.internal/state'))).status, 405);
  assert.equal((await object.fetch(internal('hack', { token: hostToken }))).status, 404);
  assert.equal((await object.fetch(internal('state', { token: hostToken, padding: 'x'.repeat(4096) }))).status, 413);
  assert.equal((await object.fetch(new Request('https://quiz.internal/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'null' }))).status, 400);
  const badType = internal('state', { token: hostToken }); badType.headers.set('content-type', 'text/plain');
  assert.equal((await object.fetch(badType)).status, 415);
});

test('initialization validates names, language, code and choices and rejects another owner', async () => {
  for (const override of [{ name: '' }, { lang: 'fr' }, { code: 'invalid' }, { questions: [] }]) {
    const ctx = context(), object = new KnowMeRoom(ctx);
    assert.equal((await object.fetch(internal('init', { ...createBody(), code, ...override }))).status, 400);
    assert.equal(ctx.data.has('know-me-room'), false);
  }
  const { object } = await setup();
  const response = await object.fetch(internal('init', { ...createBody(), code, token: guestToken }));
  assert.equal(response.status, 409); assert.equal((await response.json()).code, 'QUIZ_EXISTS');
});

test('public API creates an isolated quiz, grades guests, resumes and closes through CORS-protected POSTs', async () => {
  const { env, objects } = environment();
  const response = await worker.fetch(external('create', createBody()), env);
  assert.equal(response.status, 201); assert.equal(response.headers.get('access-control-allow-origin'), 'https://riddlearabia.com');
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const created = await response.json(); assert.match(created.code, /^[A-HJ-NP-Z2-9]{12}$/u);
  const retry = await worker.fetch(external('create', createBody()), env); assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), created);
  assert.deepEqual([...objects.keys()], [`know-me:${created.code}`]);
  const state = await (await worker.fetch(external(`${created.code}/state`, { token: guestToken }), env)).json(); assert.equal(state.role, 'guest');
  const result = await (await worker.fetch(external(`${created.code}/submit`, { token: guestToken, name: 'Friend', answers: answerKeys }), env)).json(); assert.equal(result.result.score, 10);
  const owner = await (await worker.fetch(external(`${created.code}/state`, { token: hostToken }), env)).json(); assert.equal(owner.role, 'owner'); assert.equal(owner.leaderboard.length, 1);
  const closed = await worker.fetch(external(`${created.code}/close`, { token: hostToken }), env); assert.deepEqual(await closed.json(), { closed: true });
  assert.equal(objects.values().next().value.ctx.data.size, 0);
});

test('invalid public inputs and origins never allocate objects; unknown-code probes have a network limit', async () => {
  const { env, lookups } = environment();
  for (const body of [{ ...createBody(), token: 'short' }, { ...createBody(), name: '<img>' }, { ...createBody(), lang: 'fr' }, { ...createBody(), questions: [] }]) assert.ok([400, 403].includes((await worker.fetch(external('create', body), env)).status));
  assert.equal((await worker.fetch(external('BAD/state', { token: guestToken }), env)).status, 404);
  assert.equal((await worker.fetch(external('create', { ...createBody(), extra: 'x'.repeat(4096) }), env)).status, 413);
  assert.equal(lookups(), 0);
  for (const origin of [null, 'null', 'https://evil.example', 'https://riddlearabia.com.evil.example']) {
    const request = external(`${code}/state`, { token: guestToken }); if (origin === null) request.headers.delete('origin'); else request.headers.set('origin', origin);
    assert.equal((await worker.fetch(request, env)).status, 403);
  }
  assert.equal(lookups(), 0);
  for (let index = 0; index < 120; index++) assert.equal((await worker.fetch(external(`${code}/state`, { token: guestToken }), env)).status, 404);
  const before = lookups(); assert.equal((await worker.fetch(external(`${code}/state`, { token: guestToken }), env)).status, 429); assert.equal(lookups(), before);
});

test('public creation caps run before lookup, unsupported methods and unavailable bindings return clear errors', async () => {
  const { env, lookups } = environment();
  for (let index = 0; index < 12; index++) assert.ok([200, 201].includes((await worker.fetch(external('create', createBody()), env)).status));
  const before = lookups(); assert.equal((await worker.fetch(external('create', createBody()), env)).status, 429); assert.equal(lookups(), before);
  assert.equal((await worker.fetch(new Request('https://api.riddlearabia.com/api/know-me/create'), env)).status, 405);
  const unavailable = await worker.fetch(external('create', createBody()), { ...env, BATTLE_ROOMS: undefined });
  assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).code, 'KNOW_ME_UNAVAILABLE');
  const missingBody = external(`${code}/state?token=${guestToken}`, {}); assert.equal((await worker.fetch(missingBody, env)).status, 403);
});

test('Know Me dispatch cannot overwrite Battle or Word Duel, and those games cannot access a quiz', async () => {
  const existingBattle = { code: 'SCI23456', category: 'science', questions: [] };
  const existingDuel = { kind: 'word-duel', code: 'ABCD2345', expiresAt: Date.now() + 100000 };
  for (const original of [{ room: existingBattle }, { 'word-duel-room': existingDuel }]) {
    const ctx = context(original), object = new BattleRoom(ctx), before = structuredClone(ctx.data);
    assert.equal((await object.fetch(internal('know-me/init', { ...createBody(), code }))).status, 409);
    assert.equal((await object.fetch(internal('know-me/state', { token: guestToken }))).status, 409);
    assert.deepEqual(ctx.data, before);
  }
  const ctx = context(), object = new BattleRoom(ctx);
  assert.equal((await object.fetch(internal('know-me/init', { ...createBody(), code }))).status, 201);
  const before = structuredClone(ctx.data);
  assert.equal((await object.fetch(internal('word-duel/init', { token: hostToken }))).status, 409);
  assert.equal((await object.fetch(internal('init', {}))).status, 409);
  assert.equal((await object.fetch(new Request('https://quiz.internal/connect', { headers: { upgrade: 'websocket', 'x-jakh-client-key': 'N'.repeat(43) } }))).status, 404);
  assert.deepEqual(ctx.data, before);
  await new BattleRoom(ctx).alarm(); assert.deepEqual(ctx.data, before);
  const room = ctx.data.get('know-me-room'); room.expiresAt = Date.now() - 1; ctx.data.set('know-me-room', room);
  await new BattleRoom(ctx).alarm(); assert.equal(ctx.data.size, 0);
});

test('concurrent dispatches cannot initialize two game kinds in the same object', async () => {
  const ctx = context(), object = new BattleRoom(ctx);
  const duelRequest = internal('word-duel/init', { name: 'Host', token: hostToken, code: 'ABCD2345', lang: 'en' }); duelRequest.headers.set('x-duel-client-key', 'N'.repeat(43));
  const responses = await Promise.all([object.fetch(internal('know-me/init', { ...createBody(), code })), object.fetch(duelRequest)]);
  assert.deepEqual(responses.map(response => response.status), [201, 409]);
  assert.equal(ctx.data.has('know-me-room'), true); assert.equal(ctx.data.has('word-duel-room'), false);
});

test('new game preserves deployed Durable Object classes and migration boundary for Worker rollback', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(config.migrations, [{ tag: 'v1', new_sqlite_classes: ['BattleRoom', 'PasswordHasher'] }]);
  assert.deepEqual(config.durable_objects.bindings, [{ name: 'BATTLE_ROOMS', class_name: 'BattleRoom' }, { name: 'PASSWORD_HASHERS', class_name: 'PasswordHasher' }]);
  const entrypoint = await import('../dist/index.js'); assert.equal(entrypoint.KnowMeRoom, undefined);
});
