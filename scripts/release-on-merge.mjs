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

export async function releaseMergedMain(gh, { sha, log = () => {}, dispatch = dispatchAndWait, stages = RELEASE_STAGES }) {
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
    log(`Starting ${stage.workflow} for ${sha}. If the production environment asks for approval, approve it in the Actions tab.`);
    const run = await dispatch(gh, { workflow: stage.workflow, ref: "main", sha, inputs: stage.inputs, timeoutMs: stage.timeoutMs });
    log(`${stage.workflow} finished: ${run.html_url || run.id}`);
    runs.push({ workflow: stage.workflow, id: run.id, url: run.html_url });
  }
  return { status: runs.every((run) => run.reused) ? "already-released" : "released", sha, runs };
}

async function main(env = process.env) {
  const { sha } = mergeContext(env);
  const gh = githubClient(env);
  const result = await releaseMergedMain(gh, { sha, log: (message) => process.stdout.write(`${message}\n`) });
  process.stdout.write(`::notice title=Release on merge::${result.status} for ${sha}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; })
    .catch((error) => { process.stdout.write(`::error title=Release on merge failed::${error.message}\n`); process.exitCode = 1; });
}
