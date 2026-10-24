import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { readFile, writeFile, appendFile, mkdir, open, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { context, githubClient, autopilotRequest, assertMain, releaseInputs, REPOSITORY, REPOSITORY_ID, API_ORIGIN, SHA } from "./autopilot-client.mjs";
import { mintAutopilotAppToken } from "./autopilot-github-app.mjs";
import { createGitHubRequest, resolveLiveRelease, runLiveCheck } from "./monitor-live-release.mjs";

export const FINDINGS_MARKER = "<!-- riddle-arabia-autopilot-findings:v1 -->";
export const BOT_ID = 41898282;
const PREFIX = `/repos/${REPOSITORY}`;
const BASELINE_IDENTITY_FINDING = "Current source is not the verified live build; release needs attention";
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));

export function safeChildEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) =>
    !/TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL|ACTIONS_ID_TOKEN|^NODE_OPTIONS$|^NODE_PATH$|^BASH_ENV$|^ENV$|^GIT_CONFIG|^GIT_EXEC_PATH$|^GIT_SSH|^GIT_ASKPASS$/iu.test(key)));
}

export function runCommand(command, args, { cwd = process.cwd(), env = safeChildEnv(), capture = false } = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", chunk => {
      if (capture) {
        stdout += chunk;
        if (stdout.length > 4_000_000) child.kill();
      } else process.stdout.write(chunk);
    });
    child.stderr.on("data", chunk => { if (!capture) process.stderr.write(chunk); });
    child.once("error", reject);
    child.once("close", code => resolveRun({ code: code ?? 1, stdout: stdout.trim() }));
  });
}

async function must(command, args, options) {
  const result = await runCommand(command, args, options);
  if (result.code !== 0) throw new Error(`${command} ${args[0]} failed. See the workflow check output.`);
  return result.stdout;
}

export function findingBody(checks, runUrl, notes = []) {
  return `${FINDINGS_MARKER}\n## Daily maintenance findings\n\nThe latest run found checks that need attention. No unverified change was deployed.\n\n`
    + checks.map(check => `- ${check.replace(/[^a-zA-Z0-9 .:/_-]/gu, "").slice(0,120)}`).join("\n")
    + notes.map(note => `\n\n${note.replace(/[^a-zA-Z0-9 .,:/_()-]/gu, "").slice(0,400)}`).join("")
    + `\n\n[View the run and evidence](${runUrl})\n\nAutopilot only repairs generated site files from approved source data. Other problems stay visible for review.\n`;
}

// Source ahead of the live build is the normal state between a merge and its
// release. It stays informational (listed, but the run is not red) while it is
// explained by unreleased merges on top of the last verified static release
// and has lasted at most this long.
export const RELEASE_LAG_LIMIT_DAYS = 7;
const DAY_MS = 86_400_000;

function trustedStaticRelease(run) {
  return Boolean(run) && Number.isSafeInteger(run.id) && run.id > 0
    && run.path?.split("@")[0] === ".github/workflows/static-site.yml"
    && run.head_branch === "main" && run.event === "workflow_dispatch"
    && run.status === "completed" && run.conclusion === "success" && SHA.test(run.head_sha || "")
    && run.repository?.full_name === REPOSITORY && run.head_repository?.full_name === REPOSITORY;
}

// Releases always ship the tip of protected main, so after the last verified
// release the source can only be ahead through later merges. The lag is
// measured from the later of the oldest unreleased commit's committer date
// and that release's completion. Anything not explained this way is not
// informational.
export async function assessReleaseLag(gh, { sourceSha, now = new Date() }) {
  const unknown = reason => ({ state: "unknown", reason, informational: false });
  try {
    const listing = await gh(`${PREFIX}/actions/workflows/static-site.yml/runs?branch=main&event=workflow_dispatch&status=success&per_page=30`);
    const releases = (Array.isArray(listing?.workflow_runs) ? listing.workflow_runs : []).filter(trustedStaticRelease)
      .sort((left, right) => Date.parse(right.run_started_at || right.created_at) - Date.parse(left.run_started_at || left.created_at));
    const release = releases[0];
    if (!release) return unknown("no verified static release was found");
    const identity = { releaseRunId: String(release.id), releaseSha: release.head_sha };
    if (release.head_sha === sourceSha) {
      return { state: "not_explained", ...identity, informational: false, reason: "main has no merge after the last verified release" };
    }
    let previous = null;
    for (let page = 1; page <= 3; page++) {
      const commits = await gh(`${PREFIX}/commits?sha=${sourceSha}&per_page=100&page=${page}`);
      if (!Array.isArray(commits)) return unknown("the commit history could not be read");
      const index = commits.findIndex(commit => commit?.sha === release.head_sha);
      if (index >= 0) {
        const oldest = index > 0 ? commits[index - 1] : previous;
        const mergedAt = Date.parse(oldest?.commit?.committer?.date || "");
        const releasedAt = Date.parse(release.updated_at || "");
        if (!oldest || !Number.isFinite(mergedAt) || !Number.isFinite(releasedAt)) return unknown("the release or merge time could not be read");
        const since = Math.max(mergedAt, releasedAt);
        const ageDays = Math.max(0, (now.getTime() - since) / DAY_MS);
        return { state: "unreleased_merges", ...identity, unreleasedCommits: (page - 1) * 100 + index,
          since: new Date(since).toISOString(), ageDays: Math.round(ageDays * 10) / 10,
          informational: ageDays <= RELEASE_LAG_LIMIT_DAYS };
      }
      if (commits.length < 100) break;
      previous = commits.at(-1);
    }
    return unknown("the last verified release is not in the recent history of main");
  } catch {
    return unknown("the release history could not be read");
  }
}

