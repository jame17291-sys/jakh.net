import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { context, githubClient, oidcToken, autopilotRequest, assertMain, releaseInputs, authorizeRelease,
  REPOSITORY, REPOSITORY_ID, API_ORIGIN, AUDIENCE } from './autopilot-client.mjs';
import { safeChildEnv, findingBody, syncFindings, matchDispatchedRun, dispatchAndWait,
  FINDINGS_MARKER, BOT_ID, publishVerifiedRepair, waitForPullRequestChecks } from './site-autopilot.mjs';

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
  assert.match(source, /environment: autopilot-production/u);
  for (const match of source.matchAll(/secrets\.([A-Za-z0-9_]+)/gu)) assert.equal(match[1], 'AUTOPILOT_GITHUB_APP_PRIVATE_KEY');
  for (const match of source.matchAll(/uses:\s+([^\s#]+)/gu)) assert.match(match[1], /@[a-f0-9]{40}$/u);
  const policy = source.indexOf('scripts/autopilot-policy.test.mjs');
  assert.ok(policy >= 0 && policy < source.indexOf('run: node scripts/site-autopilot.mjs'));
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
  const migration = api.slice(api.indexOf('\n  migrate-final:'));
  assert.match(migration, /environment: production/u);
  assert.doesNotMatch(migration, /environment:.*autopilot-production/u);
  const lateAuthorization = 'Recheck automatic release permission immediately before deployment';
  assert.ok(api.indexOf(lateAuthorization) < api.indexOf('id: deploy_compatibility'));
  const apiPredeployGate = api.slice(api.indexOf(lateAuthorization), api.indexOf('id: deploy_compatibility'));
  assert.match(apiPredeployGate, /AUTOPILOT_TARGET_SCHEMA: \$\{\{ steps\.preflight\.outputs\.target-schema \}\}/u);
  assert.match(apiPredeployGate, /AUTOPILOT_CURRENT_SCHEMA: \$\{\{ steps\.preflight\.outputs\.current-schema \}\}/u);
  assert.match(apiPredeployGate, /AUTOPILOT_SCHEMA_CHANGED: \$\{\{ steps\.preflight\.outputs\.schema-changed \}\}/u);
  assert.match(apiPredeployGate, /\[ "\$AUTOPILOT_TARGET_SCHEMA" != "9" \] \|\| \[ "\$AUTOPILOT_CURRENT_SCHEMA" != "9" \] \|\| \[ "\$AUTOPILOT_SCHEMA_CHANGED" != "false" \]/u);
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

test('automatic API release requires the exact live maintenance predecessor and healthy unchanged schema 9', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'autopilot-predecessor-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const version = '11111111-1111-4111-8111-111111111111';
  const quarantine = loadProductionQuarantine();
  const deployment = {
    id: 'verified-predecessor', annotations: { 'workers/message': `JAKH final ${NEXT} schema 9 run 98765` },
    versions: [{ version_id: version, percentage: 100 }],
  };
  const health = {
    ok: true, service: 'jakh-api', workerVersionId: version, schema: '9', targetSchema: '9', compatibleSchemas: ['8', '9'],
    features: { registration: true, accountRecovery: true, accountDeletion: true, contentStudio: true },
    contentPublication: { state: 'safety-quarantine-active', quarantinedCategories: [...quarantine.categorySlugs],
      quarantinedQuestions: quarantine.manifest.totalCards, publicQuestions: 3275, manifestSha256: quarantine.policySha256 },
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
  await writeProof({ ...deployment, annotations: { 'workers/message': `JAKH final ${BASE} schema 9 run 98765` } });
  await assert.rejects(() => authorizeRelease(env, mockFetch), /automatic repair base is not the live API source:.*active API source commit/u);
  await writeProof(deployment, { ...health, schema: '8' });
  await assert.rejects(() => authorizeRelease(env, mockFetch), /API health schema was 8, expected 9/u);
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
  const source = await fs.readFile(path.join(ROOT, 'scripts/site-autopilot.mjs'), 'utf8');
  const proof = source.indexOf('"--candidate", candidate, "--repo", root]);');
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
