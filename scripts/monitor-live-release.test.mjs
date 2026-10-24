import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import http from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  checkLiveIdentity,
  contractEnv,
  createGitHubRequest,
  isTrustedReleaseRun,
  mergeLiveReports,
  receiptIdentity,
  REPOSITORY,
  resolveLiveRelease,
  runLiveCheck,
  selectLiveRelease,
  validateResolution,
} from "./monitor-live-release.mjs";
import { routeProductionAlert } from "./route-production-alert.mjs";

const executeFile = promisify(execFile);
const SITE_SHA = "a".repeat(40);
const API_SHA = "b".repeat(40);
const MAIN_SHA = "c".repeat(40);
const SITE_BUILD = "d".repeat(64);
const SITE_WORKER = "11111111-1111-4111-8111-111111111111";
const API_WORKER = "22222222-2222-4222-8222-222222222222";
const OTHER_WORKER = "33333333-3333-4333-8333-333333333333";

function run(workflow, overrides = {}) {
  return {
    id: 100,
    run_attempt: 1,
    path: `.github/workflows/${workflow}`,
    head_branch: "main",
    event: "workflow_dispatch",
    head_sha: SITE_SHA,
    status: "completed",
    conclusion: "success",
    run_started_at: "2026-10-24T10:00:00Z",
    created_at: "2026-10-24T10:00:00Z",
    repository: { full_name: REPOSITORY },
    head_repository: { full_name: REPOSITORY },
    ...overrides,
  };
}

function quietLogger() {
  const lines = [];
  return { lines, log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) };
}

function githubFixture(listings) {
  const requests = [];
  const request = async (path) => {
    requests.push(path);
    const match = /\/actions\/workflows\/([a-z-]+\.yml)\/runs\?branch=main&event=workflow_dispatch&per_page=100&page=(\d+)$/u.exec(path);
    assert.ok(match, `unexpected request ${path}`);
    const pages = listings[match[1]] || [[]];
    return { workflow_runs: pages[Number(match[2]) - 1] || [] };
  };
  return { request, requests };
}

const RESOLUTION = Object.freeze({
  state: "live",
  resolvedAt: "2026-10-24T12:00:00.000Z",
  site: { workflow: "static-site.yml", runId: "501", runAttempt: 1, commit: SITE_SHA, runUrl: `https://github.com/${REPOSITORY}/actions/runs/501` },
  api: { workflow: "api-deploy.yml", runId: "502", runAttempt: 1, commit: API_SHA, runUrl: `https://github.com/${REPOSITORY}/actions/runs/502` },
});

function verifiedIdentities() {
  return {
    site: receiptIdentity(RESOLUTION.site, { status: "verified", runId: "501", sourceSha: SITE_SHA, summary: { buildId: SITE_BUILD, workerVersion: SITE_WORKER } }, "site"),
    api: receiptIdentity(RESOLUTION.api, { status: "verified", runId: "502", sourceSha: API_SHA, summary: { buildId: null, workerVersion: API_WORKER } }, "api"),
  };
}

function identityFetch({ siteBuild = SITE_BUILD, siteWorker = SITE_WORKER, apiWorker = API_WORKER, apiBodyWorker = apiWorker, fail = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (fail) throw new TypeError("fetch failed");
    if (new URL(url).hostname === "riddlearabia.com") {
      return new Response("<html></html>", { status: 200, headers: { "x-jakh-site-version": siteBuild, "x-jakh-worker-version": siteWorker } });
    }
    return new Response(JSON.stringify({ ok: true, workerVersionId: apiBodyWorker }), {
      status: 200, headers: { "content-type": "application/json", "x-jakh-worker-version": apiWorker },
    });
  };
  return { fetchImpl, calls };
}

test("only a protected-main dispatch of the exact release workflow is release evidence", () => {
  assert.equal(isTrustedReleaseRun(run("static-site.yml"), "static-site.yml"), true);
  assert.equal(isTrustedReleaseRun(run("static-site.yml", { path: ".github/workflows/static-site.yml@refs/heads/main" }), "static-site.yml"), true);
  for (const overrides of [
    { path: ".github/workflows/api-deploy.yml" },
    { path: ".github/workflows/static-site.yml.bak" },
    { head_branch: "feature" },
    { event: "push" },
    { event: "schedule" },
    { head_sha: "invalid" },
    { repository: { full_name: "someone/fork" } },
    { head_repository: { full_name: "someone/fork" } },
    { id: 0 },
  ]) assert.equal(isTrustedReleaseRun(run("static-site.yml", overrides), "static-site.yml"), false, JSON.stringify(overrides));
});

