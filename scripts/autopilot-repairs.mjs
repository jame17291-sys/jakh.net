#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { POLICY_VERSION, GENERATORS, GENERATED_OUTPUTS, assertSafePath, assertAllowedChanges,
  assertCatalogProjection, diffSnapshots, treeDigest, sha256 } from './autopilot-policy.mjs';

const MAX_PROCESS_OUTPUT = 2 * 1024 * 1024;
function command(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', timeout: 60_000, maxBuffer: MAX_PROCESS_OUTPUT, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${path.basename(program)} ${args[0] || ''} failed: ${result.error?.message || (result.stderr || result.stdout || `exit ${result.status}`).slice(-4_000)}`);
  }
  return result.stdout;
}
function git(repo, args, options = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env, { GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull });
  return command('git', ['--no-replace-objects', '-c', 'core.fsmonitor=false', '-C', repo, ...args], { env, ...options });
}
function resolveCommit(repo, value, label) {
  if (!/^[a-f0-9]{40}$/u.test(value || '')) throw new Error(`${label} must be a full 40-character commit SHA`);
  const resolved = git(repo, ['rev-parse', '--verify', `${value}^{commit}`]).trim();
  if (resolved !== value) throw new Error(`${label} is not an exact commit`);
  return resolved;
}
function gitTree(repo, sha) {
  const result = new Map();
  for (const record of git(repo, ['ls-tree', '-rz', sha]).split('\0').filter(Boolean)) {
    const match = record.match(/^(\d+) (\S+) ([a-f0-9]+)\t([^]*)$/u);
    if (!match) throw new Error('Invalid git tree record');
    const [, mode, type, oid, name] = match;
    assertSafePath(name);
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error(`Symlink, submodule or special file is forbidden: ${name}`);
    result.set(name, { mode, oid });
  }
  return result;
}
function fileEntry(root, name) {
  assertSafePath(name);
  const parts = name.split('/');
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    if (!fs.existsSync(current) && !fs.lstatSync(current, { throwIfNoEntry: false })) return null;
    const info = fs.lstatSync(current);
    if (info.isSymbolicLink()) throw new Error(`Symlink is forbidden: ${name}`);
    if (index < parts.length - 1 && !info.isDirectory()) throw new Error(`Non-directory parent: ${name}`);
  }
  const stat = fs.lstatSync(current);
  if (!stat.isFile()) throw new Error(`Special file or directory replaces a file: ${name}`);
  const bytes = fs.readFileSync(current);
  return { mode: stat.mode & 0o111 ? '100755' : '100644', bytes: bytes.length, sha256: sha256(bytes),
    gitOid: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
}
function directorySnapshot(root) {
  const names = [];
  function walk(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = `${prefix}${entry.name}`;
      assertSafePath(name);
      if (entry.isDirectory()) walk(path.join(directory, entry.name), `${name}/`);
      else names.push(name);
    }
  }
  walk(root);
  return new Map(names.sort().map((name) => [name, fileEntry(root, name)]));
}
function extractCommit(repo, sha, parent, label) {
  const tree = gitTree(repo, sha); // Inspect paths/types before any tar extraction.
  const directory = path.join(parent, label);
  const archive = path.join(parent, `${label}.tar`);
  fs.mkdirSync(directory);
  git(repo, ['archive', '--format=tar', `--output=${archive}`, sha]);
  command('tar', ['-xf', archive, '-C', directory]);
  fs.unlinkSync(archive);
  const snapshot = directorySnapshot(directory);
  // export-ignore/export-subst attributes must never hide or modify a candidate.
  if (snapshot.size !== tree.size) throw new Error('Git archive does not contain the complete committed tree');
  for (const [name, entry] of tree) {
    const actual = snapshot.get(name);
    if (!actual || actual.gitOid !== entry.oid || actual.mode !== entry.mode) throw new Error(`Git archive differs from committed bytes or mode: ${name}`);
  }
  return { directory, snapshot };
}
function worktreeSnapshot(repo) {
  const names = new Set(git(repo, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean));
  // Include approved outputs even when ignore rules hide an untracked file.
  for (const name of GENERATED_OUTPUTS) if (fs.lstatSync(path.join(repo, name), { throwIfNoEntry: false })) names.add(name);
  const snapshot = new Map();
  for (const name of [...names].sort()) {
    const entry = fileEntry(repo, name);
    if (entry) snapshot.set(name, entry);
  }
  return snapshot;
}
function assertCleanAtBase(repo, baseSha, before) {
  if (git(repo, ['rev-parse', 'HEAD']).trim() !== baseSha) throw new Error('Repair/check checkout HEAD must equal the trusted base SHA');
  if (git(repo, ['status', '--porcelain=v1', '--untracked-files=all']).trim()) throw new Error('Repair/check requires a clean checkout, including untracked files');
  if (diffSnapshots(before, worktreeSnapshot(repo)).length) throw new Error('Working files differ from the trusted base');
}
function runGenerators(directory) {
  const logs = [];
  for (const generator of GENERATORS) {
    const output = command(process.execPath, [path.join(directory, generator)], {
      cwd: directory,
      // No inherited tokens, NODE_OPTIONS, or user configuration reaches a generator.
      env: { PATH: path.dirname(process.execPath), HOME: directory, TMPDIR: os.tmpdir(), TZ: 'UTC', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', CI: '1' },
      timeout: 30_000,
    });
    logs.push({ generator, summary: output.trim().slice(-1_000) });
  }
  return logs;
}
function applyBundle(repo, generated, changes) {
  // All checks run before the first write. The checkout remains unpublished until
  // the orchestrator verifies, tests, and commits the complete bundle.
  const backup = changes.map((change) => ({ ...change,
    original: change.change === 'modify' ? fs.readFileSync(path.join(repo, change.path)) : null }));
  try {
    for (const change of changes) {
      const target = path.join(repo, change.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(generated, change.path), target);
      fs.chmodSync(target, change.newMode === '100755' ? 0o755 : 0o644);
    }
  } catch (error) {
    for (const change of backup.reverse()) {
      const target = path.join(repo, change.path);
      if (change.original === null) fs.rmSync(target, { force: true });
      else {
        fs.writeFileSync(target, change.original);
        fs.chmodSync(target, change.oldMode === '100755' ? 0o755 : 0o644);
      }
    }
    throw error;
  }
}

export function runAutopilot({ mode, repo = process.cwd(), base, candidate } = {}) {
  const report = { schemaVersion: 1, policyVersion: POLICY_VERSION, mode: mode || null, status: 'blocked',
    baseSha: null, candidateSha: null, changedFiles: [], bundleSha256: null,
    beforeTreeSha256: null, afterTreeSha256: null, generators: [], blockedReasons: [] };
  let temporary;
  try {
    if (!['check', 'repair', 'verify'].includes(mode)) throw new Error('Mode must be check, repair or verify');
    if (candidate && mode !== 'verify') throw new Error('--candidate is supported only in verify mode');
    repo = fs.realpathSync(git(path.resolve(repo), ['rev-parse', '--show-toplevel']).trim());
    report.baseSha = resolveCommit(repo, base, '--base');
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'riddlearabia-autopilot-'));
    const trusted = extractCommit(repo, report.baseSha, temporary, 'base');
    report.beforeTreeSha256 = treeDigest(trusted.snapshot);
    if (mode !== 'verify') assertCleanAtBase(repo, report.baseSha, trusted.snapshot);
    // Preserve the original catalog separately before generating into the scratch tree.
    const beforeCatalog = JSON.parse(fs.readFileSync(path.join(trusted.directory, 'data/catalog.json'), 'utf8'));
    report.generators = runGenerators(trusted.directory);
    const expected = directorySnapshot(trusted.directory);
    const changes = diffSnapshots(trusted.snapshot, expected);
    assertAllowedChanges(changes);
    if (changes.some((entry) => entry.path === 'data/catalog.json')) {
      assertCatalogProjection(beforeCatalog, JSON.parse(fs.readFileSync(path.join(trusted.directory, 'data/catalog.json'), 'utf8')));
    }
    // A complete bundle must reach a fixed point. This also catches ordering and
    // timestamp-dependent generators before a candidate can be published.
    runGenerators(trusted.directory);
    if (diffSnapshots(expected, directorySnapshot(trusted.directory)).length) throw new Error('Generators are not deterministic at a fixed point');
    report.changedFiles = changes;
    report.bundleSha256 = sha256(JSON.stringify(changes));
    report.afterTreeSha256 = treeDigest(expected);
    if (mode === 'verify') {
      let actual;
      if (candidate) {
        report.candidateSha = resolveCommit(repo, candidate, '--candidate');
        git(repo, ['merge-base', '--is-ancestor', report.baseSha, report.candidateSha]);
        actual = extractCommit(repo, report.candidateSha, temporary, 'candidate').snapshot;
      } else {
        // A partially staged index can commit bytes different from the inspected
        // working files. Inspect committed candidates when staging is involved.
        git(repo, ['diff', '--cached', '--quiet', '--no-ext-diff', '--no-textconv']);
        actual = worktreeSnapshot(repo);
      }
      assertAllowedChanges(diffSnapshots(trusted.snapshot, actual));
      const mismatch = diffSnapshots(expected, actual);
      if (mismatch.length) throw new Error(`Candidate does not exactly reproduce the trusted repair: ${mismatch.map((entry) => entry.path).slice(0, 20).join(', ')}`);
      report.status = changes.length ? 'verified' : 'clean';
    } else if (mode === 'repair') {
      // Recheck immediately before applying; never overwrite concurrent edits.
      assertCleanAtBase(repo, report.baseSha, trusted.snapshot);
      applyBundle(repo, trusted.directory, changes);
      if (diffSnapshots(expected, worktreeSnapshot(repo)).length) throw new Error('Applied repair differs from its verified bundle');
      report.status = changes.length ? 'repaired' : 'clean';
    } else report.status = changes.length ? 'repairable' : 'clean';
  } catch (error) {
    report.status = 'blocked';
    report.blockedReasons.push(error.message);
  } finally {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  }
  return report;
}

