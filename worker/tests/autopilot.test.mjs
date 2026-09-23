import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  adminAutopilot, updateAdminAutopilot, claimAutopilot, reportAutopilot,
  reserveAutopilotRelease, authorizeAutopilotRelease, verifyAutopilotIdentity,
} from '../dist/autopilot.js';
import worker from '../dist/index.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' };
const SOURCE = 'a'.repeat(40);
const CANDIDATE = 'b'.repeat(40);
const DAY = new Date().toISOString().slice(0, 10);
const ORIGIN = 'https://riddlearabia.com';
const ENABLED_KEY = 'autopilot:v1:enabled';
const RUN_PREFIX = 'autopilot:v1:run:';
const SESSION_TOKEN = 'A'.repeat(43);
const JWKS = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const originalFetch = globalThis.fetch;
let jwksCalls = 0;
globalThis.fetch = async (url, options) => {
  assert.equal(url, JWKS);
  assert.equal(options.redirect, 'error');
  jwksCalls += 1;
  return new Response(JSON.stringify({ keys: [jwk] }));
};
test.after(() => { globalThis.fetch = originalFetch; });

function token(overrides = {}, headerOverrides = {}, signingKey = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', kid: 'test-key', ...headerOverrides };
  const claims = {
    iss: 'https://token.actions.githubusercontent.com', aud: 'https://api.riddlearabia.com/autopilot',
    sub: 'repo:jame17291-sys/jakh.net:ref:refs/heads/main', repository: 'jame17291-sys/jakh.net',
    repository_id: '1227088138', repository_owner_id: '281123018', ref: 'refs/heads/main', ref_type: 'branch',
    ref_protected: 'true', sha: SOURCE, workflow_sha: SOURCE, runner_environment: 'github-hosted',
    workflow_ref: 'jame17291-sys/jakh.net/.github/workflows/site-autopilot.yml@refs/heads/main',
    event_name: 'schedule', run_id: '1001', run_attempt: '1', jti: 'unique-test-token', iat: now, nbf: now, exp: now + 300,
    ...overrides,
  };
  const part = [header, claims].map((item) => Buffer.from(JSON.stringify(item)).toString('base64url')).join('.');
  return `${part}.${sign('RSA-SHA256', Buffer.from(part), signingKey).toString('base64url')}`;
}
function machine(path, body = {}, claims = {}, header = {}) {
  return new Request(`https://api.riddlearabia.com/api/internal/autopilot/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token(claims, header)}` }, body: JSON.stringify(body),
  });
}
function owner(method = 'GET', body, extra = {}) {
  return new Request('https://api.riddlearabia.com/api/admin/autopilot', {
    method, headers: { origin: ORIGIN, cookie: `__Host-jakh_session=${SESSION_TOKEN}`, 'content-type': 'application/json', ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const apiClaims = (runId = '2001') => ({ workflow_ref: 'jame17291-sys/jakh.net/.github/workflows/api-deploy.yml@refs/heads/main', event_name: 'workflow_dispatch', sha: CANDIDATE, workflow_sha: CANDIDATE, run_id: runId });
const staticClaims = (runId = '3001') => ({ ...apiClaims(runId), workflow_ref: 'jame17291-sys/jakh.net/.github/workflows/static-site.yml@refs/heads/main' });
function error(code, status) { return (error) => error.code === code && (status === undefined || error.status === status); }
async function setup(t, { role = 'OWNER', enabled = true } = {}) {
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  database.exec('PRAGMA foreign_keys=ON');
  const dir = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(dir)).filter((name) => /^\d{4}_.+\.sql$/u.test(name)).sort()) database.exec(await readFile(new URL(name, dir), 'utf8'));
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO users (id,username,username_key,password_hash,password_salt,password_iterations,role,created_at,updated_at) VALUES ('owner-1','owner','owner','unused','unused',100000,?,?,?)`).run(role, now, now);
  database.prepare('INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (?,\'owner-1\',?,?)').run(createHash('sha256').update(SESSION_TOKEN).digest('base64url'), now, new Date(Date.now() + 3600000).toISOString());
  if (enabled !== undefined) database.prepare('INSERT INTO schema_meta (key,value) VALUES (?,?)').run(ENABLED_KEY, String(enabled));
  const env = {
    PASSWORD_PEPPER: 'a'.repeat(32), IP_HASH_SALT: 'b'.repeat(32), ALLOWED_ORIGINS: ORIGIN, STATIC_ORIGIN: ORIGIN,
    DB: {
      prepare(sql) {
        const stmt = database.prepare(sql);
        return {
          values: [], bind(...values) { this.values = values; return this; },
          async first() { return stmt.get(...this.values) || null; },
          async all() { return { results: stmt.all(...this.values), success: true }; },
          runSync() { return { meta: stmt.run(...this.values), success: true }; },
          async run() { return this.runSync(); },
        };
      },
      async batch(statements) {
        database.exec('BEGIN');
        try { const values = statements.map((s) => s.runSync()); database.exec('COMMIT'); return values; }
        catch (err) { database.exec('ROLLBACK'); throw err; }
      },
    },
  };
  return { env, database };
}
async function claimed(env, claims = {}) { return (await claimAutopilot(machine('claim', {}, claims), env)).json(); }
async function reserved(env) { await claimed(env); return (await reserveAutopilotRelease(machine('release', { day: DAY, candidateSha: CANDIDATE }), env)).json(); }
async function authorized(env, stage = 'api', runId) {
  return (await authorizeAutopilotRelease(machine('authorize-release', { day: DAY, maintenanceRunId: '1001', candidateSha: CANDIDATE }, stage === 'api' ? apiClaims(runId) : staticClaims(runId)), env)).json();
}

test('OIDC verifies an actual RSA signature and caches only the fixed GitHub JWKS', async () => {
  assert.deepEqual(await verifyAutopilotIdentity(machine('claim')), { runId: '1001', runAttempt: '1', sourceSha: SOURCE, stage: 'maintenance' });
  await verifyAutopilotIdentity(machine('claim'));
  assert.equal(jwksCalls, 1);
});

test('OIDC rejects malformed bearer tokens, wrong algorithm, token-supplied key URLs, and forged signatures', async () => {
  for (const authorization of ['', 'Bearer not.a.jwt', `Bearer ${'x'.repeat(17000)}`, 'Basic xxx']) {
    await assert.rejects(verifyAutopilotIdentity(new Request('https://api.riddlearabia.com', { headers: { authorization } })), error('AUTOPILOT_IDENTITY_INVALID', 401));
  }
  for (const header of [{ alg: 'HS256' }, { jku: 'https://attacker.example/keys' }, { jwk }, { x5u: 'https://attacker.example/key' }, { crit: ['exp'] }, { kid: 'not-github' }]) {
    await assert.rejects(verifyAutopilotIdentity(machine('claim', {}, {}, header)), error('AUTOPILOT_IDENTITY_INVALID', 401));
  }
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const request = new Request('https://api.riddlearabia.com', { headers: { authorization: `Bearer ${token({}, {}, other.privateKey)}` } });
  await assert.rejects(verifyAutopilotIdentity(request), error('AUTOPILOT_IDENTITY_INVALID', 401));
});

test('OIDC pins immutable repository IDs, workflow SHA, protected main, hosted runner and event scope', async () => {
  for (const [key, value] of Object.entries({ iss: 'https://attacker.example', aud: 'wrong', repository: 'attacker/jakh.net', repository_id: '1', repository_owner_id: '1', ref: 'refs/heads/patch', ref_type: 'tag', ref_protected: 'false', workflow_sha: CANDIDATE, runner_environment: 'self-hosted', sha: 'wrong', run_id: '../oops', run_attempt: '0', jti: '', workflow_ref: 'jame17291-sys/jakh.net/.github/workflows/evil.yml@refs/heads/main', event_name: 'pull_request_target' })) {
    await assert.rejects(verifyAutopilotIdentity(machine('claim', {}, { [key]: value })), error('AUTOPILOT_IDENTITY_SCOPE_INVALID', 403), key);
  }
  await assert.rejects(verifyAutopilotIdentity(machine('claim', {}, apiClaims())), error('AUTOPILOT_IDENTITY_SCOPE_INVALID'));
  await assert.rejects(verifyAutopilotIdentity(machine('claim'), true), error('AUTOPILOT_IDENTITY_SCOPE_INVALID'));
  await assert.rejects(verifyAutopilotIdentity(machine('claim', {}, { ...apiClaims(), event_name: 'schedule' }), true), error('AUTOPILOT_IDENTITY_SCOPE_INVALID'));
});

test('OIDC rejects expired, future and long-lived tokens', async () => {
  const now = Math.floor(Date.now() / 1000);
  for (const claims of [{ exp: now - 1 }, { nbf: now + 90 }, { iat: now + 90 }, { iat: now - 601 }, { exp: now + 1000 }, { exp: 'tomorrow' }, { nbf: null }]) {
    await assert.rejects(verifyAutopilotIdentity(machine('claim', {}, claims)), error('AUTOPILOT_IDENTITY_EXPIRED', 401));
  }
});

test('owner control defaults paused; non-owners and unauthenticated users cannot inspect or mutate', async (t) => {
  const { env, database } = await setup(t);
  database.prepare('DELETE FROM schema_meta WHERE key=?').run(ENABLED_KEY);
  const result = await (await adminAutopilot(owner(), env)).json();
  assert.equal(result.enabled, false);
  assert.deepEqual(result.runs, []);
  assert.equal(result.lastRun, null);
  assert.deepEqual(result.policy, { schedule: 'Daily at 07:23 Dubai', maxRunsPerDay: 1, maxReleasesPerDay: 1, aiBudgetUsd: 0 });
  database.prepare("UPDATE users SET role='ADMIN'").run();
  await assert.rejects(adminAutopilot(owner(), env), error('OWNER_REQUIRED', 403));
  await assert.rejects(updateAdminAutopilot(owner('POST', { enabled: true }), env), error('OWNER_REQUIRED', 403));
  await assert.rejects(adminAutopilot(owner('GET', undefined, { cookie: '' }), env), error('UNAUTHORIZED', 401));
});

test('owner control checks Origin, JSON boolean, request size, rate limit and records each pause/resume audit', async (t) => {
  const { env, database } = await setup(t);
  for (const origin of ['', 'https://attacker.example']) await assert.rejects(updateAdminAutopilot(owner('POST', { enabled: true }, { origin }), env), error('ORIGIN_NOT_ALLOWED', 403));
  for (const body of [{ enabled: 'true' }, { enabled: true, secret: 'ignore me' }, {}]) await assert.rejects(updateAdminAutopilot(owner('POST', body), env), error('AUTOPILOT_PAYLOAD_INVALID', 400));
  assert.equal((await (await updateAdminAutopilot(owner('POST', { enabled: false }), env)).json()).enabled, false);
  assert.equal((await (await updateAdminAutopilot(owner('POST', { enabled: true }), env)).json()).enabled, true);
  assert.deepEqual(database.prepare('SELECT action FROM admin_audit_log ORDER BY rowid').all().map((row) => row.action), ['autopilot.paused', 'autopilot.resumed']);
  database.prepare('UPDATE rate_limits SET count=20').run();
  await assert.rejects(updateAdminAutopilot(owner('POST', { enabled: false }), env), error('RATE_LIMITED', 429));
});

test('one daily claim wins across racing runs; retries require the exact run and attempt', async (t) => {
  const { env, database } = await setup(t);
  const results = await Promise.allSettled([claimed(env), claimed(env, { run_id: '1002' })]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'AUTOPILOT_RUN_MISMATCH');
  const winner = results.find((r) => r.status === 'fulfilled').value.run.runId;
  assert.equal((await claimed(env, { run_id: winner })).run.runId, winner);
  await assert.rejects(claimed(env, { run_id: winner, run_attempt: '2' }), error('AUTOPILOT_RUN_MISMATCH'));
  await assert.rejects(claimed(env, { run_id: winner, sha: CANDIDATE, workflow_sha: CANDIDATE }), error('AUTOPILOT_RUN_MISMATCH'));
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM schema_meta WHERE key GLOB 'autopilot:v1:run:*'").get().count, 1);
});

test('paused claims fail closed; pause invalidates outstanding release authority even after resume', async (t) => {
  const { env } = await setup(t, { enabled: false });
  await assert.rejects(claimed(env), error('AUTOPILOT_PAUSED', 423));
  await updateAdminAutopilot(owner('POST', { enabled: true }), env);
  await reserved(env);
  await updateAdminAutopilot(owner('POST', { enabled: false }), env);
  await assert.rejects(authorized(env), error('AUTOPILOT_PAUSED', 423));
  await updateAdminAutopilot(owner('POST', { enabled: true }), env);
  await assert.rejects(authorized(env), error('AUTOPILOT_PAUSED', 423));
  await assert.rejects(claimed(env), error('AUTOPILOT_PAUSED', 423));
});

test('daily receipts retain exactly 30 records and preserve unrelated schema metadata', async (t) => {
  const { env, database } = await setup(t);
  const template = (await claimed(env)).run;
  for (let i = 1; i <= 40; i++) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    database.prepare('INSERT INTO schema_meta (key,value) VALUES (?,?)').run(RUN_PREFIX + day, JSON.stringify({ ...template, day }));
  }
  await claimed(env);
  const result = await (await adminAutopilot(owner(), env)).json();
  assert.equal(result.runs.length, 30);
  assert.equal(result.lastRun.day, DAY);
  assert.equal(database.prepare('SELECT value FROM schema_meta WHERE key=\'schema_version\'').get().value, '9');
});

test('a single candidate may reserve one daily release and CAS prevents competing candidates', async (t) => {
  const { env } = await setup(t);
  await claimed(env);
  const results = await Promise.allSettled([CANDIDATE, 'c'.repeat(40)].map((candidateSha) => reserveAutopilotRelease(machine('release', { day: DAY, candidateSha }), env)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(['AUTOPILOT_RUN_CHANGED', 'AUTOPILOT_RELEASE_ALREADY_RESERVED', 'AUTOPILOT_RELEASE_ALREADY_AUTHORIZED'].includes(results.find((r) => r.status === 'rejected').reason.code));
  const winner = (await results.find((r) => r.status === 'fulfilled').value.json()).run.candidateSha;
  const loser = winner === CANDIDATE ? 'c'.repeat(40) : CANDIDATE;
  assert.equal((await (await reserveAutopilotRelease(machine('release', { day: DAY, candidateSha: winner }), env)).json()).reserved, true);
  await assert.rejects(reserveAutopilotRelease(machine('release', { day: DAY, candidateSha: loser }), env), error('AUTOPILOT_RELEASE_ALREADY_RESERVED'));
  await assert.rejects(reserveAutopilotRelease(machine('release', { day: '2000-01-01', candidateSha: CANDIDATE }), env), error('AUTOPILOT_DAY_INVALID'));
  await assert.rejects(reserveAutopilotRelease(machine('release', { day: DAY, candidateSha: CANDIDATE }, { run_id: '9999' }), env), error('AUTOPILOT_RUN_MISMATCH'));
});

test('release workflow grants are stage specific, exact source and run bound, with API before static', async (t) => {
  const { env } = await setup(t);
  await assert.rejects(authorized(env), error('AUTOPILOT_RUN_NOT_CLAIMED'));
  await reserved(env);
  await assert.rejects(authorized(env, 'static'), error('AUTOPILOT_API_RELEASE_REQUIRED'));
  await assert.rejects(authorizeAutopilotRelease(machine('authorize-release', { day: DAY, maintenanceRunId: '1001', candidateSha: CANDIDATE }, { ...apiClaims(), sha: SOURCE, workflow_sha: SOURCE }), env), error('AUTOPILOT_RELEASE_MISMATCH'));
  assert.equal((await authorized(env)).stage, 'api');
  assert.equal((await authorized(env)).authorized, true);
  await assert.rejects(authorized(env, 'api', '2002'), error('AUTOPILOT_RELEASE_ALREADY_AUTHORIZED'));
  await assert.rejects(authorizeAutopilotRelease(machine('authorize-release', { day: DAY, maintenanceRunId: '1001', candidateSha: CANDIDATE }, { ...apiClaims(), run_attempt: '2' }), env), error('AUTOPILOT_RELEASE_ALREADY_AUTHORIZED'));
  assert.equal((await authorized(env, 'static')).stage, 'static');
  assert.equal((await authorized(env, 'static')).authorized, true);
  await assert.rejects(authorized(env, 'static', '3002'), error('AUTOPILOT_RELEASE_ALREADY_AUTHORIZED'));
});

test('only one competing stage run can acquire release authority', async (t) => {
  const { env } = await setup(t);
  await reserved(env);
  const results = await Promise.allSettled([authorized(env, 'api', '2001'), authorized(env, 'api', '2002')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(['AUTOPILOT_RUN_CHANGED', 'AUTOPILOT_RELEASE_ALREADY_RESERVED', 'AUTOPILOT_RELEASE_ALREADY_AUTHORIZED'].includes(results.find((r) => r.status === 'rejected').reason.code));
});

test('receipts accept bounded counters and known statuses, derive URLs and reject arbitrary logs or secrets', async (t) => {
  const { env } = await setup(t);
  await claimed(env);
  for (const body of [{ status: 'unsafe' }, { status: 'testing', summary: 'a secret' }, { status: 'testing', findings: { whatever: 1 } }, { status: 'testing', findings: { total: -1 } }, { status: 'testing', checksPassed: 100001 }, { status: 'testing', fixesApplied: 1.5 }, { status: 'testing', workerVersion: 'secret' }, { status: 'testing', buildId: 'bad' }, { status: 'testing', candidateSha: 'bad' }, { status: 'testing', deploymentRunId: '999' }]) {
    await assert.rejects(reportAutopilot(machine('report', { day: DAY, ...body }), env), error('AUTOPILOT_PAYLOAD_INVALID'));
  }
  const run = (await (await reportAutopilot(machine('report', { day: DAY, status: 'testing', findings: { brokenLinks: 2, total: 2 }, checksPassed: 40, checksFailed: 0, fixesApplied: 2 }), env)).json()).run;
  assert.equal(run.findings.total, 2);
  assert.equal(run.checksPassed, 40);
  assert.equal(run.url, 'https://github.com/jame17291-sys/jakh.net/actions/runs/1001');
  await assert.rejects(reportAutopilot(machine('report', { day: DAY, status: 'testing' }, { run_id: '1002' }), env), error('AUTOPILOT_RUN_MISMATCH'));
  await assert.rejects(reportAutopilot(machine('report', { day: DAY, status: 'testing', pad: 'a'.repeat(3000) }), env), error('REQUEST_BODY_TOO_LARGE', 413));
});

test('deployment receipts require reserved static authority and keep terminal runs closed', async (t) => {
  const { env } = await setup(t);
  await claimed(env);
  await assert.rejects(reportAutopilot(machine('report', { day: DAY, status: 'deployed' }), env), error('AUTOPILOT_RELEASE_MISMATCH'));
  await reserveAutopilotRelease(machine('release', { day: DAY, candidateSha: CANDIDATE }), env);
  await authorized(env);
  await authorized(env, 'static');
  const result = await (await reportAutopilot(machine('report', { day: DAY, status: 'deployed', candidateSha: CANDIDATE, buildId: 'd'.repeat(64), workerVersion: '07003da4-69e2-43c1-8c41-e8b8ea71f80a', deploymentRunId: '3001' }), env)).json();
  assert.equal(result.run.deploymentUrl, 'https://github.com/jame17291-sys/jakh.net/actions/runs/3001');
  await assert.rejects(reportAutopilot(machine('report', { day: DAY, status: 'testing' }), env), error('AUTOPILOT_RUN_FINISHED'));
  assert.equal((await (await reportAutopilot(machine('report', { day: DAY, status: 'rolled_back' }), env)).json()).run.status, 'rolled_back');
});

test('no changes/needs attention finishes without consuming a release; terminal records cannot reopen', async (t) => {
  const { env } = await setup(t);
  await claimed(env);
  const result = await (await reportAutopilot(machine('report', { day: DAY, status: 'needs_attention', findings: { total: 1 } }), env)).json();
  assert.equal(result.run.releaseReservedAt, null);
  await assert.rejects(reserveAutopilotRelease(machine('release', { day: DAY, candidateSha: CANDIDATE }), env), error('AUTOPILOT_RUN_FINISHED'));
  await assert.rejects(reportAutopilot(machine('report', { day: DAY, status: 'fixing' }), env), error('AUTOPILOT_RUN_FINISHED'));
});

test('HTTP routing permits originless OIDC only on exact machine endpoints and never bypasses session controls', async (t) => {
  const { env } = await setup(t);
  assert.equal((await worker.fetch(machine('claim'), env)).status, 200);
  for (const path of ['/api/admin/autopilot', '/api/internal/autopilot/claim/', '/api/internal/autopilot/other']) {
    const response = await worker.fetch(new Request(`https://api.riddlearabia.com${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), env);
    assert.equal(response.status, 403);
  }
  const bad = new Request('https://api.riddlearabia.com/api/internal/autopilot/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal((await worker.fetch(bad, env)).status, 401);
  assert.equal((await worker.fetch(owner(), env)).status, 200);
  assert.equal((await worker.fetch(owner('POST', { enabled: false }), env)).status, 200);
});

test('a pause at the atomic write boundary blocks release reservation', async (t) => {
  const { env, database } = await setup(t);
  await claimed(env);
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql) => {
    if (sql.includes('UPDATE schema_meta SET value = ? WHERE key = ? AND value = ?')) {
      database.prepare('UPDATE schema_meta SET value=\'false\' WHERE key=?').run(ENABLED_KEY);
    }
    return prepare(sql);
  };
  await assert.rejects(reserveAutopilotRelease(machine('release', { day: DAY, candidateSha: CANDIDATE }), env), error('AUTOPILOT_PAUSED', 423));
  const run = JSON.parse(database.prepare('SELECT value FROM schema_meta WHERE key=?').get(RUN_PREFIX + DAY).value);
  assert.equal(run.releaseReservedAt, null);
});

