import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { artifactNamesFor, DIAGNOSTIC_CODES, inspectReceipts, monitorDeployment, parseOptions, REPOSITORY, reportExitCode, validateRunMetadata } from "./deployment-receipt-monitor.mjs";
import { buildPreflight as apiPreflight, buildPostCompatibility, buildPostMigration, buildPostDeploy as apiPostDeploy, applyRuntimeProof as apiRuntimeProof, finalizeReceipt as finalizeApi } from "./api-release-receipt.mjs";
import { buildPreflight as sitePreflight, buildPostDeploy, applyRuntimeProof as siteRuntimeProof, finalizeReceipt as finalizeSite, smokeDefinitions } from "./site-release-receipt.mjs";
import { CONTENT_PUBLICATION_CONTRACT, PRIMARY_API_ORIGIN, PRIMARY_SITE_ORIGIN, QUARANTINED_SITE_ROUTES } from "./monitor-production.mjs";
import { verifyStaticApiRelease } from "./static-api-release-gate.mjs";
import { RETIRED_SEO_ROUTE_REDIRECTS } from "../site-worker/src/seo-route-migrations.js";

const SHA = "a".repeat(40);
const RUN_ID = "12345";
const OLD = "11111111-1111-4111-8111-111111111111";
const NEW = "22222222-2222-4222-8222-222222222222";
const BUILD = "b".repeat(64);
function metadata(workflow = "maintenance", overrides = {}) {
  return { id: Number(RUN_ID), run_attempt: 1, head_sha: SHA, head_branch: "main", status: "completed", conclusion: "success", event: workflow === "maintenance" ? "schedule" : "workflow_dispatch",
    name: "Daily maintenance · custom run name", repository: { full_name: REPOSITORY }, head_repository: { full_name: REPOSITORY },
    path: `.github/workflows/${{ maintenance: "site-autopilot", api: "api-deploy", site: "static-site" }[workflow]}.yml`, ...overrides };
}
function daily(overrides = {}) {
  return { version: 1, runId: RUN_ID, runAttempt: "1", sourceSha: SHA, status: "no_changes", releaseMode: "inspection_only", checksPassed: 10, checksFailed: 0, changedFiles: [], failedChecks: [], ...overrides };
}
async function fixture(t, values) {
  const directory = await mkdtemp(join(await realpath(tmpdir()), "deployment-monitor-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [name, value] of Object.entries(values)) {
    const path = join(directory, name); await mkdir(dirname(path), { recursive: true });
    await writeFile(path, typeof value === "string" ? value : JSON.stringify(value));
  }
  return directory;
}
function deployment(version, message) {
  return { id: `deployment-${version}`, versions: [{ version_id: version, percentage: 100 }], annotations: { "workers/message": message } };
}
function health(version = NEW) {
  return { ok: true, service: "jakh-api", version: "1.5.0", schema: "10", targetSchema: "10", compatibleSchemas: ["9", "10"], workerVersionId: version,
    features: { registration: true, accountRecovery: true, accountDeletion: true, contentStudio: true, adminMfa: true }, contentPublication: CONTENT_PUBLICATION_CONTRACT };
}
function monitor(scope) {
  const names = scope === "api" ? ["API: health and allowed CORS", "API quarantine: held leaderboard category", "API quarantine: held Battle category"]
    : ["Site: catalog data", "Site: public card index", "Site: en public search index", "Site: ar public search index", ...QUARANTINED_SITE_ROUTES.map(route => `Site quarantine: ${route.name}`)];
  return { schemaVersion: 1, status: "success", failedChecks: 0, failures: [], contentPublicationContract: CONTENT_PUBLICATION_CONTRACT,
    monitor: { scope, siteContract: "current", allowCompatibleSchema: scope === "api", siteOrigin: PRIMARY_SITE_ORIGIN, apiOrigin: PRIMARY_API_ORIGIN },
    results: names.map(name => ({ name, status: name.startsWith("Site quarantine:") ? 410 : 200, workerVersionId: NEW })) };
}
const environment = { GITHUB_REPOSITORY: REPOSITORY, GITHUB_SHA: SHA, GITHUB_REF: "refs/heads/main", GITHUB_RUN_ID: RUN_ID, GITHUB_RUN_ATTEMPT: "1" };
function validApiFiles() {
  const source = { service: "jakh-api", version: "1.5.0", schema: "10", compatibleSchemas: ["9", "10"], migrations: [] };
  const database = [{ success: true, results: [{ value: "10" }] }];
  const migrations = "No migrations to apply!";
  const preflight = apiPreflight({ phase: "compatibility", source, deployment: deployment(OLD, "previous"), health: health(OLD), databaseResult: database, migrationList: migrations, environment });
  assert.deepEqual(preflight.errors, []);
  const candidate = deployment(NEW, `JAKH final ${SHA} schema 10 run ${RUN_ID}`);
  const receipt = preflight.receipt;
  receipt.safety.rollbackProof = { safe: true };
  assert.deepEqual(buildPostCompatibility({ receipt, deployment: candidate, health: health(), httpStatus: "200", databaseResult: database, migrationList: migrations }).errors, []);
  const runtime = monitor("api");
  assert.equal(apiRuntimeProof({ receipt, stage: "candidate", deploymentBefore: candidate, deploymentAfter: candidate, monitorReport: runtime, allowCompatibleSchema: true }).proof.safe, true);
  finalizeApi(receipt, { preflight: "success", rollbackProof: "success", compatibilityDeploy: "success", productionVerification: "success" });
  return { "release-receipt.json": receipt, "runtime-monitor.json": runtime, "worker-after-compatibility.json": candidate,
    "worker-after-runtime-monitor.json": candidate, "health-after-compatibility.json": health(), "database-after-compatibility.json": database, "migrations-after-compatibility.txt": migrations };
}
function validFinalApiFiles() {
  const source = { service: "jakh-api", version: "1.5.0", schema: "10", compatibleSchemas: ["9", "10"], migrations: [] };
  const previous = deployment(OLD, `JAKH compatibility ${SHA} target schema 10 run 98765`);
  const beforeHealth = { ...health(OLD), schema: "9", features: { ...health(OLD).features, adminMfa: false } };
  const databaseBefore = [{ success: true, results: [{ value: "9" }] }];
  const databaseAfter = [{ success: true, results: [{ value: "10" }] }];
  const migrations = "No migrations to apply!";
  const preflight = apiPreflight({ phase: "migrate-final", source, deployment: previous, health: beforeHealth,
    databaseResult: databaseBefore, migrationList: "0010_admin_mfa.sql", environment });
  assert.deepEqual(preflight.errors, []);
  const receipt = preflight.receipt;
  assert.deepEqual(buildPostMigration({ receipt, deployment: previous, health: health(OLD), httpStatus: "200", databaseResult: databaseAfter, migrationList: migrations }).errors, []);
  const candidate = deployment(NEW, `JAKH final ${SHA} schema 10 run ${RUN_ID}`);
  assert.deepEqual(apiPostDeploy({ receipt, deployment: candidate, health: health(), httpStatus: "200", databaseResult: databaseAfter, migrationList: migrations }).errors, []);
  const runtime = monitor("api"); runtime.monitor.allowCompatibleSchema = false;
  assert.equal(apiRuntimeProof({ receipt, stage: "candidate", deploymentBefore: candidate, deploymentAfter: candidate, monitorReport: runtime, allowCompatibleSchema: false }).proof.safe, true);
  finalizeApi(receipt, { preflight: "success", rollbackProof: "success", migrationAuthorization: "success", migrations: "success",
    migrationCompatibility: "success", migrationQuarantineProof: "success", finalDeploy: "success", productionVerification: "success" });
  return { "release-receipt.json": receipt, "runtime-monitor.json": runtime, "worker-after-worker.json": candidate,
    "worker-after-runtime-monitor.json": candidate, "health-after-worker.json": health(), "database-after-worker.json": databaseAfter, "migrations-after-worker.txt": migrations };
}
function smoke(buildId = BUILD, version = NEW) {
  return { ok: true, errors: [], observedBuildId: buildId, observedWorkerVersionId: version,
    probes: smokeDefinitions("fixture-token").map(definition => ({ name: definition.name, url: definition.url, status: definition.status,
      headers: { "strict-transport-security": "max-age=31536000", "content-security-policy": "frame-ancestors 'none'", "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin", "permissions-policy": "camera=()", "x-frame-options": "DENY",
        "x-jakh-site-version": buildId, "x-jakh-worker-version": version,
        "cache-control": definition.name === "not-found" ? "no-store" : definition.cache?.test("public, max-age=86400")
          ? "public, max-age=86400" : "public, max-age=0, must-revalidate", ...(definition.location ? { location: definition.location } : {}) } })) };
}
function validSiteFiles() {
  const routes = { "/": "index.html", "/__404__": "404.html", ...Object.fromEntries(RETIRED_SEO_ROUTE_REDIRECTS.map(({ to }) => [to, "route.html"])) };
  const manifest = { service: "jakh-site", buildId: BUILD, fileCount: 1, totalBytes: 1, files: { "index.html": {} }, routes, aliases: {} };
  const preflight = sitePreflight({ manifest, deployment: deployment(OLD, "previous"), baselineSmoke: smoke("c".repeat(64), OLD), environment });
  assert.deepEqual(preflight.errors, []);
  const candidate = deployment(NEW, `JAKH site ${SHA} build ${BUILD} run ${RUN_ID}`);
  const receipt = preflight.receipt;
  assert.deepEqual(buildPostDeploy({ receipt, deployment: candidate, smoke: smoke() }).errors, []);
  const runtime = monitor("site");
  assert.equal(siteRuntimeProof({ receipt, stage: "candidate", deploymentBefore: candidate, deploymentAfter: candidate, monitorReport: runtime }).proof.safe, true);
  finalizeSite(receipt, { preflight: "success", rollbackProof: "success", deploy: "success", smoke: "success", verification: "success" });
  const apiDeployment = deployment(NEW, `JAKH final ${SHA} schema 10 run 56789`);
  const gate = verifyStaticApiRelease({ deployment: apiDeployment, health: health(), httpStatus: "200", expectedCommit: SHA });
  assert.deepEqual(gate.errors, []);
  const files = { "release-receipt.json": receipt, "runtime-monitor.json": runtime, "deployment-after.json": candidate, "deployment-after-runtime-monitor.json": candidate };
  for (const stage of ["before", "after"]) {
    files[`api-deployment-${stage}-static.json`] = apiDeployment;
    files[`api-health-${stage}-static.json`] = health();
    files[`api-gate-${stage}-static.json`] = { result: "verified", ...gate.evidence };
  }
  return files;
}

test("argument parsing uses literal paths and rejects shell-shaped IDs, duplicate and unknown options", () => {
  const options = parseOptions(["--run-id=12345", "--receipts-dir", "/private/tmp/receipts with spaces", "--run-metadata=/private/tmp/meta.json", "--output", "/private/tmp/report $(touch x).json", "--verbose"]);
  assert.equal(options["run-id"], RUN_ID);
  assert.equal(options.output, "/private/tmp/report $(touch x).json");
  for (const args of [["--run-id=123;whoami"], ["--run-id=1", "--run-id=2"], ["--unsupported"], ["--output"], ["--receipts-dir=/private/tmp/r"], ["--run-id=0"], ["--run-id=9007199254740992"]]) assert.throws(() => parseOptions(args));
});

test("metadata requires exact repo, main, completed approved workflow and safe source/event/attempt", () => {
  assert.equal(validateRunMetadata(metadata(), RUN_ID).workflow, "maintenance");
  for (const changes of [{ repository: { full_name: "attacker/repo" } }, { head_repository: { full_name: "attacker/repo" } }, { head_branch: "feature/x" }, { head_sha: "abc123" }, { status: "queued" }, { event: "pull_request" }, { path: ".github/workflows/evil.yml" }, { run_attempt: 0 }]) assert.throws(() => validateRunMetadata(metadata("maintenance", changes), RUN_ID));
});

test("artifact selection binds attempt and allows the legacy name only for attempt one", () => {
  assert.deepEqual(artifactNamesFor(validateRunMetadata(metadata(), RUN_ID)), [`autopilot-${RUN_ID}-1`, `autopilot-${RUN_ID}`]);
  assert.deepEqual(artifactNamesFor(validateRunMetadata(metadata("maintenance", { run_attempt: 2 }), RUN_ID)), [`autopilot-${RUN_ID}-2`]);
});

test("nested actual maintenance receipt is inspected without claiming smoke or deployment proof", async t => {
  const directory = await fixture(t, { "autopilot-12345/daily-report.json": daily(), "autopilot-12345/repair-plan.json": { message: "@everyone <script>" } });
  const report = await inspectReceipts({ directory, run: metadata(), runId: RUN_ID });
  assert.equal(report.status, "inspected"); assert.equal(reportExitCode(report), 0);
  assert.equal(report.summary.smokeTestPassed, null); assert.equal(report.summary.workerVersion, null);
  assert.ok(!JSON.stringify(report).includes("@everyone"));
});

test("legacy receipt is accepted for first attempt and rejected on a rerun", async t => {
  const receipt = daily(); delete receipt.runAttempt;
  const directory = await fixture(t, { "daily-report.json": receipt });
  const first = await inspectReceipts({ directory, run: metadata(), runId: RUN_ID });
  assert.equal(first.status, "inspected"); assert.ok(first.diagnostics.includes("legacy_attempt_one_receipt"));
  const rerun = await inspectReceipts({ directory, run: metadata("maintenance", { run_attempt: 2 }), runId: RUN_ID });
  assert.equal(rerun.status, "unknown"); assert.ok(rerun.diagnostics.includes("foreign_receipt_attempt"));
});

test("maintenance outcomes remain distinct and fail closed", async t => {
  for (const [overrides, status, exit] of [
    [{ status: "needs_attention", checksFailed: 1, failedChecks: ["secret message"] }, "needs_attention", 1],
    [{ status: "failed", checksFailed: 1, failedChecks: ["secret message"] }, "failed", 1],
    [{ status: "paused" }, "paused", 2],
    [{ status: "deployed", releaseMode: "automatic", changedFiles: ["index.html"], candidateSha: SHA, deploymentRunId: "9999" }, "deployment_reported", 2],
    [{ status: "inspecting" }, "unknown", 1],
    [{ checksFailed: 1, failedChecks: ["unreported failure"] }, "unknown", 1],
    [{ changedFiles: ["unexpected.html"] }, "unknown", 1],
    [{ sourceSha: "f".repeat(40) }, "unknown", 1],
    [{ checksPassed: 0 }, "unknown", 1],
  ]) {
    const directory = await fixture(t, { "daily-report.json": daily(overrides) });
    const report = await inspectReceipts({ directory, run: metadata(), runId: RUN_ID });
    assert.equal(report.status, status); assert.equal(reportExitCode(report), exit);
    assert.ok(!JSON.stringify(report).includes("secret message"));
  }
});

test("a successful receipt cannot override a failed workflow conclusion", async t => {
  const directory = await fixture(t, { "daily-report.json": daily() });
  const report = await inspectReceipts({ directory, run: metadata("maintenance", { conclusion: "failure" }), runId: RUN_ID });
  assert.equal(report.status, "failed"); assert.equal(reportExitCode(report), 1);
});

test("missing, malformed, duplicate, symlink, and excessive depth evidence remain unknown", async t => {
  for (const files of [{}, { "daily-report.json": "{" }, { "daily-report.json": daily(), "other/daily-report.json": daily() }, { [`${"deep/".repeat(11)}daily-report.json`]: daily() }]) {
    const directory = await fixture(t, files);
    assert.equal((await inspectReceipts({ directory, run: metadata(), runId: RUN_ID })).status, "unknown");
  }
  const directory = await fixture(t, { "daily-report.json": daily() });
  await symlink(join(directory, "daily-report.json"), join(directory, "linked.json"));
  const report = await inspectReceipts({ directory, run: metadata(), runId: RUN_ID });
  assert.deepEqual(report.diagnostics, ["unsafe_symlink"]);
});

test("actual API validator-produced receipt and quarantine runtime proof pass", async t => {
  const directory = await fixture(t, validApiFiles());
  const report = await inspectReceipts({ directory, run: metadata("api"), runId: RUN_ID });
  assert.equal(report.status, "verified", JSON.stringify(report)); assert.equal(report.summary.workerVersion, NEW);
  assert.equal(report.summary.smokeTestPassed, true); assert.equal(reportExitCode(report), 0);
});

test("API result strings cannot replace health, annotation, migration, and runtime proof", async t => {
  for (const mutate of [files => { files["health-after-compatibility.json"].ok = false; },
    files => { files["worker-after-compatibility.json"].annotations["workers/message"] = "JAKH final wrong-source"; },
    files => { files["migrations-after-compatibility.txt"] = "Migrations pending"; },
    files => { files["runtime-monitor.json"].results.pop(); },
    files => { files["release-receipt.json"].release.runAttempt = "2"; },
  ]) {
    const files = validApiFiles(); mutate(files);
    const directory = await fixture(t, files);
    assert.equal((await inspectReceipts({ directory, run: metadata("api"), runId: RUN_ID })).status, "unknown");
  }
});

test("migrate-final validator-produced receipt requires final authorization gates and strict runtime mode", async t => {
  const files = validFinalApiFiles();
  const directory = await fixture(t, files);
  const report = await inspectReceipts({ directory, run: metadata("api"), runId: RUN_ID });
  assert.equal(report.status, "verified", JSON.stringify(report));
  for (const mutate of [values => { values["release-receipt.json"].workflowSteps.migrationAuthorization = "skipped"; },
    values => { values["runtime-monitor.json"].monitor.allowCompatibleSchema = true; },
    values => { values["database-after-worker.json"][0].results[0].value = "9"; },
  ]) {
    const values = validFinalApiFiles(); mutate(values);
    const invalid = await fixture(t, values);
    assert.equal((await inspectReceipts({ directory: invalid, run: metadata("api"), runId: RUN_ID })).status, "unknown");
  }
});

test("actual site validator-produced receipt, full smoke, runtime and matching API proof pass", async t => {
  const files = validSiteFiles();
  const directory = await fixture(t, Object.fromEntries(Object.entries(files).map(([name, value]) => [`jakh-site-release/${name}`, value])));
  const report = await inspectReceipts({ directory, run: metadata("site"), runId: RUN_ID });
  assert.equal(report.status, "verified", JSON.stringify(report)); assert.equal(report.summary.buildId, BUILD);
});

test("site verification rejects empty smoke, runtime drift and mismatching API evidence", async t => {
  for (const mutate of [files => { files["release-receipt.json"].postDeployment.smoke.probes = []; },
    files => { files["release-receipt.json"].postDeployment.smoke.probes.find(probe => probe.name === "flat-html-alias").headers.location = "https://attacker.example/"; },
    files => { files["release-receipt.json"].postDeployment.smoke.probes.find(probe => probe.name === "apex").url = "https://attacker.example/"; },
    files => { files["deployment-after-runtime-monitor.json"].versions[0].version_id = OLD; },
    files => { files["api-health-after-static.json"].features.adminMfa = false; },
    files => { delete files["api-gate-before-static.json"]; },
  ]) {
    const files = validSiteFiles(); mutate(files);
    const directory = await fixture(t, files);
    assert.equal((await inspectReceipts({ directory, run: metadata("site"), runId: RUN_ID })).status, "unknown");
  }
});

test("offline mode never invokes gh or redownloads artifacts", async t => {
  const directory = await fixture(t, { "daily-report.json": daily(), "run-metadata.json": metadata() });
  const report = await monitorDeployment(parseOptions(["--run-id", RUN_ID, "--receipts-dir", directory, "--run-metadata", join(directory, "run-metadata.json")]), {
    execute: async () => { throw new Error("must_not_execute"); },
  });
  assert.equal(report.status, "inspected");
});

test("online fetch filters the exact workflow/artifact and invokes argv-only gh once per operation", async t => {
  const calls = [];
  const execute = async (file, args, options) => {
    calls.push([file, args]); assert.equal(file, "gh"); assert.equal(options.shell, undefined);
    if (args[0] === "run" && args[1] === "list") { assert.ok(args.includes("site-autopilot.yml")); return { stdout: JSON.stringify([{ databaseId: Number(RUN_ID) }]) }; }
    if (args[0] === "api" && args[1].endsWith(`/runs/${RUN_ID}`)) return { stdout: JSON.stringify(metadata()) };
    if (args[0] === "api") return { stdout: JSON.stringify({ total_count: 2, artifacts: [{ name: `autopilot-${RUN_ID}-1`, expired: false, workflow_run: { id: Number(RUN_ID), head_sha: SHA } }, { name: "unrelated", expired: false }] }) };
    const directory = args[args.indexOf("--dir") + 1];
    await writeFile(join(directory, "daily-report.json"), JSON.stringify(daily()));
    return { stdout: "" };
  };
  const report = await monitorDeployment(parseOptions([]), { execute });
  assert.equal(report.status, "inspected"); assert.equal(calls.length, 4);
  const downloaded = calls[3][1]; assert.ok(downloaded.includes(`autopilot-${RUN_ID}-1`));
  await assert.rejects(() => readFile(join(downloaded[downloaded.indexOf("--dir") + 1], "daily-report.json")));
});

test("remote errors cannot inject diagnostics or lose authenticated run binding", async () => {
  let calls = 0;
  const report = await monitorDeployment(parseOptions(["--run-id", RUN_ID]), { execute: async () => {
    if (++calls === 1) return { stdout: JSON.stringify(metadata()) };
    throw new Error("arbitrary_remote_lowercase_message");
  } });
  assert.equal(report.sourceSha, SHA); assert.equal(report.runAttempt, 1); assert.equal(report.status, "unknown");
  assert.deepEqual(report.diagnostics, ["receipt_fetch_failed"]);
  assert.ok(report.diagnostics.every(code => DIAGNOSTIC_CODES.includes(code)));
});
