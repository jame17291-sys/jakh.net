import assert from "node:assert/strict";
import test from "node:test";
import { existingReleaseRun, mergeContext, releaseMergedMain, RELEASE_STAGES, STATIC_CONFIRMATION } from "./release-on-merge.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./autopilot-client.mjs";

const SHA = "a".repeat(40);
const NEWER = "b".repeat(40);
const PREFIX = `/repos/${REPOSITORY}`;

function env(overrides = {}) {
  return {
    GITHUB_REPOSITORY: REPOSITORY, GITHUB_REPOSITORY_ID: REPOSITORY_ID, GITHUB_REF: "refs/heads/main",
    GITHUB_REF_PROTECTED: "true", GITHUB_SHA: SHA, GITHUB_EVENT_NAME: "push", ...overrides,
  };
}

function fakeGitHub({ tip = SHA, protectedMain = true, staticRuns = [], apiRuns = [] } = {}) {
  const requests = [];
  const gh = async (path, options = {}) => {
    requests.push({ path, method: options.method || "GET" });
    if (path === `${PREFIX}/branches/main`) return { name: "main", protected: protectedMain, commit: { sha: tip } };
    if (path.startsWith(`${PREFIX}/actions/workflows/static-site.yml/runs?`)) return { workflow_runs: staticRuns };
    if (path.startsWith(`${PREFIX}/actions/workflows/api-deploy.yml/runs?`)) return { workflow_runs: apiRuns };
    throw new Error(`unexpected request ${path}`);
  };
  return { gh, requests };
}

function releaseRun(overrides = {}) {
  return { id: 7, head_sha: SHA, head_branch: "main", event: "workflow_dispatch", status: "completed",
    conclusion: "success", head_repository: { full_name: REPOSITORY }, html_url: "https://example.test/run/7", ...overrides };
}

function fakeDispatch(record) {
  return async (gh, options) => {
    record.push(options);
    return { id: 100 + record.length, html_url: `https://github.com/${REPOSITORY}/actions/runs/${100 + record.length}` };
  };
}

test("release on merge runs only for a push to this repository's protected main", () => {
  assert.deepEqual(mergeContext(env()), { sha: SHA, event: "push" });
  assert.deepEqual(mergeContext(env({ GITHUB_EVENT_NAME: "workflow_dispatch" })), { sha: SHA, event: "workflow_dispatch" });
  for (const bad of [
    { GITHUB_REF: "refs/heads/feature" }, { GITHUB_REF_PROTECTED: "false" }, { GITHUB_SHA: "short" },
    { GITHUB_EVENT_NAME: "pull_request" }, { GITHUB_EVENT_NAME: "schedule" }, { GITHUB_REPOSITORY: "someone/fork" },
  ]) assert.throws(() => mergeContext(env(bad)), /protected main/u, JSON.stringify(bad));
});

test("the merged commit is released with the checklist's exact inputs, API first and static site second", async () => {
  const { gh, requests } = fakeGitHub();
  const dispatched = [];
  const result = await releaseMergedMain(gh, { sha: SHA, dispatch: fakeDispatch(dispatched) });
  assert.equal(result.status, "released");
  assert.deepEqual(dispatched.map(({ workflow }) => workflow), ["api-deploy.yml", "static-site.yml"]);
  assert.deepEqual(dispatched[0].inputs, { release_phase: "compatibility", domain_cutover: "false" });
  assert.deepEqual(dispatched[1].inputs, { confirmation: STATIC_CONFIRMATION, domain_cutover: "false" });
  assert.ok(dispatched.every(({ ref, sha }) => ref === "main" && sha === SHA));
  assert.equal(RELEASE_STAGES.length, 2);
  // main is re-verified before every stage so a newer push cannot be released under this run's identity.
  assert.equal(requests.filter(({ path }) => path === `${PREFIX}/branches/main`).length, 3);
  // each stage checks its own workflow for an existing run of this commit before starting one.
  assert.equal(requests.filter(({ path }) => path.includes("/actions/workflows/api-deploy.yml/runs?")).length, 1);
  assert.equal(requests.filter(({ path }) => path.includes("/actions/workflows/static-site.yml/runs?")).length, 1);
  assert.ok(requests.every(({ method }) => method === "GET"), "the script itself only reads; workflows are started by the dispatcher");
});

