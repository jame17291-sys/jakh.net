#!/usr/bin/env node
// Scheduled and manual production checks compare riddlearabia.com and its API
// with the commits that are actually live, not with an unreleased main.
//
// The live commits are the latest successful protected-main release runs. Each
// release's own receipt inspector (from that release commit) proves its exact
// Worker version and static build; the live response headers must still carry
// that identity. Each component is then checked with the monitor contract of
// its own live commit. A release run's own completion triggers a separate
// monitor run bound to that release, so a real mismatch after a release still
// fails there, and a later live drift fails here.
import { spawn } from "node:child_process";
import { appendFile, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY = "jame17291-sys/jakh.net";
export const LIVE_COMPONENTS = Object.freeze([
  Object.freeze({ name: "site", label: "static site", workflow: "static-site.yml", scope: "site" }),
  Object.freeze({ name: "api", label: "API", workflow: "api-deploy.yml", scope: "api" }),
]);
const SHA = /^[a-f0-9]{40}$/u;
const BUILD_ID = /^[a-f0-9]{64}$/u;
const WORKER_VERSION = /^[0-9A-Za-z][0-9A-Za-z._-]{5,127}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const DIAGNOSTIC = /^[a-z][a-z0-9_]{0,63}$/u;
const MAX_RUN_PAGES = 3;
const RUNS_PER_PAGE = 100;

function releaseWorkflowPath(workflow) {
  return `.github/workflows/${workflow}`;
}

// Only a protected-main dispatch of the exact release workflow in this
// repository can deploy production; anything else is not evidence of what is live.
export function isTrustedReleaseRun(run, workflow) {
  return Boolean(run) && Number.isSafeInteger(run.id) && run.id > 0
    && typeof run.path === "string" && run.path.split("@", 1)[0] === releaseWorkflowPath(workflow)
    && run.head_branch === "main" && run.event === "workflow_dispatch"
    && typeof run.head_sha === "string" && SHA.test(run.head_sha)
    && run.repository?.full_name === REPOSITORY && run.head_repository?.full_name === REPOSITORY;
}

function startedAt(run) {
  const value = Date.parse(run.run_started_at || run.created_at || "");
  return Number.isFinite(value) ? value : -Infinity;
}

// Releases share one non-cancelling concurrency group, so they run one at a
// time and the latest successful run is the one serving production. A run that
// is executing may be deploying right now; a queued or approval-waiting run has
// not reached its deployment job, so the previous release is still live.
export function selectLiveRelease(runs, workflow) {
  const trusted = (Array.isArray(runs) ? runs : []).filter((run) => isTrustedReleaseRun(run, workflow));
  const active = trusted.find((run) => run.status === "in_progress") || null;
  const successful = trusted.filter((run) => run.status === "completed" && run.conclusion === "success");
  successful.sort((left, right) => startedAt(right) - startedAt(left) || right.id - left.id);
  return { active, latest: successful[0] || null };
}

export function createGitHubRequest({ token, fetchImpl = globalThis.fetch, apiUrl = "https://api.github.com", attempts = 3, retryDelayMs = 2_000 } = {}) {
  if (typeof token !== "string" || !token.trim()) throw new Error("GH_TOKEN or GITHUB_TOKEN is required to find the live releases");
  const base = apiUrl.replace(/\/+$/u, "");
  return async function request(path) {
    if (!path.startsWith(`/repos/${REPOSITORY}/`)) throw new Error("Live release lookup is restricted to this repository");
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetchImpl(`${base}${path}`, {
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${token}`,
            "user-agent": "jakh-production-monitor-live-release/1.0",
            "x-github-api-version": "2022-11-28",
          },
          redirect: "error",
          signal: AbortSignal.timeout(20_000),
        });
        if (response.ok) return await response.json();
        lastError = new Error(`GitHub API GET ${path.split("?", 1)[0]} failed with HTTP ${response.status}`);
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        lastError = new Error(`GitHub API GET ${path.split("?", 1)[0]} failed: ${error?.name || "error"}`);
      }
      if (attempt < attempts && retryDelayMs > 0) await new Promise((done) => setTimeout(done, retryDelayMs));
    }
    throw lastError;
  };
}

async function listReleaseRuns(request, workflow) {
  const runs = [];
  for (let page = 1; page <= MAX_RUN_PAGES; page += 1) {
    const listing = await request(`/repos/${REPOSITORY}/actions/workflows/${workflow}/runs?branch=main&event=workflow_dispatch&per_page=${RUNS_PER_PAGE}&page=${page}`);
    if (!listing || !Array.isArray(listing.workflow_runs)) throw new Error(`GitHub returned an invalid ${workflow} run listing`);
    runs.push(...listing.workflow_runs);
    if (listing.workflow_runs.length < RUNS_PER_PAGE || selectLiveRelease(runs, workflow).latest) break;
  }
  return runs;
}

export async function resolveLiveRelease({ request, now = () => new Date() }) {
  const listings = [];
  for (const component of LIVE_COMPONENTS) {
    listings.push({ component, ...selectLiveRelease(await listReleaseRuns(request, component.workflow), component.workflow) });
  }
  const active = listings.find(({ active }) => active);
  if (active) {
    return {
      state: "deferred",
      reason: `${active.component.label} release run ${active.active.id} is in progress; its completion triggers a bound monitor run`,
      activeRunId: String(active.active.id),
    };
  }
  const resolution = { state: "live", resolvedAt: now().toISOString() };
  for (const { component, latest } of listings) {
    if (!latest) throw new Error(`No successful ${component.label} release on protected main was found`);
    resolution[component.name] = {
      workflow: component.workflow,
      runId: String(latest.id),
      runAttempt: Number.isSafeInteger(latest.run_attempt) ? latest.run_attempt : 1,
      commit: latest.head_sha,
      runUrl: `https://github.com/${REPOSITORY}/actions/runs/${latest.id}`,
    };
  }
  return resolution;
}

export function validateResolution(resolution) {
  if (resolution?.state !== "live") throw new Error("Live release resolution is not in the live state");
  for (const { name, workflow } of LIVE_COMPONENTS) {
    const component = resolution[name];
    if (!component || component.workflow !== workflow || !RUN_ID.test(component.runId || "") || !SHA.test(component.commit || "")) {
      throw new Error(`Live release resolution for ${name} is malformed`);
    }
  }
  return resolution;
}

// Receipt reports are produced by each release commit's own inspector. Only a
// verified receipt for exactly this run and commit binds a live identity.
export function receiptIdentity(component, receipt, name) {
  const summary = receipt?.summary;
  const verified = receipt?.status === "verified"
    && String(receipt.runId) === component.runId
    && receipt.sourceSha === component.commit
    && WORKER_VERSION.test(summary?.workerVersion || "")
    && (name !== "site" || BUILD_ID.test(summary?.buildId || ""));
  if (verified) {
    return {
      receipt: "verified",
      workerVersion: summary.workerVersion,
      buildId: name === "site" ? summary.buildId : null,
      diagnostics: [],
    };
  }
  const diagnostics = (Array.isArray(receipt?.diagnostics) ? receipt.diagnostics : [])
    .filter((code) => typeof code === "string" && DIAGNOSTIC.test(code)).slice(0, 10);
  return { receipt: "unverified", workerVersion: null, buildId: null, diagnostics: diagnostics.length ? diagnostics : ["receipt_inspection_failed"] };
}

async function readLiveIdentity(name, { fetchImpl, siteOrigin, apiOrigin, timeoutMs }) {
  const url = name === "site" ? new URL("/", siteOrigin) : new URL("/api/health", apiOrigin);
  const headers = { "user-agent": "jakh-production-monitor/1.0", ...(name === "api" ? { origin: siteOrigin } : {}) };
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      if (name === "site") {
        await response.body?.cancel();
        return { buildId: response.headers.get("x-jakh-site-version"), workerVersion: response.headers.get("x-jakh-worker-version") };
      }
      const header = response.headers.get("x-jakh-worker-version");
      let body = null;
      try { body = JSON.parse(await response.text()); } catch { body = null; }
      return { workerVersion: header, bodyWorkerVersion: body?.workerVersionId ?? null };
    } catch (error) {
      lastError = error;
    }
  }
  return { error: lastError?.name || "request failed" };
}