function releaseLagNote(lag) {
  if (!lag) return null;
  const days = lag.ageDays === 1 ? "1 day" : `${lag.ageDays} days`;
  if (lag.state === "unreleased_merges" && lag.informational) {
    return `Informational: main is ${lag.unreleasedCommits} unreleased commit(s) ahead of the last verified static release (run ${lag.releaseRunId}), unreleased for ${days} since ${lag.since}. `
      + `This is normal until the next release and does not turn the run red unless it lasts more than ${RELEASE_LAG_LIMIT_DAYS} days.`;
  }
  if (lag.state === "unreleased_merges") {
    return `Needs attention: main has been ahead of the last verified static release (run ${lag.releaseRunId}) for ${days} since ${lag.since}, more than the ${RELEASE_LAG_LIMIT_DAYS}-day limit. Release main or review the unreleased changes.`;
  }
  return `Needs attention: the live build differs from the current source, and this is not explained by recent unreleased merges (${lag.reason}).`;
}

export async function syncFindings(gh, checks, runUrl, notes = []) {
  let existing;
  for (let page = 1; page <= 10; page++) {
    const issues = await gh(`${PREFIX}/issues?state=open&per_page=100&page=${page}`);
    existing = issues.find(issue => !issue.pull_request && issue.user?.id === BOT_ID && issue.body?.startsWith(FINDINGS_MARKER));
    if (existing || issues.length < 100) break;
    if (page === 10) throw new Error("Could not establish a unique maintenance issue within the bounded issue scan.");
  }
  if (!checks.length) {
    if (existing) await gh(`${PREFIX}/issues/${existing.number}`, { method: "PATCH", body: { state: "closed", state_reason: "completed" } });
    return;
  }
  const body = { title: "[Autopilot] Daily maintenance findings", body: findingBody(checks, runUrl, notes) };
  await gh(existing ? `${PREFIX}/issues/${existing.number}` : `${PREFIX}/issues`, {
    method: existing ? "PATCH" : "POST", body,
  });
}

export function matchDispatchedRun(runs, { workflow, ref, sha, after, previousIds }) {
  const matches = runs.filter(run => !previousIds.has(run.id) && run.event === "workflow_dispatch"
    && run.head_branch === ref && run.head_sha === sha && run.path?.split("@")[0] === `.github/workflows/${workflow}`
    && Date.parse(run.created_at) >= after - 5000 && run.head_repository?.full_name === REPOSITORY);
  if (matches.length > 1) throw new Error("Ambiguous workflow dispatch; refusing to choose a release run.");
  return matches[0] || null;
}

export async function dispatchAndWait(gh, { workflow, ref, sha, inputs = {}, timeoutMs = 40 * 60_000,
  now = Date.now, wait = sleep }) {
  const listing = `${PREFIX}/actions/workflows/${workflow}/runs?event=workflow_dispatch&branch=${encodeURIComponent(ref)}&per_page=30`;
  const before = await gh(listing);
  const previousIds = new Set((before.workflow_runs || []).map(run => run.id));
  const started = now();
  await gh(`${PREFIX}/actions/workflows/${workflow}/dispatches`, { method: "POST", body: { ref, inputs } });
  let selected;
  while (now() - started < timeoutMs) {
    if (!selected) {
      selected = matchDispatchedRun((await gh(listing)).workflow_runs || [], { workflow, ref, sha, after: started, previousIds });
    } else {
      const selectedId = selected.id;
      selected = await gh(`${PREFIX}/actions/runs/${selectedId}`);
      if (selected.id !== selectedId || selected.head_sha !== sha || selected.head_branch !== ref || selected.event !== "workflow_dispatch"
        || selected.path?.split("@")[0] !== `.github/workflows/${workflow}` || selected.head_repository?.full_name !== REPOSITORY) {
        throw new Error("Dispatched workflow identity changed.");
      }
    }
    if (selected?.status === "completed") {
      if (selected.conclusion !== "success") throw new Error(`${workflow} run ${selected.id} ended with ${selected.conclusion}.`);
      return selected;
    }
    await wait(10_000);
  }
  throw new Error(`${workflow} did not finish within the maintenance budget. Its status remains available in GitHub.`);
}

// GitHub may omit pull_requests even for an active native PR run. Bind the
// immutable workflow run-name to its trigger's PR/base/head, and independently
// verify the current PR API record. When association metadata exists it must
// agree too; it is never the sole proof of the triggering pull request.
function matchesPullRequestChecks(run, { ref, sha, prNumber, base }) {
  const associations = run.pull_requests;
  const pull = Array.isArray(associations) && associations.length === 1 ? associations[0] : null;
  const associationMatches = associations == null || (Array.isArray(associations) && associations.length === 0)
    || (pull?.number === prNumber && pull.head?.sha === sha && pull.head.ref === ref
      && pull.head.repo?.id === Number(REPOSITORY_ID)
      && pull.base?.sha === base && pull.base.ref === "main" && pull.base.repo?.id === Number(REPOSITORY_ID));
  return Number.isSafeInteger(run.id) && run.id > 0
    && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0
    && run.event === "pull_request" && run.head_branch === ref && run.head_sha === sha
    && run.path?.split("@")[0] === ".github/workflows/api-check.yml"
    && run.display_title === `Validate API · PR ${prNumber} · base ${base} · head ${sha}`
    && run.repository?.full_name === REPOSITORY && run.repository.id === Number(REPOSITORY_ID)
    && run.head_repository?.full_name === REPOSITORY && run.head_repository.id === Number(REPOSITORY_ID)
    && associationMatches;
}

