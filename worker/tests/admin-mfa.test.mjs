import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { adminMfaStatus, cleanupExpiredMfaSetup, base32Encode, beginAdminMfa, confirmAdminMfa, decryptMfaSecret, encryptMfaSecret, matchingTotpStep, MFA_CODE_FAILURE_LIMIT, requireAdminMfa, totpAtStep, verifyAdminMfa } from '../dist/admin-mfa.js';
import { reauthenticateAdmin } from '../dist/admin.js';
import { sha256, validateNewPassword, validatePassword } from '../dist/security.js';
import { deleteAccount } from '../dist/privacy.js';
import { login, register, changePassword, resetPasswordWithRecovery, rotateRecoveryCode } from '../dist/routes.js';
const PASSWORD = 'orchards float beyond distant moons';
const TOKEN = 'A'.repeat(43), SECOND_TOKEN = 'B'.repeat(43), USER_ID = 'owner-user';
const PEPPER = 'this-is-a-long-test-password-pepper';
function request(path = '', body, token = TOKEN) {
  return new Request(`https://riddlearabia.com/api/user/security${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { cookie: `__Host-jakh_session=${token}`, 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.8' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function fixture(t) {
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close()); database.exec('PRAGMA foreign_keys = ON');
  const dir = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(dir)).filter((name) => /^\d.*\.sql$/u.test(name)).sort()) database.exec(await readFile(new URL(name, dir), 'utf8'));
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO users (id, username, username_key, email, password_hash, password_salt, password_iterations, role, created_at, updated_at) VALUES (?, 'Owner', 'owner', 'owner@example.test', 'hash', 'salt', 600000, 'OWNER', ?, ?)`).run(USER_ID, now, now);
  const tokenHash = await sha256(TOKEN);
  for (const token of [TOKEN, SECOND_TOKEN]) database.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(await sha256(token), USER_ID, now, new Date(Date.now() + 60 * 60_000).toISOString());
  let batchTail = Promise.resolve();
  const env = {
    PASSWORD_PEPPER: PEPPER, IP_HASH_SALT: 'test-ip-hash-salt-that-is-long-enough', STATIC_ORIGIN: 'https://riddlearabia.com',
    PASSWORD_HASHERS: { idFromName: (name) => name, get: () => ({ async fetch(request) { const body = await request.json(); if (new URL(request.url).pathname === '/verify') return Response.json({ valid: body.password === PASSWORD || body.password === '123456789' }); return Response.json({ hash: 'new-hash', salt: 'new-salt', iterations: 600000 }); } }) },
    DB: {
      prepare(sql) { const native = database.prepare(sql); return { values: [], bind(...values) { this.values = values; return this; }, async first() { return native.get(...this.values) || null; }, async all() { return { success: true, results: native.all(...this.values) }; }, async run() { if (/\bRETURNING\b/iu.test(sql)) { const results = native.all(...this.values); return { success: true, results, meta: { changes: results.length } }; } return { success: true, results: [], meta: native.run(...this.values) }; } }; },
      async batch(statements) { const previous = batchTail; let release; batchTail = new Promise((resolve) => { release = resolve; }); await previous; database.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.run()); database.exec('COMMIT'); return results; } catch (error) { database.exec('ROLLBACK'); throw error; } finally { release(); } },
    },
  };
  return { env, database, user: { id: USER_ID, username: 'Owner', email: 'owner@example.test', tokenHash, role: 'OWNER', sessionCreatedAt: now, adminLastActiveAt: null } };
}
async function enroll(env) { const setup = await (await beginAdminMfa(request('/setup', { password: PASSWORD }), env)).json(); const code = await totpAtStep(setup.secret, Math.floor(Date.now() / 30_000)); const confirmed = await (await confirmAdminMfa(request('/confirm', { code }), env)).json(); return { ...setup, ...confirmed, code }; }
test('new passwords reject predictable values without locking out legacy sign-in', () => {
  for (const value of ['123456789', 'Password123456789!', 'P@ssw0rd123456789!', 'PasswordPassword1234!', 'p4sswordp4ssword123!', '12345678901234567890', 'aaaaaaaaaaaaaaaa', 'Owner12345678901234']) assert.throws(() => validateNewPassword(value, 'Password', ['owner']), (error) => ['PASSWORD_POLICY_INVALID', 'PASSWORD_TOO_WEAK'].includes(error.code));
  for (const value of [PASSWORD, 'رحلة القمر فوق البساتين البعيدة', 'six smooth stones beside rivers', '7726491385729046']) assert.equal(validateNewPassword(value), value);
  assert.equal(validatePassword('123456789'), '123456789');
  assert.throws(() => validateNewPassword('🌲'.repeat(8)), (error) => error.code === 'PASSWORD_POLICY_INVALID');
  assert.throws(() => validateNewPassword('x'.repeat(129)), (error) => error.code === 'PASSWORD_POLICY_INVALID');
});
test('RFC6238 SHA1 vectors including counters beyond2038 match exactly', async () => {
  const secret = base32Encode(new TextEncoder().encode('12345678901234567890'));
  for (const [seconds, expected] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']]) assert.equal(await totpAtStep(secret, Math.floor(seconds / 30), 8), expected);
  const code = await totpAtStep(secret, 1000); assert.equal(await matchingTotpStep(secret, code, 1001 * 30000), 1000); assert.equal(await matchingTotpStep(secret, code, 1002 * 30000), null);
});
test('encrypted TOTP records are randomized and bound to the owner and encryption key', async () => {
  const env = { PASSWORD_PEPPER: PEPPER }; const encrypted = await encryptMfaSecret(env, 'owner', 'ABCDEFGHIJKLMNOP');
  assert.notEqual(encrypted, await encryptMfaSecret(env, 'owner', 'ABCDEFGHIJKLMNOP')); assert.doesNotMatch(encrypted, /ABCDEFGHIJKLMNOP/u); assert.equal(await decryptMfaSecret(env, 'owner', encrypted), 'ABCDEFGHIJKLMNOP');
  await assert.rejects(decryptMfaSecret(env, 'someone-else', encrypted)); await assert.rejects(decryptMfaSecret({ PASSWORD_PEPPER: 'other-pepper' }, 'owner', encrypted));
});
test('privileged access requires enrollment and confirmed session; setup requires fresh strong password', async (t) => {
  const { env, database, user } = await fixture(t);
  await assert.rejects(requireAdminMfa(env, user), (error) => error.code === 'MFA_ENROLLMENT_REQUIRED');
  await assert.rejects(beginAdminMfa(request('/setup', { password: 'wrong-password' }), env), (error) => error.code === 'CURRENT_PASSWORD_INCORRECT');
  await assert.rejects(beginAdminMfa(request('/setup', { password: '123456789' }), env), (error) => error.code === 'PASSWORD_ROTATION_REQUIRED');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_totp_pending').get().count, 0);
  const setup = await (await beginAdminMfa(request('/setup', { password: PASSWORD }), env)).json(); assert.match(setup.secret, /^[A-Z2-7]{32}$/u);
  assert.equal((await (await adminMfaStatus(request(), env)).json()).enabled, false);
  await assert.rejects(confirmAdminMfa(request('/confirm', { code: await totpAtStep(setup.secret, Math.floor(Date.now()/30000)) }, SECOND_TOKEN), env), (error) => error.code === 'MFA_SETUP_EXPIRED');
  database.prepare("UPDATE admin_totp_pending SET expires_at = '2000-01-01T00:00:00.000Z'").run();
  await assert.rejects(confirmAdminMfa(request('/confirm', { code: '123456' }), env), (error) => error.code === 'MFA_SETUP_EXPIRED');
});
test('enrollment confirms atomically, returns ten digest-only recovery codes and prevents TOTP replay', async (t) => {
  const { env, database, user } = await fixture(t); const setup = await enroll(env);
  assert.equal(setup.recoveryCodes.length, 10); assert.equal(new Set(setup.recoveryCodes).size, 10); await requireAdminMfa(env, user);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_totp_pending').get().count, 0);
  const saved = database.prepare('SELECT code_hash FROM admin_mfa_recovery_codes').all(); assert.equal(saved.length, 10); assert.ok(saved.every((row) => !setup.recoveryCodes.includes(row.code_hash)));
  await assert.rejects(verifyAdminMfa(request('/verify', { code: setup.code }, SECOND_TOKEN), env), (error) => error.code === 'MFA_CODE_INVALID');
  const secondUser = { ...user, tokenHash: await sha256(SECOND_TOKEN) }; await assert.rejects(requireAdminMfa(env, secondUser), (error) => error.code === 'MFA_REQUIRED');
  await verifyAdminMfa(request('/verify', { code: setup.recoveryCodes[0] }, SECOND_TOKEN), env); await requireAdminMfa(env, secondUser);
  await assert.rejects(verifyAdminMfa(request('/verify', { code: setup.recoveryCodes[0] }), env), (error) => error.code === 'MFA_CODE_INVALID');
  assert.equal((await (await adminMfaStatus(request(), env)).json()).recoveryCodesRemaining, 9);
  database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(user.tokenHash); assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_mfa_sessions WHERE token_hash = ?').get(user.tokenHash).count, 0);
});
test('authenticator replacement requires verified session and leaves old factor valid until confirmation', async (t) => {
  const { env, database, user } = await fixture(t); const original = await enroll(env);
  await assert.rejects(beginAdminMfa(request('/setup', { password: PASSWORD }, SECOND_TOKEN), env), (error) => error.code === 'MFA_REQUIRED');
  const previousId = database.prepare('SELECT credential_id FROM admin_totp').get().credential_id;
  const replacement = await (await beginAdminMfa(request('/setup', { password: PASSWORD }), env)).json(); assert.equal(database.prepare('SELECT credential_id FROM admin_totp').get().credential_id, previousId);
  await confirmAdminMfa(request('/confirm', { code: await totpAtStep(replacement.secret, Math.floor(Date.now()/30000)) }), env);
  assert.notEqual(database.prepare('SELECT credential_id FROM admin_totp').get().credential_id, previousId); await requireAdminMfa(env, user);
  await assert.rejects(verifyAdminMfa(request('/verify', { code: original.recoveryCodes[0] }, SECOND_TOKEN), env), (error) => error.code === 'MFA_CODE_INVALID');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_mfa_recovery_codes').get().count, 10);
});
test('repeated confirmation cannot revoke or replace the already-issued recovery codes', async (t) => {
  const { env, database } = await fixture(t); const enrolled = await enroll(env); const before = database.prepare('SELECT code_hash FROM admin_mfa_recovery_codes ORDER BY code_hash').all();
  await assert.rejects(confirmAdminMfa(request('/confirm', { code: enrolled.code }), env), (error) => error.code === 'MFA_SETUP_EXPIRED');
  assert.deepEqual(database.prepare('SELECT code_hash FROM admin_mfa_recovery_codes ORDER BY code_hash').all(), before);
});
test('MFA verification is rate limited across IP addresses and expires with privileged session', async (t) => {
  const { env, database, user } = await fixture(t); await enroll(env);
  for (let index=0; index<9; index+=1) await assert.rejects(verifyAdminMfa(request('/verify', { code: 'bad' }), env), (error) => error.code === 'MFA_CODE_INVALID');
  await assert.rejects(verifyAdminMfa(request('/verify', { code: 'bad' }), env), (error) => error.code === 'RATE_LIMITED');
  database.prepare("UPDATE admin_mfa_sessions SET verified_at = '2000-01-01T00:00:00.000Z'").run(); await assert.rejects(requireAdminMfa(env, user), (error) => error.code === 'MFA_REQUIRED');
});
test('all new credential routes enforce the policy before changing account state', async (t) => {
  const { env, database } = await fixture(t);
  await assert.rejects(register(request('', { username: 'newuser', password: '123456789' }), env), (error) => error.code === 'PASSWORD_POLICY_INVALID');
  await assert.rejects(changePassword(request('', { currentPassword: PASSWORD, newPassword: '123456789' }), env), (error) => error.code === 'PASSWORD_POLICY_INVALID');
  await assert.rejects(resetPasswordWithRecovery(request('', { username: 'Owner', recoveryCode: 'C'.repeat(43), newPassword: '123456789' }), env), (error) => error.code === 'PASSWORD_POLICY_INVALID');
  assert.equal(database.prepare('SELECT password_hash FROM users WHERE id = ?').get(USER_ID).password_hash, 'hash');
});
// Sign-in throttling: only failures count, a browser that signed in before
// keeps its own budget, and everyone else shares a per-account failure cap.
function signInRequest(username, password, { ip = '198.51.100.1', cookie, origin = 'https://api.riddlearabia.com' } = {}) {
  return new Request(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ username, password }) });
}
async function attempt(env, username, password, options) {
  try { const response = await login(signInRequest(username, password, options), env); return { status: response.status, response }; } catch (error) { return { status: error.status, code: error.code }; }
}
function deviceCookieFrom(response, name = '__Host-jakh_device') {
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  assert.ok(cookie, `${name} cookie is set`);
  return cookie.split(';')[0];
}
function pinRateWindow(t) {
  // Keep every attempt in one 15-minute window so the test cannot straddle a reset.
  const pinned = Math.floor(Date.now() / 900_000) * 900_000 + 450_000;
  t.mock.method(Date, 'now', () => pinned);
}
const failedCount = (database, key) => database.prepare('SELECT count FROM rate_limits WHERE key = ?').get(key)?.count ?? 0;