function short(value) {
  return typeof value === "string" && value ? value.slice(0, 12) : "missing";
}

// A verified release must still be what production serves. An unreachable
// origin is left to the contract checks, which report availability precisely.
export async function checkLiveIdentity(resolution, identities, options) {
  const failures = [];
  const observed = {};
  const bound = {};
  for (const { name, label } of LIVE_COMPONENTS) {
    const expected = identities[name];
    bound[name] = false;
    if (expected.receipt !== "verified") continue;
    const live = await readLiveIdentity(name, options);
    observed[name] = live;
    if (live.error) continue;
    const release = resolution[name];
    const matches = live.workerVersion === expected.workerVersion
      && (name !== "site" || live.buildId === expected.buildId)
      && (name !== "api" || live.bodyWorkerVersion === expected.workerVersion);
    if (matches) {
      bound[name] = true;
      continue;
    }
    const servedBuild = name === "site" ? ` build ${short(live.buildId)}` : "";
    const releasedBuild = name === "site" ? ` build ${short(expected.buildId)}` : "";
    failures.push({
      name: `Live release: ${label} identity`,
      message: `production serves Worker ${short(live.workerVersion)}${servedBuild}, but the last verified ${label} release `
        + `(run ${release.runId}, commit ${release.commit.slice(0, 12)}) deployed Worker ${short(expected.workerVersion)}${releasedBuild}`,
      attempts: 1,
    });
  }
  return { failures, observed, bound };
}