test("the latest successful release is live; only an executing release defers the check", () => {
  const runs = [
    run("static-site.yml", { id: 9, conclusion: "failure", run_started_at: "2026-10-24T12:00:00Z" }),
    run("static-site.yml", { id: 8, conclusion: "cancelled", run_started_at: "2026-10-24T11:30:00Z" }),
    run("static-site.yml", { id: 7, head_sha: MAIN_SHA, head_repository: { full_name: "someone/fork" }, run_started_at: "2026-10-24T11:20:00Z" }),
    run("static-site.yml", { id: 6, head_sha: SITE_SHA, run_started_at: "2026-10-24T11:00:00Z" }),
    run("static-site.yml", { id: 5, head_sha: MAIN_SHA, run_started_at: "2026-10-23T11:00:00Z" }),
  ];
  const selected = selectLiveRelease(runs, "static-site.yml");
  assert.equal(selected.latest.id, 6);
  assert.equal(selected.active, null);
  for (const status of ["queued", "waiting", "pending", "requested"]) {
    assert.equal(selectLiveRelease([run("static-site.yml", { id: 10, status, conclusion: null }), ...runs], "static-site.yml").active, null, status);
  }
  const executing = selectLiveRelease([run("static-site.yml", { id: 10, status: "in_progress", conclusion: null }), ...runs], "static-site.yml");
  assert.equal(executing.active.id, 10);
  assert.equal(executing.latest.id, 6);
  assert.equal(selectLiveRelease([run("static-site.yml", { status: "in_progress", conclusion: null, event: "push" })], "static-site.yml").active, null);
});

test("resolution returns each component's live commit or defers while a release deploys", async () => {
  const live = githubFixture({
    "static-site.yml": [[run("static-site.yml", { id: 501, head_sha: SITE_SHA })]],
    "api-deploy.yml": [[run("api-deploy.yml", { id: 503, conclusion: "failure", head_sha: MAIN_SHA }), run("api-deploy.yml", { id: 502, head_sha: API_SHA })]],
  });
  const resolution = await resolveLiveRelease({ request: live.request, now: () => new Date("2026-10-24T12:00:00Z") });
  assert.deepEqual(resolution, RESOLUTION);
  assert.equal(validateResolution(resolution), resolution);

  for (const workflow of ["static-site.yml", "api-deploy.yml"]) {
    const listing = { "static-site.yml": [[run("static-site.yml", { id: 501 })]], "api-deploy.yml": [[run("api-deploy.yml", { id: 502, head_sha: API_SHA })]] };
    listing[workflow][0].unshift(run(workflow, { id: 600, status: "in_progress", conclusion: null, head_sha: MAIN_SHA }));
    const result = await resolveLiveRelease({ request: githubFixture(listing).request });
    assert.equal(result.state, "deferred", workflow);
    assert.equal(result.activeRunId, "600");
    assert.match(result.reason, /in progress/u);
  }
});

test("resolution fails closed without a successful release and bounds pagination", async () => {
  await assert.rejects(resolveLiveRelease({ request: githubFixture({
    "static-site.yml": [[run("static-site.yml", { conclusion: "failure" })]],
    "api-deploy.yml": [[run("api-deploy.yml")]],
  }).request }), /No successful static site release/u);

  const failures = Array.from({ length: 100 }, (_, index) => run("static-site.yml", { id: 1000 - index, conclusion: "failure" }));
  const paged = githubFixture({
    "static-site.yml": [failures, [run("static-site.yml", { id: 501 })]],
    "api-deploy.yml": [[run("api-deploy.yml", { id: 502, head_sha: API_SHA })]],
  });
  assert.equal((await resolveLiveRelease({ request: paged.request })).site.runId, "501");
  assert.equal(paged.requests.filter((path) => path.includes("static-site.yml")).length, 2);

  const unbounded = githubFixture({
    "static-site.yml": [failures, failures, failures, [run("static-site.yml", { id: 501 })]],
    "api-deploy.yml": [[run("api-deploy.yml", { id: 502, head_sha: API_SHA })]],
  });
  await assert.rejects(resolveLiveRelease({ request: unbounded.request }), /No successful static site release/u);
  assert.equal(unbounded.requests.filter((path) => path.includes("static-site.yml")).length, 3);
  assert.throws(() => validateResolution({ ...RESOLUTION, site: { ...RESOLUTION.site, commit: "main" } }), /malformed/u);
  assert.throws(() => validateResolution({ ...RESOLUTION, state: "deferred" }), /not in the live state/u);
});

