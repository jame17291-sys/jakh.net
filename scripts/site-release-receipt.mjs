#!/usr/bin/env node

import { appendFile, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildVersionBoundMonitorProof } from "./runtime-monitor-proof.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const SERVICE_NAME = "jakh-site";
const RECEIPT_FORMAT_VERSION = 2;
const BUILD_ID_PATTERN = /^[a-f0-9]{64}$/u;
const WORKER_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{5,127}$/u;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArguments(argv) {
  const [command, ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    invariant(token.startsWith("--"), `Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = tokens[index + 1];
    invariant(value !== undefined && !value.startsWith("--"), `Missing value for --${name}`);
    options[name] = value;
    index += 1;
  }
  return { command, options };
}

function requireOption(options, name) {
  const value = options[name];
  invariant(typeof value === "string" && value.length > 0, `Missing required --${name}`);
  return value;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error.message}`);
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function releaseContext(environment = process.env) {
  return {
    repository: environment.GITHUB_REPOSITORY ?? null,
    commit: environment.GITHUB_SHA ?? null,
    ref: environment.GITHUB_REF ?? null,
    runId: environment.GITHUB_RUN_ID ?? null,
    runAttempt: environment.GITHUB_RUN_ATTEMPT ?? null,
    actor: environment.GITHUB_ACTOR ?? null,
  };
}

function timestamp() {
  return new Date().toISOString();
}

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) errors.push("manifest is not an object");
  if (manifest?.service !== SERVICE_NAME) errors.push(`manifest service was ${manifest?.service ?? "missing"}`);
  if (!BUILD_ID_PATTERN.test(manifest?.buildId || "")) errors.push("manifest buildId is not a SHA-256 hex digest");
  if (!Number.isInteger(manifest?.fileCount) || manifest.fileCount < 1) errors.push("manifest fileCount is invalid");
  if (!Number.isInteger(manifest?.totalBytes) || manifest.totalBytes < 1) errors.push("manifest totalBytes is invalid");
  if (Object.keys(manifest?.files || {}).length !== manifest?.fileCount) errors.push("manifest fileCount does not match files");
  if (!manifest?.routes?.["/"] || !manifest?.routes?.["/__404__"]) errors.push("manifest lacks root or 404 routes");
  for (const [alias, target] of Object.entries(manifest?.aliases || {})) {
    if (manifest.aliases[target]) errors.push(`alias ${alias} points to alias ${target}`);
    if (!manifest.routes[target]) errors.push(`alias ${alias} points to unknown route ${target}`);
  }
  return errors;
}

export function extractActiveVersion(deployment) {
  invariant(deployment && typeof deployment === "object", "Site Worker deployment status must be an object");
  invariant(Array.isArray(deployment.versions), "Site Worker deployment status must contain versions");
  invariant(
    deployment.versions.length === 1 && Number(deployment.versions[0]?.percentage) === 100,
    "Site production must have exactly one Worker version serving 100% of traffic",
  );
  const versionId = deployment.versions[0].version_id;
  invariant(
    typeof versionId === "string" && /^[0-9A-Za-z][0-9A-Za-z._-]{5,127}$/u.test(versionId),
    "Active Site Worker version ID is missing or malformed",
  );
  return versionId;
}

function headerSnapshot(response) {
  return Object.fromEntries([
    "cache-control",
    "content-security-policy",
    "etag",
    "location",
    "permissions-policy",
    "referrer-policy",
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
    "x-jakh-site-version",
    "x-jakh-worker-version",
  ].map((name) => [name, response.headers.get(name)]));
}

function requiredSecurityErrors(probe) {
  const errors = [];
  const headers = probe.headers || {};
  if (!/max-age=\d+/iu.test(headers["strict-transport-security"] || "")) errors.push("missing HSTS");
  if (!/frame-ancestors 'none'/iu.test(headers["content-security-policy"] || "")) errors.push("missing CSP frame-ancestors");
  if (headers["x-content-type-options"] !== "nosniff") errors.push("missing nosniff");
  if (!headers["referrer-policy"]) errors.push("missing Referrer-Policy");
  if (!headers["permissions-policy"]) errors.push("missing Permissions-Policy");
  if (headers["x-frame-options"] !== "DENY") errors.push("missing framing denial");
  return errors;
}