const SENSITIVE_ENV = /TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL|^NODE_OPTIONS$|^NODE_PATH$|^BASH_ENV$|^ENV$/iu;

export function contractEnv(env, overrides = {}) {
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) => !SENSITIVE_ENV.test(key)));
  return { ...clean, ...overrides };
}

export function runNode(script, args, { cwd, env }) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env, shell: false, stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", () => resolveRun(1));
    child.once("close", (code) => resolveRun(code ?? 1));
  });
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

// The release commit's own inspector downloads and verifies its receipt. It is
// protected-main code, and it is the only token-bearing child process.
async function inspectReceipt(component, checkout, { env, runNodeImpl, workDir }) {
  const output = join(workDir, `${component.workflow}-receipt.json`);
  await runNodeImpl(join(checkout, "scripts/deployment-receipt-monitor.mjs"), ["--run-id", component.runId, "--output", output], {
    cwd: checkout,
    env: { PATH: env.PATH || "", HOME: env.HOME || tmpdir(), GH_TOKEN: env.GH_TOKEN || env.GITHUB_TOKEN || "" },
  });
  return readJson(output);
}

function validContractReport(report, scope) {
  return report && typeof report === "object" && report.schemaVersion === 1 && report.monitor?.scope === scope
    && Array.isArray(report.results) && Array.isArray(report.failures);
}

async function runContract(component, checkout, { env, expectedWorkerVersion, runNodeImpl, workDir }) {
  const output = join(workDir, `${component.scope}-monitor.json`);
  const status = await runNodeImpl(join(checkout, "scripts/monitor-production.mjs"), [], {
    cwd: checkout,
    env: contractEnv(env, {
      JAKH_MONITOR_SCOPE: component.scope,
      JAKH_MONITOR_ALLOW_COMPATIBLE_SCHEMA: "false",
      JAKH_MONITOR_EXPECTED_WORKER_VERSION: expectedWorkerVersion || "",
      JAKH_MONITOR_RESULT_PATH: output,
    }),
  });
  const report = await readJson(output);
  if (!validContractReport(report, component.scope)) {
    return { report: null, failure: { name: `Live release: ${component.label} monitor contract`, message: `the live ${component.label} monitor exited ${status} without a valid ${component.scope} report`, attempts: 1 } };
  }
  if (status !== 0 && report.failures.length === 0) {
    return { report, failure: { name: `Live release: ${component.label} monitor contract`, message: `the live ${component.label} monitor exited ${status}`, attempts: 1 } };
  }
  return { report, failure: null };
}

