import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wranglerPath = join(workerRoot, 'node_modules', '.bin', 'wrangler');
const productionConfig = JSON.parse(await readFile(join(workerRoot, 'wrangler.jsonc'), 'utf8'));
const catalog = JSON.parse(await readFile(join(workerRoot, '..', 'data', 'party-games.json'), 'utf8'));
const stateDir = await mkdtemp(join(tmpdir(), 'know-me-local-integration-'));
const token = () => randomBytes(32).toString('base64url');
let child, output = '';

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const port = server.address().port;
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return port;
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const current = child;
  await new Promise(resolveStop => {
    const timer = setTimeout(() => current.kill('SIGKILL'), 5000);
    current.once('exit', () => { clearTimeout(timer); resolveStop(); });
    current.kill('SIGTERM');
  });
  child = undefined;
}

try {
  const port = await freePort(), inspectorPort = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const configPath = join(stateDir, 'wrangler.know-me.integration.json');
  await writeFile(configPath, JSON.stringify({
    name: 'know-me-local-integration', main: join(workerRoot, 'src', 'index.ts'),
    compatibility_date: productionConfig.compatibility_date,
    version_metadata: { binding: 'CF_VERSION_METADATA' },
    vars: { ALLOWED_ORIGINS: baseUrl, STATIC_ORIGIN: baseUrl, IP_HASH_SALT: 'synthetic-know-me-ip-salt-0123456789', PASSWORD_PEPPER: 'synthetic-know-me-pepper-0123456789' },
    d1_databases: [{ binding: 'DB', database_name: 'know-me-test-db', database_id: '00000000-0000-4000-8000-000000000000' }],
    durable_objects: productionConfig.durable_objects, migrations: productionConfig.migrations,
  }), { mode: 0o600 });
  const sql = 'CREATE TABLE rate_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);';
  const seeded = spawnSync(wranglerPath, ['d1', 'execute', 'DB', '--local', '--persist-to', stateDir, '--config', configPath, '--command', sql], {
    cwd: workerRoot, encoding: 'utf8', env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(stateDir, 'seed.log') }, timeout: 60000,
  });
  assert.equal(seeded.status, 0, `Local D1 fixture creation failed: ${seeded.stderr || seeded.stdout}`);

  async function start() {
    output = '';
    child = spawn(wranglerPath, ['dev', '--config', configPath, '--local', '--persist-to', stateDir, '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', String(inspectorPort), '--log-level', 'warn'], {
      cwd: workerRoot, env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(stateDir, 'dev.log') }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const append = chunk => { output = `${output}${chunk}`.slice(-100000); };
    child.stdout.on('data', append); child.stderr.on('data', append);
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Local Wrangler exited before readiness: ${output}`);
      try { if ((await fetch(`${baseUrl}/api/know-me/create`)).status === 405) return; } catch {}
      await new Promise(resolveWait => setTimeout(resolveWait, 250));
    }
    throw new Error(`Local Wrangler did not become ready: ${output}`);
  }
  async function request(path, body, expected = 200, origin = baseUrl) {
    const response = await fetch(`${baseUrl}/api/know-me/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body), redirect: 'manual' });
    const result = await response.json();
    assert.equal(response.status, expected, `${path}: ${JSON.stringify(result)}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return result;
  }
  const assertPublic = snapshot => {
    for (const key of ['answers', 'ownerTokenHash', 'tokenHash', 'answerIndex', 'correctIndex']) assert.equal(JSON.stringify(snapshot).includes(`"${key}"`), false, `private ${key} never reaches a phone`);
    assert.equal(snapshot.questions.length, 10);
    snapshot.questions.forEach(question => { assert.equal(question.options.en.length, 4); assert.equal(question.options.ar.length, 4); });
  };
  await start();
  const owners = [];
  for (const [pack, lang, name] of [['surprises', 'en', 'Owner'], ['habits', 'ar', 'جميل']]) {
    const ownerToken = token();
    const questions = catalog.knowMe.questions.filter(question => question.pack === pack).slice(0, 10).map((question, index) => ({ id: question.id, answerIndex: index % 4 }));
    const body = { token: ownerToken, name, lang, questions };
    const created = await request('create', body, 201); assertPublic(created);
    assert.equal(created.role, 'owner'); assert.equal(created.result, null);
    assert.match(created.code, /^[A-HJ-NP-Z2-9]{12}$/u);
    assert.ok(created.expiresAt >= Date.now() + 7 * 86400000 - 60000 && created.expiresAt <= Date.now() + 7 * 86400000);
    assert.deepEqual(await request('create', body), created, 'create retry resumes its original public quiz');
    const guestToken = token(), wrongToken = token();
    const guest = await request(`${created.code}/state`, { token: guestToken }); assertPublic(guest); assert.equal(guest.role, 'guest');
    const answers = questions.map(question => question.answerIndex);
    const results = await Promise.all([answers, answers.map(answer => (answer + 1) % 4)].map(choices => request(`${created.code}/submit`, { token: guestToken, name: lang === 'ar' ? 'صديق' : 'Friend', answers: choices })));
    assert.deepEqual(results[0].result, results[1].result, 'concurrent lost-response retry cannot overwrite a score');
    assert.deepEqual(results[0].result, { score: 10, total: 10, rank: 1 }); assertPublic(results[0]);
    const wrong = await request(`${created.code}/submit`, { token: wrongToken, name: 'Other', answers: answers.map(answer => (answer + 1) % 4), score: 10 });
    assert.equal(wrong.result.score, 0, 'the server ignores forged score fields');
    const owner = await request(`${created.code}/state`, { token: ownerToken }); assert.equal(owner.leaderboard.length, 2); assertPublic(owner);
    assert.equal(owner.expiresAt, created.expiresAt, 'playing never extends expiry');
    assert.equal((await request(`${created.code}/close`, { token: guestToken }, 403)).code, 'QUIZ_OWNER_REQUIRED');
    owners.push({ code: created.code, ownerToken, guestToken, result: results[0].result, expiresAt: created.expiresAt });
    console.log(`PASS Know Me native Worker/SQLite Durable Object: ${lang} creation, bilingual private snapshot, honest grading, concurrent retry and owner-only deletion`);
  }
  const malformed = { ...{ token: token(), name: 'Invalid', lang: 'en' }, questions: Array(10).fill({ id: catalog.knowMe.questions[0].id, answerIndex: 0 }) };
  assert.equal((await request('create', malformed, 400)).code, 'INVALID_QUIZ_QUESTIONS');
  assert.equal((await request(`${owners[0].code}/state`, { token: token() }, 403, 'https://untrusted.example')).code, 'ORIGIN_NOT_ALLOWED');
  assert.equal((await request('ZZZZZZZZ2345/state', { token: token() }, 404)).code, 'QUIZ_NOT_FOUND');
  await stop(); await start();
  for (const saved of owners) {
    const resumed = await request(`${saved.code}/state`, { token: saved.guestToken });
    assert.deepEqual(resumed.result, saved.result); assert.equal(resumed.expiresAt, saved.expiresAt);
    assert.deepEqual(await request(`${saved.code}/close`, { token: saved.ownerToken }), { closed: true });
    assert.deepEqual(await request(`${saved.code}/close`, { token: saved.ownerToken }), { closed: true });
    assert.equal((await request(`${saved.code}/state`, { token: saved.guestToken }, 404)).code, 'QUIZ_NOT_FOUND');
  }
  console.log('Know Me local Wrangler integration passed: 2 languages, 4 participant devices, native persistence across restart, private answer keys, immutable scores and immediate deletion. No external requests or production credentials.');
} finally {
  await stop();
  await rm(stateDir, { recursive: true, force: true });
}