export function validateSmokeReport(report, expectedBuildId, expectedWorkerVersionId) {
  const errors = [];
  if (!report || typeof report !== "object" || !Array.isArray(report.probes)) return ["smoke report is malformed"];
  if (report.ok !== true) errors.push(...(report.errors?.length ? report.errors : ["smoke report did not pass"]));
  if (!BUILD_ID_PATTERN.test(report.observedBuildId || "")) errors.push("smoke report lacks a valid observed build ID");
  if (expectedBuildId && report.observedBuildId !== expectedBuildId) {
    errors.push(`live build ${report.observedBuildId || "missing"} does not match ${expectedBuildId}`);
  }
  if (!WORKER_VERSION_PATTERN.test(report.observedWorkerVersionId || "")) {
    errors.push("smoke report lacks a valid observed Worker version ID");
  }
  if (expectedWorkerVersionId && report.observedWorkerVersionId !== expectedWorkerVersionId) {
    errors.push(
      `live Worker version ${report.observedWorkerVersionId || "missing"} does not match ${expectedWorkerVersionId}`,
    );
  }
  for (const probe of report.probes) {
    for (const error of requiredSecurityErrors(probe)) errors.push(`${probe.name}: ${error}`);
  }
  return [...new Set(errors)];
}

function smokeDefinitions(token) {
  const query = `site_probe=${token}`;
  return [
    { name: "apex", url: "https://jakh.net/", status: 200, cache: /max-age=0.+must-revalidate/iu },
    {
      name: "flat-html-alias",
      url: `https://jakh.net/science.html?${query}`,
      status: 301,
      location: `https://jakh.net/science?${query}`,
    },
    {
      name: "nested-index-alias",
      url: `https://jakh.net/ar/topics/science/index.html?${query}`,
      status: 301,
      location: `https://jakh.net/ar/topics/science/?${query}`,
    },
    {
      name: "www-one-hop-alias",
      url: `https://www.jakh.net/science.html?${query}`,
      status: 301,
      location: `https://jakh.net/science?${query}`,
    },
    {
      name: "not-found",
      url: `https://jakh.net/__site_probe_missing_${token}`,
      status: 404,
      cache: /^no-store$/iu,
    },
    {
      name: "service-worker",
      url: "https://jakh.net/sw.js",
      status: 200,
      cache: /max-age=0.+must-revalidate/iu,
    },
  ];
}

