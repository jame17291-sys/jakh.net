#!/usr/bin/env node

// Releases the merged tip of protected main without any typed inputs.
//
// A push to main (normally a merged pull request) starts this script. It
// dispatches the existing protected release workflows in their required order
// (API deploy, then Static site) for the exact commit that was pushed, with
// the same inputs the deployment checklist prescribes for a Riddle Arabia
// release. The two release workflows themselves are unchanged: every
// authorization, build, proof, environment approval, rollback and receipt step
// still runs inside them, and the monitors still see ordinary
// workflow_dispatch release runs for protected main.
//
// The script never deploys anything itself, never touches Cloudflare and holds
// only the ephemeral workflow token, which can start workflows but cannot
// approve a protected deployment environment.

import { pathToFileURL } from "node:url";
import { assertMain, githubClient, REPOSITORY, SHA } from "./autopilot-client.mjs";
import { dispatchAndWait } from "./site-autopilot.mjs";

const PREFIX = `/repos/${REPOSITORY}`;
export const STATIC_CONFIRMATION = "DEPLOY riddlearabia.com FROM protected main";
export const RELEASE_STAGES = Object.freeze([
  { workflow: "api-deploy.yml", inputs: Object.freeze({ release_phase: "compatibility", domain_cutover: "false" }), timeoutMs: 170 * 60_000 },
  { workflow: "static-site.yml", inputs: Object.freeze({ confirmation: STATIC_CONFIRMATION, domain_cutover: "false" }), timeoutMs: 170 * 60_000 },
]);

// The watcher polls GitHub for up to a few hours while the release workflows
// (and their environment approvals) run. A single dropped connection must not
// abandon a release that is still proceeding, so read requests are retried
// with a short backoff. Only reads are retried: a dispatch is never repeated,
// because a repeated POST could start a second release run.
export const READ_RETRY_DELAYS_MS = Object.freeze([5_000, 15_000, 45_000, 90_000, 180_000]);

export function isTransientReadError(error) {
  if (!error) return false;
  if (typeof error.status === "number") return error.status === 429 || error.status >= 500;
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket|timeout|aborted|network/iu.test(error.message || "");
}

export function withReadRetries(gh, { delays = READ_RETRY_DELAYS_MS, wait = (ms) => new Promise((done) => setTimeout(done, ms)), log = () => {} } = {}) {
  return async (path, options = {}) => {
    const method = options.method || "GET";
    if (method !== "GET") return gh(path, options);
    for (let attempt = 0; ; attempt++) {
      try {
        return await gh(path, options);
      } catch (error) {
        if (attempt >= delays.length || !isTransientReadError(error)) throw error;
        log(`GitHub read failed (${error.message}); retrying in ${Math.round(delays[attempt] / 1000)}s.`);
        await wait(delays[attempt]);
      }
    }
  };
}

export function mergeContext(env = process.env) {
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_REF_PROTECTED !== "true"
    || !SHA.test(env.GITHUB_SHA || "") || !["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)) {
    throw new Error("Release on merge runs only for a push to this repository's protected main branch.");
  }
  return { sha: env.GITHUB_SHA, event: env.GITHUB_EVENT_NAME };
}

// A release stage for this exact commit may already exist: the owner may have
// started it by hand, a re-run of this workflow must not start a second release
// for the same tree, and a failed static stage should be retried without a
// second API deploy. (The daily maintenance merges with the built-in Actions
// token, so its merges never start this workflow in the first place.)
export function existingReleaseRun(runs, sha) {
  return (runs || []).find((run) => run.head_sha === sha && run.head_branch === "main" && run.event === "workflow_dispatch"
    && run.head_repository?.full_name === REPOSITORY
    && (run.status !== "completed" || run.conclusion === "success")) || null;
}

// GitHub occasionally answers a workflow dispatch with a 5xx after creating the
// run (the 8 Nov release lost its API stage to an HTTP 500). A blind retry could
// start a second release, so the stage is re-evaluated instead: wait, look for a
// run of this commit that appeared since the attempt and adopt it, and only
// dispatch again when nothing appeared. One retry; a second 5xx fails the release.
export const DISPATCH_RETRY_DELAY_MS = 60_000;

export function isDispatchServerError(error) {
  return typeof error?.status === "number" && error.status >= 500 && /\/dispatches: HTTP 5\d\d/u.test(error.message || "");
}