test('a stranger cannot lock out a browser that signed in before, while guessing from many networks stays capped', async (t) => {
  pinRateWindow(t);
  const { env, database } = await fixture(t);
  const signedIn = await login(signInRequest('Owner', PASSWORD, { ip: '203.0.113.1' }), env);
  assert.equal(signedIn.status, 200);
  const deviceSetCookie = signedIn.headers.getSetCookie().find((value) => value.startsWith('__Host-jakh_device='));
  assert.match(deviceSetCookie, /^__Host-jakh_device=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=15552000$/u);
  assert.equal(deviceSetCookie.includes('Domain='), false);
  assert.match(signedIn.headers.getSetCookie().join('\n'), /^__Host-jakh_session=/mu);
  const device = deviceCookieFrom(signedIn);

  // Twenty wrong guesses, each from a different network, without the device cookie.
  for (let index = 1; index <= 20; index += 1) {
    assert.equal((await attempt(env, 'Owner', `wrong guess ${index}`, { ip: `198.51.100.${index}` })).status, 401);
  }
  // The shared account cap now stops every browser the account has not seen,
  // from any network, even with the right password.
  assert.equal((await attempt(env, 'Owner', 'wrong guess 21', { ip: '198.51.100.21' })).code, 'RATE_LIMITED');
  assert.equal((await attempt(env, 'owner@example.test', PASSWORD, { ip: '198.51.100.22' })).code, 'RATE_LIMITED');
  assert.equal((await attempt(env, 'Owner', PASSWORD, { ip: '198.51.100.23', cookie: '__Host-jakh_session=' + TOKEN })).code, 'RATE_LIMITED');

  // The owner's browser still signs in, from a new network and through the email alias.
  const owner = await attempt(env, 'owner@example.test', PASSWORD, { ip: '192.0.2.50', cookie: `theme=dark; ${device}` });
  assert.equal(owner.status, 200);
  assert.notEqual(deviceCookieFrom(owner.response), device, 'each sign-in issues a fresh device cookie');
  assert.equal((await attempt(env, 'Owner', PASSWORD, { ip: '192.0.2.51', cookie: deviceCookieFrom(owner.response) })).status, 200);
  assert.equal((await attempt(env, 'Owner', PASSWORD, { ip: '192.0.2.52', cookie: device })).status, 200, 'older device cookies stay valid');
});

