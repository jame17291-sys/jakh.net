#!/usr/bin/env node
// Read-only receipt inspection. Artifact contents are data, never executable code.
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, mkdtemp, open, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { buildPostCompatibility, buildPostDeploy as buildApiPostDeploy } from "./api-release-receipt.mjs";
import { buildPostDeploy as buildSitePostDeploy, smokeDefinitions } from "./site-release-receipt.mjs";
import { buildVersionBoundMonitorProof } from "./runtime-monitor-proof.mjs";
import { compareStaticApiEvidence, verifyStaticApiRelease } from "./static-api-release-gate.mjs";

export const REPOSITORY = "jame17291-sys/jakh.net";
const executeFile = promisify(execFile);
const SHA = /^[a-f0-9]{40}$/u;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z._-]{5,127}$/u;
const WORKFLOWS = Object.freeze({
  ".github/workflows/site-autopilot.yml": "maintenance",
  ".github/workflows/api-deploy.yml": "api",
  ".github/workflows/static-site.yml": "site",
});
const CONCLUSIONS = new Set(["success", "failure", "cancelled", "timed_out", "action_required", "neutral", "skipped", "stale"]);
export const REPORT_STATUSES = Object.freeze(["inspected", "deployment_reported", "verified", "needs_attention", "failed", "unknown", "paused"]);
export const DIAGNOSTIC_CODES = Object.freeze([
  "artifact_byte_limit", "artifact_depth_exceeded", "artifact_entry_limit", "duplicate_option", "duplicate_receipt",
  "foreign_artifact", "foreign_receipt", "foreign_repository", "foreign_run", "incomplete_run", "inconsistent_maintenance_status",
  "inspection_is_not_deployment_proof", "invalid_api_receipt", "invalid_artifact_entry", "invalid_artifact_listing",
  "invalid_build_id", "invalid_deployment_reference", "invalid_maintenance_counters", "invalid_option", "invalid_path",
  "invalid_receipt_file", "invalid_release_mode", "invalid_release_proof", "invalid_run_attempt", "invalid_run_id",
  "invalid_runtime_proof", "invalid_worker_version", "linked_release_receipt_required", "maintenance_checks_not_passed",
  "malformed_receipt_json", "missing_artifact_directory", "missing_maintenance_receipt", "missing_option_value",
  "missing_or_ambiguous_artifact", "missing_release_evidence", "missing_runtime_proof", "no_completed_maintenance_run",
  "offline_metadata_required", "offline_receipts_required", "oversized_receipt", "receipt_fetch_failed", "receipt_inspection_failed",
  "release_gates_not_passed", "release_not_verified", "unfinished_maintenance_receipt", "unfinished_release_receipt",
  "unsafe_symlink", "unsupported_workflow", "untrusted_event", "untrusted_source", "workflow_not_successful",
  "legacy_attempt_one_receipt", "foreign_receipt_attempt", "incomplete_smoke_proof", "invalid_api_continuity",
]);
const diagnostics = new Set(DIAGNOSTIC_CODES);
const RECEIPT_FILES = new Set([
  "daily-report.json", "release-receipt.json", "runtime-monitor.json",
  "worker-after-compatibility.json", "worker-after-worker.json", "worker-after-runtime-monitor.json",
  "database-after-compatibility.json", "database-after-worker.json",
  "health-after-compatibility.json", "health-after-worker.json",
  "migrations-after-compatibility.txt", "migrations-after-worker.txt",
  "deployment-after.json", "deployment-after-runtime-monitor.json",
  "api-deployment-before-static.json", "api-deployment-after-static.json", "api-health-before-static.json", "api-health-after-static.json",
  "api-gate-before-static.json", "api-gate-after-static.json",
]);
function requireValue(condition, code) { if (!condition) throw new Error(code); }
function numericId(value) {
  return typeof value === "string" && /^[1-9][0-9]{0,15}$/u.test(value) && Number.isSafeInteger(Number(value));
}
function counter(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 100_000; }
function validPath(value) {
  requireValue(typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\x00-\x1f\x7f]/u.test(value), "invalid_path");
  return resolve(value);
}

