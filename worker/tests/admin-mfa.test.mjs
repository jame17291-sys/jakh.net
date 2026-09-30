import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { adminMfaStatus, cleanupExpiredMfaSetup, base32Encode, beginAdminMfa, confirmAdminMfa, decryptMfaSecret, encryptMfaSecret, matchingTotpStep, requireAdminMfa, totpAtStep, verifyAdminMfa } from '../dist/admin-mfa.js';
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
test('login aliases share one account throttle while legacy valid passwords remain usable', async (t) => {
  const { env, database } = await fixture(t); assert.equal((await login(request('', { username: 'Owner', password: '123456789' }), env)).status, 200);
  const accountKey = await sha256(`${env.IP_HASH_SALT}:login-account:${USER_ID}`); database.prepare('UPDATE rate_limits SET count = 20 WHERE key = ?').run(accountKey);
  await assert.rejects(login(request('', { username: 'owner@example.test', password: PASSWORD }), env), (error) => error.code === 'RATE_LIMITED');
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