test('a stranger on the same network cannot block a recognised browser, and junk cookies do not skip the network limit', async (t) => {
  pinRateWindow(t);
  const { env } = await fixture(t);
  const shared = '203.0.113.7';
  const device = deviceCookieFrom(await login(signInRequest('Owner', PASSWORD, { ip: shared }), env));
  // Someone else behind the same public address uses up its network limit.
  for (let index = 1; index <= 19; index += 1) assert.equal((await attempt(env, `stranger_${index}`, 'wrong guess', { ip: shared })).status, 401);
  assert.equal((await attempt(env, 'Owner', PASSWORD, { ip: shared })).code, 'RATE_LIMITED');
  assert.equal((await attempt(env, 'Owner', PASSWORD, { ip: shared, cookie: `__Host-jakh_device=${'A'.repeat(22)}.${'B'.repeat(43)}` })).code, 'RATE_LIMITED');
  assert.equal((await attempt(env, 'Owner', PASSWORD, { ip: shared, cookie: device })).status, 200);
});

test('a recognised browser has its own small failure budget', async (t) => {
  pinRateWindow(t);
  const { env, database } = await fixture(t);
  const device = deviceCookieFrom(await login(signInRequest('Owner', PASSWORD, { ip: '203.0.113.2' }), env));
  for (let index = 1; index <= 10; index += 1) {
    assert.equal((await attempt(env, 'Owner', `wrong typo ${index}`, { ip: `198.51.100.${index}`, cookie: device })).status, 401);
  }
  assert.equal((await attempt(env, 'Owner', PASSWORD, { ip: '198.51.100.11', cookie: device })).code, 'RATE_LIMITED');
  // Those failures were charged to that browser only, not to the shared account budget.
  assert.equal(failedCount(database, await sha256(`${env.IP_HASH_SALT}:login-account:${USER_ID}`)), 0);
  assert.equal((await attempt(env, 'Owner', PASSWORD, { ip: '198.51.100.12' })).status, 200);
});