test("GitHub lookups stay in this repository, never follow redirects and retry only transient failures", async () => {
  assert.throws(() => createGitHubRequest({ token: "" }), /GH_TOKEN/u);
  const calls = [];
  const statuses = [503, 200];
  const request = createGitHubRequest({ token: "test-token", retryDelayMs: 0, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const status = statuses.shift();
    return new Response(JSON.stringify({ workflow_runs: [] }), { status });
  } });
  assert.deepEqual(await request(`/repos/${REPOSITORY}/actions/workflows/static-site.yml/runs`), { workflow_runs: [] });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.headers.authorization, "Bearer test-token");
  await assert.rejects(request("/repos/someone/fork/actions/runs"), /restricted to this repository/u);

  let notFound = 0;
  const missing = createGitHubRequest({ token: "test-token", retryDelayMs: 0, fetchImpl: async () => { notFound += 1; return new Response("{}", { status: 404 }); } });
  await assert.rejects(missing(`/repos/${REPOSITORY}/actions/runs/1`), /HTTP 404/u);
  assert.equal(notFound, 1);
  const offline = createGitHubRequest({ token: "secret-value", retryDelayMs: 0, fetchImpl: async () => { throw new Error("secret-value leaked"); } });
  await assert.rejects(offline(`/repos/${REPOSITORY}/actions/runs/1`), (error) => !error.message.includes("secret-value"));
});

test("only a verified receipt for the exact run and commit binds a live identity", () => {
  const identities = verifiedIdentities();
  assert.deepEqual(identities.site, { receipt: "verified", workerVersion: SITE_WORKER, buildId: SITE_BUILD, diagnostics: [] });
  assert.deepEqual(identities.api, { receipt: "verified", workerVersion: API_WORKER, buildId: null, diagnostics: [] });
  const base = { status: "verified", runId: "501", sourceSha: SITE_SHA, summary: { buildId: SITE_BUILD, workerVersion: SITE_WORKER } };
  for (const receipt of [
    null,
    { ...base, status: "unknown", diagnostics: ["invalid_runtime_proof", "Not A Code <script>"] },
    { ...base, runId: "999" },
    { ...base, sourceSha: MAIN_SHA },
    { ...base, summary: { buildId: "short", workerVersion: SITE_WORKER } },
    { ...base, summary: { buildId: SITE_BUILD, workerVersion: "bad" } },
  ]) {
    const identity = receiptIdentity(RESOLUTION.site, receipt, "site");
    assert.equal(identity.receipt, "unverified");
    assert.equal(identity.workerVersion, null);
    assert.ok(identity.diagnostics.every((code) => /^[a-z_]+$/u.test(code)));
  }
  assert.deepEqual(receiptIdentity(RESOLUTION.site, { ...base, status: "unknown", diagnostics: ["invalid_runtime_proof", "Not A Code"] }, "site").diagnostics,
    ["invalid_runtime_proof"]);
});