test('a concurrent receipt change cannot be overwritten by a stale release reservation', async (t) => {
  const { env, database } = await setup(t);
  await claimed(env);
  const prepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql) => {
    if (sql.includes('UPDATE schema_meta SET value = ? WHERE key = ? AND value = ?')) {
      database.prepare("UPDATE schema_meta SET value=json_set(value,'$.checksPassed',999) WHERE key=?").run(RUN_PREFIX + DAY);
    }
    return prepare(sql);
  };
  await assert.rejects(reserveAutopilotRelease(machine('release', { day: DAY, candidateSha: CANDIDATE }), env), error('AUTOPILOT_RUN_CHANGED', 409));
  const run = JSON.parse(database.prepare('SELECT value FROM schema_meta WHERE key=?').get(RUN_PREFIX + DAY).value);
  assert.equal(run.checksPassed, 999);
  assert.equal(run.releaseReservedAt, null);
});

test('failed release cannot obtain new authority through an otherwise idempotent replay', async (t) => {
  const { env } = await setup(t);
  await reserved(env);
  await authorized(env);
  await reportAutopilot(machine('report', { day: DAY, status: 'failed' }), env);
  await assert.rejects(authorized(env), error('AUTOPILOT_RUN_FINISHED', 409));
  await assert.rejects(reserveAutopilotRelease(machine('release', { day: DAY, candidateSha: CANDIDATE }), env), error('AUTOPILOT_RUN_FINISHED', 409));
});

test('owner-paused run reports return the pause code instead of misleading terminal failure, including after resume', async (t) => {
  const { env } = await setup(t);
  await claimed(env);
  await updateAdminAutopilot(owner('POST', { enabled: false }), env);
  for (const status of ['testing', 'failed', 'needs_attention']) {
    await assert.rejects(reportAutopilot(machine('report', { day: DAY, status }), env), error('AUTOPILOT_PAUSED', 423));
  }
  assert.equal((await (await reportAutopilot(machine('report', { day: DAY, status: 'paused' }), env)).json()).run.status, 'paused');
  await updateAdminAutopilot(owner('POST', { enabled: true }), env);
  await assert.rejects(reportAutopilot(machine('report', { day: DAY, status: 'testing' }), env), error('AUTOPILOT_PAUSED', 423));
});
