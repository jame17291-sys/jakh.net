import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REPOSITORY = 'jame17291-sys/jakh.net';
const REPOSITORY_ID = 1227088138;
const WORKFLOW = '.github/workflows/site-autopilot.yml';
const SHA = /^[a-f0-9]{40}$/u;
const BUILD = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const STATES = new Set(['inspected', 'deployment_reported', 'verified', 'needs_attention', 'failed', 'unknown', 'paused']);
const execute = promisify(execFile);

function integer(value) {
  return ['number', 'string'].includes(typeof value) && Number.isSafeInteger(Number(value))
    && Number(value) > 0 && /^[1-9][0-9]*$/u.test(String(value));
}

export function trustedRun(run) {
  if (!run || !integer(run.id) || !integer(run.run_attempt) || Number(run.run_attempt) > 10_000 || run.repository?.id !== REPOSITORY_ID
    || run.repository?.full_name !== REPOSITORY || run.head_repository?.id !== REPOSITORY_ID
    || run.head_repository?.full_name !== REPOSITORY || run.head_branch !== 'main'
    || run.path !== WORKFLOW || !SHA.test(run.head_sha || '') || run.status !== 'completed'
    || !['schedule', 'workflow_dispatch'].includes(run.event)
    || !['success', 'failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'stale', 'startup_failure'].includes(run.conclusion)) {
    throw new Error('Untrusted maintenance run.');
  }
  return { id: String(run.id), attempt: String(run.run_attempt), sha: run.head_sha };
}

export function trustedEvent(event) {
  if (event?.repository?.id !== REPOSITORY_ID || event.repository.full_name !== REPOSITORY
    || event.repository.default_branch !== 'main' || event.action !== 'completed') {
    throw new Error('Untrusted workflow event.');
  }
  return trustedRun(event.workflow_run);
}

export function trustedArtifact(list, run) {
  const context = trustedRun(run);
  const matches = list?.artifacts?.filter(item => item.name === `autopilot-${context.id}-${context.attempt}`);
  if (!matches || matches.length !== 1) throw new Error('Expected maintenance artifact is missing or ambiguous.');
  const artifact = matches[0];
  const binding = artifact.workflow_run;
  if (!integer(artifact.id) || artifact.expired !== false || !Number.isSafeInteger(artifact.size_in_bytes)
    || artifact.size_in_bytes <= 0 || artifact.size_in_bytes > 5_000_000
    || String(binding?.id) !== context.id || binding.repository_id !== REPOSITORY_ID
    || binding.head_repository_id !== REPOSITORY_ID || binding.head_branch !== 'main' || binding.head_sha !== context.sha) {
    throw new Error('Untrusted maintenance artifact.');
  }
  return artifact.name;
}

// Never check out or execute the triggering source or anything downloaded from its artifacts.
export async function downloadMaintenance(event, directory, runCommand = execute) {
  const expected = trustedEvent(event);
  const args = ['api', `repos/${REPOSITORY}/actions/runs/${expected.id}`];
  const { stdout } = await runCommand('gh', args, { timeout: 30_000, maxBuffer: 2_000_000 });
  const run = JSON.parse(stdout);
  const actual = trustedRun(run);
  if (actual.id !== expected.id || actual.attempt !== expected.attempt || actual.sha !== expected.sha) {
    throw new Error('Maintenance run changed after the triggering event.');
  }
  const receipts = resolve(directory, 'receipts');
  await mkdir(receipts, { recursive: true });
  // Preserve the authenticated metadata even when the artifact is expired/missing.
  await writeFile(join(directory, 'run-metadata.json'), JSON.stringify(run));
  const artifacts = await runCommand('gh', ['api', `repos/${REPOSITORY}/actions/runs/${actual.id}/artifacts?per_page=100`],
    { timeout: 30_000, maxBuffer: 2_000_000 });
  const name = trustedArtifact(JSON.parse(artifacts.stdout), run);
  await runCommand('gh', ['run', 'download', actual.id, '--repo', REPOSITORY, '--name', name, '--dir', receipts],
    { timeout: 60_000, maxBuffer: 2_000_000 });
  return actual;
}

function identifier(value, expression) { return typeof value === 'string' && expression.test(value) ? value : 'unavailable'; }
function count(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 100_000 ? String(value) : 'unknown'; }

// A fixed allowlist is the sole interface between artifact parsing and the job with issue-write permission.
export function publicStatus(report, event) {
  const current = trustedEvent(event);
  const fallback = { run_id: current.id, run_attempt: current.attempt, source_sha: current.sha,
    status: 'unknown', release_mode: 'unknown', build_id: 'unavailable', worker_version: 'unavailable',
    deployment_run_id: 'unavailable', smoke_test: 'unknown', checks_passed: 'unknown', checks_failed: 'unknown' };
  if (!report || report.version !== 1 || report.repository !== REPOSITORY || String(report.runId) !== current.id
    || String(report.runAttempt) !== current.attempt || report.sourceSha !== current.sha
    || report.workflow !== 'maintenance' || !STATES.has(report.status)) return fallback;
  const summary = report.summary || {};
  return { ...fallback, status: report.status,
    release_mode: ['inspection_only', 'automatic'].includes(report.releaseMode) ? report.releaseMode : 'unknown',
    build_id: identifier(summary.buildId, BUILD), worker_version: identifier(summary.workerVersion, UUID),
    deployment_run_id: integer(summary.deploymentRunId) ? String(summary.deploymentRunId) : 'unavailable',
    smoke_test: summary.smokeTestPassed === true ? 'passed' : summary.smokeTestPassed === false ? 'failed' : 'unknown',
    checks_passed: count(summary.checksPassed), checks_failed: count(summary.checksFailed) };
}

export function commentBody(fields) {
  // Revalidate job outputs; neither Markdown nor control characters can cross the publishing boundary.
  const safe = publicStatus({ version: 1, repository: REPOSITORY, runId: fields.run_id, runAttempt: fields.run_attempt, sourceSha: fields.source_sha,
    workflow: 'maintenance', status: fields.status, releaseMode: fields.release_mode,
    summary: { buildId: fields.build_id, workerVersion: fields.worker_version, deploymentRunId: fields.deployment_run_id,
      smokeTestPassed: fields.smoke_test === 'passed' ? true : fields.smoke_test === 'failed' ? false : null,
      checksPassed: fields.checks_passed === 'unknown' ? null : Number(fields.checks_passed),
      checksFailed: fields.checks_failed === 'unknown' ? null : Number(fields.checks_failed) } }, {
    repository: { id: REPOSITORY_ID, full_name: REPOSITORY, default_branch: 'main' }, action: 'completed',
    workflow_run: { id: fields.run_id, run_attempt: fields.run_attempt, head_sha: fields.source_sha,
      repository: { id: REPOSITORY_ID, full_name: REPOSITORY }, head_repository: { id: REPOSITORY_ID, full_name: REPOSITORY },
      head_branch: 'main', path: WORKFLOW, status: 'completed', event: 'schedule', conclusion: 'success' } });
  const marker = `<!-- deployment-monitor:${safe.run_id}:${safe.run_attempt} -->`;
  return `${marker}\nMaintenance receipt for run ${safe.run_id}, attempt ${safe.run_attempt}\n\n`
    + `- Result: **${safe.status}**\n- Publishing mode: ${safe.release_mode}\n`
    + `- Checks: ${safe.checks_passed} passed; ${safe.checks_failed} failed\n`
    + `- Source: \`${safe.source_sha}\`\n- Build ID: \`${safe.build_id}\`\n`
    + `- Worker version: \`${safe.worker_version}\`\n- Smoke test: ${safe.smoke_test}\n`
    + `- Deployment run: ${safe.deployment_run_id}\n\n`
    + `Inspection results and reported deployments do not establish a verified live release.\n\n`
    + `[View maintenance evidence](https://github.com/${REPOSITORY}/actions/runs/${safe.run_id})`;
}

async function main() {
  const [command, directory] = process.argv.slice(2);
  if (!['download', 'outputs'].includes(command) || !directory || process.argv.length !== 4) throw new Error('Use download|outputs DIRECTORY.');
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (command === 'download') {
    await downloadMaintenance(event, directory);
  } else {
    let report;
    try { report = JSON.parse(await readFile(join(directory, 'deployment-report.json'), 'utf8')); } catch { /* Missing evidence stays unknown. */ }
    const fields = publicStatus(report, event);
    if (!process.env.GITHUB_OUTPUT) throw new Error('Workflow output path is missing.');
    await appendFile(process.env.GITHUB_OUTPUT, Object.entries(fields).map(([key, value]) => `${key}=${value}\n`).join(''));
    if (['unknown', 'failed', 'needs_attention', 'paused', 'deployment_reported'].includes(fields.status)) process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { process.stderr.write('Maintenance evidence could not be validated.\n'); process.exitCode = 1; });
}
