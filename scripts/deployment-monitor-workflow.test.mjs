import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { trustedRun, trustedEvent, trustedArtifact, downloadMaintenance, publicStatus, commentBody, REPOSITORY } from './deployment-monitor-workflow.mjs';
import { maintenanceReceiptIdentity } from './site-autopilot.mjs';

const repo = { id: 1227088138, full_name: REPOSITORY, default_branch: 'main' };
const run = { id: 36992293164, run_attempt: 2, repository: repo, head_repository: repo,
  head_branch: 'main', head_sha: 'a'.repeat(40), path: '.github/workflows/site-autopilot.yml',
  name: 'Daily maintenance · source', event: 'schedule', status: 'completed', conclusion: 'success' };
const event = { action: 'completed', repository: repo, workflow_run: run };
const artifact = { id: 42, name: `autopilot-${run.id}-${run.run_attempt}`, expired: false, size_in_bytes: 331,
  workflow_run: { id: run.id, repository_id: repo.id, head_repository_id: repo.id, head_branch: 'main', head_sha: run.head_sha } };
const report = { version: 1, repository: REPOSITORY, runId: String(run.id), runAttempt: run.run_attempt,
  sourceSha: run.head_sha, workflow: 'maintenance', status: 'inspected', releaseMode: 'inspection_only',
  summary: { checksPassed: 82, checksFailed: 0, buildId: null, workerVersion: null, smokeTestPassed: null } };

test('run identity excludes forks, other branches/workflows, unsupported events and incomplete runs', () => {
  assert.deepEqual(trustedEvent(event), { id: String(run.id), attempt: '2', sha: run.head_sha });
  for (const changed of [ { id: '1; echo injected' }, { id: [123] }, { run_attempt: 0 }, { run_attempt: 10_001 }, { head_sha: 'main' },
    { repository: { ...repo, id: 1 } }, { head_repository: { ...repo, full_name: 'fork/repo' } },
    { head_branch: 'feature/tool' }, { path: '.github/workflows/api-check.yml' }, { event: 'pull_request' },
    { status: 'in_progress' }, { conclusion: null } ]) assert.throws(() => trustedRun({ ...run, ...changed }), /Untrusted/);
  assert.throws(() => trustedEvent({ ...event, action: 'requested' }), /Untrusted/);
  assert.throws(() => trustedEvent({ ...event, repository: { ...repo, default_branch: 'untrusted' } }), /Untrusted/);
});

test('only one unexpired, bounded artifact bound to the triggering source can be downloaded', () => {
  assert.equal(trustedArtifact({ artifacts: [artifact] }, run), artifact.name);
  for (const artifacts of [[], [artifact, artifact], [{ ...artifact, expired: true }],
    [{ ...artifact, size_in_bytes: 5_000_001 }], [{ ...artifact, name: 'autopilot-identity-42' }],
    [{ ...artifact, name: `autopilot-${run.id}-1` }], [{ ...artifact, name: `autopilot-${run.id}` }],
    [{ ...artifact, workflow_run: { ...artifact.workflow_run, head_sha: 'b'.repeat(40) } }],
    [{ ...artifact, workflow_run: { ...artifact.workflow_run, repository_id: 1 } }]]) {
    assert.throws(() => trustedArtifact({ artifacts }, run), /missing|ambiguous|Untrusted/);
  }
});

test('producer records the actual workflow attempt and refuses missing or malformed identity', () => {
  const ctx = { runId: String(run.id), sha: run.head_sha };
  assert.deepEqual(maintenanceReceiptIdentity(ctx, { GITHUB_RUN_ATTEMPT: '2' }), {
    version: 1, runId: String(run.id), sourceSha: run.head_sha, runAttempt: 2,
  });
  for (const value of [undefined, '', '0', '-1', '1.5', '01', '10001', '2\noutput=evil']) {
    assert.throws(() => maintenanceReceiptIdentity(ctx, { GITHUB_RUN_ATTEMPT: value }), /valid workflow run attempt/);
  }
});