test("production must still serve the verified releases; a drift is a named failure", async () => {
  const matched = identityFetch();
  const ok = await checkLiveIdentity(RESOLUTION, verifiedIdentities(), { fetchImpl: matched.fetchImpl, siteOrigin: "https://riddlearabia.com", apiOrigin: "https://api.riddlearabia.com", timeoutMs: 1_000 });
  assert.deepEqual(ok.failures, []);
  assert.deepEqual(ok.bound, { site: true, api: true });
  assert.equal(matched.calls[0].url, "https://riddlearabia.com/");
  assert.equal(matched.calls[0].options.redirect, "manual");
  assert.equal(matched.calls[1].url, "https://api.riddlearabia.com/api/health");
  assert.equal(matched.calls[1].options.headers.origin, "https://riddlearabia.com");

  for (const [drift, label] of [
    [{ siteWorker: OTHER_WORKER }, "static site"],
    [{ siteBuild: "e".repeat(64) }, "static site"],
    [{ apiWorker: OTHER_WORKER, apiBodyWorker: OTHER_WORKER }, "API"],
    [{ apiBodyWorker: OTHER_WORKER }, "API"],
  ]) {
    const result = await checkLiveIdentity(RESOLUTION, verifiedIdentities(), { fetchImpl: identityFetch(drift).fetchImpl, siteOrigin: "https://riddlearabia.com", apiOrigin: "https://api.riddlearabia.com", timeoutMs: 1_000 });
    assert.equal(result.failures.length, 1, JSON.stringify(drift));
    assert.equal(result.failures[0].name, `Live release: ${label} identity`);
    assert.match(result.failures[0].message, /last verified .* release \(run 50[12], commit [ab]{12}\)/u);
  }

  const unverified = { site: receiptIdentity(RESOLUTION.site, null, "site"), api: receiptIdentity(RESOLUTION.api, null, "api") };
  const skipped = identityFetch({ siteWorker: OTHER_WORKER });
  const none = await checkLiveIdentity(RESOLUTION, unverified, { fetchImpl: skipped.fetchImpl, siteOrigin: "https://riddlearabia.com", apiOrigin: "https://api.riddlearabia.com", timeoutMs: 1_000 });
  assert.deepEqual(none.failures, []);
  assert.deepEqual(none.bound, { site: false, api: false });
  assert.equal(skipped.calls.length, 0);

  const offline = await checkLiveIdentity(RESOLUTION, verifiedIdentities(), { fetchImpl: identityFetch({ fail: true }).fetchImpl, siteOrigin: "https://riddlearabia.com", apiOrigin: "https://api.riddlearabia.com", timeoutMs: 1_000 });
  assert.deepEqual(offline.failures, [], "availability is reported by the contract checks, not as an identity drift");
  assert.deepEqual(offline.bound, { site: false, api: false });
});

test("contract processes never receive credentials or startup overrides", () => {
  const env = contractEnv({ PATH: "/bin", GH_TOKEN: "x", GITHUB_TOKEN: "y", ACTIONS_RUNTIME_TOKEN: "z", NODE_OPTIONS: "--require evil", AWS_SECRET_ACCESS_KEY: "s", JAKH_SITE_ORIGIN: "https://riddlearabia.com" }, { JAKH_MONITOR_SCOPE: "site" });
  assert.deepEqual(env, { PATH: "/bin", JAKH_SITE_ORIGIN: "https://riddlearabia.com", JAKH_MONITOR_SCOPE: "site" });
});

const FAKE_INSPECTOR = `
import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const runId = args[args.indexOf("--run-id") + 1];
const output = args[args.indexOf("--output") + 1];
const fixture = JSON.parse(process.env.FAKE_FIXTURE || "null");
const receipt = JSON.parse(%RECEIPT%);
writeFileSync(output, JSON.stringify({ ...receipt, runId, tokenSeen: Boolean(process.env.GH_TOKEN), fixtureSeen: fixture !== null }));
`;

const FAKE_MONITOR = `
import { writeFileSync } from "node:fs";
const scope = process.env.JAKH_MONITOR_SCOPE;
const failures = JSON.parse(%FAILURES%);
const leaked = Object.keys(process.env).filter((key) => /TOKEN|SECRET/u.test(key));
writeFileSync(process.env.JAKH_MONITOR_RESULT_PATH, JSON.stringify({
  schemaVersion: 1, status: failures.length ? "failure" : "success",
  monitor: { scope, navigationLayout: "current", expectedWorkerVersion: process.env.JAKH_MONITOR_EXPECTED_WORKER_VERSION || null },
  contentPublicationContract: { contract: %CONTRACT% }, apiReleaseContract: { contract: %CONTRACT% },
  results: [{ name: (scope === "api" ? "API: " : "Site: ") + "contract " + %CONTRACT% + " bound " + (process.env.JAKH_MONITOR_EXPECTED_WORKER_VERSION || "none") + " leaked " + leaked.length, status: 200 }],
  failures,
}));
process.exitCode = failures.length ? 1 : 0;
`;