export function parseOptions(argv) {
  const options = { verbose: false };
  const allowed = new Set(["run-id", "receipts-dir", "run-metadata", "output"]);
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token === "--verbose") { requireValue(!options.verbose, "duplicate_option"); options.verbose = true; continue; }
    const match = /^--([a-z-]+)(?:=(.*))?$/u.exec(token);
    requireValue(match && allowed.has(match[1]), "invalid_option");
    const key = match[1];
    requireValue(!Object.hasOwn(options, key), "duplicate_option");
    const value = match[2] === undefined ? argv[++index] : match[2];
    requireValue(typeof value === "string" && value.length > 0 && !value.startsWith("--"), "missing_option_value");
    options[key] = key === "run-id" ? value : validPath(value);
  }
  if (options["run-id"] !== undefined) requireValue(numericId(options["run-id"]), "invalid_run_id");
  requireValue(!options["receipts-dir"] || (options["run-id"] && options["run-metadata"]), "offline_metadata_required");
  requireValue(!options["run-metadata"] || options["receipts-dir"], "offline_receipts_required");
  return options;
}

export function validateRunMetadata(run, expectedRunId) {
  requireValue(numericId(expectedRunId) && String(run?.id) === expectedRunId, "foreign_run");
  requireValue(run.repository?.full_name === REPOSITORY && run.head_repository?.full_name === REPOSITORY, "foreign_repository");
  requireValue(run.head_branch === "main" && SHA.test(run.head_sha || ""), "untrusted_source");
  requireValue(Object.hasOwn(WORKFLOWS, run.path), "unsupported_workflow");
  requireValue(run.status === "completed" && CONCLUSIONS.has(run.conclusion), "incomplete_run");
  requireValue(Number.isSafeInteger(run.run_attempt) && run.run_attempt >= 1 && run.run_attempt <= 10_000, "invalid_run_attempt");
  const workflow = WORKFLOWS[run.path];
  requireValue(run.event === "workflow_dispatch" || (workflow === "maintenance" && run.event === "schedule"), "untrusted_event");
  return { runId: expectedRunId, runAttempt: run.run_attempt, sourceSha: run.head_sha, workflow, conclusion: run.conclusion };
}

export function artifactNamesFor(metadata) {
  if (metadata.workflow === "maintenance") return [`autopilot-${metadata.runId}-${metadata.runAttempt}`,
    ...(metadata.runAttempt === 1 ? [`autopilot-${metadata.runId}`] : [])];
  if (metadata.workflow === "site") return [`static-site-release-${metadata.runId}-${metadata.runAttempt}`];
  return [`api-compatibility-${metadata.runId}-${metadata.runAttempt}`, `api-final-${metadata.runId}-${metadata.runAttempt}`];
}

async function noSymlinks(path) {
  let cursor = validPath(path);
  while (true) {
    const info = await lstat(cursor);
    requireValue(!info.isSymbolicLink(), "unsafe_symlink");
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

async function readBounded(path, maxBytes = 8 * 1024 * 1024) {
  await noSymlinks(path);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    requireValue(info.isFile() && info.size <= maxBytes, "invalid_receipt_file");
    const bytes = await file.readFile();
    requireValue(bytes.length <= maxBytes, "oversized_receipt");
    return bytes.toString("utf8");
  } finally { await file.close(); }
}

export async function readReceipts(directory) {
  await noSymlinks(directory);
  requireValue((await lstat(directory)).isDirectory(), "missing_artifact_directory");
  const files = new Map();
  let entries = 0;
  let totalBytes = 0;
  async function visit(folder, depth) {
    requireValue(depth <= 10, "artifact_depth_exceeded");
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      requireValue(++entries <= 20_000, "artifact_entry_limit");
      requireValue(!entry.isSymbolicLink(), "unsafe_symlink");
      const path = join(folder, entry.name);
      if (entry.isDirectory()) { await visit(path, depth + 1); continue; }
      requireValue(entry.isFile(), "invalid_artifact_entry");
      if (!RECEIPT_FILES.has(entry.name)) continue;
      requireValue(!files.has(entry.name), "duplicate_receipt");
      const source = await readBounded(path);
      totalBytes += Buffer.byteLength(source);
      requireValue(totalBytes <= 32 * 1024 * 1024, "artifact_byte_limit");
      try { files.set(entry.name, entry.name.endsWith(".json") ? JSON.parse(source) : source); }
      catch { throw new Error("malformed_receipt_json"); }
    }
  }
  await visit(directory, 0);
  return files;
}