test('download uses a single exact-name argv request and persists authenticated metadata', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'monitor-workflow-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [];
  const execute = async (program, args) => {
    calls.push({ program, args });
    return { stdout: JSON.stringify(calls.length === 1 ? run : { artifacts: [artifact] }) };
  };
  await downloadMaintenance(event, directory, execute);
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.program === 'gh'));
  assert.deepEqual(calls[2].args, ['run', 'download', String(run.id), '--repo', REPOSITORY,
    '--name', artifact.name, '--dir', join(directory, 'receipts')]);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'run-metadata.json'), 'utf8')), run);
});

test('rerun or foreign source metadata stops before any artifact request', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'monitor-workflow-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const changed of [{ run_attempt: 3 }, { head_sha: 'b'.repeat(40) }, { id: 123 }]) {
    let calls = 0;
    await assert.rejects(() => downloadMaintenance(event, directory, async () => {
      calls++; return { stdout: JSON.stringify({ ...run, ...changed }) };
    }), /changed/);
    assert.equal(calls, 1);
  }
});

test('an inspection result never fabricates build, worker or smoke proof', () => {
  const fields = publicStatus(report, event);
  assert.equal(fields.status, 'inspected');
  assert.equal(fields.release_mode, 'inspection_only');
  assert.equal(fields.checks_passed, '82');
  assert.equal(fields.build_id, 'unavailable');
  assert.equal(fields.worker_version, 'unavailable');
  assert.equal(fields.smoke_test, 'unknown');
  assert.match(commentBody(fields), /Inspection results and reported deployments do not establish a verified live release/);
});

test('missing, foreign, malformed and wrong-attempt reports yield unknown', () => {
  for (const candidate of [null, {}, { ...report, version: 2 }, { ...report, repository: 'fork/repo' },
    { ...report, runId: '42' }, { ...report, runAttempt: 1 }, { ...report, sourceSha: 'b'.repeat(40) },
    { ...report, workflow: 'site' }, { ...report, status: 'live' }]) {
    assert.equal(publicStatus(candidate, event).status, 'unknown');
  }
});

test('Markdown, control characters, diagnostics and remote text cannot cross the issue boundary', () => {
  const poisoned = { ...report, diagnostics: ['@everyone secret'], summary: {
    buildId: 'x\nmalicious=true', workerVersion: '`\n@everyone', deploymentRunId: '1$(evil)',
    checksPassed: 1_000_001, checksFailed: -1, smokeTestPassed: 'true' } };
  const fields = publicStatus(poisoned, event);
  const body = commentBody(fields);
  assert.doesNotMatch(body, /malicious|@everyone|evil|secret/);
  assert.ok(Object.values(fields).every(value => typeof value === 'string' && !/[\r\n]/u.test(value)));
  assert.match(body, /Smoke test: unknown/);
  assert.throws(() => commentBody({ ...fields, run_id: '1\nmalicious=true' }), /Untrusted/);
});

test('privilege separation checks out trusted main and never restores caches or executes artifact data', async () => {
  const source = await readFile(new URL('../.github/workflows/monitor-deployments.yml', import.meta.url), 'utf8');
  const inspect = source.split('  inspect:\n')[1].split('  publish:\n')[0];
  const publish = source.split('  publish:\n')[1];
  assert.match(source, /permissions: \{\}/u);
  assert.match(source, /workflows: \[Daily website maintenance\]/u);
  assert.match(source, /branches: \[main\]/u);
  assert.match(inspect, /actions: read/u);
  assert.doesNotMatch(inspect, /issues: write|secrets\.|cache:/u);
  assert.match(publish, /issues: write/u);
  assert.doesNotMatch(publish, /actions: read|run download|deployment-receipt-monitor|secrets\./u);
  assert.equal((source.match(/ref: main/gu) || []).length, 2);
  assert.equal((source.match(/persist-credentials: false/gu) || []).length, 2);
  assert.doesNotMatch(source, /ref:.*head_sha|workflow_dispatch:|contents: write|continue-on-error: true\n\s+id: status/u);
  for (const line of source.split('\n').filter(line => line.includes('uses:'))) {
    assert.match(line, /@[a-f0-9]{40}(?:\s|$)/u);
  }
  const producer = await readFile(new URL('../.github/workflows/site-autopilot.yml', import.meta.url), 'utf8');
  assert.match(producer, /name: autopilot-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u);
  assert.match(producer, /path: \$\{\{ runner\.temp \}\}\/autopilot-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}\/\*\.json/u);
});
