import assert from "node:assert/strict";
import test from "node:test";
import { existingReleaseRun, isDispatchServerError, isTransientReadError, mergeContext, releaseMergedMain, RELEASE_STAGES, STATIC_CONFIRMATION, waitForRun, withReadRetries } from "./release-on-merge.mjs";
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

test("transient GitHub read failures are retried; policy errors and writes are not", async () => {
  assert.ok(isTransientReadError(new Error("fetch failed")));
  assert.ok(isTransientReadError(Object.assign(new Error("GitHub GET x: HTTP 502"), { status: 502 })));
  assert.ok(isTransientReadError(Object.assign(new Error("GitHub GET x: HTTP 429"), { status: 429 })));
  assert.equal(isTransientReadError(Object.assign(new Error("GitHub GET x: HTTP 404"), { status: 404 })), false);
  assert.equal(isTransientReadError(new Error("GitHub requests are restricted to the Riddle Arabia repository.")), false);

  let calls = 0;
  const flaky = async (path, options = {}) => {
    calls++;
    if ((options.method || "GET") === "POST") throw new Error("fetch failed");
    if (calls < 3) throw new Error("fetch failed");
    return { ok: true, path };
  };
  const waits = [];
  const gh = withReadRetries(flaky, { delays: [1, 2, 3], wait: async (ms) => { waits.push(ms); } });
  assert.deepEqual(await gh("/repos/x/branches/main"), { ok: true, path: "/repos/x/branches/main" });
  assert.deepEqual(waits, [1, 2]);
  // writes pass straight through and are never repeated
  calls = 0;
  await assert.rejects(gh("/repos/x/actions/workflows/a.yml/dispatches", { method: "POST", body: {} }), /fetch failed/u);
  assert.equal(calls, 1);
  // retries are bounded
  const alwaysDown = withReadRetries(async () => { throw new Error("fetch failed"); }, { delays: [1, 1], wait: async () => {} });
  await assert.rejects(alwaysDown("/repos/x/branches/main"), /fetch failed/u);
});

function serverError(workflow) {
  return Object.assign(new Error(`GitHub POST /repos/${REPOSITORY}/actions/workflows/${workflow}/dispatches: HTTP 500`), { status: 500 });
}

test("a 5xx on dispatch adopts the run if it started anyway, and dispatches once more if it did not", async () => {
  assert.ok(isDispatchServerError(serverError("api-deploy.yml")));
  assert.equal(isDispatchServerError(Object.assign(new Error("GitHub GET /x: HTTP 500"), { status: 500 })), false, "only dispatches qualify");
  assert.equal(isDispatchServerError(Object.assign(new Error(`GitHub POST /x/dispatches: HTTP 422`), { status: 422 })), false);

  // Case 1: the run appeared despite the 500. The API stage adopts it; static is dispatched normally.
  let apiRuns = [];
  const appeared = fakeGitHub({ apiRuns: [] });
  const ghAdopt = async (path, options) => {
    if (path === `${PREFIX}/actions/runs/77`) return releaseRun({ id: 77, status: "completed", conclusion: "success", html_url: "https://example.test/run/77" });
    if (path.startsWith(`${PREFIX}/actions/workflows/api-deploy.yml/runs?`)) return { workflow_runs: apiRuns };
    return appeared.gh(path, options);
  };
  const dispatched = [];
  const dispatch = async (client, options) => {
    dispatched.push(options.workflow);
    if (options.workflow === "api-deploy.yml") { apiRuns = [releaseRun({ id: 77, status: "in_progress", conclusion: null })]; throw serverError("api-deploy.yml"); }
    return { id: 78, html_url: "https://example.test/run/78" };
  };
  const waits = [];
  const result = await releaseMergedMain(ghAdopt, { sha: SHA, dispatch, wait: async (ms) => { waits.push(ms); } });
  assert.equal(result.status, "released");
  assert.deepEqual(dispatched, ["api-deploy.yml", "static-site.yml"], "the API deploy is not dispatched twice");
  assert.deepEqual(result.runs.map(({ workflow, id }) => [workflow, id]), [["api-deploy.yml", 77], ["static-site.yml", 78]]);
  assert.deepEqual(waits, [60_000]);

  // Case 2: nothing appeared. One more dispatch, which succeeds.
  const { gh } = fakeGitHub();
  const attempts = [];
  const flaky = async (client, options) => {
    attempts.push(options.workflow);
    if (options.workflow === "api-deploy.yml" && attempts.filter((w) => w === "api-deploy.yml").length === 1) throw serverError("api-deploy.yml");
    return { id: 90 + attempts.length };
  };
  const retried = await releaseMergedMain(gh, { sha: SHA, dispatch: flaky, wait: async () => {} });
  assert.equal(retried.status, "released");
  assert.deepEqual(attempts, ["api-deploy.yml", "api-deploy.yml", "static-site.yml"]);

  // Case 3: a second 5xx fails the release; other errors are never retried.
  const twice = async (client, options) => { throw serverError(options.workflow); };
  await assert.rejects(releaseMergedMain(gh, { sha: SHA, dispatch: twice, wait: async () => {} }), /HTTP 500/u);
  const plain = [];
  const other = async (client, options) => { plain.push(options.workflow); throw new Error("api-deploy.yml run 5 ended with failure."); };
  await assert.rejects(releaseMergedMain(gh, { sha: SHA, dispatch: other, wait: async () => {} }), /ended with failure/u);
  assert.deepEqual(plain, ["api-deploy.yml"]);
});

test("waitForRun follows one adopted run to completion and refuses an identity change", async () => {
  const states = ["queued", "in_progress", "completed"];
  let i = 0;
  const gh = async () => releaseRun({ id: 5, status: states[Math.min(i++, 2)], conclusion: i > 2 ? "success" : null });
  const run = await waitForRun(gh, { runId: 5, sha: SHA, timeoutMs: 60_000, wait: async () => {} });
  assert.equal(run.status, "completed");
  await assert.rejects(waitForRun(async () => releaseRun({ id: 5, head_sha: NEWER }), { runId: 5, sha: SHA, timeoutMs: 60_000, wait: async () => {} }), /identity changed/u);
  await assert.rejects(waitForRun(async () => releaseRun({ id: 5, conclusion: "failure" }), { runId: 5, sha: SHA, timeoutMs: 60_000, wait: async () => {} }), /ended with failure/u);
  let t = 0;
  await assert.rejects(waitForRun(async () => releaseRun({ id: 5, status: "in_progress", conclusion: null }), { runId: 5, sha: SHA, timeoutMs: 25_000, now: () => (t += 10_000), wait: async () => {} }), /did not finish/u);
});