function parseArguments(args) {
  const [mode, ...remaining] = args;
  const values = { mode };
  for (let index = 0; index < remaining.length; index += 2) {
    const flag = remaining[index];
    if (!['--repo', '--base', '--candidate', '--report'].includes(flag) || !remaining[index + 1] || remaining[index + 1].startsWith('--')) throw new Error(`Invalid argument: ${flag}`);
    const key = flag.slice(2);
    if (key in values) throw new Error(`Duplicate argument: ${flag}`);
    values[key] = remaining[index + 1];
  }
  return values;
}
function reportTarget(filename, repo) {
  const target = path.resolve(filename);
  const root = fs.realpathSync(git(path.resolve(repo || process.cwd()), ['rev-parse', '--show-toplevel']).trim());
  const parent = fs.realpathSync(path.dirname(target));
  const resolved = path.join(parent, path.basename(target));
  if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) throw new Error('--report must be outside the repository');
  const existing = fs.lstatSync(resolved, { throwIfNoEntry: false });
  if (existing && !existing.isFile()) throw new Error('--report must name a regular file');
  return resolved;
}
function writeReport(filename, report, repo) {
  const resolved = reportTarget(filename, repo);
  const temporary = `${resolved}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, resolved);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let options;
  let report;
  try {
    options = parseArguments(process.argv.slice(2));
    // Validate the report path before a repair could mutate anything.
    if (options.report) reportTarget(options.report, options.repo);
    report = runAutopilot(options);
    if (options.report) writeReport(options.report, report, options.repo);
  } catch (error) {
    report = { schemaVersion: 1, policyVersion: POLICY_VERSION, mode: options?.mode || null, status: 'blocked', blockedReasons: [error.message] };
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status === 'blocked') process.exitCode = 1;
}
