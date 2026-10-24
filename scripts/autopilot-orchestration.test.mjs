import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { context, githubClient, oidcToken, autopilotRequest, diagnoseAutopilotIdentity, assertMain, releaseInputs, authorizeRelease,
  REPOSITORY, REPOSITORY_ID, API_ORIGIN, AUDIENCE } from './autopilot-client.mjs';
import { safeChildEnv, findingBody, syncFindings, matchDispatchedRun, dispatchAndWait,
  FINDINGS_MARKER, BOT_ID, publishVerifiedRepair, waitForPullRequestChecks, verifyPublishedBuild,
  automaticReleaseReadiness, publicationFinding, validateHandoff, readHandoff, HANDOFF_FILE,
  publicationExitCode, runPublication, runInspection, inspectionIdentity, assessReleaseLag, RELEASE_LAG_LIMIT_DAYS,
  runLiveProductionCheck } from './site-autopilot.mjs';
import { execFileSync } from 'node:child_process';

import { loadProductionQuarantine } from './publication-quarantine.mjs';

const BASE = 'a'.repeat(40);
const NEXT = 'b'.repeat(40);
const PREFIX = `/repos/${REPOSITORY}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV = Object.freeze({ GITHUB_REPOSITORY: REPOSITORY, GITHUB_REPOSITORY_ID: REPOSITORY_ID,
  GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true', GITHUB_SHA: BASE,
  GITHUB_RUN_ID: '12345', GITHUB_EVENT_NAME: 'schedule', GITHUB_TOKEN: 'test-ephemeral-token',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://pipelines.actions.githubusercontent.com/identity?api-version=2.0',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-oidc-request', AUTOPILOT_RELEASE_ENABLED: 'true',
  AUTOPILOT_RUN_ID: '12344', AUTOPILOT_DAY: '2026-09-23', AUTOPILOT_DOMAIN_CUTOVER: 'false',
  AUTOPILOT_RELEASE_PHASE: 'compatibility' });
const response = (body, status = 200, headers = {}) => new Response(body === null ? null : JSON.stringify(body), { status, headers });

test('maintenance identity requires the exact repository, protected main, SHA, run and allowed trigger', () => {
  assert.deepEqual(context(ENV), { repository: REPOSITORY, sha: BASE, runId: '12345', runUrl: `https://github.com/${REPOSITORY}/actions/runs/12345` });
  assert.doesNotThrow(() => context({ ...ENV, GITHUB_EVENT_NAME: 'workflow_dispatch' }));
  const changes = { GITHUB_REPOSITORY: 'someone/fork', GITHUB_REPOSITORY_ID: '1', GITHUB_REF: 'refs/heads/other',
    GITHUB_REF_PROTECTED: 'false', GITHUB_SHA: 'main', GITHUB_RUN_ID: '0', GITHUB_EVENT_NAME: 'pull_request_target' };
  for (const [key, value] of Object.entries(changes)) assert.throws(() => context({ ...ENV, [key]: value }), /protected main/);
});

test('GitHub client restricts requests to this repository and never follows redirects', async () => {
  const calls = [];
  const gh = githubClient(ENV, async (url, options) => { calls.push({ url, options }); return response({ ok: true }); });
  await gh(`${PREFIX}/pulls`, { method: 'POST', body: { base: 'main' } });
  assert.equal(calls[0].url, `https://api.github.com${PREFIX}/pulls`);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.authorization, 'Bearer test-ephemeral-token');
  assert.deepEqual(JSON.parse(calls[0].options.body), { base: 'main' });
  for (const route of ['/repos/other/repo/issues', 'https://other.example/steal', `${PREFIX}-fork/issues`, `${PREFIX}/../issues`, `${PREFIX}/issues\r\nx: y`]) {
    await assert.rejects(() => gh(route), /restricted/);
  }
  assert.equal(calls.length, 1);
  assert.throws(() => githubClient({}), /token is missing/);
});

test('encoded path traversal cannot escape the repository scope', async () => {
  let requests = 0;
  const gh = githubClient(ENV, async () => { requests++; return response({}); });
  for (const route of [`${PREFIX}/%2e%2e/%2e%2e/issues`, `${PREFIX}/%2E%2E/issues`, `${PREFIX}/%2e%2e%2fissues`, `${PREFIX}/%5c..%5cissues`]) {
    await assert.rejects(() => gh(route), /restricted|path|scope/iu);
  }
  assert.equal(requests, 0);
});

test('network failures and oversized JSON fail without exposing bearer tokens', async () => {
  const gh = githubClient(ENV, async () => response({ error: ENV.GITHUB_TOKEN }, 403));
  await assert.rejects(() => gh(`${PREFIX}/issues`), (error) => error.status === 403 && !error.message.includes(ENV.GITHUB_TOKEN));
  const huge = githubClient(ENV, async () => response({}, 200, { 'content-length': '2000001' }));
  await assert.rejects(() => huge(PREFIX), /too large/);
  const redirected = githubClient(ENV, async (_url, options) => {
    assert.equal(options.redirect, 'error');
    throw new TypeError('redirect forbidden');
  });
  await assert.rejects(() => redirected(PREFIX), /redirect forbidden/);
});

test('Autopilot failures retain only known identity codes with the matching HTTP status', async () => {
  for (const [code, status] of [
    ['AUTOPILOT_IDENTITY_INVALID', 401], ['AUTOPILOT_IDENTITY_EXPIRED', 401],
    ['AUTOPILOT_IDENTITY_SCOPE_INVALID', 403], ['AUTOPILOT_IDENTITY_UNAVAILABLE', 503],
    ['AUTOPILOT_PAYLOAD_INVALID', 400],
  ]) {
    let calls = 0;
    const fetchImpl = async () => ++calls === 1 ? response({ value: 'private-identity-token' })
      : response({ code, error: 'private-identity-token', details: ENV.GITHUB_TOKEN }, status);
    await assert.rejects(() => autopilotRequest('claim', {}, { env: ENV, fetchImpl }), error => {
      assert.equal(error.message, `Autopilot claim: HTTP ${status} (${code})`);
      assert.equal(error.code, code);
      assert.equal(error.status, status);
      assert.doesNotMatch(JSON.stringify(error), /private-identity-token|test-ephemeral-token/);
      return true;
    });
    assert.equal(calls, 2);
  }
});

test('Autopilot diagnostics discard malformed, unexpected and secret-bearing error details', async () => {
  const bodies = [
    { code: 'private-identity-token', error: ENV.GITHUB_TOKEN },
    { code: 'AUTOPILOT_IDENTITY_INVALID\nprivate-identity-token' },
    { code: 'AUTOPILOT_IDENTITY_SCOPE_INVALID' }, // Wrong status must remain generic.
    { code: ['AUTOPILOT_IDENTITY_INVALID'] },
    [{ code: 'AUTOPILOT_IDENTITY_INVALID' }],
    null,
  ];
  for (const body of [...bodies.map(value => JSON.stringify(value)), '<html>private-identity-token</html>', '{invalid-json']) {
    let calls = 0;
    const fetchImpl = async () => ++calls === 1 ? response({ value: 'private-identity-token' }) : new Response(body, { status: 401 });
    await assert.rejects(() => autopilotRequest('claim', {}, { env: ENV, fetchImpl }), error => {
      assert.equal(error.message, 'Autopilot claim: HTTP 401');
      assert.equal(error.code, undefined);
      assert.equal(error.status, 401);
      return true;
    });
  }
});

test('GitHub and OIDC-provider errors cannot inject Autopilot diagnostic codes', async () => {
  const fetchImpl = async () => response({ code: 'AUTOPILOT_IDENTITY_INVALID', error: ENV.GITHUB_TOKEN }, 401);
  const gh = githubClient(ENV, fetchImpl);
  for (const request of [() => gh(`${PREFIX}/issues`), () => oidcToken(ENV, fetchImpl)]) {
    await assert.rejects(request, error => {
      assert.equal(error.status, 401);
      assert.equal(error.code, undefined);
      assert.doesNotMatch(error.message, /AUTOPILOT_IDENTITY|test-ephemeral-token/);
      return true;
    });
  }
});

test('manual identity diagnostics send only an invalid claim payload and require its exact authenticated rejection', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1 ? response({ value: 'private-identity-token' })
      : response({ code: 'AUTOPILOT_PAYLOAD_INVALID', error: 'private-identity-token' }, 400);
  };
  const result = await diagnoseAutopilotIdentity({ ...ENV, GITHUB_EVENT_NAME: 'workflow_dispatch' }, fetchImpl);
  assert.equal(result.status, 'identity_verified_without_claim');
  assert.equal(result.mode, 'identity_check_only');
  assert.equal(result.sourceSha, BASE);
  assert.equal(result.runId, ENV.GITHUB_RUN_ID);
  assert.equal(result.httpStatus, 400);
  assert.equal(result.code, 'AUTOPILOT_PAYLOAD_INVALID');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, `${API_ORIGIN}/api/internal/autopilot/claim`);
  assert.deepEqual(JSON.parse(calls[1].options.body), { diagnosticOnly: true });
  assert.doesNotMatch(JSON.stringify(result), /private-identity-token|test-ephemeral-token/);
});

test('identity diagnostics never retry or claim after auth failures, wrong responses, or unexpected acceptance', async () => {
  for (const [body, status, expectedCode] of [
    [{ code: 'AUTOPILOT_IDENTITY_EXPIRED', error: 'private-identity-token' }, 401, 'AUTOPILOT_IDENTITY_EXPIRED'],
    [{ code: 'AUTOPILOT_PAYLOAD_INVALID' }, 401, 'IDENTITY_REQUEST_FAILED'],
    [{ code: 'private-identity-token' }, 400, 'IDENTITY_REQUEST_FAILED'],
    [{ error: 'private-identity-token' }, 400, 'IDENTITY_REQUEST_FAILED'],
    [{ claimed: true, private: 'private-identity-token' }, 200, 'IDENTITY_PREFLIGHT_UNEXPECTED_ACCEPTANCE'],
  ]) {
    let calls = 0;
    const fetchImpl = async () => ++calls === 1 ? response({ value: 'private-identity-token' }) : response(body, status);
    const result = await diagnoseAutopilotIdentity({ ...ENV, GITHUB_EVENT_NAME: 'workflow_dispatch' }, fetchImpl);
    assert.equal(result.status, 'failed');
    assert.equal(result.code, expectedCode);
    assert.equal(calls, 2);
    assert.doesNotMatch(JSON.stringify(result), /private-identity-token|test-ephemeral-token/);
  }
  const failure = await diagnoseAutopilotIdentity({ ...ENV, GITHUB_EVENT_NAME: 'workflow_dispatch' }, async () => {
    throw new Error('private-identity-token');
  });
  assert.equal(failure.code, 'IDENTITY_REQUEST_FAILED');
  assert.doesNotMatch(JSON.stringify(failure), /private-identity-token/);
  await assert.rejects(() => diagnoseAutopilotIdentity(ENV, async () => assert.fail('must not request a token')), /explicit manual/);
});

function workflowJob(source, name) {
  const start = source.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `${name} job exists`);
  const next = source.slice(start + 1).search(/\n {2}[a-z-]+:\n/u);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

