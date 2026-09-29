import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createECDH, createDecipheriv, createPublicKey, generateKeyPairSync, hkdfSync, verify } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { BattleRoom } from '../dist/battle-room.js';
import { rematchAction, vocabulary, normalizeWord, scorePlacement, privateSnapshot } from '../dist/word-duel-rules.js';
import { base64url, encryptPush, pushConfigured, pushReady, sendDuelPush, validateSubscription, vapidAuthorization } from '../dist/word-duel-push.js';
const hostToken = 'H'.repeat(43), guestToken = 'G'.repeat(43);
const keyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = keyPair.privateKey.export({ format: 'jwk' });
const config = { VAPID_PUBLIC_KEY: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url'), VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: 'mailto:qa@example.test' };
function receiver(endpoint = 'https://fcm.googleapis.com/fcm/send/test-device') {
  const client = createECDH('prime256v1'); client.generateKeys();
  return { client, subscription: { endpoint, keys: { p256dh: client.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 19).toString('base64url') } } };
}
function decrypt(receiver, bytes) {
  const body = Buffer.from(bytes), salt = body.subarray(0, 16), serverKey = body.subarray(21, 86);
  assert.equal(body.readUInt32BE(16), 4096); assert.equal(body[20], 65);
  const shared = receiver.client.computeSecret(serverKey);
  const ikm = Buffer.from(hkdfSync('sha256', shared, Buffer.from(receiver.subscription.keys.auth, 'base64url'), Buffer.concat([Buffer.from('WebPush: info\0'), receiver.client.getPublicKey(), serverKey]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce); decipher.setAuthTag(body.subarray(-16));
  const result = Buffer.concat([decipher.update(body.subarray(86, -16)), decipher.final()]);
  assert.equal(result.at(-1), 2); return result.subarray(0, -1).toString();
}
function context() {
  const data = new Map();
  return { data, getWebSockets() { return []; }, storage: { async get(key) { return structuredClone(data.get(key)); }, async put(key, value) { data.set(key, structuredClone(value)); }, async deleteAll() { data.clear(); }, async setAlarm(value) { data.set('alarm', value); } } };
}
function request(path, body) { return new Request(`https://duel.internal/word-duel/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-duel-client-key': 'N'.repeat(43) }, body: JSON.stringify(body) }); }
async function pair(settings = config) {
  const ctx = context(), object = new BattleRoom(ctx, settings);
  const host = await (await object.fetch(request('init', { code: 'ABCD2345', name: 'Host', lang: 'en', token: hostToken }))).json();
  const guest = await (await object.fetch(request('join', { name: 'Guest', token: guestToken }))).json();
  return { ctx, object, host, guest };
}
async function call(object, path, token, values = {}) { const response = await object.fetch(request(path, { token, ...values })); return { status: response.status, data: await response.json() }; }
async function finish(object) { return (await call(object, 'action', hostToken, { kind: 'resign', revision: 1 })).data; }
function due(ctx) { const room = ctx.data.get('word-duel-room'); for (const reminder of Object.values(room.reminders || {})) if (reminder.pending) reminder.pending.nextAt = Date.now() - 1; }

test('Web Push encryption independently decrypts with the browser private key and authenticates tampering', async () => {
  const browser = receiver(), payload = JSON.stringify({ text: 'دورك الآن', type: 'word-duel' });
  const encrypted = await encryptPush(browser.subscription, payload);
  assert.equal(decrypt(browser, encrypted), payload);
  const second = await encryptPush(browser.subscription, payload); assert.notDeepEqual(encrypted, second);
  encrypted[90] ^= 1; assert.throws(() => decrypt(browser, encrypted));
  await assert.rejects(encryptPush(browser.subscription, 'x'.repeat(3001)), /too large/u);
  assert.equal(base64url(new Uint8Array([255, 239, 254])), '_-_-');
});
test('VAPID signs ES256 with audience, bounded expiry and a validated matching key pair', async () => {
  assert.equal(pushConfigured({}), false); assert.equal(await pushReady(config), true); assert.equal(await pushReady(config), true);
  assert.equal(await pushReady({ ...config, VAPID_PUBLIC_KEY: 'A'.repeat(87) }), false);
  assert.equal(await pushReady({ ...config, VAPID_PRIVATE_KEY: 'A'.repeat(43) }), false);
  await assert.rejects(vapidAuthorization({}, 'https://fcm.googleapis.com/send'), /not configured/u);
  const header = await vapidAuthorization(config, 'https://fcm.googleapis.com/fcm/send/private-endpoint', 1700000000000);
  const [, encoded] = /^vapid t=([^,]+), k=/u.exec(header);
  const [head, body, signature] = encoded.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url')), { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(JSON.parse(Buffer.from(body, 'base64url')), { aud: 'https://fcm.googleapis.com', exp: 1700003600, sub: config.VAPID_SUBJECT });
  assert.equal(verify('sha256', Buffer.from(`${head}.${body}`), { key: createPublicKey(keyPair.privateKey), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true);
});
test('push endpoint validation rejects SSRF, deceptive domains, redirects targets and malformed keys', async () => {
  const { subscription } = receiver();
  for (const endpoint of ['http://fcm.googleapis.com/send', 'https://localhost/push', 'https://127.0.0.1/push', 'https://[::1]/push', 'https://169.254.169.254/metadata', 'https://fcm.googleapis.com.evil.test/send', 'https://evil.test@fcm.googleapis.com/send', 'https://fcm.googleapis.com:8443/send', 'https://fcm.googleapis.com/send#fragment', 'https://push.apple.com.evil.test/send', 'https://fcm.googleapis.com/', 'not a URL']) await assert.rejects(validateSubscription({ ...subscription, endpoint }));
  for (const endpoint of ['https://web.push.apple.com/Q/token', 'https://updates.push.services.mozilla.com/wpush/v2/token', 'https://wns.notify.windows.com/w/?token=sample']) assert.equal((await validateSubscription({ ...subscription, endpoint })).endpoint, endpoint);
  for (const input of [null, [], {}, { endpoint: subscription.endpoint, keys: {} }, { ...subscription, keys: { ...subscription.keys, p256dh: 'A'.repeat(87) } }, { ...subscription, keys: { ...subscription.keys, auth: 'bad' } }]) await assert.rejects(validateSubscription(input));
});
test('push sends only encrypted generic room data and classifies provider delivery outcomes', async t => {
  const browser = receiver(), reminder = { subscription: browser.subscription, lang: 'ar', pending: { kind: 'rematch' } };
  let responseCode = 201, sent;
  t.mock.method(globalThis, 'fetch', async (url, options) => { sent = { url, options }; return new Response(null, { status: responseCode }); });
  assert.equal(await sendDuelPush(config, reminder, 'ABCD2345'), 'sent');
  assert.equal(sent.options.redirect, 'error'); assert.equal(sent.options.headers.TTL, '300'); assert.equal(sent.options.headers.Topic, 'duel_ABCD2345');
  const payload = JSON.parse(decrypt(browser, sent.options.body));
  assert.equal(payload.code, 'ABCD2345'); assert.equal(payload.kind, 'rematch'); assert.match(payload.title, /ريدل أرابيا/u);
  assert.doesNotMatch(JSON.stringify(payload), /token|rack|score|Host/u);
  for (const [status, result] of [[404, 'gone'], [410, 'gone'], [429, 'retry'], [503, 'retry'], [400, 'failed'], [302, 'failed']]) { responseCode = status; assert.equal(await sendDuelPush(config, reminder, 'ABCD2345'), result); }
  globalThis.fetch.mock.mockImplementation(async () => { throw new Error('network/redirect denied'); });
  assert.equal(await sendDuelPush(config, reminder, 'ABCD2345'), 'retry');
});
test('rematches require both existing seats, preserve results and reject replay across matches', async () => {
  const { ctx, object, host, guest } = await pair();
  assert.equal((await call(object, 'rematch', hostToken, { revision: 1, matchNumber: 1, decision: 'request' })).data.code, 'REMATCH_NOT_READY');
  const ended = await finish(object), old = structuredClone(ctx.data.get('word-duel-room'));
  const requests = await Promise.all([1, 2].map(() => call(object, 'rematch', hostToken, { revision: ended.revision, matchNumber: 1, decision: 'request' })));
  assert.deepEqual(requests.map(result => result.status).sort(), [200, 400]);
  const waiting = requests.find(result => result.status === 200).data;
  assert.equal(waiting.phase, 'finished'); assert.equal(waiting.expiresAt, ended.expiresAt);
  assert.equal((await call(object, 'rematch', hostToken, { revision: waiting.revision, matchNumber: 1, decision: 'accept' })).data.code, 'REMATCH_CONSENT');
  assert.equal((await call(object, 'rematch', 'X'.repeat(43), { revision: waiting.revision, matchNumber: 1, decision: 'accept' })).status, 403);
  const accepted = await call(object, 'rematch', guestToken, { revision: waiting.revision, matchNumber: 1, decision: 'accept' });
  assert.equal(accepted.status, 200); assert.equal(accepted.data.matchNumber, 2); assert.equal(accepted.data.phase, 'playing');
  assert.equal(accepted.data.turnId, guest.you); assert.ok(accepted.data.board.every(cell => cell === null)); assert.equal(accepted.data.players[0].score, 0);
  assert.equal(accepted.data.results.length, 1); assert.equal(accepted.data.results[0].winnerId, guest.you); assert.equal(accepted.data.you, guest.you);
  assert.deepEqual(ctx.data.get('word-duel-room').players.map(player => [player.id, player.tokenHash]), old.players.map(player => [player.id, player.tokenHash]));
  assert.equal((await call(object, 'rematch', guestToken, { revision: waiting.revision, matchNumber: 1, decision: 'accept' })).data.code, 'REMATCH_NOT_READY');
  assert.equal((await call(object, 'action', hostToken, { revision: ended.revision, kind: 'pass' })).data.code, 'STALE_REVISION');
  assert.equal((await call(object, 'state', hostToken)).data.you, host.you);
  const secretText = JSON.stringify(accepted.data); assert.doesNotMatch(secretText, /tokenHash|subscription|pendingPush/u);
});
test('declined/cancelled rematch requests are closed, legacy finished rooms archive before reset', async () => {
  for (const decision of ['decline', 'cancel']) {
    const { object } = await pair(); const ended = await finish(object);
    const invite = (await call(object, 'rematch', hostToken, { revision: ended.revision, matchNumber: 1, decision: 'request' })).data;
    assert.equal((await call(object, 'rematch', guestToken, { revision: invite.revision, matchNumber: 1, decision: 'cancel' })).data.code, 'UNAUTHORIZED');
    const closed = (await call(object, 'rematch', decision === 'cancel' ? hostToken : guestToken, { revision: invite.revision, matchNumber: 1, decision })).data;
    assert.equal(closed.phase, 'finished'); assert.equal(closed.rematch.status, decision === 'cancel' ? 'cancelled' : 'declined');
    assert.equal((await call(object, 'rematch', hostToken, { revision: closed.revision, matchNumber: 1, decision: 'request' })).data.code, 'REMATCH_CLOSED');
  }
  const { ctx, object } = await pair(); await finish(object); const legacy = ctx.data.get('word-duel-room'); delete legacy.results; delete legacy.matchNumber; delete legacy.vocabularyVersion;
  let next = rematchAction(legacy, legacy.players[0].id, { revision: legacy.revision, matchNumber: 1, decision: 'request' });
  assert.throws(() => rematchAction(next, legacy.players[1].id, { revision: next.revision, matchNumber: 1, decision: 'wrong' }), { code: 'INVALID_ACTION' });
  next = rematchAction(next, legacy.players[1].id, { revision: next.revision, matchNumber: 1, decision: 'accept' });
  assert.equal(next.results.length, 1); assert.equal(next.results[0].reason, 'resigned'); assert.equal(next.vocabularyVersion, 2); assert.equal(next.matchNumber, 2);
});
test('subscriptions are opt-in, bounded per seat, private, removable and unavailable without configuration', async () => {
  const { object, ctx, host, guest } = await pair(); const first = receiver(), second = receiver();
  assert.equal((await call(object, 'reminders', hostToken, { enabled: true, subscription: { endpoint: 'https://localhost/private' } })).data.code, 'INVALID_REMINDER');
  assert.equal((await call(object, 'reminders', hostToken, {})).data.code, 'INVALID_REMINDER');
  assert.equal((await call(object, 'reminders', 'X'.repeat(43), { enabled: true, subscription: first.subscription })).status, 403);
  for (const browser of [first, second]) assert.equal((await call(object, 'reminders', hostToken, { enabled: true, subscription: browser.subscription })).data.remindersEnabled, true);
  assert.equal((await call(object, 'reminders', guestToken, { enabled: true, lang: 'ar', subscription: first.subscription })).data.remindersEnabled, true);
  const stored = ctx.data.get('word-duel-room'); assert.equal(Object.keys(stored.reminders).length, 2); assert.deepEqual(stored.reminders[host.you].subscription, second.subscription);
  assert.doesNotMatch(JSON.stringify(privateSnapshot(stored, guest.you)), /p256dh|endpoint|auth|lastKey/u);
  assert.equal((await call(object, 'reminders', hostToken, { enabled: false })).data.remindersEnabled, false); assert.equal(Object.keys(ctx.data.get('word-duel-room').reminders).length, 1);
  const noConfig = await pair({}); assert.equal((await call(noConfig.object, 'reminders', hostToken, { enabled: true, subscription: first.subscription })).data.code, 'PUSH_UNAVAILABLE');
  assert.equal((await call(noConfig.object, 'reminders', hostToken, { enabled: false })).status, 200);
});
test('durable reminders dedupe, retry with limits, clean gone endpoints and discard stale turns', async t => {
  let sends = 0, status = 503;
  t.mock.method(globalThis, 'fetch', async () => { sends++; return new Response(null, { status }); });
  const { object, ctx, guest } = await pair(); const { subscription } = receiver();
  await call(object, 'reminders', guestToken, { enabled: true, subscription });
  await call(object, 'action', hostToken, { revision: 1, kind: 'pass' });
  assert.equal(ctx.data.get('word-duel-room').reminders[guest.you].pending.attempts, 0);
  await object.alarm(); assert.equal(sends, 0); // not due yet
  for (let i = 0; i < 3; i++) { due(ctx); await object.alarm(); }
  assert.equal(sends, 3); assert.equal(ctx.data.get('word-duel-room').reminders[guest.you].pending, undefined);
  await object.alarm(); assert.equal(sends, 3);
  await call(object, 'action', guestToken, { revision: 2, kind: 'pass' });
  await call(object, 'action', hostToken, { revision: 3, kind: 'pass' });
  status = 201; due(ctx); await new BattleRoom(ctx, config).alarm(); assert.equal(sends, 4);
  await object.alarm(); assert.equal(sends, 4);
  await call(object, 'action', guestToken, { revision: 4, kind: 'pass' });
  await call(object, 'action', hostToken, { revision: 5, kind: 'pass' });
  status = 410; due(ctx); await object.alarm(); assert.equal(ctx.data.get('word-duel-room').reminders[guest.you], undefined);
  const other = await pair(); await call(other.object, 'reminders', guestToken, { enabled: true, subscription }); await call(other.object, 'action', hostToken, { revision: 1, kind: 'pass' });
  const room = other.ctx.data.get('word-duel-room'); room.revision++; due(other.ctx); await other.object.alarm(); assert.equal(sends, 5); assert.equal(room.reminders[other.guest.you].pending !== undefined, true); // stored clone replaced below
  assert.equal(other.ctx.data.get('word-duel-room').reminders[other.guest.you].pending, undefined);
});
test('rematch reminders, opt-out, expiry and malformed persisted subscription cannot create endless alarms', async t => {
  let sends = 0; t.mock.method(globalThis, 'fetch', async () => { sends++; return new Response(null, { status: 201 }); });
  const { object, ctx, guest } = await pair(); const { subscription } = receiver();
  await call(object, 'reminders', guestToken, { enabled: true, subscription }); const ended = await finish(object);
  await call(object, 'rematch', hostToken, { revision: ended.revision, matchNumber: 1, decision: 'request' });
  assert.equal(ctx.data.get('word-duel-room').reminders[guest.you].pending.kind, 'rematch');
  due(ctx); await object.alarm(); assert.equal(sends, 1);
  const room = ctx.data.get('word-duel-room'); room.reminders[guest.you].pending = { key: 'broken', revision: room.revision, kind: 'rematch', attempts: 0, nextAt: 1 }; room.reminders[guest.you].subscription.endpoint = 'https://localhost/private';
  await object.alarm(); assert.equal(ctx.data.get('word-duel-room').reminders[guest.you], undefined); assert.equal(sends, 1);
  await call(object, 'reminders', guestToken, { enabled: true, subscription });
  const stored = ctx.data.get('word-duel-room'); stored.reminders[guest.you].pending = { key: 'missing-config', revision: stored.revision, kind: 'rematch', attempts: 0, nextAt: 1 };
  await new BattleRoom(ctx, {}).alarm(); assert.equal(ctx.data.get('word-duel-room').reminders[guest.you].pending, undefined);
  ctx.data.get('word-duel-room').expiresAt = 1; await object.alarm(); assert.equal(ctx.data.size, 0);
});
test('Arabic version two is synchronized, broader and preserves hamza/taa/yaa distinctions; old rooms keep their list', async () => {
  execFileSync(process.execPath, ['worker/scripts/sync-duel-arabic.mjs', '--check'], { cwd: new URL('../../', import.meta.url) });
  assert.ok(vocabulary('ar').length > 1500); assert.ok(vocabulary('ar').length > vocabulary('ar', 1).length);
  for (const word of ['سؤال', 'هادئ', 'يستطيع', 'مكتبة']) assert.ok(vocabulary('ar').includes(normalizeWord(word, 'ar')));
  assert.equal(normalizeWord('يُسْرَى', 'ar'), 'يسرى'); assert.equal(normalizeWord('يُسْرَى', 'ar', 1), 'يسري');
  assert.notEqual(normalizeWord('فتى', 'ar'), normalizeWord('فتي', 'ar')); assert.notEqual(normalizeWord('ورقة', 'ar'), normalizeWord('ورقه', 'ar'));
  assert.ok(vocabulary('ar', 1).includes('سوال')); assert.equal(vocabulary('ar').includes('سوال'), false);
  const { ctx, object } = await pair(); const room = ctx.data.get('word-duel-room'); room.lang = 'ar'; room.players[0].rack = [...'سؤالاين'];
  assert.deepEqual(scorePlacement(room, room.players[0], [...'سؤال'].map((letter, col) => ({ row: 4, col: col + 3, letter }))).words, ['سؤال']);
});
test('service worker notifications use fixed safe text and only navigate to allowlisted room routes', async () => {
  const handlers = new Map(), notifications = [], opened = [];
  const source = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');
  const self = { location: { origin: 'https://riddlearabia.com' }, addEventListener(type, fn) { handlers.set(type, fn); }, registration: { async showNotification(title, options) { notifications.push({ title, options }); } }, clients: { async matchAll() { return []; }, async openWindow(url) { opened.push(url); } } };
  vm.runInNewContext(source, { self, URL, Request, Response, Set });
  const push = data => { let pending; handlers.get('push')({ data: { json: () => data }, waitUntil(value) { pending = value; } }); return pending; };
  await push({ type: 'word-duel', code: 'ABCD2345', lang: 'ar', kind: 'rematch', title: '<injected>', url: 'https://evil.test' });
  assert.equal(notifications.length, 1); assert.match(notifications[0].title, /ريدل أرابيا/u); assert.match(notifications[0].options.data.url, /^\/ar\/play\/\?game=duel&duelRoom=ABCD2345$/u);
  await push({ type: 'word-duel', code: '../../evil' }); assert.equal(notifications.length, 1);
  let pending; const click = url => { handlers.get('notificationclick')({ notification: { tag: 'word-duel-ABCD2345', data: { url }, close() {} }, waitUntil(value) { pending = value; } }); return pending; };
  await click('https://evil.test/play?game=duel&duelRoom=ABCD2345'); assert.equal(opened.length, 0);
  await click('/play?game=duel&duelRoom=ABCD2345&token=leak'); assert.deepEqual(opened, ['https://riddlearabia.com/play?game=duel&duelRoom=ABCD2345']);
});