function assertPullRequestChecksIdentity(pull, { ref, sha, prNumber, base }) {
  if (pull?.number !== prNumber || pull.state !== "open"
    || pull.head?.sha !== sha || pull.head.ref !== ref
    || pull.head.repo?.id !== Number(REPOSITORY_ID) || pull.head.repo.full_name !== REPOSITORY
    || pull.base?.sha !== base || pull.base.ref !== "main"
    || pull.base.repo?.id !== Number(REPOSITORY_ID) || pull.base.repo.full_name !== REPOSITORY) {
    throw new Error("Pull-request source identity changed before required checks could be verified.");
  }
}

export async function waitForPullRequestChecks(gh, { ref, sha, prNumber, base, timeoutMs = 25 * 60_000,
  now = Date.now, wait = sleep }) {
  if (!SHA.test(sha || "") || !SHA.test(base || "") || !Number.isSafeInteger(prNumber) || prNumber < 1
    || typeof ref !== "string" || !ref || ref.length > 200 || /[\s?&#%\\]/u.test(ref)) {
    throw new Error("Invalid pull-request validation identity.");
  }
  const identity = { ref, sha, prNumber, base };
  const listing = `${PREFIX}/actions/workflows/api-check.yml/runs?event=pull_request&branch=${encodeURIComponent(ref)}&head_sha=${sha}&exclude_pull_requests=false&per_page=100`;
  const started = now();
  assertPullRequestChecksIdentity(await gh(`${PREFIX}/pulls/${prNumber}`), identity);
  let selected;
  while (now() - started < timeoutMs) {
    if (!selected) {
      const result = await gh(listing);
      if (!Array.isArray(result.workflow_runs) || result.total_count > 100) throw new Error("Cannot establish a bounded, unique pull-request validation run.");
      const matches = result.workflow_runs.filter(run => matchesPullRequestChecks(run, identity));
      if (matches.length > 1) throw new Error("Ambiguous pull-request validation runs; refusing to choose required checks.");
      selected = matches[0];
    } else {
      const { id, run_attempt: attempt } = selected;
      selected = await gh(`${PREFIX}/actions/runs/${id}?exclude_pull_requests=false`);
      if (selected.id !== id || selected.run_attempt !== attempt || !matchesPullRequestChecks(selected, identity)) {
        throw new Error("Pull-request validation identity changed.");
      }
    }
    if (selected?.conclusion === "action_required" || ["action_required", "waiting"].includes(selected?.status)) {
      throw new Error(`Pull-request validation run ${selected.id} requires human approval; no release can proceed.`);
    }
    if (selected?.status === "completed") {
      if (selected.conclusion !== "success") throw new Error(`Pull-request validation run ${selected.id} ended with ${selected.conclusion}.`);
      // Pin the run attempt too: a rerun must not mix an old successful job with
      // a newly skipped, pending or failed required job.
      const result = await gh(`${PREFIX}/actions/runs/${selected.id}/attempts/${selected.run_attempt}/jobs?per_page=100`);
      if (!Array.isArray(result.jobs) || result.total_count !== 2 || result.jobs.length !== 2) {
        throw new Error("Both required pull-request jobs must be present exactly once.");
      }
      for (const name of ["validate", "Browser regression"]) {
        const jobs = result.jobs.filter(job => job.name === name);
        if (jobs.length !== 1 || jobs[0].run_id !== selected.id || jobs[0].status !== "completed" || jobs[0].conclusion !== "success") {
          throw new Error(`Required pull-request job ${name} did not complete successfully.`);
        }
      }
      assertPullRequestChecksIdentity(await gh(`${PREFIX}/pulls/${prNumber}`), identity);
      return selected;
    }
    await wait(10_000);
  }
  throw new Error("Required pull-request checks did not finish within the maintenance budget; no release can proceed.");
}

export async function publishVerifiedRepair(gh, { base, candidate, branch, prNumber, day, runId,
  verifyCandidate, verifyMergedTree, reserveRelease, assertActive, waitForChecks = waitForPullRequestChecks, dispatch = dispatchAndWait }) {
  if (typeof assertActive !== "function") throw new Error("A live owner-control check is required.");
  await waitForChecks(gh, { ref: branch, sha: candidate, prNumber, base, timeoutMs: 25 * 60_000 });
  assertMain(await gh(`${PREFIX}/branches/main`), base);
  await verifyCandidate();
  const latestPr = await gh(`${PREFIX}/pulls/${prNumber}`);
  if (latestPr.head?.sha !== candidate || latestPr.base?.sha !== base || latestPr.base?.ref !== "main" || latestPr.state !== "open") {
    throw new Error("Repair pull request changed during validation.");
  }
  await assertActive();
  const merged = await gh(`${PREFIX}/pulls/${prNumber}/merge`, { method: "PUT", body: { sha: candidate, merge_method: "squash" } });
  if (merged.merged !== true || !SHA.test(merged.sha || "")) throw new Error("Required branch checks did not permit merging the repair.");
  await verifyMergedTree(merged.sha);
  assertMain(await gh(`${PREFIX}/branches/main`), merged.sha);
  await reserveRelease(merged.sha);
  await dispatch(gh, { workflow: "api-deploy.yml", ref: "main", sha: merged.sha, timeoutMs: 20 * 60_000,
    inputs: releaseInputs("api", { day, runId }) });
  assertMain(await gh(`${PREFIX}/branches/main`), merged.sha);
  const released = await dispatch(gh, { workflow: "static-site.yml", ref: "main", sha: merged.sha, timeoutMs: 25 * 60_000,
    inputs: releaseInputs("static", { day, runId }) });
  return { sha: merged.sha, released };
}

export function verifyPublishedBuild(response, { expectedBuildId } = {}) {
  if (typeof expectedBuildId !== "string" || !/^[a-f0-9]{64}$/u.test(expectedBuildId)) {
    throw new Error("The verified candidate build identity is missing or invalid.");
  }
  if (response?.status !== 200) throw new Error("Published admin page failed the final HTTP 200 check.");
  const buildId = response.headers?.get?.("x-jakh-site-version");
  const workerVersion = response.headers?.get?.("x-jakh-worker-version");
  if (buildId !== expectedBuildId) throw new Error("Published site does not match the verified candidate build.");
  if (typeof workerVersion !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(workerVersion)) {
    throw new Error("Published Worker version identity is missing or invalid.");
  }
  return { buildId, workerVersion };
}

export function findingCounts(failedChecks) {
  return { total: failedChecks.length,
    accessibility: failedChecks.filter(name => name === "Accessibility").length,
    dependencies: failedChecks.filter(name => /dependency audit/u.test(name)).length,
    content: failedChecks.filter(name => ["Source contracts", "Static validation", "English and Arabic", "Search and metadata"].includes(name)).length,
  };
}

export const DAILY_CHECKS = Object.freeze([
  ["Source contracts", "npm", ["run", "test:contracts"]],
  ["Static validation", "node", ["scripts/validate-static.mjs"]],
  ["English and Arabic", "node", ["scripts/validate-bilingual.mjs"]],
  ["Search and metadata", "node", ["scripts/validate-seo.mjs"]],
  ["Root dependency audit", "npm", ["audit", "--audit-level=high"]],
  ["API dependency audit", "npm", ["--prefix", "worker", "run", "audit:security"]],
  ["Site dependency audit", "npm", ["audit", "--prefix", "site-worker", "--audit-level=high"]],
  ["Build site", "npm", ["run", "build:site"]],
  ["Static projection", "npm", ["--prefix", "site-worker", "test"]],
  ["Accessibility", "npm", ["run", "test:a11y"]],
]);

export function automaticReleaseReadiness(env = process.env) {
  if (env.AUTOPILOT_RELEASE_ENABLED !== "true") return { mode: "inspection_only", finding: null };
  const numericId = value => typeof value === "string" && /^[1-9][0-9]{0,15}$/u.test(value) && Number.isSafeInteger(Number(value));
  const configured = numericId(env.AUTOPILOT_GITHUB_APP_ID) && numericId(env.AUTOPILOT_GITHUB_APP_INSTALLATION_ID)
    && typeof env.AUTOPILOT_GITHUB_APP_PRIVATE_KEY === "string" && env.AUTOPILOT_GITHUB_APP_PRIVATE_KEY.trim().length > 0;
  return configured
    ? { mode: "automatic", finding: null }
    : { mode: "inspection_only", finding: "Automatic publishing is enabled but the repository-scoped GitHub App setup is incomplete" };
}

export function publicationFinding(readiness, changedFiles) {
  if (readiness.finding) return readiness.finding;
  return readiness.mode !== "automatic" && changedFiles.length
    ? "Generated repairs are ready for review; automatic publishing is disabled"
    : null;
}

async function writeReport(path, report, env) {
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  if (env.GITHUB_STEP_SUMMARY && ["no_changes", "needs_attention", "deployed", "failed", "paused", "paused_or_daily_limit"].includes(report.status)) await appendFile(env.GITHUB_STEP_SUMMARY,
    `## Riddle Arabia Autopilot\n\n- Result: **${report.status}**\n- Publishing mode: **${report.releaseMode}**\n- Checks passed: ${report.checksPassed}\n- Checks failed: ${report.checksFailed}\n- AI spending: **$0**\n- Generated files repaired: ${report.changedFiles.length}\n`
    + (report.pullRequest ? `- [Repair pull request](${report.pullRequest})\n` : "")
    + (report.deploymentRunId ? `- [Production release](https://github.com/${REPOSITORY}/actions/runs/${report.deploymentRunId})\n` : ""));
}

// The workflow runs maintenance as two jobs. Inspection installs packages and
// runs every check with a read-only token and no OIDC identity, deployment
// environment or secret. Publication installs nothing: it claims the day,
// reports, files findings and publishes only a repair it independently
// re-derives from the trusted base. The handoff between them is data only.
export const HANDOFF_FILE = "maintenance-handoff.json";
const HANDOFF_MAX_BYTES = 256 * 1024;
const BUILD_ID = /^[a-f0-9]{64}$/u;
const MODE = /^(?:100644|100755)$/u;
const HEX64 = /^[a-f0-9]{64}$/u;

// A reservation is a UTC-day budget. Never begin a maintenance job so late
// that its bounded work could cross into another reservation day.
function assertEarlyEnough(now = new Date()) {
  const minutesUntilMidnight = 1440 - (now.getUTCHours() * 60 + now.getUTCMinutes());
  if (minutesUntilMidnight < 105) throw new Error("Run maintenance earlier in the UTC day; the next scheduled run remains at 07:23 Dubai.");
}

function outputDirectory(env, ctx, root) {
  const outputDir = resolve(env.RUNNER_TEMP || "../autopilot-work", `autopilot-${ctx.runId}`);
  if (outputDir === root || outputDir.startsWith(`${root}/`)) throw new Error("Maintenance evidence must stay outside the checkout.");
  return outputDir;
}

async function assertTrustedSource(gh, ctx) {
  const metadata = await gh(PREFIX);
  if (metadata.id !== Number(REPOSITORY_ID) || metadata.private !== false || metadata.default_branch !== "main") {
    throw new Error("Free-run policy requires the exact public Riddle Arabia repository.");
  }
  assertMain(await gh(`${PREFIX}/branches/main`), ctx.sha);
  if (await must("git", ["status", "--porcelain"], { capture: true })) throw new Error("Maintenance requires a clean checkout.");
}

function sanitizedChange(change) {
  const valid = change && typeof change === "object" && typeof change.path === "string" && change.path.length > 0 && change.path.length <= 500
    && !/[\x00-\x1f\x7f]/u.test(change.path) && ["add", "delete", "modify"].includes(change.change)
    && (change.oldMode === null || MODE.test(change.oldMode)) && (change.newMode === null || MODE.test(change.newMode))
    && (change.beforeSha256 === null || HEX64.test(change.beforeSha256)) && (change.afterSha256 === null || HEX64.test(change.afterSha256))
    && Number.isSafeInteger(change.bytes) && change.bytes >= 0;
  if (!valid) throw new Error("The inspection handoff lists an invalid changed file.");
  const { path, oldMode, newMode, beforeSha256, afterSha256, bytes } = change;
  return { path, change: change.change, oldMode, newMode, beforeSha256, afterSha256, bytes };
}

// The handoff comes from the job that ran installed packages. It is parsed as
// bounded data, bound to this exact run and source, and never executed.
export function validateHandoff(handoff, { runId, runAttempt, sourceSha }) {
  const fail = message => { throw new Error(`The inspection handoff is invalid: ${message}.`); };
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff) || handoff.version !== 1) fail("unsupported format");
  if (handoff.runId !== runId || handoff.runAttempt !== runAttempt || handoff.sourceSha !== sourceSha) fail("it belongs to another run or source");
  if (!["inspected", "failed"].includes(handoff.status)) fail("unknown status");
  if (!Number.isSafeInteger(handoff.checksPassed) || handoff.checksPassed < 0 || handoff.checksPassed > 1_000) fail("invalid passed-check count");
  if (!Array.isArray(handoff.failedChecks) || handoff.failedChecks.length > 50
    || !handoff.failedChecks.every(check => typeof check === "string" && check.length > 0 && check.length <= 200)) fail("invalid findings");
  if (!Array.isArray(handoff.changedFiles) || handoff.changedFiles.length > 250) fail("invalid changed files");
  if (handoff.error !== null && (typeof handoff.error !== "string" || !handoff.error || handoff.error.length > 200)) fail("invalid error");
  if ((handoff.status === "failed") !== (handoff.error !== null)) fail("status and error disagree");
  const candidate = handoff.candidate;
  if (candidate !== null && (typeof candidate !== "object" || !SHA.test(candidate.tree || "") || !BUILD_ID.test(candidate.buildId || ""))) fail("invalid candidate");
  return {
    version: 1, runId, runAttempt, sourceSha, status: handoff.status, checksPassed: handoff.checksPassed,
    failedChecks: [...handoff.failedChecks], changedFiles: handoff.changedFiles.map(sanitizedChange), error: handoff.error,
    candidate: candidate === null ? null : { tree: candidate.tree, buildId: candidate.buildId },
  };
}