export async function waitForRun(gh, { runId, sha, timeoutMs, now = Date.now, wait = (ms) => new Promise((done) => setTimeout(done, ms)) }) {
  const started = now();
  while (now() - started < timeoutMs) {
    const run = await gh(`${PREFIX}/actions/runs/${runId}`);
    if (run.id !== runId || run.head_sha !== sha || run.head_branch !== "main" || run.event !== "workflow_dispatch"
      || run.head_repository?.full_name !== REPOSITORY) throw new Error("Adopted workflow run identity changed.");
    if (run.status === "completed") {
      if (run.conclusion !== "success") throw new Error(`run ${run.id} ended with ${run.conclusion}.`);
      return run;
    }
    await wait(10_000);
  }
  throw new Error(`run ${runId} did not finish within the release budget. Its status remains available in GitHub.`);
}

export async function releaseMergedMain(gh, { sha, log = () => {}, dispatch = dispatchAndWait, stages = RELEASE_STAGES,
  wait = (ms) => new Promise((done) => setTimeout(done, ms)), waitRun = waitForRun }) {
  const branch = await gh(`${PREFIX}/branches/main`);
  if (branch?.commit?.sha !== sha) {
    log(`Commit ${sha} is no longer the tip of main (${branch?.commit?.sha || "unknown"}); the newer push releases instead.`);
    return { status: "superseded", sha };
  }
  assertMain(branch, sha);

  const runs = [];
  for (const stage of stages) {
    assertMain(await gh(`${PREFIX}/branches/main`), sha);
    const listing = await gh(`${PREFIX}/actions/workflows/${stage.workflow}/runs?branch=main&event=workflow_dispatch&per_page=30`);
    const existing = existingReleaseRun(listing.workflow_runs, sha);
    if (existing?.status === "completed") {
      log(`${stage.workflow} already succeeded for ${sha} (run ${existing.id}); not repeating it.`);
      runs.push({ workflow: stage.workflow, id: existing.id, url: existing.html_url, reused: true });
      continue;
    }
    if (existing) {
      log(`${stage.workflow} is already ${existing.status} for ${sha} (run ${existing.id}), started outside this workflow; leaving it to finish.`);
      return { status: "in-progress-elsewhere", sha, runs, runId: existing.id };
    }
    const knownIds = new Set((listing.workflow_runs || []).map((run) => run.id));
    let run;
    for (let attempt = 0; !run; attempt++) {
      log(`Starting ${stage.workflow} for ${sha}. If the production environment asks for approval, approve it in the Actions tab.`);
      try {
        run = await dispatch(gh, { workflow: stage.workflow, ref: "main", sha, inputs: stage.inputs, timeoutMs: stage.timeoutMs });
      } catch (error) {
        if (!isDispatchServerError(error) || attempt >= 1) throw error;
        log(`GitHub answered the dispatch with ${error.message}; checking whether the run started anyway.`);
        await wait(DISPATCH_RETRY_DELAY_MS);
        const after = await gh(`${PREFIX}/actions/workflows/${stage.workflow}/runs?branch=main&event=workflow_dispatch&per_page=30`);
        const appeared = existingReleaseRun((after.workflow_runs || []).filter((candidate) => !knownIds.has(candidate.id)), sha);
        if (appeared) {
          log(`${stage.workflow} run ${appeared.id} did start; waiting for it instead of dispatching again.`);
          run = await waitRun(gh, { runId: appeared.id, sha, timeoutMs: stage.timeoutMs });
        }
      }
    }
    log(`${stage.workflow} finished: ${run.html_url || run.id}`);
    runs.push({ workflow: stage.workflow, id: run.id, url: run.html_url });
  }
  return { status: runs.every((run) => run.reused) ? "already-released" : "released", sha, runs };
}

async function main(env = process.env) {
  const { sha } = mergeContext(env);
  const log = (message) => process.stdout.write(`${message}\n`);
  const gh = withReadRetries(githubClient(env), { log });
  const result = await releaseMergedMain(gh, { sha, log });
  process.stdout.write(`::notice title=Release on merge::${result.status} for ${sha}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; })
    .catch((error) => { process.stdout.write(`::error title=Release on merge failed::${error.message}\n`); process.exitCode = 1; });
}