function newReport(runId) {
  return {
    version: 1, repository: REPOSITORY, runId: numericId(runId) ? runId : null, runAttempt: null,
    sourceSha: null, workflow: null, conclusion: null, status: "unknown", releaseMode: null,
    summary: { checksPassed: null, checksFailed: null, changedFiles: null, buildId: null,
      workerVersion: null, deploymentRunId: null, smokeTestPassed: null }, diagnostics: [],
  };
}

function inspectMaintenance(files, report) {
  const receipt = files.get("daily-report.json");
  requireValue(receipt, "missing_maintenance_receipt");
  requireValue(receipt.version === 1 && String(receipt.runId) === report.runId && receipt.sourceSha === report.sourceSha, "foreign_receipt");
  if (receipt.runAttempt === undefined && report.runAttempt === 1) report.diagnostics.push("legacy_attempt_one_receipt");
  else requireValue(String(receipt.runAttempt) === String(report.runAttempt), "foreign_receipt_attempt");
  requireValue(["inspection_only", "automatic"].includes(receipt.releaseMode), "invalid_release_mode");
  requireValue(counter(receipt.checksPassed) && counter(receipt.checksFailed)
    && Array.isArray(receipt.changedFiles) && receipt.changedFiles.length <= 250
    && Array.isArray(receipt.failedChecks) && receipt.failedChecks.length === receipt.checksFailed, "invalid_maintenance_counters");
  report.releaseMode = receipt.releaseMode;
  Object.assign(report.summary, { checksPassed: receipt.checksPassed, checksFailed: receipt.checksFailed, changedFiles: receipt.changedFiles.length });
  if (["paused", "paused_or_daily_limit"].includes(receipt.status)) { report.status = "paused"; return; }
  if (receipt.status === "failed") { report.status = "failed"; return; }
  if (receipt.status === "needs_attention" && receipt.checksFailed > 0) { report.status = "needs_attention"; return; }
  requireValue(receipt.checksFailed === 0 && receipt.checksPassed > 0, "maintenance_checks_not_passed");
  if (receipt.status === "no_changes") {
    requireValue(receipt.changedFiles.length === 0, "inconsistent_maintenance_status");
    report.status = "inspected";
    report.diagnostics.push("inspection_is_not_deployment_proof");
  } else if (receipt.status === "deployed") {
    requireValue(receipt.releaseMode === "automatic" && numericId(receipt.deploymentRunId)
      && receipt.deploymentRunId !== report.runId && SHA.test(receipt.candidateSha || "") && receipt.changedFiles.length > 0, "invalid_deployment_reference");
    report.summary.deploymentRunId = receipt.deploymentRunId;
    report.status = "deployment_reported";
    report.diagnostics.push("linked_release_receipt_required");
  } else throw new Error("unfinished_maintenance_receipt");
}

function requiredFile(files, name) {
  requireValue(files.has(name), "missing_release_evidence");
  return files.get(name);
}
function safeProof(receipt, files, state, beforeName, scope, compatible) {
  const proof = state?.runtimeProof;
  requireValue(proof?.schemaVersion === 1 && proof.safe === true && Number.isFinite(Date.parse(proof.capturedAt)), "missing_runtime_proof");
  const recomputed = buildVersionBoundMonitorProof({
    targetVersion: state.activeWorkerVersion,
    deploymentBefore: requiredFile(files, beforeName),
    deploymentAfter: requiredFile(files, scope === "api" ? "worker-after-runtime-monitor.json" : "deployment-after-runtime-monitor.json"),
    monitorReport: requiredFile(files, "runtime-monitor.json"), scope,
    allowCompatibleSchema: compatible, generatedAt: new Date(proof.capturedAt),
  });
  requireValue(recomputed.safe && recomputed.monitorSha256 === proof.monitorSha256
    && recomputed.targetVersion === proof.targetVersion && recomputed.scope === proof.scope
    && recomputed.versionBefore === proof.versionBefore && recomputed.versionAfter === proof.versionAfter, "invalid_runtime_proof");
}