export function mergeLiveReports({ resolution, identities, identity, contracts, extraFailures = [], config, generatedAt = new Date() }) {
  const site = contracts.site?.report;
  const api = contracts.api?.report;
  const results = [...(site?.results || []), ...(api?.results || [])];
  const failures = [
    ...identity.failures,
    ...extraFailures,
    ...(contracts.site?.failure ? [contracts.site.failure] : []),
    ...(site?.failures || []),
    ...(contracts.api?.failure ? [contracts.api.failure] : []),
    ...(api?.failures || []),
  ];
  const liveRelease = Object.fromEntries(LIVE_COMPONENTS.map(({ name }) => [name, {
    ...resolution[name],
    receipt: identities[name].receipt,
    diagnostics: identities[name].diagnostics,
    workerVersion: identities[name].workerVersion,
    ...(name === "site" ? { buildId: identities[name].buildId } : {}),
    identityBound: identity.bound[name] === true,
  }]));
  return {
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    status: failures.length ? "failure" : "success",
    monitor: {
      scope: "all",
      siteContract: "current",
      navigationLayout: site?.monitor?.navigationLayout || "current",
      siteOrigin: config.siteOrigin,
      apiOrigin: config.apiOrigin,
      legacySiteOrigins: [],
      allowCompatibleSchema: false,
      expectedWorkerVersion: null,
      basis: "live-release",
    },
    liveRelease,
    totalChecks: results.length + failures.length,
    passedChecks: results.length,
    failedChecks: failures.length,
    contentPublicationContract: site?.contentPublicationContract ?? null,
    apiReleaseContract: api?.apiReleaseContract ?? null,
    results,
    failures,
  };
}