async function fakeCheckout(root, name, { contract, receipt, failures = [], monitor = true }) {
  const directory = join(root, name);
  await mkdir(join(directory, "scripts"), { recursive: true });
  await writeFile(join(directory, "scripts/deployment-receipt-monitor.mjs"), FAKE_INSPECTOR.replace("%RECEIPT%", JSON.stringify(JSON.stringify(receipt))));
  if (monitor) {
    await writeFile(join(directory, "scripts/monitor-production.mjs"), FAKE_MONITOR
      .replace("%FAILURES%", JSON.stringify(JSON.stringify(failures)))
      .replaceAll("%CONTRACT%", JSON.stringify(contract)));
  }
  return directory;
}

async function withCheckouts(options, callback) {
  const root = await mkdtemp(join(tmpdir(), "jakh-live-release-test-"));
  try {
    const site = await fakeCheckout(root, "site", { contract: `site@${SITE_SHA.slice(0, 7)}`, receipt: { status: "verified", sourceSha: SITE_SHA, summary: { buildId: SITE_BUILD, workerVersion: SITE_WORKER } }, ...options.site });
    const api = await fakeCheckout(root, "api", { contract: `api@${API_SHA.slice(0, 7)}`, receipt: { status: "verified", sourceSha: API_SHA, summary: { buildId: null, workerVersion: API_WORKER } }, ...options.api });
    return await callback({ site, api });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const CHECK_ENV = { PATH: process.env.PATH, HOME: process.env.HOME, GH_TOKEN: "test-gh-token", GITHUB_TOKEN: "test-github-token", JAKH_SITE_ORIGIN: "https://riddlearabia.com", JAKH_API_ORIGIN: "https://api.riddlearabia.com", JAKH_MONITOR_TIMEOUT_MS: "1000" };

test("each component is checked with its own live commit's contract, bound to its verified Worker", async () => {
  await withCheckouts({}, async ({ site, api }) => {
    const logger = quietLogger();
    const report = await runLiveCheck({ resolution: RESOLUTION, siteCheckout: site, apiCheckout: api, env: CHECK_ENV,
      fetchImpl: identityFetch().fetchImpl, logger, generatedAt: new Date("2026-10-24T12:00:00Z") });
    assert.equal(report.status, "success");
    assert.equal(report.monitor.scope, "all");
    assert.equal(report.monitor.basis, "live-release");
    assert.deepEqual(report.results.map(({ name }) => name), [
      `Site: contract site@${SITE_SHA.slice(0, 7)} bound ${SITE_WORKER} leaked 0`,
      `API: contract api@${API_SHA.slice(0, 7)} bound ${API_WORKER} leaked 0`,
    ]);
    assert.deepEqual(report.contentPublicationContract, { contract: `site@${SITE_SHA.slice(0, 7)}` });
    assert.deepEqual(report.apiReleaseContract, { contract: `api@${API_SHA.slice(0, 7)}` });
    assert.equal(report.liveRelease.site.commit, SITE_SHA);
    assert.equal(report.liveRelease.site.buildId, SITE_BUILD);
    assert.equal(report.liveRelease.site.identityBound, true);
    assert.equal(report.liveRelease.api.commit, API_SHA);
    assert.equal(report.liveRelease.api.workerVersion, API_WORKER);
    assert.equal(report.failedChecks, 0);
  });
});

test("a live identity drift fails and the contracts still report without a stale binding", async () => {
  await withCheckouts({}, async ({ site, api }) => {
    const logger = quietLogger();
    const report = await runLiveCheck({ resolution: RESOLUTION, siteCheckout: site, apiCheckout: api,
      env: { ...CHECK_ENV, JAKH_MONITOR_ANNOTATE: "1" }, fetchImpl: identityFetch({ siteWorker: OTHER_WORKER }).fetchImpl, logger });
    assert.equal(report.status, "failure");
    assert.equal(report.failures[0].name, "Live release: static site identity");
    assert.equal(report.liveRelease.site.identityBound, false);
    assert.equal(report.liveRelease.api.identityBound, true);
    assert.match(report.results[0].name, /bound none/u);
    assert.ok(logger.lines.some((line) => line.startsWith("::error title=Monitor - Live release%3A static site identity::")));
  });
});

test("contract failures and missing reports from a live checkout fail the merged report", async () => {
  const failure = { name: "Site: Home", message: "missing page marker", attempts: 2 };
  await withCheckouts({ site: { failures: [failure] }, api: { monitor: false } }, async ({ site, api }) => {
    const report = await runLiveCheck({ resolution: RESOLUTION, siteCheckout: site, apiCheckout: api, env: CHECK_ENV,
      fetchImpl: identityFetch().fetchImpl, logger: quietLogger() });
    assert.equal(report.status, "failure");
    assert.deepEqual(report.failures.map(({ name }) => name), ["Site: Home", "Live release: API monitor contract"]);
    assert.equal(report.totalChecks, 3);
    assert.equal(report.passedChecks, 1);
  });
});

test("an unverifiable receipt is a warning; the live commit's contract still runs unbound", async () => {
  await withCheckouts({ site: { receipt: { status: "unknown", diagnostics: ["missing_or_ambiguous_artifact"] } } }, async ({ site, api }) => {
    const logger = quietLogger();
    const fetchCalls = identityFetch({ siteWorker: OTHER_WORKER });
    const report = await runLiveCheck({ resolution: RESOLUTION, siteCheckout: site, apiCheckout: api, env: CHECK_ENV, fetchImpl: fetchCalls.fetchImpl, logger });
    assert.equal(report.status, "success");
    assert.equal(report.liveRelease.site.receipt, "unverified");
    assert.deepEqual(report.liveRelease.site.diagnostics, ["missing_or_ambiguous_artifact"]);
    assert.match(report.results[0].name, /bound none/u);
    assert.ok(logger.lines.some((line) => line.startsWith("::warning title=Live release receipt unverified::")));
    assert.ok(fetchCalls.calls.every(({ url }) => !url.startsWith("https://riddlearabia.com")));
  });
});

test("only the release inspector receives the GitHub token", async () => {
  const seen = [];
  const runNodeImpl = async (script, args, options) => {
    seen.push({ script, env: options.env });
    const output = args[args.indexOf("--output") + 1];
    if (script.endsWith("deployment-receipt-monitor.mjs")) {
      const component = script.includes("/site/") ? RESOLUTION.site : RESOLUTION.api;
      await writeFile(output, JSON.stringify({ status: "verified", runId: component.runId, sourceSha: component.commit,
        summary: { buildId: component === RESOLUTION.site ? SITE_BUILD : null, workerVersion: component === RESOLUTION.site ? SITE_WORKER : API_WORKER } }));
    } else {
      await writeFile(options.env.JAKH_MONITOR_RESULT_PATH, JSON.stringify({ schemaVersion: 1, monitor: { scope: options.env.JAKH_MONITOR_SCOPE }, results: [], failures: [] }));
    }
    return 0;
  };
  await runLiveCheck({ resolution: RESOLUTION, siteCheckout: "/checkouts/site", apiCheckout: "/checkouts/api", env: CHECK_ENV,
    fetchImpl: identityFetch().fetchImpl, runNodeImpl, logger: quietLogger() });
  const inspectors = seen.filter(({ script }) => script.endsWith("deployment-receipt-monitor.mjs"));
  const monitors = seen.filter(({ script }) => script.endsWith("monitor-production.mjs"));
  assert.deepEqual(inspectors.map(({ script }) => script), ["/checkouts/site/scripts/deployment-receipt-monitor.mjs", "/checkouts/api/scripts/deployment-receipt-monitor.mjs"]);
  assert.ok(inspectors.every(({ env }) => env.GH_TOKEN === "test-gh-token" && Object.keys(env).sort().join() === "GH_TOKEN,HOME,PATH"));
  assert.deepEqual(monitors.map(({ env }) => env.JAKH_MONITOR_SCOPE), ["site", "api"]);
  assert.ok(monitors.every(({ env }) => !Object.keys(env).some((key) => /TOKEN/u.test(key))));
  assert.deepEqual(monitors.map(({ env }) => env.JAKH_MONITOR_ALLOW_COMPATIBLE_SCHEMA), ["false", "false"]);
});

test("a merged live failure opens the same full-scope production alert", async () => {
  const identities = verifiedIdentities();
  const report = mergeLiveReports({
    resolution: RESOLUTION, identities,
    identity: { failures: [{ name: "Live release: static site identity", message: "drift", attempts: 1 }], bound: { site: false, api: true } },
    contracts: { site: { report: { results: [{ name: "Site: Home" }], failures: [] } }, api: { report: { results: [], failures: [] } } },
    config: { siteOrigin: "https://riddlearabia.com", apiOrigin: "https://api.riddlearabia.com" },
  });
  const requests = [];
  const result = await routeProductionAlert({
    state: "failure", report,
    env: { GITHUB_TOKEN: "token", GITHUB_REPOSITORY: REPOSITORY, GITHUB_RUN_ID: "1", GITHUB_RUN_ATTEMPT: "1", JAKH_MONITOR_SCOPE: "all", JAKH_ALERT_EVENT: "schedule" },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if ((options.method || "GET") === "GET") return new Response("[]", { status: 200 });
      return new Response(JSON.stringify({ number: 7, html_url: "https://github.test/issues/7" }), { status: 201 });
    },
  });
  assert.equal(result.action, "created");
  assert.equal(result.scope, "all");
  const body = JSON.parse(requests.at(-1).options.body).body;
  assert.match(body, /Live release: static site identity/u);
});

async function withGitHubServer(handler, callback) {
  const server = http.createServer(handler);
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    return await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((done) => server.close(done));
  }
}

