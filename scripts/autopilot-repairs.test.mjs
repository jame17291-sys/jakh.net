import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GENERATORS } from './autopilot-policy.mjs';
import { runAutopilot } from './autopilot-repairs.mjs';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entrypoint = path.join(sourceRoot, 'scripts/autopilot-repairs.mjs');
function git(repo, ...args) {
  const result = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function write(repo, name, content) {
  fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
  fs.writeFileSync(path.join(repo, name), content);
}
function commit(repo) {
  git(repo, 'add', '-A');
  git(repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Fixture');
  return git(repo, 'rev-parse', 'HEAD');
}
function fixture(t, { generator, missing = false } = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-test-'));
  const repo = path.join(parent, 'repo');
  fs.mkdirSync(repo);
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  git(repo, 'init', '--quiet');
  git(repo, 'config', 'core.filemode', 'true');
  write(repo, 'data/catalog.json', JSON.stringify({ site: { totalQuestions: 1 }, categories: [] }));
  write(repo, 'data/science.json', '[{"question":"Authored question","answer":"Authored answer"}]\n');
  if (!missing) write(repo, 'data/search-index.json', 'stale\n');
  for (const script of GENERATORS) write(repo, script, '');
  write(repo, GENERATORS[0], generator || `import fs from 'node:fs'; fs.writeFileSync('data/search-index.json', 'generated\\n');`);
  return { parent, repo, base: commit(repo) };
}
function run(options, mode = 'check') { return runAutopilot({ ...options, mode }); }
function assertBlocked(report, pattern) {
  assert.equal(report.status, 'blocked', JSON.stringify(report));
  if (pattern) assert.match(report.blockedReasons.join('\n'), pattern);
}

test('check diagnoses a complete repair without writing; repair and verification reproduce the same bundle', (t) => {
  const setup = fixture(t);
  const checked = run(setup);
  assert.equal(checked.status, 'repairable', JSON.stringify(checked));
  assert.deepEqual(checked.changedFiles.map((entry) => entry.path), ['data/search-index.json']);
  assert.equal(fs.readFileSync(path.join(setup.repo, 'data/search-index.json'), 'utf8'), 'stale\n');
  assert.equal(git(setup.repo, 'status', '--porcelain'), '');
  const repaired = run(setup, 'repair');
  assert.equal(repaired.status, 'repaired', JSON.stringify(repaired));
  assert.equal(repaired.bundleSha256, checked.bundleSha256);
  assert.equal(run(setup, 'verify').status, 'verified');
  const candidate = commit(setup.repo);
  assert.equal(run({ ...setup, candidate }, 'verify').status, 'verified');
  assert.equal(run({ ...setup, base: candidate }).status, 'clean');
  assert.equal(fs.readFileSync(path.join(setup.repo, 'data/science.json'), 'utf8'), '[{"question":"Authored question","answer":"Authored answer"}]\n');
});
test('a missing known generated output may be restored as a non-executable addition', (t) => {
  const setup = fixture(t, { missing: true });
  const report = run(setup, 'repair');
  assert.equal(report.status, 'repaired', JSON.stringify(report));
  assert.equal(report.changedFiles[0].change, 'add');
  assert.equal(report.changedFiles[0].newMode, '100644');
  assert.equal(run(setup, 'verify').status, 'verified');
});
test('repair refuses dirty tracked files, untracked files and a different HEAD', (t) => {
  const setup = fixture(t);
  write(setup.repo, 'extra.txt', 'untracked');
  assertBlocked(run(setup, 'repair'), /clean checkout/);
  fs.unlinkSync(path.join(setup.repo, 'extra.txt'));
  write(setup.repo, 'data/science.json', 'modified');
  assertBlocked(run(setup, 'repair'), /clean checkout/);
  commit(setup.repo);
  assertBlocked(run(setup, 'repair'), /HEAD must equal/);
});
test('candidate contents, arbitrary Arabic routes, source data and workflow changes are rejected', async (t) => {
  for (const name of ['data/search-index.json', 'ar/admin/index.html', 'data/science.json', '.github/workflows/unsafe.yml']) {
    await t.test(name, (sub) => {
      const setup = fixture(sub);
      assert.equal(run(setup, 'repair').status, 'repaired');
      write(setup.repo, name, 'untrusted candidate bytes');
      assertBlocked(run(setup, 'verify'), name === 'data/search-index.json' ? /exactly reproduce/ : /Not an approved/);
    });
  }
});
test('staged differences, deleted files, symlinks and mode changes are rejected', async (t) => {
  for (const kind of ['staged', 'deleted', 'symlink', 'mode']) {
    await t.test(kind, (sub) => {
      const setup = fixture(sub);
      assert.equal(run(setup, 'repair').status, 'repaired');
      const target = path.join(setup.repo, 'data/search-index.json');
      if (kind === 'staged') git(setup.repo, 'add', 'data/search-index.json');
      if (kind === 'deleted') fs.unlinkSync(target);
      if (kind === 'symlink') { fs.unlinkSync(target); fs.symlinkSync('science.json', target); }
      if (kind === 'mode') fs.chmodSync(target, 0o755);
      assertBlocked(run(setup, 'verify'));
    });
  }
});
test('the verifier never executes scripts from a candidate commit', (t) => {
  const setup = fixture(t);
  assert.equal(run(setup, 'repair').status, 'repaired');
  const sentinel = path.join(setup.parent, 'candidate-executed');
  write(setup.repo, GENERATORS[0], `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(sentinel)}, 'bad');`);
  const candidate = commit(setup.repo);
  assertBlocked(run({ ...setup, candidate }, 'verify'), /Not an approved/);
  assert.equal(fs.existsSync(sentinel), false);
});
test('unexpected generator writes, deletions and non-deterministic output never reach the checkout', async (t) => {
  for (const generator of [
    `import fs from 'node:fs'; fs.writeFileSync('admin.html', 'unsafe');`,
    `import fs from 'node:fs'; fs.unlinkSync('data/search-index.json');`,
    `import fs from 'node:fs'; fs.appendFileSync('data/search-index.json', 'again');`,
  ]) {
    await t.test(generator, (sub) => {
      const setup = fixture(sub, { generator });
      assertBlocked(run(setup, 'repair'));
      assert.equal(git(setup.repo, 'status', '--porcelain'), '');
      assert.equal(fs.existsSync(path.join(setup.repo, 'admin.html')), false);
    });
  }
});
test('git export-ignore cannot conceal unauthorized candidate changes', (t) => {
  const setup = fixture(t);
  assert.equal(run(setup, 'repair').status, 'repaired');
  write(setup.repo, '.gitattributes', 'admin.html export-ignore\n');
  write(setup.repo, 'admin.html', 'hidden unsafe edit');
  const candidate = commit(setup.repo);
  assertBlocked(run({ ...setup, candidate }, 'verify'), /complete committed tree/);
});
test('CLI requires exact commits, validates flags and writes bounded reports outside the checkout', (t) => {
  const setup = fixture(t);
  const invoke = (...args) => spawnSync(process.execPath, [entrypoint, ...args], { cwd: setup.repo, encoding: 'utf8' });
  for (const args of [['check', '--base', 'HEAD'], ['check', '--base', setup.base, '--unknown', 'x'], ['check', '--base', setup.base, '--base', setup.base], ['repair', '--base', setup.base, '--report', path.join(setup.repo, 'report.json')]]) {
    const result = invoke(...args);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).status, 'blocked');
    assert.equal(git(setup.repo, 'status', '--porcelain'), '');
  }
  const target = path.join(setup.parent, 'report.json');
  const result = invoke('check', '--base', setup.base, '--repo', setup.repo, '--report', target);
  assert.equal(result.status, 0, result.stdout);
  const report = JSON.parse(fs.readFileSync(target, 'utf8'));
  assert.equal(report.status, 'repairable');
  assert.equal(report.baseSha, setup.base);
  assert.ok(result.stdout.length < 10_000);
  assert.equal('contents' in report.changedFiles[0], false);
});
test('real trusted repository generators are compatible with the bounded policy', (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-real-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const repo = path.join(parent, 'repo');
  const clone = spawnSync('git', ['clone', '--quiet', '--no-hardlinks', sourceRoot, repo], { encoding: 'utf8' });
  assert.equal(clone.status, 0, clone.stderr);
  // Manufacture stale outputs without altering any trusted factual source.
  write(repo, 'data/search-index.json', 'stale\n');
  write(repo, 'ar/daily/index.html', '<!doctype html><title>Stale</title>\n');
  const base = commit(repo);
  const report = run({ repo, base }, 'repair');
  assert.equal(report.status, 'repaired', JSON.stringify(report));
  assert.ok(report.changedFiles.some((entry) => entry.path === 'data/search-index.json'));
  assert.ok(report.changedFiles.some((entry) => entry.path === 'ar/daily/index.html'));
  assert.equal(run({ repo, base }, 'verify').status, 'verified');
});