function annotationText(value) {
  return String(value).replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function originFrom(value, fallback) {
  const parsed = new URL(value || fallback);
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("Live release origins must not include a path");
  return parsed.origin;
}

export async function runLiveCheck({
  resolution, siteCheckout, apiCheckout, env = process.env, fetchImpl = globalThis.fetch,
  runNodeImpl = runNode, logger = console, generatedAt,
}) {
  validateResolution(resolution);
  const config = {
    siteOrigin: originFrom(env.JAKH_SITE_ORIGIN, "https://riddlearabia.com"),
    apiOrigin: originFrom(env.JAKH_API_ORIGIN, "https://api.riddlearabia.com"),
  };
  const timeoutMs = Number.parseInt(env.JAKH_MONITOR_TIMEOUT_MS || "10000", 10) || 10_000;
  const checkouts = { site: resolve(siteCheckout), api: resolve(apiCheckout) };
  // The receipt inspector refuses an output path below a symbolic link.
  const workDir = await realpath(await mkdtemp(join(await realpath(tmpdir()), "jakh-live-release-")));
  try {
    const identities = {};
    for (const component of LIVE_COMPONENTS) {
      const receipt = await inspectReceipt(resolution[component.name], checkouts[component.name], { env, runNodeImpl, workDir });
      identities[component.name] = receiptIdentity(resolution[component.name], receipt, component.name);
      if (identities[component.name].receipt !== "verified") {
        const message = `The ${component.label} release receipt for run ${resolution[component.name].runId} could not be verified `
          + `(${identities[component.name].diagnostics.join(", ")}); checking its commit's contract without an exact identity binding.`;
        logger.log(`::warning title=Live release receipt unverified::${annotationText(message)}`);
      }
    }
    const identity = await checkLiveIdentity(resolution, identities, { fetchImpl, ...config, timeoutMs });
    const contracts = {};
    for (const component of LIVE_COMPONENTS) {
      contracts[component.name] = await runContract(component, checkouts[component.name], {
        env,
        expectedWorkerVersion: identity.bound[component.name] ? identities[component.name].workerVersion : null,
        runNodeImpl,
        workDir,
      });
    }
    const report = mergeLiveReports({ resolution, identities, identity, contracts, config, generatedAt });
    for (const failure of [...identity.failures, ...LIVE_COMPONENTS.map(({ name }) => contracts[name].failure).filter(Boolean)]) {
      logger.error(`FAIL  ${failure.name}: ${failure.message}`);
      if (env.JAKH_MONITOR_ANNOTATE === "1") {
        logger.log(`::error title=Monitor - ${annotationText(failure.name).replaceAll(":", "%3A").replaceAll(",", "%2C")}::${annotationText(failure.message)}`);
      }
    }
    for (const { name, label } of LIVE_COMPONENTS) {
      const release = report.liveRelease[name];
      logger.log(`Live ${label}: run ${release.runId}, commit ${release.commit}, receipt ${release.receipt}, identity ${release.identityBound ? "bound" : "not bound"}.`);
    }
    logger.log(`Live production monitor ${report.status === "success" ? "passed" : "failed"}: ${report.passedChecks} passed, ${report.failedChecks} failed.`);
    return report;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function argument(argv, name) {
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (typeof value !== "string" || !value || value.startsWith("--")) throw new Error(`--${name} is required`);
  return value;
}

async function writeUnresolvedReport(path, message, generatedAt = new Date()) {
  if (!path) return;
  await writeFile(path, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    status: "failure",
    monitor: { scope: "all", basis: "live-release" },
    totalChecks: 1,
    passedChecks: 0,
    failedChecks: 1,
    results: [],
    failures: [{ name: "Live release: resolution", message, attempts: 1 }],
  }, null, 2)}\n`, "utf8");
}

async function main(argv, env) {
  const [mode] = argv;
  if (mode === "resolve") {
    const output = resolve(argument(argv, "output"));
    try {
      const resolution = await resolveLiveRelease({ request: createGitHubRequest({
        token: env.GH_TOKEN || env.GITHUB_TOKEN,
        apiUrl: env.GITHUB_API_URL || "https://api.github.com",
        retryDelayMs: env.JAKH_LIVE_RELEASE_RETRY_DELAY_MS === undefined ? 2_000 : Number(env.JAKH_LIVE_RELEASE_RETRY_DELAY_MS),
      }) });
      await writeFile(output, `${JSON.stringify(resolution, null, 2)}\n`, "utf8");
      const outputs = resolution.state === "live"
        ? `state=live\nsite-sha=${resolution.site.commit}\napi-sha=${resolution.api.commit}\n`
        : "state=deferred\n";
      if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, outputs, "utf8");
      if (resolution.state === "deferred") {
        console.log(`::notice title=Production check deferred::${annotationText(resolution.reason)}`);
        if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `Production check deferred: ${resolution.reason}.\n`, "utf8");
      } else {
        console.log(`Live static site: run ${resolution.site.runId}, commit ${resolution.site.commit}.`);
        console.log(`Live API: run ${resolution.api.runId}, commit ${resolution.api.commit}.`);
      }
      return 0;
    } catch (error) {
      const message = `Could not determine the live releases: ${error instanceof Error ? error.message : String(error)}`;
      console.log(`::error title=Monitor - Live release resolution::${annotationText(message)}`);
      await writeUnresolvedReport(env.JAKH_MONITOR_RESULT_PATH, message);
      return 1;
    }
  }
  if (mode === "check") {
    const resolution = JSON.parse(await readFile(resolve(argument(argv, "resolution")), "utf8"));
    const report = await runLiveCheck({
      resolution,
      siteCheckout: argument(argv, "site-checkout"),
      apiCheckout: argument(argv, "api-checkout"),
      env,
    });
    if (env.JAKH_MONITOR_RESULT_PATH) await writeFile(env.JAKH_MONITOR_RESULT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return report.status === "success" ? 0 : 1;
  }
  throw new Error("Usage: monitor-live-release.mjs resolve --output <file> | check --resolution <file> --site-checkout <dir> --api-checkout <dir>");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  main(process.argv.slice(2), process.env).then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
