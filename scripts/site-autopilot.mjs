import { spawn } from "node:child_process";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { context, githubClient, autopilotRequest, assertMain, releaseInputs, REPOSITORY, REPOSITORY_ID, API_ORIGIN, SHA } from "./autopilot-client.mjs";
import { mintAutopilotAppToken } from "./autopilot-github-app.mjs";

export const FINDINGS_MARKER = "<!-- riddle-arabia-autopilot-findings:v1 -->";
export const BOT_ID = 41898282;
const PREFIX = `/repos/${REPOSITORY}`;
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

export function findingBody(checks, runUrl) {
  return `${FINDINGS_MARKER}\n## Daily maintenance findings\n\nThe latest run found checks that need attention. No unverified change was deployed.\n\n`
    + checks.map(check => `- ${check.replace(/[^a-zA-Z0-9 .:/_-]/gu, "").slice(0,120)}`).join("\n")
    + `\n\n[View the run and evidence](${runUrl})\n\nAutopilot only repairs generated site files from approved source data. Other problems stay visible for review.\n`;
}

export async function syncFindings(gh, checks, runUrl) {
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
  const body = { title: "[Autopilot] Daily maintenance findings", body: findingBody(checks, runUrl) };
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

// The Actions REST pull_requests field lists associated open PRs; association
// alone does not prove the trigger. Require the PR event and exact workflow,
// repository, head, base and PR identity together. See GitHub's workflow-run and
// pull-request-minimal schemas in github/rest-api-description.
function matchesPullRequestChecks(run, { ref, sha, prNumber, base }) {
  const pull = Array.isArray(run.pull_requests) && run.pull_requests.length === 1 ? run.pull_requests[0] : null;
  return Number.isSafeInteger(run.id) && run.id > 0
    && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0
    && run.event === "pull_request" && run.head_branch === ref && run.head_sha === sha
    && run.path?.split("@")[0] === ".github/workflows/api-check.yml"
    && run.repository?.full_name === REPOSITORY && run.repository.id === Number(REPOSITORY_ID)
    && run.head_repository?.full_name === REPOSITORY && run.head_repository.id === Number(REPOSITORY_ID)
    && pull?.number === prNumber && pull.head?.sha === sha && pull.head.ref === ref
    && pull.head.repo?.id === Number(REPOSITORY_ID)
    && pull.base?.sha === base && pull.base.ref === "main" && pull.base.repo?.id === Number(REPOSITORY_ID);
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

async function writeReport(path, report, env) {
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  if (env.GITHUB_STEP_SUMMARY && ["no_changes", "needs_attention", "deployed", "failed", "paused", "paused_or_daily_limit"].includes(report.status)) await appendFile(env.GITHUB_STEP_SUMMARY,
    `## Riddle Arabia Autopilot\n\n- Result: **${report.status}**\n- Checks passed: ${report.checksPassed}\n- Checks failed: ${report.checksFailed}\n- AI spending: **$0**\n- Generated files repaired: ${report.changedFiles.length}\n`
    + (report.pullRequest ? `- [Repair pull request](${report.pullRequest})\n` : "")
    + (report.deploymentRunId ? `- [Production release](https://github.com/${REPOSITORY}/actions/runs/${report.deploymentRunId})\n` : ""));
}

export async function runAutopilot(env = process.env) {
  const ctx = context(env);
  if (env.AUTOPILOT_RELEASE_ENABLED !== "true") throw new Error("Owner setup is not complete; automatic maintenance is disabled.");
  // A reservation is a UTC-day budget. Never begin a manual cycle so late
  // that its bounded release work could cross into another reservation day.
  const start = new Date();
  const minutesUntilMidnight = 1440 - (start.getUTCHours() * 60 + start.getUTCMinutes());
  if (minutesUntilMidnight < 105) throw new Error("Run maintenance earlier in the UTC day; the next scheduled run remains at 07:23 Dubai.");
  const root = process.cwd();
  const outputDir = resolve(env.RUNNER_TEMP || "../autopilot-work", `autopilot-${ctx.runId}`);
  if (outputDir === root || outputDir.startsWith(`${root}/`)) throw new Error("Maintenance evidence must stay outside the checkout.");
  await mkdir(outputDir, { recursive: true });
  const reportPath = join(outputDir, "daily-report.json");
  const gh = githubClient(env);
  const report = { version: 1, runId: ctx.runId, sourceSha: ctx.sha, status: "inspecting", checksPassed: 0, checksFailed: 0, changedFiles: [], failedChecks: [] };
  let day;
  const send = async (status, extra = {}) => {
    report.status = status;
    if (day) await autopilotRequest("report", { day, status, checksPassed: report.checksPassed,
      checksFailed: report.checksFailed, fixesApplied: status === "deployed" ? report.changedFiles.length : 0,
      findings: findingCounts(report.failedChecks), ...extra }, { env });
    await writeReport(reportPath, report, env);
  };
  try {
    const metadata = await gh(PREFIX);
    if (metadata.id !== Number(REPOSITORY_ID) || metadata.private !== false || metadata.default_branch !== "main") {
      throw new Error("Free-run policy requires the exact public Riddle Arabia repository.");
    }
    assertMain(await gh(`${PREFIX}/branches/main`), ctx.sha);
    if (await must("git", ["status", "--porcelain"], { capture: true })) throw new Error("Maintenance requires a clean checkout.");
    try { day = (await autopilotRequest("claim", {}, { env })).day; report.day = day; }
    catch (error) {
      if ([409,423].includes(error.status)) { report.status = "paused_or_daily_limit"; await writeReport(reportPath, report, env); return report; }
      throw error;
    }
    // A repair may not sweep an unrelated, human-merged but unreleased change
    // into production. Establish the current base's exact live static build.
    await must("npm", ["run", "build:site"]);
    const baselineManifest = JSON.parse(await readFile(join(root,"site-worker/generated/site-manifest.json"),"utf8"));
    const baselineResponse = await fetch("https://riddlearabia.com/admin", { redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (!baselineResponse.ok || baselineResponse.headers.get("x-jakh-site-version") !== baselineManifest.buildId) {
      report.failedChecks.push("Current source is not the verified live build; release needs attention");
      report.checksFailed = report.failedChecks.length;
    }
    const repairPath = join(outputDir, "repair-plan.json");
    await must("node", ["scripts/autopilot-repairs.mjs", "repair", "--base", ctx.sha, "--repo", root, "--report", repairPath]);
    const repair = JSON.parse(await readFile(repairPath, "utf8"));
    report.changedFiles = repair.changedFiles || [];
    await send(report.changedFiles.length ? "fixing" : "inspecting");

    const monitor = await runCommand("node", ["scripts/monitor-production.mjs"], {
      env: { ...safeChildEnv(env), JAKH_SITE_ORIGIN: "https://riddlearabia.com", JAKH_API_ORIGIN: API_ORIGIN,
        JAKH_MONITOR_RESULT_PATH: join(outputDir, "production-monitor.json") },
    });
    if (monitor.code) report.failedChecks.push("Production monitor"); else report.checksPassed++;
    await send("testing");
    for (const [name, command, args] of DAILY_CHECKS) {
      process.stdout.write(`\nMaintenance check: ${name}\n`);
      const result = await runCommand(command, args, { env: { ...safeChildEnv(env),
        JAKH_SITE_ROOT: join(root,"site-worker/dist"), JAKH_SITE_MANIFEST: join(root,"site-worker/generated/site-manifest.json") } });
      if (result.code) report.failedChecks.push(name); else report.checksPassed++;
      report.checksFailed = report.failedChecks.length;
      if (Date.now() - start.getTime() > 20 * 60_000) throw new Error("Daily inspection exceeded its 20-minute budget; no release was started.");
    }
    // A previous merged repair or a human change may still be unreleased.
    // A zero diff is not proof that production matches the current source.
    if (!report.changedFiles.length && !report.failedChecks.includes("Build site")) {
      const manifest = JSON.parse(await readFile(join(root,"site-worker/generated/site-manifest.json"),"utf8"));
      const live = await fetch("https://riddlearabia.com/admin", { redirect: "error", signal: AbortSignal.timeout(20_000) });
      if (!live.ok || live.headers.get("x-jakh-site-version") !== manifest.buildId) {
        report.failedChecks.push("Current source is not the verified live build; release needs attention");
        report.checksFailed = report.failedChecks.length;
      }
    }
    if (report.failedChecks.length) {
      await syncFindings(gh, report.failedChecks, ctx.runUrl);
      await send("needs_attention");
      return report;
    }
    await syncFindings(gh, [], ctx.runUrl);
    if (!report.changedFiles.length) { await send("no_changes"); return report; }

    // Only the generated, byte-for-byte reproducible bundle can reach a PR.
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
    if (!response.ok) throw new Error("Published admin page failed the final HTTP check.");
    const buildId = response.headers.get("x-jakh-site-version");
    const workerVersion = response.headers.get("x-jakh-worker-version");
    if (!/^[a-f0-9]{64}$/u.test(buildId || "") || !/^[a-f0-9-]{36}$/u.test(workerVersion || "")) throw new Error("Published build identity is missing.");
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAutopilot().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