export async function readHandoff(path, expected) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > HANDOFF_MAX_BYTES) throw new Error("The inspection handoff is missing or too large.");
    const text = await file.readFile("utf8");
    if (Buffer.byteLength(text) > HANDOFF_MAX_BYTES) throw new Error("The inspection handoff is missing or too large.");
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error("The inspection handoff is not valid JSON."); }
    return validateHandoff(parsed, expected);
  } finally { await file.close(); }
}

const ATTEMPT = /^[1-9][0-9]{0,3}$/u;

function runIdentity(env, ctx) {
  const runAttempt = ATTEMPT.test(env.GITHUB_RUN_ATTEMPT || "") ? env.GITHUB_RUN_ATTEMPT : "1";
  return { runId: ctx.runId, runAttempt, sourceSha: ctx.sha };
}

// Publication reads the hand-off of this run's inspection attempt. It equals the
// current attempt unless only the publish job was re-run.
export function inspectionIdentity(env, ctx) {
  const current = runIdentity(env, ctx);
  const attempt = env.AUTOPILOT_INSPECTION_ATTEMPT;
  if (attempt === undefined || attempt === "") return current;
  if (!ATTEMPT.test(attempt) || Number(attempt) > Number(current.runAttempt)) {
    throw new Error("The inspection attempt does not belong to this run.");
  }
  return { ...current, runAttempt: attempt };
}