test('successful sign-ins never use up the account limit', async (t) => {
  pinRateWindow(t);
  const { env, database } = await fixture(t);
  for (let index = 1; index <= 25; index += 1) {
    assert.equal((await attempt(env, index % 2 ? 'Owner' : 'owner@example.test', index % 3 ? PASSWORD : '123456789', { ip: `198.51.100.${index}` })).status, 200);
  }
  assert.equal(failedCount(database, await sha256(`${env.IP_HASH_SALT}:login-account:${USER_ID}`)), 0);
  assert.equal((await attempt(env, 'Owner', 'one wrong guess', { ip: '198.51.100.30' })).status, 401);
  assert.equal(failedCount(database, await sha256(`${env.IP_HASH_SALT}:login-account:${USER_ID}`)), 1);
  // Unknown accounts are throttled too, by a digest of the identifier.
  for (let index = 1; index <= 20; index += 1) assert.equal((await attempt(env, 'nobody_here', 'wrong guess', { ip: `203.0.113.${index}` })).status, 401);
  assert.equal((await attempt(env, 'nobody_here', 'wrong guess', { ip: '203.0.113.21' })).code, 'RATE_LIMITED');
});

test('a device cookie helps only the account it was issued to and cannot be forged', async (t) => {
  pinRateWindow(t);
  const { env, database } = await fixture(t);
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO users (id, username, username_key, email, password_hash, password_salt, password_iterations, role, created_at, updated_at) VALUES ('other-user', 'Other', 'other', NULL, 'hash', 'salt', 600000, 'USER', ?, ?)`).run(now, now);
  const ownerDevice = deviceCookieFrom(await login(signInRequest('Owner', PASSWORD, { ip: '203.0.113.3' }), env));
  const otherDevice = deviceCookieFrom(await login(signInRequest('Other', PASSWORD, { ip: '203.0.113.4' }), env));
  const foreignPepper = deviceCookieFrom(await login(signInRequest('Owner', PASSWORD, { ip: '203.0.113.5' }), { ...env, PASSWORD_PEPPER: 'a-completely-different-password-pepper' }));
  database.prepare('UPDATE rate_limits SET count = 20 WHERE key = ?').run(await sha256(`${env.IP_HASH_SALT}:login-account:${USER_ID}`));
  const [nonce, mac] = ownerDevice.split('=')[1].split('.');
  const rejected = [
    otherDevice,
    `__Host-jakh_device=${'A'.repeat(22)}.${mac}`,
    `__Host-jakh_device=${nonce}.${'A'.repeat(43)}`,
    `__Host-jakh_device=${nonce}.${mac}x`,
    `__Host-jakh_device=${nonce}`,
    foreignPepper,
    ownerDevice.replace('__Host-jakh_device=', 'jakh_device='),
  ];
  for (const [index, cookie] of rejected.entries()) {
    assert.equal((await attempt(env, 'Owner', PASSWORD, { ip: `198.51.100.${index + 1}`, cookie })).code, 'RATE_LIMITED', cookie);
  }
  assert.equal((await attempt(env, 'Owner', PASSWORD, { ip: '198.51.100.50', cookie: ownerDevice })).status, 200);
});

test('new accounts and local development receive working device cookies', async (t) => {
  pinRateWindow(t);
  const { env, database } = await fixture(t);
  const created = await register(new Request('https://api.riddlearabia.com/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.6' }, body: JSON.stringify({ username: 'newuser', password: PASSWORD }) }), env);
  assert.equal(created.status, 201);
  const device = deviceCookieFrom(created);
  const newUserId = database.prepare("SELECT id FROM users WHERE username_key = 'newuser'").get().id;
  database.prepare('INSERT INTO rate_limits (key, window_start, count, expires_at) VALUES (?, ?, 20, ?)').run(await sha256(`${env.IP_HASH_SALT}:login-account:${newUserId}`), Math.floor(Date.now() / 900_000) * 900, Math.floor(Date.now() / 1000) + 1800);
  assert.equal((await attempt(env, 'newuser', PASSWORD, { ip: '198.51.100.1' })).code, 'RATE_LIMITED');
  assert.equal((await attempt(env, 'newuser', PASSWORD, { ip: '198.51.100.2', cookie: device })).status, 200);

  const local = { ...env, STATIC_ORIGIN: 'http://localhost:8788' };
  const localSignIn = await login(signInRequest('Owner', PASSWORD, { ip: '127.0.0.1', origin: 'http://localhost:8787' }), local);
  const localSetCookie = localSignIn.headers.getSetCookie().find((value) => value.startsWith('jakh_device='));
  assert.ok(localSetCookie); assert.equal(localSetCookie.includes('Secure'), false);
  database.prepare('UPDATE rate_limits SET count = 20 WHERE key = ?').run(await sha256(`${env.IP_HASH_SALT}:login-account:${USER_ID}`));
  assert.equal((await attempt(local, 'Owner', PASSWORD, { ip: '127.0.0.1', origin: 'http://localhost:8787', cookie: localSetCookie.split(';')[0] })).status, 200);
});

test('account recovery has no account-wide lockout but limits failures per network', async (t) => {
  pinRateWindow(t);
  const { env, database } = await fixture(t);
  const code = 'R'.repeat(43);
  const now = new Date().toISOString();
  database.prepare('INSERT INTO account_recovery_codes (user_id, code_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run(USER_ID, await sha256(code), now, now);
  const recover = async (recoveryCode, ip) => {
    try {
      const response = await resetPasswordWithRecovery(new Request('https://api.riddlearabia.com/api/auth/recovery/reset', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify({ username: 'Owner', recoveryCode, newPassword: 'fifteen other stones float gently' }) }), env);
      return { status: response.status, response };
    } catch (error) { return { status: error.status, code: error.code }; }
  };
  // Failed codes from one network are limited for that network only.
  for (let index = 0; index < 5; index += 1) assert.equal((await recover('W'.repeat(43), '198.51.100.1')).code, 'RECOVERY_CREDENTIALS_INVALID');
  assert.equal((await recover(code, '198.51.100.1')).code, 'RATE_LIMITED');
  // Many more failures from other networks than the old account-wide limit allowed.
  for (let network = 2; network <= 4; network += 1) {
    for (let index = 0; index < 5; index += 1) assert.equal((await recover('not-a-valid-recovery-code', `198.51.100.${network}`)).code, 'RECOVERY_CREDENTIALS_INVALID');
  }
  const recovered = await recover(code, '192.0.2.60');
  assert.equal(recovered.status, 200);
  assert.match(recovered.response.headers.getSetCookie().join('\n'), /^__Host-jakh_device=/mu);
  assert.equal(failedCount(database, await sha256(`${env.IP_HASH_SALT}:recovery-reset-account-network:owner:192.0.2.60`)), 0);
  assert.equal(database.prepare('SELECT password_hash FROM users WHERE id = ?').get(USER_ID).password_hash, 'new-hash');
});

test('two confirmations that read the same pending setup cannot replace the winning recovery codes', async (t) => {
  const { env, database } = await fixture(t);
  const setup = await (await beginAdminMfa(request('/setup', { password: PASSWORD }), env)).json();
  const code = await totpAtStep(setup.secret, Math.floor(Date.now()/30000));
  const originalPrepare = env.DB.prepare;
  let reads = 0, release;
  const barrier = new Promise((resolve) => { release = resolve; });
  env.DB.prepare = (sql) => {
    const statement = originalPrepare(sql);
    if (sql.startsWith('SELECT credential_id, previous_credential_id')) {
      const originalFirst = statement.first;
      statement.first = async function () { const row = await originalFirst.call(this); reads += 1; if (reads === 2) release(); await barrier; return row; };
    }
    return statement;
  };
  const outcomes = await Promise.allSettled([confirmAdminMfa(request('/confirm', { code }), env), confirmAdminMfa(request('/confirm', { code }), env)]);
  assert.equal(outcomes.filter((item) => item.status === 'fulfilled').length, 1);
  const winning = await outcomes.find((item) => item.status === 'fulfilled').value.json();
  const stored = database.prepare('SELECT code_hash FROM admin_mfa_recovery_codes ORDER BY code_hash').all().map((row) => row.code_hash);
  assert.deepEqual(stored, (await Promise.all(winning.recoveryCodes.map((code) => sha256(`admin-mfa-recovery:${USER_ID}:${code}`)))).sort());
});

test('failed enrollment batch rolls back credential and recovery state together', async (t) => {
  const { env, database } = await fixture(t);
  const setup = await (await beginAdminMfa(request('/setup', { password: PASSWORD }), env)).json();
  const code = await totpAtStep(setup.secret, Math.floor(Date.now()/30000));
  const originalBatch = env.DB.batch;
  env.DB.batch = (statements) => originalBatch([...statements.slice(0, 5), { async run() { throw new Error('injected write failure'); } }, ...statements.slice(5)]);
  await assert.rejects(confirmAdminMfa(request('/confirm', { code }), env), /injected write failure/u);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_totp').get().count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_mfa_recovery_codes').get().count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_totp_pending').get().count, 1);
  env.DB.batch = originalBatch;
  assert.equal((await confirmAdminMfa(request('/confirm', { code }), env)).status, 200);
});

test('password-only privileged sessions cannot delete accounts, change enrolled credentials or rotate recovery codes', async (t) => {
  const { env, database } = await fixture(t);
  await assert.rejects(deleteAccount(request('', { username: 'Owner', currentPassword: PASSWORD, confirmPermanentDeletion: true }), env), (error) => error.code === 'MFA_ENROLLMENT_REQUIRED');
  await enroll(env);
  await assert.rejects(changePassword(request('', { currentPassword: PASSWORD, newPassword: 'fifteen other stones float gently' }, SECOND_TOKEN), env), (error) => error.code === 'MFA_REQUIRED');
  await assert.rejects(rotateRecoveryCode(request('', { password: PASSWORD }, SECOND_TOKEN), env), (error) => error.code === 'MFA_REQUIRED');
  await assert.rejects(deleteAccount(request('', { username: 'Owner', currentPassword: PASSWORD, confirmPermanentDeletion: true }, SECOND_TOKEN), env), (error) => error.code === 'MFA_REQUIRED');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
  assert.equal(database.prepare('SELECT password_hash FROM users').get().password_hash, 'hash');
});

test('scheduled maintenance removes expired pending secret material without touching an active setup', async (t) => {
  const { env, database } = await fixture(t);
  await beginAdminMfa(request('/setup', { password: PASSWORD }), env);
  await cleanupExpiredMfaSetup(env);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_totp_pending').get().count, 1);
  database.prepare("UPDATE admin_totp_pending SET expires_at = '2000-01-01T00:00:00.000Z'").run();
  await cleanupExpiredMfaSetup(env);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_totp_pending').get().count, 0);
});

test('privileged account deletion rejects an idle verified session without deleting the account', async (t) => {
  const { env, database, user } = await fixture(t);
  await enroll(env);
  database.prepare('UPDATE sessions SET admin_last_active_at = ? WHERE token_hash = ?').run(new Date(Date.now() - 16 * 60_000).toISOString(), user.tokenHash);
  await assert.rejects(deleteAccount(request('', { username: 'Owner', currentPassword: PASSWORD, confirmPermanentDeletion: true }), env), (error) => error.code === 'ADMIN_SESSION_EXPIRED');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sessions WHERE token_hash = ?').get(user.tokenHash).count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_mfa_sessions WHERE token_hash = ?').get(user.tokenHash).count, 0);
});

test('verified privileged password changes preserve the factor and revoke old session verification', async (t) => {
  const { env, database } = await fixture(t);
  await enroll(env);
  await beginAdminMfa(request('/setup', { password: PASSWORD }), env);
  const response = await changePassword(request('', { currentPassword: PASSWORD, newPassword: 'different orchards float past mountains' }), env);
  assert.equal(response.status, 200);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_totp').get().count, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_mfa_sessions').get().count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_totp_pending').get().count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_mfa_recovery_codes').get().count, 10);
});

test('authenticator audit events record security actions without secret material', async (t) => {
  const { env, database } = await fixture(t);
  const first = await enroll(env);
  await verifyAdminMfa(request('/verify', { code: first.recoveryCodes[0] }, SECOND_TOKEN), env);
  const nextCode = await totpAtStep(first.secret, Math.floor(Date.now()/30000) + 1);
  await verifyAdminMfa(request('/verify', { code: nextCode }, SECOND_TOKEN), env);
  const second = await enroll(env);
  const events = database.prepare('SELECT action, target_type, target_id, detail FROM admin_audit_log ORDER BY rowid').all();
  assert.deepEqual(events.map((event) => event.action), ['security.authenticator_enabled', 'security.authenticator_recovery_used', 'security.authenticator_verified', 'security.authenticator_replaced']);
  assert.ok(events.every((event) => event.target_type === 'account' && event.target_id === USER_ID));
  assert.deepEqual(JSON.parse(events[1].detail), { method: 'recovery_code' });
  const serialized = JSON.stringify(events);
  for (const secret of [PASSWORD, TOKEN, SECOND_TOKEN, first.secret, second.secret, ...first.recoveryCodes, ...second.recoveryCodes]) assert.equal(serialized.includes(secret), false);
});

// Authenticator lockout: a daily budget of failed codes per account, on top of
// the 15-minute limit. Every failure is audited; the lockout ends the session.
const DAY_MS = 86_400_000;
function pinClock(t) {
  // A constant clock (a little ahead of real time) keeps every rate window fixed.
  let now = Date.now() + 60_000;
  t.mock.method(Date, 'now', () => now);
  return { advance(ms) { now += ms; } };
}
async function outcome(operation) {
  try { const response = await operation; return { status: response.status, response }; } catch (error) { return { status: error.status, code: error.code, headers: error.headers }; }
}
async function addSession(database, token, userId = USER_ID) {
  database.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(await sha256(token), userId, new Date().toISOString(), new Date(Date.now() + 60 * 60_000).toISOString());
}
const sessionCount = async (database, token) => database.prepare('SELECT COUNT(*) AS count FROM sessions WHERE token_hash = ?').get(await sha256(token)).count;
const auditActions = (database) => database.prepare('SELECT action, detail FROM admin_audit_log ORDER BY rowid').all();

test('authenticator codes lock the account after 30 failures in a day, audit each failure without the code, and end the session', async (t) => {
  const clock = pinClock(t);
  const { env, database } = await fixture(t);
  const enrolled = await enroll(env);
  const failureKey = await sha256(`${env.IP_HASH_SALT}:admin-mfa:code-failures:${USER_ID}`);
  const shortKey = await sha256(`${env.IP_HASH_SALT}:admin-mfa:code:${USER_ID}`);
  assert.equal(failedCount(database, failureKey), 0, 'a correct setup code hands its slot back');
  const wrongCodes = ['bad', 'Z'.repeat(22)];
  // Attempts spread over the day, so the 15-minute limit never applies.
  for (let failure = 1; failure < MFA_CODE_FAILURE_LIMIT; failure += 1) {
    database.prepare('DELETE FROM rate_limits WHERE key = ?').run(shortKey);
    assert.equal((await outcome(verifyAdminMfa(request('/verify', { code: wrongCodes[failure % 2] }), env))).code, 'MFA_CODE_INVALID');
    if (failure === 1) {
      // A correct code in between neither counts nor resets the failures.
      database.prepare('DELETE FROM rate_limits WHERE key = ?').run(shortKey);
      assert.equal((await verifyAdminMfa(request('/verify', { code: await totpAtStep(enrolled.secret, Math.floor(Date.now() / 30_000) + 1) }), env)).status, 200);
      assert.equal(failedCount(database, failureKey), 1);
    }
  }
  assert.equal(await sessionCount(database, TOKEN), 1);
  assert.equal(auditActions(database).filter((event) => event.action === 'security.authenticator_locked').length, 0);

  database.prepare('DELETE FROM rate_limits WHERE key = ?').run(shortKey);
  const locked = await outcome(verifyAdminMfa(request('/verify', { code: 'bad' }), env));
  assert.equal(locked.status, 429);
  assert.equal(locked.code, 'MFA_LOCKED');
  const retryAfter = Number(locked.headers['retry-after']);
  assert.ok(retryAfter > 0 && retryAfter <= DAY_MS / 1000, `retry-after ${retryAfter}`);
  assert.equal(await sessionCount(database, TOKEN), 0, 'the session that sent the codes is ended');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_mfa_sessions WHERE token_hash = ?').get(await sha256(TOKEN)).count, 0);

  const events = auditActions(database);
  const failures = events.filter((event) => event.action === 'security.authenticator_failed');
  assert.equal(failures.length, MFA_CODE_FAILURE_LIMIT);
  assert.deepEqual(failures.map((event) => JSON.parse(event.detail).failedCodes), Array.from({ length: MFA_CODE_FAILURE_LIMIT }, (_, index) => index + 1));
  assert.deepEqual(JSON.parse(failures[0].detail), { method: 'recovery_code', purpose: 'verify', failedCodes: 1, limit: MFA_CODE_FAILURE_LIMIT });
  assert.deepEqual(JSON.parse(failures[1].detail).method, 'totp');
  const lockouts = events.filter((event) => event.action === 'security.authenticator_locked');
  assert.equal(lockouts.length, 1);
  assert.equal(JSON.parse(lockouts[0].detail).failedCodes, MFA_CODE_FAILURE_LIMIT);
  assert.ok(Date.parse(JSON.parse(lockouts[0].detail).lockedUntil) > Date.now());

  // Until the window ends, even correct codes from another session are refused
  // without being checked or used up, and that session ends as well.
  const correct = await totpAtStep(enrolled.secret, Math.floor(Date.now() / 30_000));
  const otherToken = 'C'.repeat(43);
  for (const [token, code] of [[SECOND_TOKEN, correct], [otherToken, enrolled.recoveryCodes[0]]]) {
    if (token === otherToken) await addSession(database, otherToken);
    database.prepare('DELETE FROM rate_limits WHERE key = ?').run(shortKey);
    assert.equal((await outcome(verifyAdminMfa(request('/verify', { code }, token), env))).code, 'MFA_LOCKED');
    assert.equal(await sessionCount(database, token), 0);
  }
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM admin_mfa_recovery_codes').get().count, 10);
  assert.equal(auditActions(database).length, events.length, 'refused attempts add no audit noise');
  const serialized = JSON.stringify(auditActions(database));
  for (const secret of [PASSWORD, TOKEN, enrolled.secret, correct, ...wrongCodes, ...enrolled.recoveryCodes]) assert.equal(serialized.includes(secret), false, secret);

  // After the window ends, a new sign-in can verify again.
  clock.advance(DAY_MS);
  await addSession(database, 'D'.repeat(43));
  assert.equal((await verifyAdminMfa(request('/verify', { code: await totpAtStep(enrolled.secret, Math.floor(Date.now() / 30_000)) }, 'D'.repeat(43)), env)).status, 200);
});

test('failed setup confirmation codes are audited and share the same daily budget', async (t) => {
  pinClock(t);
  const { env, database } = await fixture(t);
  const setup = await (await beginAdminMfa(request('/setup', { password: PASSWORD }), env)).json();
  const failureKey = await sha256(`${env.IP_HASH_SALT}:admin-mfa:code-failures:${USER_ID}`);
  database.prepare('INSERT INTO rate_limits (key, window_start, count, expires_at) VALUES (?, ?, ?, ?)').run(failureKey, Math.floor(Date.now() / DAY_MS) * 86_400, MFA_CODE_FAILURE_LIMIT - 2, Math.floor(Date.now() / 1000) + 2 * 86_400);
  assert.equal((await outcome(confirmAdminMfa(request('/confirm', { code: 'bad' }), env))).code, 'MFA_CODE_INVALID');
  assert.deepEqual(JSON.parse(auditActions(database).at(-1).detail), { method: 'totp', purpose: 'setup', failedCodes: MFA_CODE_FAILURE_LIMIT - 1, limit: MFA_CODE_FAILURE_LIMIT });
  // A correct code hands its slot back and completes setup.
  const confirmed = await confirmAdminMfa(request('/confirm', { code: await totpAtStep(setup.secret, Math.floor(Date.now() / 30_000)) }), env);
  assert.equal(confirmed.status, 200);
  assert.equal(failedCount(database, failureKey), MFA_CODE_FAILURE_LIMIT - 1);
  // The last failure is shared with sign-in verification and locks the account.
  assert.equal((await outcome(verifyAdminMfa(request('/verify', { code: '1234567' }, SECOND_TOKEN), env))).code, 'MFA_LOCKED');
  assert.equal(await sessionCount(database, SECOND_TOKEN), 0);
  assert.equal(await sessionCount(database, TOKEN), 1, 'other sessions are left alone');
  assert.deepEqual(auditActions(database).slice(-2).map((event) => event.action), ['security.authenticator_failed', 'security.authenticator_locked']);
});

// Password re-checks on a signed-in session share one per-account budget of
// failures, whatever network they come from; correct passwords never use it.
function requestFrom(ip, path, body, token = TOKEN) {
  return new Request(`https://riddlearabia.com/api${path}`, { method: 'POST', headers: { cookie: `__Host-jakh_session=${token}`, 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) });
}
const MEMBER_TOKEN = 'M'.repeat(43), MEMBER_ID = 'member-user';

test('failed password re-checks are capped per account across networks and endpoints, and correct passwords never count', async (t) => {
  pinClock(t);
  const { env, database } = await fixture(t);
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO users (id, username, username_key, email, password_hash, password_salt, password_iterations, role, created_at, updated_at) VALUES (?, 'Member', 'member', NULL, 'hash', 'salt', 600000, 'USER', ?, ?)`).run(MEMBER_ID, now, now);
  await addSession(database, MEMBER_TOKEN, MEMBER_ID);
  const recheckKey = await sha256(`${env.IP_HASH_SALT}:password-recheck:${MEMBER_ID}`);
  const rotate = (ip, password) => outcome(rotateRecoveryCode(requestFrom(ip, '/auth/recovery/rotate', { password }, MEMBER_TOKEN), env));
  const change = (ip, currentPassword) => outcome(changePassword(requestFrom(ip, '/user/password', { currentPassword, newPassword: 'fifteen other stones float gently' }, MEMBER_TOKEN), env));
  const remove = (ip, currentPassword) => outcome(deleteAccount(requestFrom(ip, '/user/account', { username: 'Member', currentPassword, confirmPermanentDeletion: true }, MEMBER_TOKEN), env));

  for (let index = 1; index <= 15; index += 1) assert.equal((await rotate(`198.51.100.${index}`, PASSWORD)).status, 200);
  assert.equal(failedCount(database, recheckKey), 0, 'correct passwords hand their slot back');

  const attempts = [rotate, change, remove];
  for (let index = 1; index <= 10; index += 1) {
    assert.equal((await attempts[index % 3](`192.0.2.${index}`, `wrong guess ${index}`)).code, 'CURRENT_PASSWORD_INCORRECT');
  }
  // Ten failures from ten networks: the next check is refused even with the
  // right password, from yet another network, and nothing is changed.
  for (const attempt of attempts) assert.equal((await attempt('203.0.113.99', PASSWORD)).code, 'RATE_LIMITED');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM users WHERE id = ?').get(MEMBER_ID).count, 1);
  assert.equal(database.prepare('SELECT password_hash FROM users WHERE id = ?').get(MEMBER_ID).password_hash, 'hash');
  // Other accounts have their own budget.
  assert.equal(failedCount(database, await sha256(`${env.IP_HASH_SALT}:password-recheck:${USER_ID}`)), 0);
});

test('administrator re-confirmation and authenticator setup share the password re-check budget', async (t) => {
  pinClock(t);
  const { env, database } = await fixture(t);
  await enroll(env);
  const recheckKey = await sha256(`${env.IP_HASH_SALT}:password-recheck:${USER_ID}`);
  const reauth = (ip, password) => outcome(reauthenticateAdmin(requestFrom(ip, '/admin/security/reauthenticate', { password }), env));
  assert.equal((await reauth('198.51.100.1', PASSWORD)).status, 200);
  assert.equal(failedCount(database, recheckKey), 0);
  for (let index = 1; index <= 9; index += 1) assert.equal((await reauth(`192.0.2.${index}`, `wrong guess ${index}`)).code, 'STEP_UP_INVALID');
  assert.equal((await outcome(beginAdminMfa(request('/setup', { password: 'wrong guess 10' }), env))).code, 'CURRENT_PASSWORD_INCORRECT');
  assert.equal((await reauth('203.0.113.99', PASSWORD)).code, 'RATE_LIMITED');
  assert.equal((await outcome(beginAdminMfa(request('/setup', { password: PASSWORD }), env))).code, 'RATE_LIMITED');
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'security.password_reconfirmed'").get().count, 1);
});

// Accounts created under the old work factor move to the current one after a
// successful sign-in, without ever failing the sign-in.
function hasherWith(onHash) {
  const calls = [];
  return {
    calls,
    binding: { idFromName: (name) => name, get: () => ({ async fetch(request) {
      const body = await request.json(); const path = new URL(request.url).pathname; calls.push({ path, body });
      if (path === '/verify') return Response.json({ valid: body.password === PASSWORD });
      return onHash(body);
    } }) },
  };
}
async function addLegacyUser(database, id = 'legacy-user', username = 'Legacy') {
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO users (id, username, username_key, email, password_hash, password_salt, password_iterations, role, created_at, updated_at) VALUES (?, ?, ?, NULL, 'old-hash', 'old-salt', 100000, 'USER', ?, ?)`).run(id, username, username.toLowerCase(), now, now);
}
const passwordRecord = (database, id) => ({ ...database.prepare('SELECT password_hash, password_salt, password_iterations FROM users WHERE id = ?').get(id) });

test('a successful sign-in upgrades an old password hash once, with a fresh salt, and leaves current hashes alone', async (t) => {
  pinRateWindow(t);
  const { env, database } = await fixture(t);
  await addLegacyUser(database);
  const hasher = hasherWith(() => Response.json({ hash: 'H'.repeat(43), salt: 'S'.repeat(22), iterations: 600000 }));
  env.PASSWORD_HASHERS = hasher.binding;
  assert.equal((await attempt(env, 'Legacy', PASSWORD)).status, 200);
  assert.deepEqual(passwordRecord(database, 'legacy-user'), { password_hash: 'H'.repeat(43), password_salt: 'S'.repeat(22), password_iterations: 600000 });
  const upgrades = hasher.calls.filter((call) => call.path === '/hash');
  assert.equal(upgrades.length, 1);
  assert.equal(upgrades[0].body.iterations, 600000);
  assert.equal('salt' in upgrades[0].body, false, 'the hasher picks a fresh salt');
  assert.equal(hasher.calls.find((call) => call.path === '/verify').body.iterations, 100000);

  hasher.calls.length = 0;
  assert.equal((await attempt(env, 'Legacy', PASSWORD)).status, 200);
  assert.equal((await attempt(env, 'Owner', PASSWORD)).status, 200);
  assert.deepEqual(hasher.calls.map((call) => call.path), ['/verify', '/verify'], 'current hashes are not re-hashed');
  assert.equal(passwordRecord(database, USER_ID).password_hash, 'hash');

  // A wrong password never upgrades anything.
  await addLegacyUser(database, 'legacy-two', 'LegacyTwo');
  assert.equal((await attempt(env, 'LegacyTwo', 'not the password')).status, 401);
  assert.equal(passwordRecord(database, 'legacy-two').password_iterations, 100000);
});

test('a failed hash upgrade never fails the sign-in, and a password change in between is not overwritten', async (t) => {
  pinRateWindow(t);
  const { env, database } = await fixture(t);
  const warnings = t.mock.method(console, 'warn', () => {});
  await addLegacyUser(database);
  env.PASSWORD_HASHERS = hasherWith(() => Response.json({ error: 'Password hashing failed' }, { status: 500 })).binding;
  const signedIn = await attempt(env, 'Legacy', PASSWORD);
  assert.equal(signedIn.status, 200);
  assert.match(signedIn.response.headers.getSetCookie().join('\n'), /^__Host-jakh_session=/mu);
  assert.deepEqual(passwordRecord(database, 'legacy-user'), { password_hash: 'old-hash', password_salt: 'old-salt', password_iterations: 100000 });
  assert.equal(warnings.mock.callCount(), 1);
  assert.equal(JSON.stringify(warnings.mock.calls[0].arguments).includes(PASSWORD), false);

  // The account's password changes while the upgrade hash is being computed.
  env.PASSWORD_HASHERS = hasherWith(() => {
    database.prepare("UPDATE users SET password_hash = 'changed-hash', password_salt = 'changed-salt', password_iterations = 600000 WHERE id = 'legacy-user'").run();
    return Response.json({ hash: 'H'.repeat(43), salt: 'S'.repeat(22), iterations: 600000 });
  }).binding;
  assert.equal((await attempt(env, 'Legacy', PASSWORD)).status, 200);
  assert.deepEqual(passwordRecord(database, 'legacy-user'), { password_hash: 'changed-hash', password_salt: 'changed-salt', password_iterations: 600000 });
});
