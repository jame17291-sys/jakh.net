import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectReceipts, reportExitCode } from './deployment-receipt-monitor.mjs';
import { publicStatus, commentBody, REPOSITORY } from './deployment-monitor-workflow.mjs';
import { maintenanceReceiptIdentity } from './site-autopilot.mjs';

const repo = { id: 1227088138, full_name: REPOSITORY, default_branch: 'main' };
const run = { id: 36992293164, run_attempt: 2, repository: repo, head_repository: repo, head_branch: 'main',
  head_sha: 'a'.repeat(40), path: '.github/workflows/site-autopilot.yml', event: 'schedule', status: 'completed', conclusion: 'success' };
const event = { action: 'completed', repository: repo, workflow_run: run };
function daily(overrides = {}) {
  return { ...maintenanceReceiptIdentity({ runId: String(run.id), sha: run.head_sha }, { GITHUB_RUN_ATTEMPT: '2' }),
    releaseMode: 'inspection_only', status: 'no_changes', checksPassed: 82, checksFailed: 0,
    changedFiles: [], failedChecks: [], ...overrides };
}
async function parse(t, receipt) {
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'receipt-integration-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const folder = join(directory, `autopilot-${run.id}-${run.run_attempt}`);
  await mkdir(folder);
  await writeFile(join(folder, 'daily-report.json'), JSON.stringify(receipt));
  return inspectReceipts({ directory, run, runId: String(run.id) });
}

test('producer identity survives nested artifact parsing and bounded inspection publication', async t => {
  const report = await parse(t, daily());
  assert.equal(report.status, 'inspected');
  assert.equal(report.runAttempt, 2);
  assert.equal(reportExitCode(report), 0);
  const fields = publicStatus(report, event);
  assert.equal(fields.status, 'inspected');
  assert.equal(fields.smoke_test, 'unknown');
  const body = commentBody(fields);
  assert.match(body, /attempt 2/u);
  assert.match(body, /Build ID: `unavailable`/u);
  assert.match(body, /do not establish a verified live release/u);
});

test('actual needs-attention shape remains unresolved and discards arbitrary failure text', async t => {
  const report = await parse(t, daily({ status: 'needs_attention', checksFailed: 1,
    failedChecks: ['secret\n@everyone Current source is not the verified live build'] }));
  assert.equal(report.status, 'needs_attention');
  assert.equal(reportExitCode(report), 1);
  const body = commentBody(publicStatus(report, event));
  assert.match(body, /needs_attention/u);
  assert.match(body, /82 passed; 1 failed/u);
  assert.doesNotMatch(body, /secret|@everyone|Current source/u);
});

test('old or missing receipt attempt cannot borrow the current rerun metadata', async t => {
  for (const runAttempt of [1, undefined]) {
    const report = await parse(t, daily({ runAttempt }));
    assert.equal(report.status, 'unknown');
    assert.equal(reportExitCode(report), 1);
    assert.equal(publicStatus(report, event).status, 'unknown');
    assert.ok(report.diagnostics.includes('foreign_receipt_attempt'));
  }
});

test('a publication reference does not fabricate a linked release proof', async t => {
  const report = await parse(t, daily({ releaseMode: 'automatic', status: 'deployed',
    changedFiles: ['data/search-index.json'], candidateSha: 'b'.repeat(40), deploymentRunId: '12345',
    buildId: 'c'.repeat(64), workerVersion: '11111111-1111-1111-1111-111111111111', smokeTestPassed: true }));
  assert.equal(report.status, 'deployment_reported');
  assert.equal(reportExitCode(report), 2);
  const fields = publicStatus(report, event);
  assert.equal(fields.deployment_run_id, '12345');
  assert.equal(fields.build_id, 'unavailable');
  assert.equal(fields.worker_version, 'unavailable');
  assert.equal(fields.smoke_test, 'unknown');
});