test('manual identity-check workflow cannot start a daily claim or request publishing credentials', async () => {
  const source = await fs.readFile(path.join(ROOT, '.github/workflows/site-autopilot.yml'), 'utf8');
  const diagnostic = workflowJob(source, 'identity-check');
  const maintenance = source.split('\n  inspect:\n')[1];
  assert.match(source, /identity_check_only:[\s\S]*default: false\n\s+type: boolean/u);
  assert.match(diagnostic, /github\.event_name == 'workflow_dispatch' && inputs\.identity_check_only == true/u);
  assert.match(diagnostic, /github\.ref == 'refs\/heads\/main' && github\.ref_protected/u);
  assert.match(diagnostic, /permissions:\n\s+contents: read\n\s+id-token: write/u);
  assert.match(diagnostic, /autopilot-client\.mjs diagnose-identity/u);
  assert.doesNotMatch(diagnostic, /site-autopilot\.mjs|secrets\.|environment:|GITHUB_TOKEN:|contents: write|issues: write/u);
  for (const job of ['inspect', 'publish']) assert.match(workflowJob(source, job), /inputs\.identity_check_only != true/u, job);
  assert.match(maintenance, /node scripts\/site-autopilot\.mjs inspect/u);
  assert.match(maintenance, /node scripts\/site-autopilot\.mjs publish/u);
});

test('OIDC audience and internal API destination are fixed and redirect-free', async () => {
  const calls = [];
  const mockFetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1 ? response({ value: 'test-identity-jwt' }) : response({ day: '2026-09-23' });
  };
  assert.deepEqual(await autopilotRequest('claim', {}, { env: ENV, fetchImpl: mockFetch }), { day: '2026-09-23' });
  const identity = new URL(calls[0].url);
  assert.equal(identity.searchParams.get('audience'), AUDIENCE);
  assert.equal(calls[0].options.headers.authorization, 'Bearer test-oidc-request');
  assert.equal(calls[1].url, `${API_ORIGIN}/api/internal/autopilot/claim`);
  assert.equal(calls[1].options.headers.authorization, 'Bearer test-identity-jwt');
  for (const call of calls) assert.equal(call.options.redirect, 'error');
  await assert.rejects(() => autopilotRequest('delete-account', {}, { env: ENV, fetchImpl: mockFetch }), /Unknown/);
  for (const endpoint of ['http://pipelines.actions.githubusercontent.com/x', 'https://actions.githubusercontent.com.attacker.invalid/x', 'https://user@pipelines.actions.githubusercontent.com/x']) {
    await assert.rejects(() => oidcToken({ ...ENV, ACTIONS_ID_TOKEN_REQUEST_URL: endpoint }, mockFetch), /Untrusted/);
  }
  assert.equal(calls.length, 2);
});

test('child checks receive no credentials or executable startup overrides', () => {
  const env = safeChildEnv({ PATH: '/usr/bin', LANG: 'C.UTF-8', CI: 'true',
    GITHUB_TOKEN: 'secret', CLOUDFLARE_API_TOKEN: 'secret', password: 'secret', Database_Password: 'secret',
    PRIVATE_KEY: 'secret', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'secret', AWS_SECRET_ACCESS_KEY: 'secret',
    NODE_OPTIONS: '--import=evil.mjs', NODE_PATH: '/untrusted', BASH_ENV: '/untrusted/startup',
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_VALUE_0: 'secret-authorization', GIT_CONFIG_KEY_0: 'core.hooksPath' });
  assert.deepEqual(env, { PATH: '/usr/bin', LANG: 'C.UTF-8', CI: 'true' });
});

test('maintenance release inputs cannot request D1 migration or domain cutover', () => {
  const identity = { runId: '12345', day: '2026-09-23', release_phase: 'migrate-final', domain_cutover: 'true' };
  assert.deepEqual(releaseInputs('api', identity), { release_phase: 'compatibility', domain_cutover: 'false', autopilot_run_id: '12345', autopilot_day: '2026-09-23' });
  assert.deepEqual(releaseInputs('static', identity), { confirmation: 'DEPLOY riddlearabia.com FROM protected main', domain_cutover: 'false', autopilot_run_id: '12345', autopilot_day: '2026-09-23' });
  for (const identity of [{ runId: '0', day: '2026-09-23' }, { runId: '12345', day: 'today' }]) assert.throws(() => releaseInputs('api', identity), /Invalid/);
  assert.throws(() => releaseInputs('database', { runId: '12345', day: '2026-09-23' }), /Unknown/);
});

test('stale main, disabled release, migration, and cutover fail before release authorization', async () => {
  assertMain({ name: 'main', protected: true, commit: { sha: BASE } }, BASE);
  for (const branch of [{ name: 'main', protected: true, commit: { sha: NEXT } }, { name: 'other', protected: true, commit: { sha: BASE } }, { name: 'main', protected: false, commit: { sha: BASE } }]) assert.throws(() => assertMain(branch, BASE), /Protected main changed/);
  let calls = 0;
  const noFetch = async () => { calls++; throw new Error('Unexpected network'); };
  for (const values of [{ AUTOPILOT_RELEASE_ENABLED: 'false' }, { AUTOPILOT_RELEASE_PHASE: 'migrate-final' }, { AUTOPILOT_DOMAIN_CUTOVER: 'true' }, { AUTOPILOT_RUN_ID: '' }]) {
    await assert.rejects(() => authorizeRelease({ ...ENV, ...values }, noFetch));
  }
  assert.equal(calls, 0);
  const requests = [];
  await assert.rejects(() => authorizeRelease(ENV, async (url) => {
    requests.push(String(url));
    return response({ name: 'main', protected: true, commit: { sha: NEXT } });
  }), /Protected main changed/);
  assert.deepEqual(requests, [`https://api.github.com${PREFIX}/branches/main`]);
});

const START = Date.parse('2026-09-23T03:23:00Z');
function workflowRun(overrides = {}) {
  return { id: 555, event: 'workflow_dispatch', head_branch: 'main', head_sha: BASE,
    path: '.github/workflows/static-site.yml', created_at: new Date(START).toISOString(),
    head_repository: { full_name: REPOSITORY }, status: 'queued', conclusion: null, ...overrides };
}
const MATCH = { workflow: 'static-site.yml', ref: 'main', sha: BASE, after: START, previousIds: new Set([1]) };

test('dispatch correlation excludes prior, old, wrong-source, wrong-workflow and fork runs', () => {
  const invalid = [workflowRun({ id: 1 }), workflowRun({ created_at: new Date(START - 60_000).toISOString() }),
    workflowRun({ event: 'push' }), workflowRun({ head_branch: 'other' }), workflowRun({ head_sha: NEXT }),
    workflowRun({ path: '.github/workflows/api-deploy.yml' }), workflowRun({ head_repository: { full_name: 'someone/fork' } })];
  assert.equal(matchDispatchedRun(invalid, MATCH), null);
  const exact = workflowRun();
  assert.equal(matchDispatchedRun([...invalid, exact], MATCH), exact);
  assert.throws(() => matchDispatchedRun([exact, workflowRun({ id: 556 })], MATCH), /Ambiguous/);
});

function dispatchMock({ conclusion = 'success', drift = {} } = {}) {
  let clock = START;
  let lists = 0;
  const requests = [];
  const gh = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.includes('/runs?')) return { workflow_runs: lists++ === 0 ? [workflowRun({ id: 1 })] : [workflowRun({ id: 1 }), workflowRun()] };
    if (url.endsWith('/dispatches')) return null;
    if (url.endsWith('/runs/555')) return workflowRun({ status: 'completed', conclusion, ...drift });
    throw new Error(`Unexpected test request: ${url}`);
  };
  return { gh, requests, options: { workflow: 'static-site.yml', ref: 'main', sha: BASE, timeoutMs: 30_000,
    now: () => clock, wait: async (milliseconds) => { clock += milliseconds; } } };
}

test('dispatch waits for exact successful run and rejects every failed CI conclusion', async () => {
  const success = dispatchMock();
  const run = await dispatchAndWait(success.gh, success.options);
  assert.equal(run.id, 555);
  assert.equal(success.requests.filter(({ url }) => url.endsWith('/dispatches')).length, 1);
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped', 'neutral', 'action_required']) {
    const failed = dispatchMock({ conclusion });
    await assert.rejects(() => dispatchAndWait(failed.gh, failed.options), /ended with/);
  }
});

test('a selected workflow cannot change repository, path or run identity while polling', async () => {
  for (const drift of [{ head_sha: NEXT }, { head_branch: 'other' }, { event: 'push' },
    { path: '.github/workflows/api-deploy.yml' }, { head_repository: { full_name: 'someone/fork' } }, { id: 999 }]) {
    const setup = dispatchMock({ drift });
    await assert.rejects(() => dispatchAndWait(setup.gh, setup.options), /identity changed/);
  }
});

test('missing dispatched run has a bounded timeout and is never substituted with an older successful run', async () => {
  let clock = START;
  let dispatches = 0;
  const gh = async (url) => {
    if (url.endsWith('/dispatches')) { dispatches++; return null; }
    return { workflow_runs: [workflowRun({ id: 1, status: 'completed', conclusion: 'success' })] };
  };
  await assert.rejects(() => dispatchAndWait(gh, { workflow: 'static-site.yml', ref: 'main', sha: BASE, timeoutMs: 20_000,
    now: () => clock, wait: async ms => { clock += ms; } }), /maintenance budget/);
  assert.equal(dispatches, 1);
});

test('repeated findings update the bot-owned issue; human issues and pull requests are untouched', async () => {
  const issues = [
    { number: 10, user: { id: 1 }, body: FINDINGS_MARKER },
    { number: 11, user: { id: BOT_ID }, body: FINDINGS_MARKER, pull_request: { url: 'https://example.invalid' } },
  ];
  const mutations = [];
  const gh = async (_url, options = {}) => {
    if (!options.method) return issues;
    mutations.push({ url: _url, ...options });
    if (options.method === 'POST') issues.push({ number: 12, user: { id: BOT_ID }, body: options.body.body });
    return {};
  };
  await syncFindings(gh, ['Source contracts'], `https://github.com/${REPOSITORY}/actions/runs/12345`);
  await syncFindings(gh, ['Accessibility'], `https://github.com/${REPOSITORY}/actions/runs/12346`);
  await syncFindings(gh, [], `https://github.com/${REPOSITORY}/actions/runs/12347`);
  assert.deepEqual(mutations.map(({ method, url }) => [method, url]), [['POST', `${PREFIX}/issues`], ['PATCH', `${PREFIX}/issues/12`], ['PATCH', `${PREFIX}/issues/12`]]);
  assert.equal(mutations[2].body.state, 'closed');
  assert.equal(findingBody(['Bad\n<script>alert(1)</script>'], 'https://github.com/run').includes('<script>'), false);
});

test('bounded issue scan fails instead of creating potentially duplicated findings', async () => {
  let requests = 0;
  await assert.rejects(() => syncFindings(async (_url, options = {}) => {
    assert.equal(options.method, undefined);
    requests++;
    return Array.from({ length: 100 }, (_, number) => ({ number, user: { id: 1 }, body: 'human' }));
  }, ['Source contracts'], 'https://github.com/run'), /bounded issue scan/);
  assert.equal(requests, 10);
});