function validateCompleteSmoke(smoke, buildId, workerVersion) {
  const probes = new Map((smoke?.probes || []).map(probe => [probe.name, probe]));
  const probeUrl = probes.get("flat-html-alias")?.url;
  requireValue(typeof probeUrl === "string" && probeUrl.length <= 2048, "incomplete_smoke_proof");
  const token = new URL(probeUrl).searchParams.get("site_probe");
  requireValue(typeof token === "string" && /^[a-z0-9-]{1,64}$/u.test(token), "incomplete_smoke_proof");
  const expected = smokeDefinitions(token);
  requireValue(probes.size === expected.length && smoke.probes.length === expected.length, "incomplete_smoke_proof");
  for (const definition of expected) {
    const probe = probes.get(definition.name);
    requireValue(probe?.url === definition.url && probe.status === definition.status
      && (!definition.location || probe.headers?.location === definition.location)
      && probe.headers?.["x-jakh-site-version"] === buildId
      && probe.headers?.["x-jakh-worker-version"] === workerVersion
      && (!definition.cache || definition.cache.test(probe.headers["cache-control"] || "")), "incomplete_smoke_proof");
  }
}

function validateApiContinuity(files, expectedCommit) {
  const evidence = [];
  for (const stage of ["before", "after"]) {
    const gate = requiredFile(files, `api-gate-${stage}-static.json`);
    requireValue(gate.result === "verified" && gate.expectedCommit === expectedCommit, "invalid_api_continuity");
    const checked = verifyStaticApiRelease({ deployment: requiredFile(files, `api-deployment-${stage}-static.json`),
      health: requiredFile(files, `api-health-${stage}-static.json`), httpStatus: gate.healthHttpStatus, expectedCommit });
    requireValue(checked.errors.length === 0, "invalid_api_continuity");
    evidence.push({ result: "verified", ...checked.evidence });
  }
  requireValue(compareStaticApiEvidence(...evidence).errors.length === 0, "invalid_api_continuity");
}

function inspectRelease(files, report) {
  const receipt = requiredFile(files, "release-receipt.json");
  const release = receipt.release;
  requireValue(release?.repository === REPOSITORY && release.commit === report.sourceSha
    && String(release.runId) === report.runId && String(release.runAttempt) === String(report.runAttempt)
    && release.ref === "refs/heads/main", "foreign_receipt");
  requireValue(Number.isFinite(Date.parse(receipt.finalizedAt)), "unfinished_release_receipt");
  const steps = receipt.workflowSteps;
  requireValue(steps?.preflight === "success" && steps.rollbackProof === "success", "release_gates_not_passed");
  if (report.workflow === "site") {
    requireValue(receipt.formatVersion === 2 && receipt.service === "jakh-site" && receipt.result === "deployed-and-verified", "release_not_verified");
    requireValue(["deploy", "smoke", "verification"].every(name => steps[name] === "success"), "release_gates_not_passed");
    requireValue(/^[a-f0-9]{64}$/u.test(receipt.candidate?.buildId || ""), "invalid_build_id");
    const candidate = receipt.postDeployment;
    validateCompleteSmoke(candidate?.smoke, receipt.candidate.buildId, candidate?.activeWorkerVersion);
    const verified = buildSitePostDeploy({ receipt: structuredClone(receipt), deployment: requiredFile(files, "deployment-after.json"), smoke: candidate?.smoke });
    requireValue(verified.errors.length === 0, "invalid_release_proof");
    safeProof(receipt, files, candidate, "deployment-after.json", "site", false);
    validateApiContinuity(files, report.sourceSha);
    report.summary.buildId = receipt.candidate.buildId;
    report.summary.workerVersion = candidate.activeWorkerVersion;
  } else {
    requireValue(receipt.formatVersion === 3 && receipt.source?.service === "jakh-api"
      && ["compatibility", "migrate-final"].includes(receipt.phase), "invalid_api_receipt");
    const compatibility = receipt.phase === "compatibility";
    requireValue(receipt.result === (compatibility
      ? (receipt.safety?.schemaChanged ? "compatibility-worker-verified" : "code-only-final-worker-verified")
      : "deployed-and-verified"), "release_not_verified");
    requireValue(steps.productionVerification === "success" && (compatibility ? steps.compatibilityDeploy === "success"
      : ["migrationAuthorization", "migrations", "migrationCompatibility", "migrationQuarantineProof", "finalDeploy"].every(name => steps[name] === "success")), "release_gates_not_passed");
    const suffix = compatibility ? "compatibility" : "worker";
    const state = compatibility ? receipt.compatibilityDeployment : receipt.postDeployment;
    const health = requiredFile(files, `health-after-${suffix}.json`);
    const inputs = {
      receipt: structuredClone(receipt), deployment: requiredFile(files, `worker-after-${suffix}.json`), health,
      httpStatus: state?.healthHttpStatus, databaseResult: requiredFile(files, `database-after-${suffix}.json`),
      migrationList: requiredFile(files, `migrations-after-${suffix}.txt`),
    };
    const verified = compatibility ? buildPostCompatibility(inputs) : buildApiPostDeploy(inputs);
    requireValue(verified.errors.length === 0, "invalid_release_proof");
    safeProof(receipt, files, state, `worker-after-${suffix}.json`, "api", compatibility);
    report.summary.workerVersion = state.activeWorkerVersion;
  }
  requireValue(VERSION.test(report.summary.workerVersion || ""), "invalid_worker_version");
  report.summary.smokeTestPassed = true;
  report.status = "verified";
}