async function oneSmokeAttempt({ fetchImpl, expectedBuildId, expectedWorkerVersionId, timeoutMs }) {
  const token = (expectedBuildId || Date.now().toString(16)).slice(0, 16);
  const probes = [];
  const errors = [];
  for (const definition of smokeDefinitions(token)) {
    let response;
    try {
      response = await fetchImpl(definition.url, {
        redirect: "manual",
        headers: { "user-agent": "jakh-static-release-smoke/1.0" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      errors.push(`${definition.name}: ${error.message}`);
      continue;
    }
    const probe = {
      name: definition.name,
      url: definition.url,
      status: response.status,
      headers: headerSnapshot(response),
    };
    probes.push(probe);
    if (response.status !== definition.status) {
      errors.push(`${definition.name}: HTTP ${response.status}, expected ${definition.status}`);
    }
    if (definition.location && probe.headers.location !== definition.location) {
      errors.push(`${definition.name}: Location ${probe.headers.location || "missing"}, expected ${definition.location}`);
    }
    if (definition.cache && !definition.cache.test(probe.headers["cache-control"] || "")) {
      errors.push(`${definition.name}: unexpected Cache-Control ${probe.headers["cache-control"] || "missing"}`);
    }
    for (const error of requiredSecurityErrors(probe)) errors.push(`${definition.name}: ${error}`);
  }
  const rootProbe = probes.find((probe) => probe.name === "apex");
  const observedBuildId = rootProbe?.headers?.["x-jakh-site-version"] || null;
  const observedWorkerVersionId = rootProbe?.headers?.["x-jakh-worker-version"] || null;
  if (!BUILD_ID_PATTERN.test(observedBuildId || "")) errors.push("apex: missing valid X-JAKH-Site-Version");
  if (expectedBuildId && observedBuildId !== expectedBuildId) {
    errors.push(`apex: live build ${observedBuildId || "missing"}, expected ${expectedBuildId}`);
  }
  if (!WORKER_VERSION_PATTERN.test(observedWorkerVersionId || "")) {
    errors.push("apex: missing valid X-JAKH-Worker-Version");
  }
  if (expectedWorkerVersionId && observedWorkerVersionId !== expectedWorkerVersionId) {
    errors.push(`apex: live Worker ${observedWorkerVersionId || "missing"}, expected ${expectedWorkerVersionId}`);
  }
  for (const probe of probes) {
    if (probe.headers["x-jakh-site-version"] !== observedBuildId) {
      errors.push(`${probe.name}: inconsistent X-JAKH-Site-Version`);
    }
    if (probe.headers["x-jakh-worker-version"] !== observedWorkerVersionId) {
      errors.push(`${probe.name}: inconsistent X-JAKH-Worker-Version`);
    }
  }
  return {
    checkedAt: timestamp(),
    observedBuildId,
    observedWorkerVersionId,
    ok: errors.length === 0,
    probes,
    errors,
  };
}

export async function runSmoke({
  expectedBuildId,
  expectedWorkerVersionId,
  attempts = 1,
  delayMs = 0,
  timeoutMs = 10_000,
  fetchImpl = fetch,
} = {}) {
  if (expectedBuildId) invariant(BUILD_ID_PATTERN.test(expectedBuildId), "Expected build ID must be SHA-256 hex");
  invariant(Number.isInteger(attempts) && attempts >= 1 && attempts <= 12, "Smoke attempts must be between 1 and 12");
  invariant(Number.isInteger(delayMs) && delayMs >= 0 && delayMs <= 30_000, "Smoke delay must be between 0 and 30000 ms");
  let report;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    report = await oneSmokeAttempt({ fetchImpl, expectedBuildId, expectedWorkerVersionId, timeoutMs });
    report.attempt = attempt;
    report.maxAttempts = attempts;
    if (report.ok || attempt === attempts) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }
  return report;
}

function expectedDeploymentMessage(receipt) {
  if (!receipt.release.commit || !receipt.release.runId) return null;
  return `JAKH site ${receipt.release.commit} build ${receipt.candidate.buildId} run ${receipt.release.runId}`;
}

export function buildPreflight({ manifest, deployment, baselineSmoke, environment = process.env }) {
  const errors = [
    ...validateManifest(manifest),
    ...validateSmokeReport(baselineSmoke),
  ];
  let activeVersion = null;
  try {
    activeVersion = extractActiveVersion(deployment);
  } catch (error) {
    errors.push(error.message);
  }
  const staticAssetsChanged = baselineSmoke?.observedBuildId !== manifest?.buildId;
  const baselineMessage = deployment?.annotations?.["workers/message"] || "";
  const exactReleasePrefix = environment.GITHUB_SHA && manifest?.buildId
    ? `JAKH site ${environment.GITHUB_SHA} build ${manifest.buildId} run `
    : null;
  if (!staticAssetsChanged && exactReleasePrefix && baselineMessage.startsWith(exactReleasePrefix)) {
    errors.push("candidate commit and static build are already live");
  }
  if (activeVersion && baselineSmoke?.observedWorkerVersionId !== activeVersion) {
    errors.push("baseline HTTP Worker version does not match the captured rollback version");
  }
  const receipt = {
    formatVersion: RECEIPT_FORMAT_VERSION,
    service: SERVICE_NAME,
    createdAt: timestamp(),
    release: releaseContext(environment),
    candidate: {
      buildId: manifest?.buildId || null,
      fileCount: manifest?.fileCount || null,
      totalBytes: manifest?.totalBytes || null,
      staticAssetsChanged,
    },
    safety: {
      workerRollbackTarget: activeVersion,
      rollbackBuildId: baselineSmoke?.observedBuildId || null,
      automaticRollback: false,
      rollbackProof: null,
    },
    preDeployment: {
      capturedAt: timestamp(),
      activeWorkerVersion: activeVersion,
      workerDeployment: deployment,
      smoke: baselineSmoke,
    },
    result: errors.length === 0 ? "preflight-passed" : "preflight-failed",
  };
  return { receipt, errors };
}

export function buildPostDeploy({ receipt, deployment, smoke }) {
  const errors = validateSmokeReport(smoke, receipt.candidate.buildId);
  let activeVersion = null;
  try {
    activeVersion = extractActiveVersion(deployment);
  } catch (error) {
    errors.push(error.message);
  }
  if (activeVersion === receipt.safety.workerRollbackTarget) errors.push("site deployment did not produce a new active version");
  if (activeVersion && smoke?.observedWorkerVersionId !== activeVersion) {
    errors.push("candidate HTTP Worker version does not match the active deployment version");
  }
  const expectedMessage = expectedDeploymentMessage(receipt);
  if (expectedMessage && deployment?.annotations?.["workers/message"] !== expectedMessage) {
    errors.push("active Site Worker deployment message does not identify this exact release");
  }
  receipt.postDeployment = {
    capturedAt: timestamp(),
    activeWorkerVersion: activeVersion,
    workerDeployment: deployment,
    smoke,
  };
  receipt.result = errors.length === 0 ? "deployed-and-verified" : "post-deploy-verification-failed";
  return { receipt, errors };
}

export function buildPostRollback({ receipt, deployment, smoke }) {
  const errors = validateSmokeReport(smoke, receipt.safety.rollbackBuildId);
  let activeVersion = null;
  try {
    activeVersion = extractActiveVersion(deployment);
  } catch (error) {
    errors.push(error.message);
  }
  if (activeVersion !== receipt.safety.workerRollbackTarget) {
    errors.push(`rollback activated ${activeVersion || "unknown"}, expected ${receipt.safety.workerRollbackTarget}`);
  }
  if (activeVersion && smoke?.observedWorkerVersionId !== activeVersion) {
    errors.push("rollback HTTP Worker version does not match the active deployment version");
  }
  receipt.rollback = {
    capturedAt: timestamp(),
    activeWorkerVersion: activeVersion,
    workerDeployment: deployment,
    smoke,
  };
  receipt.result = errors.length === 0 ? "rolled-back-and-verified" : "rollback-verification-failed";
  return { receipt, errors };
}

export function applyRuntimeProof({
  receipt,
  stage,
  deploymentBefore,
  deploymentAfter,
  monitorReport,
  generatedAt,
}) {
  invariant(["rollback-target", "candidate", "rollback"].includes(stage), "runtime proof stage must be rollback-target, candidate, or rollback");
  if (stage === "candidate") invariant(receipt.postDeployment, "candidate state must be verified before its runtime proof");
  if (stage === "rollback") invariant(receipt.rollback, "rollback state must be verified before its runtime proof");
  const targetVersion = stage === "candidate"
    ? receipt.postDeployment.activeWorkerVersion
    : receipt.safety.workerRollbackTarget;
  const proof = buildVersionBoundMonitorProof({
    targetVersion,
    deploymentBefore,
    deploymentAfter,
    monitorReport,
    scope: "site",
    allowCompatibleSchema: false,
    generatedAt,
  });
  if (stage === "rollback-target") {
    receipt.safety.rollbackProof = proof;
    receipt.safety.automaticRollback = proof.safe;
  } else if (stage === "candidate") {
    receipt.postDeployment.runtimeProof = proof;
    if (!proof.safe) receipt.result = "post-deploy-verification-failed";
  } else {
    receipt.rollback.runtimeProof = proof;
    if (!proof.safe) receipt.result = "rollback-verification-failed";
  }
  return { receipt, proof };
}

export function finalizeReceipt(receipt, outcomes) {
  receipt.finalizedAt = timestamp();
  receipt.workflowSteps = outcomes;
  if (outcomes.preflight !== "success") receipt.result = "preflight-failed";
  else if (outcomes.rollbackProof !== "success") receipt.result = "rollback-target-proof-failed";
  else if (outcomes.deploy !== "success") receipt.result = "site-deploy-failed";
  else if (outcomes.smoke === "success" && outcomes.verification === "success") receipt.result = "deployed-and-verified";
  else if (receipt.safety.automaticRollback !== true) receipt.result = "automatic-rollback-withheld-unsafe-predecessor";
  else if (outcomes.rollback !== "success") receipt.result = "post-deploy-failure-without-rollback";
  else if (outcomes.rollbackVerification !== "success") receipt.result = "rollback-verification-failed";
  else receipt.result = "post-deploy-failure-rolled-back";
  return receipt;
}

function failOnErrors(errors) {
  if (!errors.length) return;
  for (const error of errors) process.stderr.write(`::error title=Static site release safety gate::${error}\n`);
  throw new Error(`${errors.length} static site release safety gate(s) failed`);
}

async function appendOutputs(path, values) {
  if (!path) return;
  await appendFile(path, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, "utf8");
}

async function commandPreflight(options) {
  const manifest = await readJson(requireOption(options, "manifest"));
  const deployment = await readJson(requireOption(options, "deployment"));
  const baselineSmoke = await readJson(requireOption(options, "baseline-smoke"));
  const { receipt, errors } = buildPreflight({ manifest, deployment, baselineSmoke });
  await writeJson(requireOption(options, "receipt"), receipt);
  await appendOutputs(options["github-output"], {
    "rollback-version": receipt.safety.workerRollbackTarget || "",
    "rollback-build-id": receipt.safety.rollbackBuildId || "",
    "candidate-build-id": receipt.candidate.buildId || "",
  });
  failOnErrors(errors);
}

async function commandTransition(options, transition) {
  const receiptPath = requireOption(options, "receipt");
  const result = transition({
    receipt: await readJson(receiptPath),
    deployment: await readJson(requireOption(options, "deployment")),
    smoke: await readJson(requireOption(options, "smoke")),
  });
  await writeJson(receiptPath, result.receipt);
  failOnErrors(result.errors);
}

async function commandRuntimeProof(options) {
  const receiptPath = requireOption(options, "receipt");
  const result = applyRuntimeProof({
    receipt: await readJson(receiptPath),
    stage: requireOption(options, "stage"),
    deploymentBefore: await readJson(requireOption(options, "deployment-before")),
    deploymentAfter: await readJson(requireOption(options, "deployment-after")),
    monitorReport: await readJson(requireOption(options, "monitor")),
  });
  await writeJson(receiptPath, result.receipt);
  await appendOutputs(options["github-output"], { "rollback-safe": result.proof.safe });
  failOnErrors([...result.proof.bindingErrors, ...result.proof.monitorErrors]);
}

async function commandSmoke(options) {
  const report = await runSmoke({
    expectedBuildId: options["expected-build-id"],
    expectedWorkerVersionId: options["expected-worker-version"],
    attempts: Number(options.attempts || "1"),
    delayMs: Number(options["delay-ms"] || "0"),
    timeoutMs: Number(options["timeout-ms"] || "10000"),
  });
  await writeJson(requireOption(options, "output"), report);
  failOnErrors(report.errors);
}

async function commandFinalize(options) {
  const receiptPath = requireOption(options, "receipt");
  const receipt = await readJson(receiptPath);
  finalizeReceipt(receipt, {
    preflight: requireOption(options, "preflight-outcome"),
    deploy: requireOption(options, "deploy-outcome"),
    smoke: requireOption(options, "smoke-outcome"),
    verification: requireOption(options, "verification-outcome"),
    rollback: requireOption(options, "rollback-outcome"),
    rollbackVerification: requireOption(options, "rollback-verification-outcome"),
    rollbackProof: requireOption(options, "rollback-proof-outcome"),
  });
  await writeJson(receiptPath, receipt);
}

async function commandSummary(options) {
  const receipt = await readJson(requireOption(options, "receipt"));
  const lines = [
    "## Static site release receipt",
    "",
    `- Result: \`${receipt.result}\``,
    `- Candidate build: \`${receipt.candidate?.buildId || "unknown"}\``,
    `- Rollback version: \`${receipt.safety?.workerRollbackTarget || "unknown"}\``,
    `- Rollback build: \`${receipt.safety?.rollbackBuildId || "unknown"}\``,
    `- Automatic rollback eligible: \`${receipt.safety?.automaticRollback === true}\``,
    `- Active version after deploy: \`${receipt.postDeployment?.activeWorkerVersion || "not verified"}\``,
    `- Active version after rollback: \`${receipt.rollback?.activeWorkerVersion || "not used"}\``,
  ];
  if (receipt.safety?.rollbackProof?.monitorErrors?.length) {
    lines.push(`- Rollback withheld reason: ${receipt.safety.rollbackProof.monitorErrors.join("; ")}`);
  }
  await appendFile(requireOption(options, "github-summary"), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  switch (command) {
    case "validate-source": {
      const errors = validateManifest(await readJson(options.manifest || resolve(REPOSITORY_ROOT, "site-worker/generated/site-manifest.json")));
      failOnErrors(errors);
      process.stdout.write("Static site source manifest is valid.\n");
      break;
    }
    case "smoke": await commandSmoke(options); break;
    case "preflight": await commandPreflight(options); break;
    case "post-deploy": await commandTransition(options, buildPostDeploy); break;
    case "post-rollback": await commandTransition(options, buildPostRollback); break;
    case "runtime-proof": await commandRuntimeProof(options); break;
    case "active-version": {
      process.stdout.write(extractActiveVersion(await readJson(requireOption(options, "deployment"))));
      break;
    }
    case "finalize": await commandFinalize(options); break;
    case "summary": await commandSummary(options); break;
    default: throw new Error(`Unknown command: ${command || "missing"}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