test("the resolve command writes the workflow outputs, defers cleanly and reports lookup failures", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "jakh-live-release-cli-"));
  const listings = {
    "static-site.yml": [run("static-site.yml", { id: 501, head_sha: SITE_SHA })],
    "api-deploy.yml": [run("api-deploy.yml", { id: 502, head_sha: API_SHA })],
  };
  try {
    await withGitHubServer((request, response) => {
      const workflow = /\/workflows\/([a-z-]+\.yml)\/runs/u.exec(request.url)?.[1];
      assert.equal(request.headers.authorization, "Bearer cli-token");
      if (!workflow) { response.writeHead(404).end("{}"); return; }
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ workflow_runs: listings[workflow] }));
    }, async (apiUrl) => {
      const script = resolve("scripts/monitor-live-release.mjs");
      const env = { PATH: process.env.PATH, GH_TOKEN: "cli-token", GITHUB_API_URL: apiUrl, JAKH_LIVE_RELEASE_RETRY_DELAY_MS: "0" };
      const outputs = join(temporary, "outputs");
      await executeFile(process.execPath, [script, "resolve", "--output", join(temporary, "live.json")], { env: { ...env, GITHUB_OUTPUT: outputs } });
      assert.equal(await readFile(outputs, "utf8"), `state=live\nsite-sha=${SITE_SHA}\napi-sha=${API_SHA}\n`);
      assert.equal(JSON.parse(await readFile(join(temporary, "live.json"), "utf8")).site.runId, "501");

      listings["api-deploy.yml"] = [run("api-deploy.yml", { id: 503, status: "in_progress", conclusion: null }), ...listings["api-deploy.yml"]];
      const deferredOutputs = join(temporary, "deferred-outputs");
      const deferred = await executeFile(process.execPath, [script, "resolve", "--output", join(temporary, "deferred.json")], { env: { ...env, GITHUB_OUTPUT: deferredOutputs } });
      assert.equal(await readFile(deferredOutputs, "utf8"), "state=deferred\n");
      assert.match(deferred.stdout, /::notice title=Production check deferred::API release run 503 is in progress/u);

      listings["api-deploy.yml"] = [run("api-deploy.yml", { conclusion: "failure" })];
      const resultPath = join(temporary, "result.json");
      await assert.rejects(executeFile(process.execPath, [script, "resolve", "--output", join(temporary, "failed.json")], {
        env: { ...env, GITHUB_OUTPUT: join(temporary, "failed-outputs"), JAKH_MONITOR_RESULT_PATH: resultPath },
      }), (error) => error.code === 1 && /::error title=Monitor - Live release resolution::/u.test(error.stdout));
      const unresolved = JSON.parse(await readFile(resultPath, "utf8"));
      assert.equal(unresolved.monitor.scope, "all");
      assert.equal(unresolved.status, "failure");
      assert.match(unresolved.failures[0].message, /No successful API release/u);
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

function workflowStep(workflow, name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  assert.ok(start >= 0, `${name} step exists`);
  const next = workflow.indexOf("\n      - ", start + 1);
  return next < 0 ? workflow.slice(start) : workflow.slice(start, next);
}

test("the monitor workflow checks scheduled runs against the live releases and releases against their own commit", async () => {
  const workflow = await readFile(new URL("../.github/workflows/production-monitor.yml", import.meta.url), "utf8");
  const cron = /cron: "([^"]+)"/u.exec(workflow)?.[1];
  const minutes = cron.split(" ")[0].split(",").map(Number);
  assert.equal(minutes.length, 2, "twice hourly");
  assert.ok(minutes.every((minute) => Number.isInteger(minute) && minute % 15 !== 0), "avoid the congested quarter hours");
  assert.match(workflow, /permissions:\n  contents: read\n  issues: write\n(?:  #[^\n]*\n)*  actions: read\n/u);
  assert.doesNotMatch(workflow, /contents: write|actions: write|id-token|secrets\./u);
  for (const match of workflow.matchAll(/uses:\s+([^\s#]+)/gu)) assert.match(match[1], /@[a-f0-9]{40}$/u);

  const release = workflowStep(workflow, "Check production");
  assert.match(release, /if: \$\{\{ github\.event_name == 'workflow_run' \}\}/u);
  assert.match(release, /run: node scripts\/monitor-production\.mjs/u);
  assert.doesNotMatch(release, /GH_TOKEN|GITHUB_TOKEN/u);

  assert.match(workflowStep(workflow, "Test live release resolution"), /if: \$\{\{ github\.event_name != 'workflow_run' \}\}\n\s+run: node --test scripts\/monitor-live-release\.test\.mjs/u);
  const resolveStep = workflowStep(workflow, "Find the live releases");
  assert.match(resolveStep, /id: live\n\s+if: \$\{\{ github\.event_name != 'workflow_run' \}\}/u);
  assert.match(resolveStep, /run: node scripts\/monitor-live-release\.mjs resolve --output "\$RUNNER_TEMP\/live-release\.json"/u);
  for (const [name, path, sha] of [["Load the live static site monitor contract", ".live-site", "site-sha"], ["Load the live API monitor contract", ".live-api", "api-sha"]]) {
    const step = workflowStep(workflow, name);
    assert.match(step, /if: \$\{\{ steps\.live\.outputs\.state == 'live'/u);
    assert.match(step, /persist-credentials: false/u);
    assert.ok(step.includes(`ref: \${{ steps.live.outputs.${sha} }}`), name);
    assert.ok(step.includes(`path: ${path}`), name);
  }
  const check = workflowStep(workflow, "Check production against the live releases");
  assert.match(check, /id: live_production\n\s+if: \$\{\{ steps\.live\.outputs\.state == 'live' \}\}/u);
  assert.match(check, /node scripts\/monitor-live-release\.mjs check/u);
  assert.match(check, /JAKH_MONITOR_RESULT_PATH: monitor-production-result\.json/u);
  assert.match(check, /JAKH_MONITOR_ANNOTATE: "1"/u);

  const route = workflowStep(workflow, "Route production failure or recovery");
  for (const condition of ["steps.production.outcome == 'success'", "steps.production.outcome == 'failure'",
    "steps.live_production.outcome == 'success'", "steps.live_production.outcome == 'failure'", "steps.live.outcome == 'failure'"]) {
    assert.ok(route.includes(condition), condition);
  }
  assert.match(route, /JAKH_ALERT_STATE: \$\{\{ \(steps\.production\.outcome == 'success' \|\| steps\.live_production\.outcome == 'success'\) && 'recovery' \|\| 'failure' \}\}/u);
  assert.ok(workflow.indexOf("id: live\n") > workflow.indexOf("id: context\n"));
  assert.ok(workflow.indexOf("id: live_production") < workflow.indexOf("Route production failure or recovery"));
});