export async function inspectReceipts({ directory, run, runId }) {
  const report = newReport(runId);
  try {
    Object.assign(report, validateRunMetadata(run, runId));
    const files = await readReceipts(directory);
    if (report.workflow === "maintenance") inspectMaintenance(files, report); else inspectRelease(files, report);
    if (report.conclusion !== "success") { report.status = "failed"; report.diagnostics.push("workflow_not_successful"); }
  } catch (error) {
    report.status = "unknown";
    // Only errors raised by these validation routines are published; never artifact text.
    const code = diagnostics.has(error.message) ? error.message : "receipt_inspection_failed";
    report.diagnostics.push(code);
  }
  return report;
}

export function reportExitCode(report) {
  if (["inspected", "verified"].includes(report.status)) return 0;
  if (["paused", "deployment_reported"].includes(report.status)) return 2;
  return 1;
}

async function ghJson(args, execute = executeFile) {
  const { stdout } = await execute("gh", args, { encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout);
}

export async function monitorDeployment(options, { execute = executeFile } = {}) {
  let runId = options["run-id"];
  let directory = options["receipts-dir"];
  let temporaryDirectory;
  let metadata;
  try {
    if (!runId) {
      const runs = await ghJson(["run", "list", "--repo", REPOSITORY, "--workflow", "site-autopilot.yml", "--branch", "main", "--status", "completed", "--limit", "1", "--json", "databaseId"], execute);
      runId = String(runs?.[0]?.databaseId || "");
      requireValue(numericId(runId), "no_completed_maintenance_run");
    }
    const run = options["run-metadata"] ? JSON.parse(await readBounded(options["run-metadata"]))
      : await ghJson(["api", `repos/${REPOSITORY}/actions/runs/${runId}`], execute);
    metadata = validateRunMetadata(run, runId);
    if (!directory) {
      const listing = await ghJson(["api", `repos/${REPOSITORY}/actions/runs/${runId}/artifacts?per_page=100`], execute);
      requireValue(Number.isSafeInteger(listing.total_count) && listing.total_count <= 100 && Array.isArray(listing.artifacts), "invalid_artifact_listing");
      const names = artifactNamesFor(metadata);
      const artifacts = listing.artifacts.filter(artifact => names.includes(artifact.name));
      requireValue(artifacts.length === 1 && artifacts[0].expired === false, "missing_or_ambiguous_artifact");
      requireValue(String(artifacts[0].workflow_run?.id) === runId && artifacts[0].workflow_run?.head_sha === metadata.sourceSha, "foreign_artifact");
      temporaryDirectory = await mkdtemp(join(await realpath(tmpdir()), "jakh-deployment-receipts-"));
      directory = temporaryDirectory;
      await execute("gh", ["run", "download", runId, "--repo", REPOSITORY, "--name", artifacts[0].name, "--dir", directory], { encoding: "utf8", timeout: 60_000, maxBuffer: 1024 * 1024 });
    }
    return await inspectReceipts({ directory, run, runId });
  } catch (error) {
    const report = newReport(runId);
    if (metadata) Object.assign(report, metadata);
    report.diagnostics.push(diagnostics.has(error.message) ? error.message : "receipt_fetch_failed");
    return report;
  } finally { if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true }); }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const report = await monitorDeployment(options);
  if (options.output) {
    await noSymlinks(dirname(options.output));
    const file = await open(options.output, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
    try { await file.writeFile(`${JSON.stringify(report, null, 2)}\n`); } finally { await file.close(); }
  }
  process.stdout.write(`Receipt inspection: ${report.status}; run ${report.runId || "unknown"}; diagnostics ${report.diagnostics.join(", ") || "none"}.\n`);
  if (options.verbose) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = reportExitCode(report);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { process.stderr.write("Receipt inspection failed: invalid options or output path.\n"); process.exitCode = 1; });
}