// The maintenance production check compares the site and API with the releases
// that are live, exactly like the scheduled monitor, so a merge that changes
// the monitor's expectations does not fail before it is released. A drift from
// the live release, or any contract failure of the live commits, still fails.
// The live commits are checked out as detached worktrees outside the checkout,
// which keeps the repository clean for the repair engine.
export async function runLiveProductionCheck(env, { root, outputDir, workDir,
  resolve: resolveRelease = resolveLiveRelease, check = runLiveCheck, request } = {}) {
  const resultPath = join(outputDir, "production-monitor.json");
  const token = env.GITHUB_TOKEN;
  const resolution = await resolveRelease({ request: request || createGitHubRequest({ token }) });
  if (resolution.state === "deferred") {
    process.stdout.write(`Production monitor deferred: ${resolution.reason}.\n`);
    return { state: "deferred", reason: resolution.reason };
  }
  if (!SHA.test(resolution.site?.commit || "") || !SHA.test(resolution.api?.commit || "")) throw new Error("The live release resolution is malformed.");
  if (workDir === root || workDir.startsWith(`${root}/`)) throw new Error("Live release checkouts must stay outside the checkout.");
  const checkouts = new Map();
  try {
    await mkdir(workDir, { recursive: true });
    for (const sha of new Set([resolution.site.commit, resolution.api.commit])) {
      const path = join(workDir, sha);
      await must("git", ["worktree", "add", "--detach", path, sha]);
      checkouts.set(sha, path);
    }
    const report = await check({
      resolution,
      siteCheckout: checkouts.get(resolution.site.commit),
      apiCheckout: checkouts.get(resolution.api.commit),
      env: { ...safeChildEnv(env), GH_TOKEN: token || "", JAKH_SITE_ORIGIN: "https://riddlearabia.com", JAKH_API_ORIGIN: API_ORIGIN },
    });
    await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`);
    return { state: report.status === "success" ? "passed" : "failed" };
  } finally {
    for (const path of checkouts.values()) await runCommand("git", ["worktree", "remove", "--force", path], { capture: true });
    await runCommand("git", ["worktree", "prune"], { capture: true });
    await rm(workDir, { recursive: true, force: true });
  }
}

async function liveProductionCheck(env, { ctx, root, outputDir }) {
  try {
    return (await runLiveProductionCheck(env, { root, outputDir, workDir: resolve(env.RUNNER_TEMP || "../autopilot-work", `autopilot-live-${ctx.runId}`) })).state;
  } catch (error) {
    process.stderr.write(`Production monitor could not check the live release: ${String(error.message).slice(0, 200)}\n`);
    await writeFile(join(outputDir, "production-monitor.json"), `${JSON.stringify({ schemaVersion: 1, status: "failure", monitor: { scope: "all", basis: "live-release" },
      totalChecks: 1, passedChecks: 0, failedChecks: 1, results: [],
      failures: [{ name: "Live release: resolution", message: String(error.message).slice(0, 200), attempts: 1 }] }, null, 2)}\n`);
    return "failed";
  }
}

// Read-only job: inspect, repair locally, test, and prove the exact candidate
// tree. It has no write token, OIDC identity, environment or secret.
export async function runInspection(env = process.env, { now = () => new Date() } = {}) {
  const ctx = context(env);
  const start = now();
  assertEarlyEnough(start);
  const root = process.cwd();
  const outputDir = outputDirectory(env, ctx, root);
  await mkdir(outputDir, { recursive: true });
  const handoff = { version: 1, ...runIdentity(env, ctx), status: "inspected", checksPassed: 0, failedChecks: [], changedFiles: [], error: null, candidate: null };
  const finding = name => { if (!handoff.failedChecks.includes(name)) handoff.failedChecks.push(name); };
  try {
    await assertTrustedSource(githubClient(env), ctx);
    // A repair may not sweep an unrelated, human-merged but unreleased change
    // into production. Establish the current base's exact live static build.
    await must("npm", ["run", "build:site"]);
    const baselineManifest = JSON.parse(await readFile(join(root,"site-worker/generated/site-manifest.json"),"utf8"));
    const baselineResponse = await fetch("https://riddlearabia.com/admin", { redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (!baselineResponse.ok || baselineResponse.headers.get("x-jakh-site-version") !== baselineManifest.buildId) finding(BASELINE_IDENTITY_FINDING);
    const repairPath = join(outputDir, "repair-plan.json");
    await must("node", ["scripts/autopilot-repairs.mjs", "repair", "--base", ctx.sha, "--repo", root, "--report", repairPath]);
    const repair = JSON.parse(await readFile(repairPath, "utf8"));
    handoff.changedFiles = repair.changedFiles || [];

    // A release that is deploying right now defers this check; it is neither
    // passed nor failed, and that release's completion runs its own monitor.
    const production = await liveProductionCheck(env, { ctx, root, outputDir });
    if (production === "failed") handoff.failedChecks.push("Production monitor");
    else if (production === "passed") handoff.checksPassed++;
    for (const [name, command, args] of DAILY_CHECKS) {
      process.stdout.write(`\nMaintenance check: ${name}\n`);
      const result = await runCommand(command, args, { env: { ...safeChildEnv(env),
        JAKH_SITE_ROOT: join(root,"site-worker/dist"), JAKH_SITE_MANIFEST: join(root,"site-worker/generated/site-manifest.json") } });
      if (result.code) handoff.failedChecks.push(name); else handoff.checksPassed++;
      if (Date.now() - start.getTime() > 20 * 60_000) throw new Error("Daily inspection exceeded its 20-minute budget; no release was started.");
    }
    // A previous merged repair or a human change may still be unreleased.
    // A zero diff is not proof that production matches the current source.
    if (!handoff.changedFiles.length && !handoff.failedChecks.includes("Build site")) {
      const manifest = JSON.parse(await readFile(join(root,"site-worker/generated/site-manifest.json"),"utf8"));
      const live = await fetch("https://riddlearabia.com/admin", { redirect: "error", signal: AbortSignal.timeout(20_000) });
      if (!live.ok || live.headers.get("x-jakh-site-version") !== manifest.buildId) finding(BASELINE_IDENTITY_FINDING);
    }
    // Only the generated, byte-for-byte reproducible bundle can reach a PR. The
    // publication job re-derives it from the trusted base and must reach this
    // exact tested tree before anything is pushed.
    if (env.AUTOPILOT_RELEASE_ENABLED === "true" && handoff.changedFiles.length && !handoff.failedChecks.length) {
      await must("node", ["scripts/autopilot-repairs.mjs", "verify", "--base", ctx.sha, "--repo", root]);
      await must("git", ["switch", "-c", `autopilot-candidate-${ctx.runId}`]);
      await must("git", ["config", "user.name", "Riddle Arabia Autopilot"]);
      await must("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
      await must("git", ["add", "--all"]);
      await must("git", ["commit", "-m", "Refresh generated site files from approved sources"]);
      const candidate = await must("git", ["rev-parse", "HEAD"], { capture: true });
      if (!SHA.test(candidate)) throw new Error("Invalid repair commit.");
      await must("node", ["scripts/autopilot-repairs.mjs", "verify", "--base", ctx.sha, "--candidate", candidate, "--repo", root]);
      const tree = await must("git", ["rev-parse", `${candidate}^{tree}`], { capture: true });
      const candidateManifest = JSON.parse(await readFile(join(root, "site-worker/generated/site-manifest.json"), "utf8"));
      if (!SHA.test(tree) || !BUILD_ID.test(candidateManifest.buildId || "")) throw new Error("The verified repair candidate identity is invalid.");
      handoff.candidate = { tree, buildId: candidateManifest.buildId };
    }
  } catch (error) {
    handoff.status = "failed";
    handoff.error = String(error.message || "Inspection failed").slice(0,200) || "Inspection failed";
  }
  const handoffPath = join(outputDir, HANDOFF_FILE);
  await writeFile(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`);
  return { handoff, handoffPath };
}