test("a commit that is no longer the tip of main is superseded, not released", async () => {
  const { gh } = fakeGitHub({ tip: NEWER });
  const dispatched = [];
  const result = await releaseMergedMain(gh, { sha: SHA, dispatch: fakeDispatch(dispatched) });
  assert.equal(result.status, "superseded");
  assert.deepEqual(dispatched, []);
});

test("an unprotected main is refused", async () => {
  const { gh } = fakeGitHub({ protectedMain: false });
  await assert.rejects(releaseMergedMain(gh, { sha: SHA, dispatch: fakeDispatch([]) }), /Protected main/u);
});

test("an existing or running static release for the same commit is not repeated", async () => {
  const run = releaseRun;
  assert.equal(existingReleaseRun([run({})], SHA)?.id, 7);
  assert.equal(existingReleaseRun([run({ status: "in_progress", conclusion: null })], SHA)?.id, 7);
  assert.equal(existingReleaseRun([run({ status: "queued", conclusion: null })], SHA)?.id, 7);
  for (const overrides of [
    { conclusion: "failure" }, { conclusion: "cancelled" }, { head_sha: NEWER }, { head_branch: "release" },
    { event: "push" }, { head_repository: { full_name: "someone/fork" } },
  ]) assert.equal(existingReleaseRun([run(overrides)], SHA), null, JSON.stringify(overrides));

  const completed = fakeGitHub({ apiRuns: [run({ id: 5 })], staticRuns: [run({})] });
  const dispatched = [];
  const result = await releaseMergedMain(completed.gh, { sha: SHA, dispatch: fakeDispatch(dispatched) });
  assert.equal(result.status, "already-released");
  assert.deepEqual(dispatched, []);

  const running = fakeGitHub({ apiRuns: [run({ id: 5 })], staticRuns: [run({ status: "in_progress", conclusion: null })] });
  const stillRunning = await releaseMergedMain(running.gh, { sha: SHA, dispatch: fakeDispatch(dispatched) });
  assert.equal(stillRunning.status, "in-progress-elsewhere");
  assert.deepEqual(dispatched, []);
});

test("a finished API release is reused so a failed static stage is retried on its own", async () => {
  const { gh } = fakeGitHub({ apiRuns: [releaseRun({ id: 5 })], staticRuns: [releaseRun({ id: 6, conclusion: "failure" })] });
  const dispatched = [];
  const result = await releaseMergedMain(gh, { sha: SHA, dispatch: fakeDispatch(dispatched) });
  assert.equal(result.status, "released");
  assert.deepEqual(dispatched.map(({ workflow }) => workflow), ["static-site.yml"]);
  assert.deepEqual(result.runs.map(({ workflow, reused }) => [workflow, reused === true]), [["api-deploy.yml", true], ["static-site.yml", false]]);
});

test("an API release already running by hand is left alone and the static site is not started", async () => {
  const { gh } = fakeGitHub({ apiRuns: [releaseRun({ id: 5, status: "in_progress", conclusion: null })] });
  const dispatched = [];
  const result = await releaseMergedMain(gh, { sha: SHA, dispatch: fakeDispatch(dispatched) });
  assert.equal(result.status, "in-progress-elsewhere");
  assert.deepEqual(dispatched, []);
});

test("a failed API release stops before the static site is touched", async () => {
  const { gh } = fakeGitHub();
  const dispatched = [];
  const dispatch = async (client, options) => {
    dispatched.push(options.workflow);
    if (options.workflow === "api-deploy.yml") throw new Error("api-deploy.yml run 55 ended with failure.");
    return { id: 56 };
  };
  await assert.rejects(releaseMergedMain(gh, { sha: SHA, dispatch }), /api-deploy\.yml run 55/u);
  assert.deepEqual(dispatched, ["api-deploy.yml"]);
});

test("the release stages are frozen so nothing can rewrite the inputs at run time", () => {
  assert.ok(Object.isFrozen(RELEASE_STAGES));
  assert.ok(RELEASE_STAGES.every((stage) => Object.isFrozen(stage.inputs)));
  assert.ok(RELEASE_STAGES.every((stage) => stage.inputs.domain_cutover === "false"));
});