test('daily workflow remains free, bounded, pinned and independent of a desktop conversation', async () => {
  const source = await fs.readFile(path.join(ROOT, '.github/workflows/site-autopilot.yml'), 'utf8');
  assert.match(source, /cron: "23 3 \* \* \*"/u);
  assert.match(source, /github\.event\.repository\.private == false/u);
  assert.match(source, /github\.ref_protected/u);
  assert.match(source, /cancel-in-progress: false/u);
  assert.match(source, /timeout-minutes: 100/u);
  assert.match(source, /persist-credentials: false/u);
  assert.match(source, /id-token: write/u);
  assert.match(source, /retention-days: 1/u);
  assert.doesNotMatch(source, /pull_request_target|OPENAI_API_KEY|ANTHROPIC_API_KEY|CLOUDFLARE_[A-Z_]*(?:TOKEN|SECRET|KEY)|self-hosted/iu);
  assert.match(source, /environment: \$\{\{ vars\.AUTOPILOT_RELEASE_ENABLED == 'true' && 'autopilot-production' \|\| '' \}\}/u);
  for (const job of ['inspect', 'publish']) {
    const jobCondition = workflowJob(source, job).split('    if: >-')[1]?.split('    runs-on:')[0] || '';
    assert.match(jobCondition, /github\.ref_protected/u, job);
    assert.doesNotMatch(jobCondition, /AUTOPILOT_RELEASE_ENABLED/u, 'Inspection must not be silently skipped when automatic publishing is not set up');
  }
  for (const match of source.matchAll(/secrets\.([A-Za-z0-9_]+)/gu)) assert.equal(match[1], 'AUTOPILOT_GITHUB_APP_PRIVATE_KEY');
  for (const match of source.matchAll(/uses:\s+([^\s#]+)/gu)) assert.match(match[1], /@[a-f0-9]{40}$/u);
  const policy = source.indexOf('scripts/autopilot-policy.test.mjs');
  assert.ok(policy >= 0 && policy < source.indexOf('run: node scripts/site-autopilot.mjs'));
});

test('daily inspection remains available while missing publishing setup fails closed', () => {
  for (const value of [undefined, '', 'false', 'TRUE']) {
    const readiness = automaticReleaseReadiness({ AUTOPILOT_RELEASE_ENABLED: value });
    assert.deepEqual(readiness, { mode: 'inspection_only', finding: null });
    assert.equal(publicationFinding(readiness, []), null);
    assert.match(publicationFinding(readiness, ['sitemap.xml']), /automatic publishing is disabled/u);
  }
  const configured = { AUTOPILOT_RELEASE_ENABLED: 'true', AUTOPILOT_GITHUB_APP_ID: '123',
    AUTOPILOT_GITHUB_APP_INSTALLATION_ID: '456', AUTOPILOT_GITHUB_APP_PRIVATE_KEY: 'fixture-key-not-a-real-key' };
  const ready = automaticReleaseReadiness(configured);
  assert.deepEqual(ready, { mode: 'automatic', finding: null });
  assert.equal(publicationFinding(ready, ['sitemap.xml']), null);
  for (const key of ['AUTOPILOT_GITHUB_APP_ID', 'AUTOPILOT_GITHUB_APP_INSTALLATION_ID', 'AUTOPILOT_GITHUB_APP_PRIVATE_KEY']) {
    const readiness = automaticReleaseReadiness({ ...configured, [key]: '' });
    assert.equal(readiness.mode, 'inspection_only');
    assert.match(publicationFinding(readiness, []), /setup is incomplete/u);
  }
});

test('inspection reports its mode before checks and blocks publication before branch creation', async () => {
  const source = await fs.readFile(path.join(ROOT, 'scripts/site-autopilot.mjs'), 'utf8');
  const inspection = source.slice(source.indexOf('export async function runInspection'), source.indexOf('export async function runPublication'));
  const publication = source.slice(source.indexOf('export async function runPublication'));
  assert.doesNotMatch(inspection.slice(0, inspection.indexOf('const start =')), /throw.*maintenance is disabled/u);
  assert.doesNotMatch(publication.slice(0, publication.indexOf('assertEarlyEnough(now())')), /throw.*maintenance is disabled/u);
  // The read-only job never claims, reports, files issues or mints credentials.
  assert.doesNotMatch(inspection, /autopilotRequest|syncFindings|mintAutopilotAppToken|method: "(?:POST|PATCH|PUT)"|"push"/u);
  assert.ok(inspection.indexOf('const baselineManifest') > 0);
  // The claimed run reports its mode before the inspection results are recorded.
  assert.ok(publication.indexOf('await send("inspecting")') < publication.indexOf('report.failedChecks = [...inspection.failedChecks]'));
  assert.ok(publication.indexOf('publicationFinding(readiness, report.changedFiles)') < publication.indexOf('"switch", "-c"'));
  assert.ok(publication.indexOf('const inspection = await readHandoff(') < publication.indexOf('autopilotRequest("claim"'));
  assert.match(publication, /releaseMode: report\.releaseMode/u);
});

test('automatic deployments use a reserved environment while manual approvals and rollback proofs remain enforced', async () => {
  const [api, site] = await Promise.all(['api-deploy.yml', 'static-site.yml'].map(name => fs.readFile(path.join(ROOT, '.github/workflows', name), 'utf8')));
  for (const source of [api, site]) {
    assert.match(source, /inputs\.autopilot_run_id != '' && 'autopilot-production' \|\| 'production'/u);
    assert.match(source, /process\.env\.RELEASE_ENVIRONMENT === "production" && !rules\.some\(\(rule\) => rule\.type === "required_reviewers"\)/u);
    assert.match(source, /environment\.deployment_branch_policy\?\.protected_branches !== true/u);
    assert.match(source, /AUTOPILOT_RELEASE_ENABLED: \$\{\{ vars\.AUTOPILOT_RELEASE_ENABLED \}\}/u);
    assert.match(source, /group: jakh-production-release\n  cancel-in-progress: false/u);
    assert.match(source, /rollback-safe == 'true'/u);
    assert.ok((source.match(/node scripts\/autopilot-client\.mjs authorize-release/gu) || []).length >= 2,
      'Verify reservation initially and recheck immediately before a deployment');
  }
  assert.match(api, /needs: autopilot-authorization/u);
  assert.match(api, /needs\.autopilot-authorization\.result == 'success'/u);
  const authorization = api.split('\n  autopilot-authorization:\n')[1]?.split('\n  production-branch:\n')[0] || '';
  assert.doesNotMatch(authorization, /\n {4}if:/u,
    'Manual releases must complete authorization successfully instead of introducing a skipped ancestor');
  assert.equal((authorization.match(/if: \$\{\{ inputs\.autopilot_run_id != '' \}\}/gu) || []).length, 3);
  assert.match(authorization, /name: Verify daily reservation and code-only release scope\n {8}if: \$\{\{ inputs\.autopilot_run_id != '' \}\}[\s\S]*run: node scripts\/autopilot-client\.mjs authorize-release/u);
  assert.match(authorization, /name: Continue manual release through production approval\n {8}if: \$\{\{ inputs\.autopilot_run_id == '' \}\}\n {8}run: echo /u);
  assert.doesNotMatch(authorization, /continue-on-error:\s*true/u);
  const productionBranch = api.split('\n  production-branch:\n')[1]?.split('\n  validate:\n')[0] || '';
  assert.match(productionBranch, /if: \$\{\{ always\(\) && needs\.autopilot-authorization\.result == 'success' \}\}/u,
    'Both manual and automatic releases must fail closed if authorization does not succeed');
  const migration = api.slice(api.indexOf('\n  migrate-final:'));
  assert.match(migration, /environment: production/u);
  assert.doesNotMatch(migration, /environment:.*autopilot-production/u);
  const lateAuthorization = 'Recheck automatic release permission immediately before deployment';
  assert.ok(api.indexOf(lateAuthorization) < api.indexOf('id: deploy_compatibility'));
  const apiPredeployGate = api.slice(api.indexOf(lateAuthorization), api.indexOf('id: deploy_compatibility'));
  assert.match(apiPredeployGate, /AUTOPILOT_TARGET_SCHEMA: \$\{\{ steps\.preflight\.outputs\.target-schema \}\}/u);
  assert.match(apiPredeployGate, /AUTOPILOT_CURRENT_SCHEMA: \$\{\{ steps\.preflight\.outputs\.current-schema \}\}/u);
  assert.match(apiPredeployGate, /AUTOPILOT_SCHEMA_CHANGED: \$\{\{ steps\.preflight\.outputs\.schema-changed \}\}/u);
  assert.match(apiPredeployGate, /\[ "\$AUTOPILOT_TARGET_SCHEMA" != "10" \] \|\| \[ "\$AUTOPILOT_CURRENT_SCHEMA" != "10" \] \|\| \[ "\$AUTOPILOT_SCHEMA_CHANGED" != "false" \]/u);
  assert.match(apiPredeployGate, /AUTOPILOT_PREDECESSOR_DIR: \$\{\{ runner\.temp \}\}\/jakh-api-release/u);
  assert.ok(apiPredeployGate.indexOf('exit 1') < apiPredeployGate.indexOf('node scripts/autopilot-client.mjs authorize-release'));

  assert.ok(site.indexOf(lateAuthorization) < site.indexOf('id: deploy\n'));
  assert.match(site, /node scripts\/static-api-release-gate\.mjs verify/u);
  assert.match(site, /--expected-commit "\$GITHUB_SHA"/u);
  assert.match(site, /needs: authorize/u);
});

function publicationMock({ failAt, staleMainAt, prOverrides = {}, mergeDenied = false } = {}) {
  const mergedSha = 'c'.repeat(40);
  const events = [];
  const dispatches = [];
  const writes = [];
  let merged = false;
  let mainReads = 0;
  const gh = async (url, options = {}) => {
    if (options.method) writes.push({ url, ...options });
    if (url.endsWith('/branches/main')) {
      events.push('main');
      mainReads++;
      return { name: 'main', protected: true, commit: { sha: mainReads === staleMainAt ? 'd'.repeat(40) : merged ? mergedSha : BASE } };
    }
    if (url.endsWith('/pulls/62/merge')) {
      events.push('merge');
      assert.deepEqual(options.body, { sha: NEXT, merge_method: 'squash' });
      merged = !mergeDenied;
      return { merged, sha: merged ? mergedSha : null };
    }
    if (url.endsWith('/pulls/62')) {
      events.push('pr');
      return { head: { sha: NEXT }, base: { sha: BASE, ref: 'main' }, state: 'open', ...prOverrides };
    }
    throw new Error(`Unexpected test request: ${url}`);
  };
  const gate = name => async (sha) => {
    events.push(name);
    if (!['verifyCandidate', 'assertActive'].includes(name)) assert.equal(sha, mergedSha);
    if (failAt === name) throw new Error(`${name} refused`);
  };
  const options = { base: BASE, candidate: NEXT, branch: 'autopilot/2026-09-23-12345', prNumber: 62,
    day: '2026-09-23', runId: '12345', verifyCandidate: gate('verifyCandidate'),
    verifyMergedTree: gate('verifyMergedTree'), reserveRelease: gate('reserveRelease'), assertActive: gate('assertActive'),
    waitForChecks: async (client, options) => {
      assert.equal(client, gh);
      assert.deepEqual(options, { ref: 'autopilot/2026-09-23-12345', sha: NEXT, prNumber: 62, base: BASE, timeoutMs: 25 * 60_000 });
      events.push('pull_request checks');
      if (failAt === 'pull_request checks') throw new Error('pull_request checks refused');
      return { id: 554, status: 'completed', conclusion: 'success' };
    },
    dispatch: async (client, options) => {
      assert.equal(client, gh);
      events.push(options.workflow);
      dispatches.push(options);
      if (failAt === options.workflow) throw new Error(`${options.workflow} refused`);
      return { id: 555, status: 'completed', conclusion: 'success' };
    } };
  return { gh, options, events, dispatches, writes, mergedSha };
}

test('verified publication validates exact CI, proves unchanged merge, reserves once, then deploys API before site', async () => {
  const setup = publicationMock();
  const result = await publishVerifiedRepair(setup.gh, setup.options);
  assert.equal(result.sha, setup.mergedSha);
  assert.equal(result.released.id, 555);
  assert.deepEqual(setup.events, ['pull_request checks', 'main', 'verifyCandidate', 'pr', 'assertActive', 'merge', 'verifyMergedTree', 'main', 'reserveRelease', 'api-deploy.yml', 'main', 'static-site.yml']);
  assert.deepEqual(setup.dispatches.map(({ workflow, sha, ref }) => [workflow, sha, ref]), [
    ['api-deploy.yml', setup.mergedSha, 'main'], ['static-site.yml', setup.mergedSha, 'main']]);
  assert.deepEqual(setup.dispatches[0].inputs, releaseInputs('api', setup.options));
  assert.deepEqual(setup.dispatches[1].inputs, releaseInputs('static', setup.options));
  assert.equal(setup.writes.length, 1);
});

test('failed candidate CI stops before any GitHub mutation or production release', async () => {
  const setup = publicationMock({ failAt: 'pull_request checks' });
  await assert.rejects(() => publishVerifiedRepair(setup.gh, setup.options), /pull_request checks refused/);
  assert.deepEqual(setup.events, ['pull_request checks']);
  assert.deepEqual(setup.writes, []);
});

test('main moving at any release boundary prevents the next publication step', async () => {
  for (const staleMainAt of [1, 2, 3]) {
    const setup = publicationMock({ staleMainAt });
    await assert.rejects(() => publishVerifiedRepair(setup.gh, setup.options), /Protected main changed/);
    if (staleMainAt === 1) assert.deepEqual(setup.writes, []);
    if (staleMainAt <= 2) assert.equal(setup.events.includes('reserveRelease'), false);
    if (staleMainAt <= 2) assert.equal(setup.events.includes('api-deploy.yml'), false);
    assert.equal(setup.events.includes('static-site.yml'), false);
  }
});

test('candidate verification and a changed pull request stop before merge', async () => {
  const cases = [{ failAt: 'verifyCandidate' }, { failAt: 'assertActive' }, { prOverrides: { head: { sha: BASE } } },
    { prOverrides: { base: { sha: NEXT, ref: 'main' } } }, { prOverrides: { base: { sha: BASE, ref: 'other' } } },
    { prOverrides: { state: 'closed' } }];
  for (const options of cases) {
    const setup = publicationMock(options);
    await assert.rejects(() => publishVerifiedRepair(setup.gh, setup.options));
    assert.deepEqual(setup.writes, []);
    assert.equal(setup.events.includes('reserveRelease'), false);
    assert.equal(setup.events.includes('api-deploy.yml'), false);
  }
});

test('branch protection, merged-tree mismatch and daily reservation failures prohibit deployment', async () => {
  for (const options of [{ mergeDenied: true }, { failAt: 'verifyMergedTree' }, { failAt: 'reserveRelease' }]) {
    const setup = publicationMock(options);
    await assert.rejects(() => publishVerifiedRepair(setup.gh, setup.options));
    assert.deepEqual(setup.dispatches.map(({ workflow }) => workflow), []);
    if (options.mergeDenied || options.failAt === 'verifyMergedTree') assert.equal(setup.events.includes('reserveRelease'), false);
  }
});

test('failed API deployment never dispatches the static website release', async () => {
  const setup = publicationMock({ failAt: 'api-deploy.yml' });
  await assert.rejects(() => publishVerifiedRepair(setup.gh, setup.options), /api-deploy.yml refused/);
  assert.deepEqual(setup.dispatches.map(({ workflow }) => workflow), ['api-deploy.yml']);
  assert.equal(setup.events.includes('static-site.yml'), false);
});

test('publication refuses to run without a live owner pause check', async () => {
  const setup = publicationMock();
  delete setup.options.assertActive;
  await assert.rejects(() => publishVerifiedRepair(setup.gh, setup.options), /live owner-control check/);
  assert.deepEqual(setup.dispatches, []);
  assert.deepEqual(setup.writes, []);
});

test('automatic API release requires the exact live maintenance predecessor and healthy unchanged schema 10', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autopilot-predecessor-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const version = '11111111-1111-4111-8111-111111111111';
  const quarantine = loadProductionQuarantine();
  const deployment = {
    id: 'verified-predecessor', annotations: { 'workers/message': `JAKH final ${NEXT} schema 10 run 98765` },
    versions: [{ version_id: version, percentage: 100 }],
  };
  const health = {
    ok: true, service: 'jakh-api', workerVersionId: version, schema: '10', targetSchema: '10', compatibleSchemas: ['8', '9', '10'],
    features: { registration: true, accountRecovery: true, accountDeletion: true, contentStudio: true, adminMfa: true },
    contentPublication: { state: 'safety-quarantine-active', quarantinedCategories: [...quarantine.categorySlugs],
      quarantinedQuestions: quarantine.manifest.totalCards, publicQuestions: 3798, manifestSha256: quarantine.policySha256 },
  };
  const receipt = { authorized: true, stage: 'api', run: { sourceSha: NEXT } };
  const calls = [];
  const mockFetch = async (url, options) => {
    calls.push(String(url));
    assert.equal(options.redirect, 'error');
    if (String(url) === `https://api.github.com${PREFIX}/branches/main`) return response({ name: 'main', protected: true, commit: { sha: BASE } });
    if (new URL(url).hostname === 'pipelines.actions.githubusercontent.com') return response({ value: 'test-identity-jwt' });
    assert.equal(String(url), `${API_ORIGIN}/api/internal/autopilot/authorize-release`);
    assert.deepEqual(JSON.parse(options.body), { day: ENV.AUTOPILOT_DAY, maintenanceRunId: ENV.AUTOPILOT_RUN_ID, candidateSha: BASE });
    return response(receipt);
  };
  const writeProof = async (deploymentProof = deployment, healthProof = health) => {
    await fs.writeFile(path.join(directory, 'worker-before-reread.json'), JSON.stringify(deploymentProof));
    await fs.writeFile(path.join(directory, 'health-before.json'), JSON.stringify(healthProof));
  };
  const env = { ...ENV, AUTOPILOT_PREDECESSOR_DIR: directory };
  await writeProof();
  assert.deepEqual(await authorizeRelease(env, mockFetch), receipt);
  assert.equal(calls.length, 3);
  await writeProof({ ...deployment, annotations: { 'workers/message': `JAKH final ${BASE} schema 10 run 98765` } });
  await assert.rejects(() => authorizeRelease(env, mockFetch), /automatic repair base is not the live API source:.*active API source commit/u);
  await writeProof(deployment, { ...health, schema: '8' });
  await assert.rejects(() => authorizeRelease(env, mockFetch), /API health schema was 8, expected 10/u);
  await writeProof({ ...deployment, versions: [{ version_id: version, percentage: 50 }] });
  await assert.rejects(() => authorizeRelease(env, mockFetch), /exactly one active Worker version serving 100%/u);
  await writeProof();
  receipt.stage = 'static';
  await assert.rejects(() => authorizeRelease(env, mockFetch), /predecessor identity is missing/u);
  receipt.stage = 'api';
  receipt.run.sourceSha = '';
  await assert.rejects(() => authorizeRelease(env, mockFetch), /predecessor identity is missing/u);
  receipt.run.sourceSha = NEXT;
  await fs.unlink(path.join(directory, 'worker-before-reread.json'));
  await assert.rejects(() => authorizeRelease(env, mockFetch), /ENOENT/u);
});

const REPAIR_REF = 'autopilot/2026-09-23-12345';
const API_REPOSITORY = { id: Number(REPOSITORY_ID), full_name: REPOSITORY };
function pullRequestRun(overrides = {}) {
  return { id: 777, run_attempt: 1, event: 'pull_request', head_branch: REPAIR_REF, head_sha: NEXT,
    path: '.github/workflows/api-check.yml@refs/pull/62/merge', display_title: `Validate API · PR 62 · base ${BASE} · head ${NEXT}`, status: 'queued', conclusion: null,
    repository: API_REPOSITORY, head_repository: API_REPOSITORY,
    pull_requests: [{ number: 62, head: { ref: REPAIR_REF, sha: NEXT, repo: { id: Number(REPOSITORY_ID) } },
      base: { ref: 'main', sha: BASE, repo: { id: Number(REPOSITORY_ID) } } }], ...overrides };
}
function successfulPullJobs() {
  return ['validate', 'Browser regression'].map((name, index) => ({ id: 1000 + index, run_id: 777,
    name, status: 'completed', conclusion: 'success' }));
}
function pullChecksMock({ runs, refresh = {}, jobs = successfulPullJobs(), totalJobs = jobs.length, totalRuns, pullOverride = {}, finalPullOverride = {} } = {}) {
  let clock = START;
  const requests = [];
  let pullReads = 0;
  const gh = async (url, options = {}) => {
    assert.equal(options.method, undefined, 'Waiting for PR checks must never dispatch or mutate a workflow');
    requests.push(url);
    if (url === `${PREFIX}/pulls/62`) {
      pullReads++;
      return { number: 62, state: 'open', head: { ref: REPAIR_REF, sha: NEXT, repo: API_REPOSITORY },
        base: { ref: 'main', sha: BASE, repo: API_REPOSITORY }, ...pullOverride, ...(pullReads > 1 ? finalPullOverride : {}) };
    }
    if (url.includes('/workflows/api-check.yml/runs?')) {
      const listed = runs || [pullRequestRun()];
      return { total_count: totalRuns ?? listed.length, workflow_runs: listed };
    }
    if (url === `${PREFIX}/actions/runs/777?exclude_pull_requests=false`) return pullRequestRun({ status: 'completed', conclusion: 'success', ...refresh });
    if (url === `${PREFIX}/actions/runs/777/attempts/1/jobs?per_page=100`) return { total_count: totalJobs, jobs };
    throw new Error(`Unexpected PR test request: ${url}`);
  };
  return { gh, requests, options: { ref: REPAIR_REF, sha: NEXT, prNumber: 62, base: BASE, timeoutMs: 30_000,
    now: () => clock, wait: async ms => { clock += ms; } } };
}

test('PR validation waits for the exact native PR workflow and both required jobs in the same attempt', async () => {
  const setup = pullChecksMock();
  const run = await waitForPullRequestChecks(setup.gh, setup.options);
  assert.equal(run.id, 777);
  const query = new URL(`https://api.github.com${setup.requests[1]}`).searchParams;
  assert.equal(query.get('event'), 'pull_request');
  assert.equal(query.get('head_sha'), NEXT);
  assert.equal(query.get('branch'), REPAIR_REF);
  assert.equal(query.get('exclude_pull_requests'), 'false');
  assert.equal(setup.requests[0], `${PREFIX}/pulls/62`);
  assert.deepEqual(setup.requests.slice(2), [`${PREFIX}/actions/runs/777?exclude_pull_requests=false`, `${PREFIX}/actions/runs/777/attempts/1/jobs?per_page=100`, `${PREFIX}/pulls/62`]);
});

test('PR checks never substitute push/dispatch, unrelated PR, stale base, wrong head, workflow or fork validation', async () => {
  const wrongPull = (change) => [{ ...pullRequestRun().pull_requests[0], ...change }];
  const invalid = [
    pullRequestRun({ event: 'push', status: 'completed', conclusion: 'success' }),
    pullRequestRun({ event: 'workflow_dispatch', status: 'completed', conclusion: 'success' }),
    pullRequestRun({ head_sha: BASE }), pullRequestRun({ head_branch: 'another-branch' }),
    pullRequestRun({ path: '.github/workflows/static-site.yml' }),
    pullRequestRun({ head_repository: { ...API_REPOSITORY, id: 1 } }),
    pullRequestRun({ repository: { ...API_REPOSITORY, full_name: 'someone/fork' } }),
    pullRequestRun({ pull_requests: wrongPull({ number: 99 }) }),
    pullRequestRun({ pull_requests: wrongPull({ base: { ref: 'main', sha: NEXT, repo: { id: Number(REPOSITORY_ID) } } }) }),
    pullRequestRun({ pull_requests: wrongPull({ head: { ref: REPAIR_REF, sha: NEXT, repo: { id: 1 } } }) }),
    pullRequestRun({ display_title: `Validate API · PR 99 · base ${BASE} · head ${NEXT}` }),
  ];
  const setup = pullChecksMock({ runs: invalid });
  await assert.rejects(() => waitForPullRequestChecks(setup.gh, setup.options), /Required pull-request checks did not finish/);
  assert.equal(setup.requests.some(url => url.includes('/jobs?')), false);
});

test('PR run selection rejects ambiguity and an incomplete oversized listing', async () => {
  for (const options of [{ runs: [pullRequestRun(), pullRequestRun({ id: 778 })] }, { totalRuns: 101 }]) {
    const setup = pullChecksMock(options);
    await assert.rejects(() => waitForPullRequestChecks(setup.gh, setup.options), /Ambiguous|bounded, unique/);
    assert.equal(setup.requests.length, 2);
  }
});

test('PR run identity and attempt cannot change while checks are running', async () => {
  for (const refresh of [{ id: 778 }, { run_attempt: 2 }, { head_sha: BASE }, { event: 'workflow_dispatch' },
    { display_title: 'unbound title' }, { head_repository: { ...API_REPOSITORY, id: 1 } }]) {
    const setup = pullChecksMock({ refresh });
    await assert.rejects(() => waitForPullRequestChecks(setup.gh, setup.options), /Pull-request validation identity changed/);
    assert.equal(setup.requests.some(url => url.includes('/jobs?')), false);
  }
});

test('failed or approval-blocked PR checks cannot authorize automatic publication', async () => {
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped', 'neutral', 'action_required']) {
    const setup = pullChecksMock({ runs: [pullRequestRun({ status: 'completed', conclusion })] });
    await assert.rejects(() => waitForPullRequestChecks(setup.gh, setup.options), /ended with|requires human approval/);
    assert.equal(setup.requests.some(url => url.includes('/jobs?')), false);
  }
  for (const status of ['waiting', 'action_required']) {
    const setup = pullChecksMock({ runs: [pullRequestRun({ status })] });
    await assert.rejects(() => waitForPullRequestChecks(setup.gh, setup.options), /requires human approval/);
    assert.equal(setup.requests.length, 2);
  }
});

test('a successful PR workflow cannot hide skipped, missing, duplicate, unfinished or unrelated required jobs', async () => {
  const cases = [
    successfulPullJobs().map(job => job.name === 'Browser regression' ? { ...job, conclusion: 'skipped' } : job),
    successfulPullJobs().map(job => job.name === 'validate' ? { ...job, conclusion: 'neutral' } : job),
    successfulPullJobs().map(job => ({ ...job, run_id: 778 })),
    successfulPullJobs().map(job => ({ ...job, status: 'in_progress' })),
    [successfulPullJobs()[0]],
    [successfulPullJobs()[0], { ...successfulPullJobs()[0], id: 1111 }],
    [...successfulPullJobs(), { name: 'unexpected additional job', run_id: 777, status: 'completed', conclusion: 'success' }],
  ];
  for (const jobs of cases) {
    const setup = pullChecksMock({ jobs });
    await assert.rejects(() => waitForPullRequestChecks(setup.gh, setup.options), /required pull-request jobs|Required pull-request job/);
  }
});

test('invalid PR check identities are rejected before network access', async () => {
  for (const values of [{ sha: 'main' }, { base: '' }, { prNumber: 0 }, { prNumber: '62' }, { ref: 'branch?escape' }]) {
    const setup = pullChecksMock();
    await assert.rejects(() => waitForPullRequestChecks(setup.gh, { ...setup.options, ...values }), /Invalid pull-request/);
    assert.equal(setup.requests.length, 0);
  }
});

test('the App publisher credential is minted after candidate proof, used only for branch and PR publication, then revoked', async () => {
  const fullSource = await fs.readFile(path.join(ROOT, 'scripts/site-autopilot.mjs'), 'utf8');
  // Only the package-free publication job may hold the App credential.
  const source = fullSource.slice(fullSource.indexOf('export async function runPublication'));
  assert.doesNotMatch(fullSource.slice(0, fullSource.indexOf('export async function runPublication')), /mintAutopilotAppToken\(|publisher\.token/u);
  const proof = source.indexOf('"--candidate", candidate, "--repo", root]);');
  const treeBinding = source.indexOf('inspection.candidate.tree');
  assert.ok(proof >= 0 && treeBinding > proof && treeBinding < source.indexOf('const publisher = await mintAutopilotAppToken({ env });'),
    'The re-derived candidate must match the inspected tree after its own proof and before any credential exists');
  const minted = source.indexOf('const publisher = await mintAutopilotAppToken({ env });');
  const revoked = source.indexOf('finally { await publisher.revoke(); }', minted);
  const publish = source.indexOf('await publishVerifiedRepair(gh,', revoked);
  assert.ok(proof >= 0 && minted > proof && revoked > minted && publish > revoked,
    'The App token must exist only between candidate verification and completion of branch/PR publication');
  const credentialScope = source.slice(minted, revoked);
  assert.match(credentialScope, /githubClient\(\{ \.\.\.env, GITHUB_TOKEN: publisher\.token \}\)/u);
  assert.match(credentialScope, /await must\("git", \["push", "origin", `HEAD:refs\/heads\/\$\{branch\}`\]/u);
  assert.match(credentialScope, /pr = await appGithub\(`\$\{PREFIX\}\/pulls`, \{ method: "POST"/u);
  assert.equal((credentialScope.match(/await appGithub\(/gu) || []).length, 1);
  assert.doesNotMatch(credentialScope, /\/merge|\/actions\/|writeFile\(|appendFile\(/u);
  assert.doesNotMatch(source.slice(revoked + 'finally { await publisher.revoke(); }'.length), /publisher\.token|appGithub\(/u);
  assert.match(credentialScope, /::add-mask::\$\{publisher\.token\}/u);
  assert.match(credentialScope, /::add-mask::\$\{authorization\}/u);
  assert.equal(safeChildEnv({ AUTOPILOT_GITHUB_APP_PRIVATE_KEY: 'private-key', GITHUB_TOKEN: 'token' }).AUTOPILOT_GITHUB_APP_PRIVATE_KEY, undefined);
});

test('GitHub empty or absent PR associations are accepted only with the bound run title and authoritative PR proof', async () => {
  for (const pull_requests of [[], null, undefined]) {
    const setup = pullChecksMock({ runs: [pullRequestRun({ status: 'completed', conclusion: 'success', pull_requests })] });
    const result = await waitForPullRequestChecks(setup.gh, setup.options);
    assert.equal(result.id, 777);
    assert.equal(setup.requests.filter(url => url === `${PREFIX}/pulls/62`).length, 2);
  }
  for (const display_title of ['Unbound PR title', `Validate API · PR 99 · base ${BASE} · head ${NEXT}`,
    `Validate API · PR 62 · base ${NEXT} · head ${NEXT}`, `Validate API · PR 62 · base ${BASE} · head ${BASE}`]) {
    const setup = pullChecksMock({ runs: [pullRequestRun({ status: 'completed', conclusion: 'success', pull_requests: [], display_title })] });
    await assert.rejects(() => waitForPullRequestChecks(setup.gh, setup.options), /Required pull-request checks did not finish/);
    assert.equal(setup.requests.some(url => url.includes('/jobs?')), false);
  }
});

test('authoritative PR identity must agree both before polling and after successful checks', async () => {
  const changes = [
    { number: 99 }, { state: 'closed' },
    { head: { ref: REPAIR_REF, sha: BASE, repo: API_REPOSITORY } },
    { head: { ref: 'another-branch', sha: NEXT, repo: API_REPOSITORY } },
    { head: { ref: REPAIR_REF, sha: NEXT, repo: { ...API_REPOSITORY, id: 1 } } },
    { base: { ref: 'main', sha: NEXT, repo: API_REPOSITORY } },
    { base: { ref: 'other', sha: BASE, repo: API_REPOSITORY } },
    { base: { ref: 'main', sha: BASE, repo: { ...API_REPOSITORY, full_name: 'someone/fork' } } },
  ];
  for (const pullOverride of changes) {
    const setup = pullChecksMock({ pullOverride });
    await assert.rejects(() => waitForPullRequestChecks(setup.gh, setup.options), /Pull-request source identity changed/);
    assert.deepEqual(setup.requests, [`${PREFIX}/pulls/62`]);
  }
  const moved = pullChecksMock({ finalPullOverride: { base: { ref: 'main', sha: NEXT, repo: API_REPOSITORY } } });
  await assert.rejects(() => waitForPullRequestChecks(moved.gh, moved.options), /Pull-request source identity changed/);
  assert.ok(moved.requests.some(url => url.includes('/attempts/1/jobs?')));
});

test('the immutable CI workflow binds its run title to the triggering PR number and source commits', async () => {
  const workflow = await fs.readFile(path.join(ROOT, '.github/workflows/api-check.yml'), 'utf8');
  assert.ok(workflow.includes("run-name: Validate API · PR ${{ github.event.pull_request.number || 'none' }} · base ${{ github.event.pull_request.base.sha || 'none' }} · head ${{ github.event.pull_request.head.sha || github.sha }}"));
});

const EXPECTED_PUBLISHED_BUILD = 'a'.repeat(64);
const PUBLISHED_WORKER_VERSION = '07003da4-69e2-43c1-8c41-e8b8ea71f80a';
function publishedResponse({ status = 200, buildId = EXPECTED_PUBLISHED_BUILD, workerVersion = PUBLISHED_WORKER_VERSION } = {}) {
  const headers = {};
  if (buildId !== null) headers['x-jakh-site-version'] = buildId;
  if (workerVersion !== null) headers['x-jakh-worker-version'] = workerVersion;
  return new Response(null, { status, headers });
}

test('final publication proof returns only an HTTP 200 exact candidate build and valid Worker UUID', () => {
  assert.deepEqual(verifyPublishedBuild(publishedResponse(), { expectedBuildId: EXPECTED_PUBLISHED_BUILD }),
    { buildId: EXPECTED_PUBLISHED_BUILD, workerVersion: PUBLISHED_WORKER_VERSION });
});

test('a concurrent different deployment cannot be recorded as the verified candidate', () => {
  assert.throws(() => verifyPublishedBuild(publishedResponse({ buildId: 'b'.repeat(64) }),
    { expectedBuildId: EXPECTED_PUBLISHED_BUILD }), /does not match the verified candidate build/);
});

test('final publication proof rejects errors, redirects and other successful HTTP statuses', () => {
  for (const status of [201, 202, 204, 301, 404, 500]) {
    assert.throws(() => verifyPublishedBuild(publishedResponse({ status }),
      { expectedBuildId: EXPECTED_PUBLISHED_BUILD }), /HTTP 200 check/);
  }
});

test('missing or malformed published build and Worker identities fail closed', () => {
  for (const buildId of [null, '', 'a'.repeat(63), 'g'.repeat(64)]) {
    assert.throws(() => verifyPublishedBuild(publishedResponse({ buildId }),
      { expectedBuildId: EXPECTED_PUBLISHED_BUILD }), /verified candidate build/);
  }
  for (const workerVersion of [null, '', '-'.repeat(36), '0'.repeat(36), '00000000-0000-0000-0000-000000000000',
    '07003da4-69e2-43c1-0c41-e8b8ea71f80a']) {
    assert.throws(() => verifyPublishedBuild(publishedResponse({ workerVersion }),
      { expectedBuildId: EXPECTED_PUBLISHED_BUILD }), /Worker version identity/);
  }
});

test('final publication proof requires a valid local verified build identity', () => {
  for (const expectedBuildId of [undefined, null, '', 'a'.repeat(63), 'g'.repeat(64)]) {
    assert.throws(() => verifyPublishedBuild(publishedResponse(), { expectedBuildId }), /candidate build identity is missing or invalid/);
  }
});

test('maintenance installs packages only in a read-only job and writes only from a package-free job', async () => {
  const source = await fs.readFile(path.join(ROOT, '.github/workflows/site-autopilot.yml'), 'utf8');
  const inspect = workflowJob(source, 'inspect');
  const publish = workflowJob(source, 'publish');
  assert.match(inspect, /\n    permissions:\n      contents: read\n      actions: read\n(?! {6})/u, 'the package job has exactly a read-only token');
  assert.equal((inspect.match(/\n    permissions:/gu) || []).length, 1);
  assert.doesNotMatch(inspect, /id-token|environment:|secrets\.|: write|AUTOPILOT_GITHUB_APP/u);
  assert.match(inspect, /npm ci --no-audit --no-fund/u);
  assert.match(inspect, /run: node scripts\/site-autopilot\.mjs inspect/u);
  assert.match(inspect, /uses: actions\/upload-artifact@[a-f0-9]{40} # v[\d.]+\n\s+with:\n\s+name: autopilot-handoff-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u);

  assert.match(publish, /needs: inspect/u);
  assert.doesNotMatch(publish, /npm ci|npm install|npx |playwright|cache: npm|cache-dependency-path/u, 'the writing job installs no packages');
  assert.match(publish, /environment: \$\{\{ vars\.AUTOPILOT_RELEASE_ENABLED == 'true' && 'autopilot-production' \|\| '' \}\}/u);
  for (const permission of ['contents: write', 'pull-requests: write', 'issues: write', 'actions: write', 'id-token: write']) {
    assert.ok(publish.includes(permission), permission);
  }
  // Hand-off identity comes from job outputs GitHub evaluates, never from a step.
  assert.match(inspect, /    outputs:\n      handoff: autopilot-handoff-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}\n      attempt: \$\{\{ github\.run_attempt \}\}\n/u);
  assert.match(publish, /uses: actions\/download-artifact@[a-f0-9]{40} # v[\d.]+\n\s+with:\n\s+name: \$\{\{ needs\.inspect\.outputs\.handoff \}\}\n\s+path: \$\{\{ runner\.temp \}\}\/autopilot-\$\{\{ github\.run_id \}\}/u);
  assert.match(publish, /AUTOPILOT_INSPECTION_ATTEMPT: \$\{\{ needs\.inspect\.outputs\.attempt \}\}\n\s+run: node scripts\/site-autopilot\.mjs publish/u);
  assert.doesNotMatch(publish, /digest-mismatch: (?:ignore|info|warn)/u, 'a tampered hand-off must fail the download');
  assert.ok(publish.indexOf('scripts/autopilot-policy.test.mjs') < publish.indexOf('run: node scripts/site-autopilot.mjs publish'));
  assert.ok(publish.indexOf('actions/download-artifact') < publish.indexOf('run: node scripts/site-autopilot.mjs publish'));
  assert.match(publish, /name: Keep the small maintenance receipt\n\s+if: always\(\)[\s\S]*name: autopilot-\$\{\{ github\.run_id \}\}\n/u);
  assert.equal((source.match(/secrets\.AUTOPILOT_GITHUB_APP_PRIVATE_KEY/gu) || []).length, 1);
  assert.ok(publish.includes('secrets.AUTOPILOT_GITHUB_APP_PRIVATE_KEY'));
});

const HANDOFF_IDENTITY = Object.freeze({ runId: '12345', runAttempt: '1', sourceSha: BASE });
const CHANGE = Object.freeze({ path: 'sitemap.xml', change: 'modify', oldMode: '100644', newMode: '100644',
  beforeSha256: 'c'.repeat(64), afterSha256: 'd'.repeat(64), bytes: 120 });
function handoff(overrides = {}) {
  return { version: 1, ...HANDOFF_IDENTITY, status: 'inspected', checksPassed: 11, failedChecks: [], changedFiles: [], error: null, candidate: null, ...overrides };
}

test('the inspection hand-off is bounded data bound to this exact run, attempt and source', async () => {
  assert.deepEqual(validateHandoff(handoff({ changedFiles: [{ ...CHANGE, extra: 'dropped' }], candidate: { tree: NEXT, buildId: 'e'.repeat(64), extra: 1 } }), HANDOFF_IDENTITY),
    handoff({ changedFiles: [CHANGE], candidate: { tree: NEXT, buildId: 'e'.repeat(64) } }));
  for (const [overrides, message] of [
    [{ version: 2 }, /unsupported format/u],
    [{ runId: '99999' }, /another run/u],
    [{ runAttempt: '2' }, /another run/u],
    [{ sourceSha: NEXT }, /another run/u],
    [{ status: 'deployed' }, /unknown status/u],
    [{ checksPassed: -1 }, /passed-check/u],
    [{ failedChecks: Array.from({ length: 51 }, () => 'Accessibility') }, /invalid findings/u],
    [{ failedChecks: [''] }, /invalid findings/u],
    [{ changedFiles: Array.from({ length: 251 }, () => CHANGE) }, /invalid changed files/u],
    [{ status: 'failed' }, /status and error disagree/u],
    [{ error: 'boom' }, /status and error disagree/u],
    [{ candidate: { tree: 'main', buildId: 'e'.repeat(64) } }, /invalid candidate/u],
    [{ candidate: { tree: NEXT, buildId: 'short' } }, /invalid candidate/u],
  ]) assert.throws(() => validateHandoff(handoff(overrides), HANDOFF_IDENTITY), message, JSON.stringify(overrides));
  for (const change of [{ ...CHANGE, path: '' }, { ...CHANGE, path: 'a\nb' }, { ...CHANGE, change: 'rename' }, { ...CHANGE, newMode: '120000' },
    { ...CHANGE, afterSha256: 'xyz' }, { ...CHANGE, bytes: -1 }]) {
    assert.throws(() => validateHandoff(handoff({ changedFiles: [change] }), HANDOFF_IDENTITY), /invalid changed file/u);
  }

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autopilot-handoff-'));
  try {
    const file = path.join(directory, HANDOFF_FILE);
    await fs.writeFile(file, JSON.stringify(handoff()));
    assert.equal((await readHandoff(file, HANDOFF_IDENTITY)).checksPassed, 11);
    await fs.symlink(file, path.join(directory, 'linked.json'));
    await assert.rejects(readHandoff(path.join(directory, 'linked.json'), HANDOFF_IDENTITY));
    await fs.writeFile(file, ' '.repeat(256 * 1024 + 1));
    await assert.rejects(readHandoff(file, HANDOFF_IDENTITY), /too large/u);
    await fs.writeFile(file, '{');
    await assert.rejects(readHandoff(file, HANDOFF_IDENTITY), /not valid JSON/u);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('a run whose findings need attention fails visibly after the findings issue is filed', () => {
  const lines = [];
  assert.equal(publicationExitCode({ status: 'needs_attention', failedChecks: ['Accessibility', 'Current source is not the verified live build; release needs attention'] }, text => lines.push(text)), 1);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^::error title=Daily maintenance needs attention::Accessibility; Current source is not the verified live build; release needs attention\. See the findings issue\.\n$/u);
  for (const status of ['no_changes', 'deployed', 'paused', 'paused_or_daily_limit']) {
    assert.equal(publicationExitCode({ status, failedChecks: [] }, text => lines.push(text)), 0, status);
  }
  assert.equal(lines.length, 1);
});

async function withPublicationFixture({ inspection, claimStatus = 200, existingIssue = false, release = '', history = null }, callback) {
  const repository = await fs.mkdtemp(path.join(os.tmpdir(), 'autopilot-publication-repo-'));
  const runner = await fs.mkdtemp(path.join(os.tmpdir(), 'autopilot-publication-runner-'));
  const previousDirectory = process.cwd();
  const previousFetch = globalThis.fetch;
  const calls = [];
  try {
    const git = (...args) => execFileSync('git', args, { cwd: repository, stdio: 'pipe' });
    git('init', '-q', '-b', 'main');
    await fs.writeFile(path.join(repository, 'README.md'), 'fixture\n');
    git('add', 'README.md');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'fixture');
    await fs.mkdir(path.join(runner, 'autopilot-12345'), { recursive: true });
    await fs.writeFile(path.join(runner, 'autopilot-12345', HANDOFF_FILE), JSON.stringify(inspection));
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : undefined;
      calls.push({ target, method, body });
      if (target.startsWith('https://pipelines.actions.githubusercontent.com/')) return response({ value: 'test-identity-jwt' });
      if (target === `${API_ORIGIN}/api/internal/autopilot/claim`) return claimStatus === 200 ? response({ day: '2026-10-24' }) : response({ code: 'AUTOPILOT_PAUSED' }, claimStatus);
      if (target === `${API_ORIGIN}/api/internal/autopilot/report`) return response({ ok: true });
      if (target === `https://api.github.com${PREFIX}`) return response({ id: Number(REPOSITORY_ID), private: false, default_branch: 'main' });
      if (target === `https://api.github.com${PREFIX}/branches/main`) return response({ name: 'main', protected: true, commit: { sha: BASE } });
      if (target.startsWith(`https://api.github.com${PREFIX}/issues?state=open`)) {
        return response(existingIssue ? [{ number: 77, user: { id: BOT_ID }, body: `${FINDINGS_MARKER}\nold` }] : []);
      }
      if (target === `https://api.github.com${PREFIX}/issues` && method === 'POST') return response({ number: 78 }, 201);
      if (target === `https://api.github.com${PREFIX}/issues/77` && method === 'PATCH') return response({ number: 77 });
      if (history && target.startsWith(`https://api.github.com${PREFIX}/actions/workflows/static-site.yml/runs?`)) return response({ workflow_runs: history.runs });
      if (history && target.startsWith(`https://api.github.com${PREFIX}/commits?sha=${BASE}&per_page=100&page=`)) {
        return response(history.commits[Number(new URL(target).searchParams.get('page')) - 1] || []);
      }
      throw new Error(`Unexpected fixture request ${method} ${target}`);
    };
    process.chdir(repository);
    const env = { ...ENV, GITHUB_RUN_ATTEMPT: '1', RUNNER_TEMP: runner, AUTOPILOT_RELEASE_ENABLED: release, GITHUB_STEP_SUMMARY: '' };
    return await callback({ env, calls, runner, run: () => runPublication(env, { now: () => new Date('2026-10-24T03:30:00Z') }) });
  } finally {
    process.chdir(previousDirectory);
    globalThis.fetch = previousFetch;
    await fs.rm(repository, { recursive: true, force: true });
    await fs.rm(runner, { recursive: true, force: true });
  }
}

const reportedStatuses = calls => calls.filter(call => call.target.endsWith('/autopilot/report')).map(call => call.body.status);
const issueWrites = calls => calls.filter(call => call.target.includes('/issues') && call.method !== 'GET');

test('publication records findings under the daily claim, files the issue and keeps the receipt', async () => {
  await withPublicationFixture({ inspection: handoff({ checksPassed: 10, failedChecks: ['Accessibility'] }) }, async ({ calls, runner, run }) => {
    const report = await run();
    assert.equal(report.status, 'needs_attention');
    assert.deepEqual(report.failedChecks, ['Accessibility']);
    assert.equal(report.checksPassed, 10);
    assert.equal(report.releaseMode, 'inspection_only');
    assert.deepEqual(reportedStatuses(calls), ['inspecting', 'inspecting', 'testing', 'needs_attention']);
    const claim = calls.findIndex(call => call.target.endsWith('/autopilot/claim'));
    assert.ok(claim > calls.findIndex(call => call.target.endsWith('/branches/main')), 'protected main is checked before the claim');
    assert.deepEqual(issueWrites(calls).map(call => [call.method, call.body.title]), [['POST', '[Autopilot] Daily maintenance findings']]);
    assert.match(issueWrites(calls)[0].body.body, /- Accessibility/u);
    const receipt = JSON.parse(await fs.readFile(path.join(runner, 'autopilot-12345', 'daily-report.json'), 'utf8'));
    assert.equal(receipt.status, 'needs_attention');
    assert.equal(publicationExitCode(report, () => {}), 1);
  });
});

test('a clean inspection closes the findings issue and reports no changes', async () => {
  await withPublicationFixture({ inspection: handoff(), existingIssue: true }, async ({ calls, run }) => {
    const report = await run();
    assert.equal(report.status, 'no_changes');
    assert.deepEqual(reportedStatuses(calls), ['inspecting', 'inspecting', 'testing', 'no_changes']);
    assert.deepEqual(issueWrites(calls).map(call => [call.method, call.target.split('/').at(-1), call.body.state]), [['PATCH', '77', 'closed']]);
    assert.equal(publicationExitCode(report, () => {}), 0);
  });
});

test('generated repairs without automatic publishing stay a review finding, exactly as before the split', async () => {
  await withPublicationFixture({ inspection: handoff({ changedFiles: [CHANGE] }) }, async ({ calls, run }) => {
    const report = await run();
    assert.equal(report.status, 'needs_attention');
    assert.deepEqual(report.failedChecks, ['Generated repairs are ready for review; automatic publishing is disabled']);
    assert.deepEqual(reportedStatuses(calls), ['inspecting', 'fixing', 'testing', 'needs_attention']);
    assert.ok(!calls.some(call => call.target.includes('/pulls') || call.target.includes('/dispatches')));
  });
});

test('a paused or already-claimed day discards the inspection without touching issues', async () => {
  for (const status of [409, 423]) {
    await withPublicationFixture({ inspection: handoff({ failedChecks: ['Accessibility'] }), claimStatus: status }, async ({ calls, run }) => {
      const report = await run();
      assert.equal(report.status, 'paused_or_daily_limit');
      assert.deepEqual(reportedStatuses(calls), []);
      assert.deepEqual(issueWrites(calls), []);
      assert.equal(publicationExitCode(report, () => {}), 0);
    });
  }
});

test('an inspection error is filed as a failed claimed run and fails the job', async () => {
  await withPublicationFixture({ inspection: handoff({ status: 'failed', error: 'npm run failed. See the workflow check output.', checksPassed: 3, failedChecks: ['Accessibility'] }) }, async ({ calls, run }) => {
    await assert.rejects(run(), /npm run failed/u);
    assert.deepEqual(reportedStatuses(calls), ['inspecting', 'failed']);
    const [created] = issueWrites(calls);
    assert.match(created.body.body, /- Accessibility\n- npm run failed\. See the workflow check output\./u);
  });
});

test('a hand-off from another run attempt is rejected before any claim or GitHub write', async () => {
  await withPublicationFixture({ inspection: handoff({ runAttempt: '2' }) }, async ({ calls, run }) => {
    await assert.rejects(run(), /another run/u);
    assert.deepEqual(calls, []);
  });
});

test('a publish-only re-run reads its own inspection attempt and nothing newer', async () => {
  const ctx = { runId: '12345', sha: BASE };
  assert.deepEqual(inspectionIdentity({ GITHUB_RUN_ATTEMPT: '2', AUTOPILOT_INSPECTION_ATTEMPT: '1' }, ctx), { runId: '12345', runAttempt: '1', sourceSha: BASE });
  assert.deepEqual(inspectionIdentity({ GITHUB_RUN_ATTEMPT: '2' }, ctx), { runId: '12345', runAttempt: '2', sourceSha: BASE });
  for (const attempt of ['3', '0', 'x', '1; rm -rf /']) {
    assert.throws(() => inspectionIdentity({ GITHUB_RUN_ATTEMPT: '2', AUTOPILOT_INSPECTION_ATTEMPT: attempt }, ctx), /does not belong to this run/u, attempt);
  }
  // The re-run's own OIDC attempt cannot take over a day claimed by the first attempt.
  await withPublicationFixture({ inspection: handoff(), claimStatus: 409 }, async ({ env, calls }) => {
    const report = await runPublication({ ...env, GITHUB_RUN_ATTEMPT: '2', AUTOPILOT_INSPECTION_ATTEMPT: '1' }, { now: () => new Date('2026-10-24T03:30:00Z') });
    assert.equal(report.status, 'paused_or_daily_limit');
    assert.deepEqual(issueWrites(calls), []);
  });
});

test('automatic publishing never pushes without the inspected candidate tree', async () => {
  await withPublicationFixture({ inspection: handoff({ changedFiles: [CHANGE] }), release: 'true' }, async ({ env, calls }) => {
    const configured = { ...env, AUTOPILOT_GITHUB_APP_ID: '123', AUTOPILOT_GITHUB_APP_INSTALLATION_ID: '456', AUTOPILOT_GITHUB_APP_PRIVATE_KEY: 'fixture-key-not-a-real-key' };
    await assert.rejects(runPublication(configured, { now: () => new Date('2026-10-24T03:30:00Z') }), /did not prove a repair candidate/u);
    assert.deepEqual(reportedStatuses(calls), ['inspecting', 'fixing', 'testing', 'failed']);
    assert.ok(!calls.some(call => call.target.includes('/pulls') || call.target.includes('access_tokens')));
  });
});

test('neither maintenance job starts within 105 minutes of the UTC reservation boundary', async () => {
  await withPublicationFixture({ inspection: handoff() }, async ({ env, calls }) => {
    await assert.rejects(runPublication(env, { now: () => new Date('2026-10-24T22:16:00Z') }), /earlier in the UTC day/u);
    await assert.rejects(runInspection(env, { now: () => new Date('2026-10-24T23:59:00Z') }), /earlier in the UTC day/u);
    assert.deepEqual(calls, []);
  });
});

const BASELINE_FINDING = 'Current source is not the verified live build; release needs attention';
const LIVE_SHA = 'e'.repeat(40);
function staticRelease(overrides = {}) {
  return { id: 900, path: '.github/workflows/static-site.yml', head_branch: 'main', event: 'workflow_dispatch', status: 'completed',
    conclusion: 'success', head_sha: LIVE_SHA, run_started_at: '2026-10-20T10:00:00Z', updated_at: '2026-10-20T10:20:00Z',
    repository: { full_name: REPOSITORY }, head_repository: { full_name: REPOSITORY }, ...overrides };
}
const commit = (sha, date) => ({ sha, commit: { committer: { date } } });
function historyGh({ runs = [staticRelease()], commits = [[commit(BASE, '2026-10-23T09:00:00Z'), commit('f'.repeat(40), '2026-10-22T09:00:00Z'), commit(LIVE_SHA, '2026-10-20T09:50:00Z')]], fail = false } = {}) {
  const requests = [];
  const gh = async (url, options = {}) => {
    requests.push(url);
    assert.equal(options.method, undefined, 'the assessment only reads');
    if (fail) throw new Error('GitHub GET failed: HTTP 502');
    if (url.startsWith(`${PREFIX}/actions/workflows/static-site.yml/runs?branch=main&event=workflow_dispatch&status=success`)) return { workflow_runs: runs };
    const page = /\/commits\?sha=([a-f0-9]{40})&per_page=100&page=(\d+)$/u.exec(url);
    if (page) { assert.equal(page[1], BASE); return commits[Number(page[2]) - 1] || []; }
    throw new Error(`Unexpected ${url}`);
  };
  return { gh, requests };
}

test('a recent unreleased merge on top of the last verified release is informational for at most seven days', async () => {
  const recent = await assessReleaseLag(historyGh().gh, { sourceSha: BASE, now: new Date('2026-10-24T09:00:00Z') });
  assert.deepEqual(recent, { state: 'unreleased_merges', releaseRunId: '900', releaseSha: LIVE_SHA, unreleasedCommits: 2,
    since: '2026-10-22T09:00:00.000Z', ageDays: 2, informational: true });
  assert.equal(RELEASE_LAG_LIMIT_DAYS, 7);
  const atLimit = await assessReleaseLag(historyGh().gh, { sourceSha: BASE, now: new Date('2026-10-29T09:00:00Z') });
  assert.equal(atLimit.informational, true);
  const stale = await assessReleaseLag(historyGh().gh, { sourceSha: BASE, now: new Date('2026-10-29T09:01:00Z') });
  assert.equal(stale.state, 'unreleased_merges');
  assert.equal(stale.informational, false);

  // A merge commit can carry an older committer date; the lag never starts before the release completed.
  const older = await assessReleaseLag(historyGh({ commits: [[commit(BASE, '2026-10-23T09:00:00Z'), commit('f'.repeat(40), '2026-10-01T00:00:00Z'), commit(LIVE_SHA, '2026-10-01T00:00:00Z')]] }).gh,
    { sourceSha: BASE, now: new Date('2026-10-24T10:20:00Z') });
  assert.equal(older.since, '2026-10-20T10:20:00.000Z');
  assert.equal(older.ageDays, 4);

  // The oldest unreleased commit may be the last entry of the previous page.
  const firstPage = Array.from({ length: 100 }, (_, index) => commit(index === 0 ? BASE : index.toString(16).padStart(40, '1'), '2026-10-23T00:00:00Z'));
  firstPage[99] = commit('9'.repeat(40), '2026-10-21T00:00:00Z');
  const paged = historyGh({ commits: [firstPage, [commit(LIVE_SHA, '2026-10-20T00:00:00Z')]] });
  const boundary = await assessReleaseLag(paged.gh, { sourceSha: BASE, now: new Date('2026-10-24T00:00:00Z') });
  assert.equal(boundary.unreleasedCommits, 100);
  assert.equal(boundary.since, '2026-10-21T00:00:00.000Z');
  assert.equal(paged.requests.filter(url => url.includes('/commits?')).length, 2);
});

test('a live difference that unreleased merges do not explain is never informational', async () => {
  const now = new Date('2026-10-24T09:00:00Z');
  const same = await assessReleaseLag(historyGh({ runs: [staticRelease({ head_sha: BASE })] }).gh, { sourceSha: BASE, now });
  assert.equal(same.state, 'not_explained');
  assert.equal(same.informational, false);
  for (const runs of [[], [staticRelease({ conclusion: 'failure' })], [staticRelease({ head_branch: 'feature' })], [staticRelease({ event: 'schedule' })],
    [staticRelease({ path: '.github/workflows/pages.yml' })], [staticRelease({ head_repository: { full_name: 'someone/fork' } })]]) {
    const result = await assessReleaseLag(historyGh({ runs }).gh, { sourceSha: BASE, now });
    assert.equal(result.state, 'unknown', JSON.stringify(runs[0] || {}));
    assert.equal(result.informational, false);
  }
  const missing = await assessReleaseLag(historyGh({ commits: [[commit(BASE, '2026-10-23T09:00:00Z')]] }).gh, { sourceSha: BASE, now });
  assert.deepEqual([missing.state, missing.informational], ['unknown', false]);
  const unbounded = historyGh({ commits: Array.from({ length: 4 }, () => Array.from({ length: 100 }, () => commit('8'.repeat(40), '2026-10-23T00:00:00Z'))) });
  assert.equal((await assessReleaseLag(unbounded.gh, { sourceSha: BASE, now })).state, 'unknown');
  assert.equal(unbounded.requests.filter(url => url.includes('/commits?')).length, 3);
  const broken = await assessReleaseLag(historyGh({ fail: true }).gh, { sourceSha: BASE, now });
  assert.deepEqual([broken.state, broken.informational], ['unknown', false]);
  const undated = await assessReleaseLag(historyGh({ commits: [[commit(BASE, 'later'), commit(LIVE_SHA, 'x')]] }).gh, { sourceSha: BASE, now });
  assert.equal(undated.state, 'unknown');
});

test('only a recent, explained release gap stays green; every other finding still fails the run', () => {
  const informational = { state: 'unreleased_merges', releaseRunId: '900', unreleasedCommits: 2, since: '2026-10-22T09:00:00.000Z', ageDays: 2, informational: true };
  const lines = [];
  assert.equal(publicationExitCode({ status: 'needs_attention', failedChecks: [BASELINE_FINDING], releaseLag: informational }, text => lines.push(text)), 0);
  assert.match(lines.at(-1), /^::notice title=Daily maintenance: release pending::Informational: main is 2 unreleased commits ahead/u);

  assert.equal(publicationExitCode({ status: 'needs_attention', failedChecks: [BASELINE_FINDING, 'Accessibility'], releaseLag: informational }, text => lines.push(text)), 1);
  assert.match(lines.at(-1), /^::error title=Daily maintenance needs attention::Accessibility\. See the findings issue\.\n$/u);

  for (const releaseLag of [{ ...informational, ageDays: 8, informational: false }, { state: 'not_explained', informational: false, reason: 'main has no merge after the last verified release' },
    { state: 'unknown', informational: false, reason: 'the release history could not be read' }, { ...informational, state: 'unknown' }, undefined]) {
    assert.equal(publicationExitCode({ status: 'needs_attention', failedChecks: [BASELINE_FINDING], releaseLag }, text => lines.push(text)), 1, JSON.stringify(releaseLag));
    assert.match(lines.at(-1), /^::error title=Daily maintenance needs attention::Current source is not the verified live build; release needs attention\./u);
  }
  assert.match(lines.at(-5), /for 8 days since .*more than the 7-day limit/u);
});

test('publication files the release gap as an informational finding and keeps the run green', async () => {
  const history = { runs: [staticRelease()], commits: [[commit(BASE, '2026-10-23T09:00:00Z'), commit(LIVE_SHA, '2026-10-20T09:50:00Z')]] };
  await withPublicationFixture({ inspection: handoff({ failedChecks: [BASELINE_FINDING] }), history }, async ({ calls, runner, run }) => {
    const report = await run();
    assert.equal(report.status, 'needs_attention');
    assert.deepEqual(report.failedChecks, [BASELINE_FINDING]);
    assert.equal(report.releaseLag.informational, true);
    assert.deepEqual(reportedStatuses(calls), ['inspecting', 'inspecting', 'testing', 'needs_attention']);
    const [created] = issueWrites(calls);
    assert.match(created.body.body, /- Current source is not the verified live build release needs attention/u);
    assert.match(created.body.body, /Informational: main is 1 unreleased commit\(s\) ahead of the last verified static release \(run 900\), unreleased for 0.8 days since 2026-10-23T09:00:00.000Z/u);
    const receipt = JSON.parse(await fs.readFile(path.join(runner, 'autopilot-12345', 'daily-report.json'), 'utf8'));
    assert.equal(receipt.releaseLag.state, 'unreleased_merges');
    assert.equal(publicationExitCode(report, () => {}), 0);
  });
  const staleHistory = { runs: [staticRelease({ updated_at: '2026-10-10T00:00:00Z' })], commits: [[commit(BASE, '2026-10-12T00:00:00Z'), commit(LIVE_SHA, '2026-10-09T00:00:00Z')]] };
  await withPublicationFixture({ inspection: handoff({ failedChecks: [BASELINE_FINDING] }), history: staleHistory }, async ({ calls, run }) => {
    const report = await run();
    assert.equal(report.releaseLag.informational, false);
    assert.match(issueWrites(calls)[0].body.body, /Needs attention: main has been ahead of the last verified static release \(run 900\) for 12.1 days/u);
    assert.equal(publicationExitCode(report, () => {}), 1);
  });
});

test('the maintenance production check uses the live release, never unreleased main', async () => {
  const source = await fs.readFile(path.join(ROOT, 'scripts/site-autopilot.mjs'), 'utf8');
  const inspection = source.slice(source.indexOf('export async function runInspection'), source.indexOf('export async function runPublication'));
  assert.doesNotMatch(inspection, /scripts\/monitor-production\.mjs/u, 'inspection must not run main\'s monitor contract against production');
  assert.match(inspection, /await liveProductionCheck\(env, \{ ctx, root, outputDir \}\)/u);
  assert.match(inspection, /if \(production === "failed"\) handoff\.failedChecks\.push\("Production monitor"\);/u);
});

async function withLiveRepository(callback) {
  const repository = await fs.mkdtemp(path.join(os.tmpdir(), 'autopilot-live-repo-'));
  const runner = await fs.mkdtemp(path.join(os.tmpdir(), 'autopilot-live-runner-'));
  const previousDirectory = process.cwd();
  try {
    const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: 'pipe' }).trim();
    git('init', '-q', '-b', 'main');
    const commitFile = async (content, message) => {
      await fs.writeFile(path.join(repository, 'contract.txt'), content);
      git('add', 'contract.txt');
      git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', message);
      return git('rev-parse', 'HEAD');
    };
    const released = await commitFile('released contract\n', 'released');
    const main = await commitFile('unreleased contract\n', 'unreleased merge');
    process.chdir(repository);
    return await callback({ repository, runner, released, main, git });
  } finally {
    process.chdir(previousDirectory);
    await fs.rm(repository, { recursive: true, force: true });
    await fs.rm(runner, { recursive: true, force: true });
  }
}

const liveResolution = (site, api) => ({ state: 'live', resolvedAt: '2026-10-24T12:00:00.000Z',
  site: { workflow: 'static-site.yml', runId: '501', runAttempt: 1, commit: site, runUrl: 'https://github.com/x/actions/runs/501' },
  api: { workflow: 'api-deploy.yml', runId: '502', runAttempt: 1, commit: api, runUrl: 'https://github.com/x/actions/runs/502' } });

test('the live production check runs each live commit outside the clean checkout and records the result', async () => {
  await withLiveRepository(async ({ repository, runner, released, main, git }) => {
    const outputDir = path.join(runner, 'autopilot-12345');
    await fs.mkdir(outputDir, { recursive: true });
    const workDir = path.join(runner, 'autopilot-live-12345');
    const seen = [];
    const result = await runLiveProductionCheck({ ...ENV, RUNNER_TEMP: runner }, {
      root: repository, outputDir, workDir,
      resolve: async ({ request }) => { assert.equal(typeof request, 'function'); return liveResolution(released, released); },
      check: async ({ resolution, siteCheckout, apiCheckout, env }) => {
        seen.push({ siteCheckout, apiCheckout });
        assert.equal(siteCheckout, apiCheckout, 'one worktree when both components are live at one commit');
        assert.ok(siteCheckout.startsWith(`${workDir}/`) && !siteCheckout.startsWith(`${repository}/`));
        // The live commit's contract is used, not the unreleased one in the checkout.
        assert.equal(await fs.readFile(path.join(siteCheckout, 'contract.txt'), 'utf8'), 'released contract\n');
        assert.equal(await fs.readFile(path.join(repository, 'contract.txt'), 'utf8'), 'unreleased contract\n');
        assert.equal(git('status', '--porcelain', '--untracked-files=all'), '', 'the checkout stays clean for the repair engine');
        assert.equal(env.GH_TOKEN, ENV.GITHUB_TOKEN);
        assert.equal(env.GITHUB_TOKEN, undefined);
        assert.equal(env.JAKH_SITE_ORIGIN, 'https://riddlearabia.com');
        assert.equal(resolution.site.commit, released);
        return { schemaVersion: 1, status: 'success', monitor: { scope: 'all', basis: 'live-release' }, results: [{ name: 'Site: Home' }], failures: [] };
      },
    });
    assert.deepEqual(result, { state: 'passed' });
    assert.equal(seen.length, 1);
    assert.equal(JSON.parse(await fs.readFile(path.join(outputDir, 'production-monitor.json'), 'utf8')).monitor.basis, 'live-release');
    assert.equal(git('worktree', 'list', '--porcelain').split('\n').filter(line => line.startsWith('worktree ')).length, 1, 'temporary worktrees are removed');
    await assert.rejects(fs.access(workDir));
    assert.notEqual(main, released);

    const split = await runLiveProductionCheck({ ...ENV, RUNNER_TEMP: runner }, { root: repository, outputDir, workDir,
      resolve: async () => liveResolution(released, main),
      check: async ({ siteCheckout, apiCheckout }) => {
        assert.notEqual(siteCheckout, apiCheckout);
        assert.equal(await fs.readFile(path.join(apiCheckout, 'contract.txt'), 'utf8'), 'unreleased contract\n');
        return { schemaVersion: 1, status: 'failure', monitor: { scope: 'all' }, results: [], failures: [{ name: 'Live release: static site identity', message: 'drift' }] };
      } });
    assert.deepEqual(split, { state: 'failed' }, 'a drift from the live release still fails the check');
  });
});

test('a deploying release defers the maintenance production check, and malformed or unsafe input fails it', async () => {
  await withLiveRepository(async ({ repository, runner, released }) => {
    const outputDir = path.join(runner, 'autopilot-12345');
    await fs.mkdir(outputDir, { recursive: true });
    let checked = false;
    const deferred = await runLiveProductionCheck(ENV, { root: repository, outputDir, workDir: path.join(runner, 'live'),
      resolve: async () => ({ state: 'deferred', reason: 'static site release run 600 is in progress' }), check: async () => { checked = true; } });
    assert.deepEqual(deferred, { state: 'deferred', reason: 'static site release run 600 is in progress' });
    assert.equal(checked, false);
    await assert.rejects(runLiveProductionCheck(ENV, { root: repository, outputDir, workDir: path.join(runner, 'live'),
      resolve: async () => liveResolution('main', released), check: async () => { checked = true; } }), /malformed/u);
    await assert.rejects(runLiveProductionCheck(ENV, { root: repository, outputDir, workDir: path.join(repository, 'live'),
      resolve: async () => liveResolution(released, released), check: async () => { checked = true; } }), /outside the checkout/u);
    await assert.rejects(runLiveProductionCheck(ENV, { root: repository, outputDir, workDir: path.join(runner, 'live'),
      resolve: async () => liveResolution('0'.repeat(40), released), check: async () => { checked = true; } }), /git worktree failed/u);
    assert.equal(checked, false);
  });
});