// Writer job: no package install. It records the inspection under the daily
// claim, files or closes findings, and publishes only a verified repair.
export async function runPublication(env = process.env, { handoffPath, now = () => new Date() } = {}) {
  const ctx = context(env);
  assertEarlyEnough(now());
  const readiness = automaticReleaseReadiness(env);
  const root = process.cwd();
  const outputDir = outputDirectory(env, ctx, root);
  await mkdir(outputDir, { recursive: true });
  const inspection = await readHandoff(handoffPath || join(outputDir, HANDOFF_FILE), inspectionIdentity(env, ctx));
  const reportPath = join(outputDir, "daily-report.json");
  const gh = githubClient(env);
  const report = { version: 1, runId: ctx.runId, sourceSha: ctx.sha, releaseMode: readiness.mode, status: "inspecting", checksPassed: 0, checksFailed: 0, changedFiles: [], failedChecks: [] };
  let day;
  const send = async (status, extra = {}) => {
    report.status = status;
    if (day) await autopilotRequest("report", { day, status, checksPassed: report.checksPassed,
      checksFailed: report.checksFailed, fixesApplied: status === "deployed" ? report.changedFiles.length : 0,
      findings: findingCounts(report.failedChecks), releaseMode: report.releaseMode, ...extra }, { env });
    await writeReport(reportPath, report, env);
  };
  try {
    await assertTrustedSource(gh, ctx);
    try { day = (await autopilotRequest("claim", {}, { env })).day; report.day = day; }
    catch (error) {
      if ([409,423].includes(error.status)) { report.status = "paused_or_daily_limit"; await writeReport(reportPath, report, env); return report; }
      throw error;
    }
    await send("inspecting");
    // Record the read-only inspection exactly as the single job used to.
    report.changedFiles = inspection.changedFiles;
    report.checksPassed = inspection.checksPassed;
    report.failedChecks = [...inspection.failedChecks];
    report.checksFailed = report.failedChecks.length;
    if (inspection.status === "failed") throw new Error(inspection.error);
    await send(report.changedFiles.length ? "fixing" : "inspecting");
    await send("testing");
    const publishingBlocker = publicationFinding(readiness, report.changedFiles);
    if (publishingBlocker) {
      report.failedChecks.push(publishingBlocker);
      report.checksFailed = report.failedChecks.length;
    }
    if (report.failedChecks.length) {
      if (report.failedChecks.includes(BASELINE_IDENTITY_FINDING)) {
        report.releaseLag = await assessReleaseLag(gh, { sourceSha: ctx.sha, now: now() });
      }
      const note = releaseLagNote(report.releaseLag);
      await syncFindings(gh, report.failedChecks, ctx.runUrl, note ? [note] : []);
      await send("needs_attention");
      return report;
    }
    await syncFindings(gh, [], ctx.runUrl);
    if (!report.changedFiles.length) { await send("no_changes"); return report; }

    if (!inspection.candidate) throw new Error("The inspection job did not prove a repair candidate; nothing was published.");
    // Re-derive the bundle from the trusted base in this package-free job.
    const repairPath = join(outputDir, "publication-repair-plan.json");
    await must("node", ["scripts/autopilot-repairs.mjs", "repair", "--base", ctx.sha, "--repo", root, "--report", repairPath]);
    await must("node", ["scripts/autopilot-repairs.mjs", "verify", "--base", ctx.sha, "--repo", root]);
    const branch = `autopilot/${day}-${ctx.runId}`;
    await must("git", ["switch", "-c", branch]);
    await must("git", ["config", "user.name", "Riddle Arabia Autopilot"]);
    await must("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
    await must("git", ["add", "--all"]);
    await must("git", ["commit", "-m", "Refresh generated site files from approved sources"]);
    const candidate = await must("git", ["rev-parse", "HEAD"], { capture: true });
    if (!SHA.test(candidate)) throw new Error("Invalid repair commit.");
    await must("node", ["scripts/autopilot-repairs.mjs", "verify", "--base", ctx.sha, "--candidate", candidate, "--repo", root]);
    if (await must("git", ["rev-parse", `${candidate}^{tree}`], { capture: true }) !== inspection.candidate.tree) {
      throw new Error("The re-derived repair differs from the inspected and tested tree; nothing was published.");
    }
    await send("testing");
    // A repository-scoped App is needed only for publishing the branch and PR:
    // its pull_request event can start ordinary required CI without a person
    // approving a PR created with the built-in Actions token.
    const publisher = await mintAutopilotAppToken({ env });
    let pr;
    try {
      if (env.GITHUB_ACTIONS === "true") process.stdout.write(`::add-mask::${publisher.token}\n`);
      const authorization = Buffer.from(`x-access-token:${publisher.token}`).toString("base64");
      if (env.GITHUB_ACTIONS === "true") process.stdout.write(`::add-mask::${authorization}\n`);
      const appGithub = githubClient({ ...env, GITHUB_TOKEN: publisher.token });
      await send("testing");
      await must("git", ["push", "origin", `HEAD:refs/heads/${branch}`], { env: {
        ...safeChildEnv(env), GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${authorization}`,
      } });
      await send("testing");
      pr = await appGithub(`${PREFIX}/pulls`, { method: "POST", body: {
        title: "Refresh generated site files from approved sources", head: branch, base: "main",
        body: `Autopilot found stale generated files and rebuilt them from the approved source at \`${ctx.sha}\`. No question source data, application logic, tests or release policy changed.\n\nValidation: deterministic reproduction, source contracts, bilingual/static checks, dependency audits and accessibility. [Daily evidence](${ctx.runUrl}). Required CI must also pass before automatic merge.`,
      } });
    } finally { await publisher.revoke(); }
    report.pullRequest = pr.html_url;
    // Wait for the exact normal PR checks. The merge API also independently
    // enforces the protected branch's required checks and conversation rules.
    const { sha: mergedSha, released } = await publishVerifiedRepair(gh, {
      base: ctx.sha, candidate, branch, prNumber: pr.number, day, runId: ctx.runId,
      assertActive: () => send("testing"),
      verifyCandidate: () => must("node", ["scripts/autopilot-repairs.mjs", "verify", "--base", ctx.sha, "--candidate", candidate, "--repo", root]),
      verifyMergedTree: async mergedSha => {
        await must("git", ["fetch", "origin", "main"]);
        const mergedTree = await must("git", ["rev-parse", `${mergedSha}^{tree}`], { capture: true });
        const candidateTree = await must("git", ["rev-parse", `${candidate}^{tree}`], { capture: true });
        if (mergedTree !== candidateTree) throw new Error("Merged tree differs from the verified repair.");
        report.candidateSha = mergedSha;
        await send("testing", { candidateSha: mergedSha });
      },
      reserveRelease: async mergedSha => {
        await autopilotRequest("release", { day, candidateSha: mergedSha }, { env });
        report.status = "release_reserved";
        await writeReport(reportPath, report, env);
      },
    });
    const response = await fetch("https://riddlearabia.com/admin", { redirect: "error", signal: AbortSignal.timeout(20_000) });
    const { buildId, workerVersion } = verifyPublishedBuild(response, { expectedBuildId: inspection.candidate.buildId });
    report.deploymentRunId = String(released.id);
    await send("deployed", { candidateSha: mergedSha, buildId, workerVersion, deploymentRunId: String(released.id) });
    return report;
  } catch (error) {
    if (error.status === 423) { report.status = "paused"; await writeReport(reportPath, report, env); return report; }
    report.failedChecks.push(error.message.slice(0,200));
    report.checksFailed = report.failedChecks.length;
    try { await syncFindings(gh, report.failedChecks, ctx.runUrl); } catch { process.stderr.write("Could not update the maintenance issue; see the workflow failure.\n"); }
    try { await send("failed"); } catch { report.status = "failed"; await writeReport(reportPath, report, env); }
    throw error;
  }
}

function annotation(value) {
  return String(value).replace(/[^a-zA-Z0-9 .:/_;-]/gu, "").slice(0, 900);
}

// A run that needs attention must not look green: the findings issue is filed
// first, then the job fails with a visible annotation. The only exception is
// a source-ahead-of-live finding that a recent unreleased merge explains.
export function publicationExitCode(report, write = text => process.stdout.write(text)) {
  if (report?.status !== "needs_attention") return 0;
  const informational = report.releaseLag?.state === "unreleased_merges" && report.releaseLag.informational === true;
  const blocking = report.failedChecks.filter(check => !(informational && check === BASELINE_IDENTITY_FINDING));
  if (!blocking.length) {
    write(`::notice title=Daily maintenance: release pending::${annotation(releaseLagNote(report.releaseLag))}\n`);
    return 0;
  }
  const lag = blocking.includes(BASELINE_IDENTITY_FINDING) && report.releaseLag ? ` ${releaseLagNote(report.releaseLag)}` : "";
  write(`::error title=Daily maintenance needs attention::${annotation(`${blocking.join("; ")}.${lag}`)} See the findings issue.\n`);
  return 1;
}

async function main(argv, env) {
  const [mode] = argv;
  if (mode === "inspect") {
    const { handoff } = await runInspection(env);
    process.stdout.write(`Inspection ${handoff.status}: ${handoff.checksPassed} checks passed, ${handoff.failedChecks.length} need attention.\n`);
    return 0;
  }
  if (mode === "publish") {
    try {
      return publicationExitCode(await runPublication(env));
    } catch (error) {
      process.stdout.write(`::error title=Daily maintenance failed::${annotation(error.message)}\n`);
      throw error;
    }
  }
  throw new Error("Usage: site-autopilot.mjs inspect | publish");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env).then(code => { process.exitCode = code; })
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
