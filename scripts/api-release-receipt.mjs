#!/usr/bin/env node

import { appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildVersionBoundMonitorProof } from "./runtime-monitor-proof.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");
const SERVICE_NAME = "jakh-api";
const RECEIPT_FORMAT_VERSION = 3;
const RELEASE_PHASES = new Set(["compatibility", "migrate-final"]);
const FEATURE_SCHEMA = Object.freeze({
  registration: 7,
  accountRecovery: 7,
  accountDeletion: 8,
  contentStudio: 9,
});

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
  const source = await readFile(path, "utf8");
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error.message}`);
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function schemaNumber(value, label) {
  invariant(typeof value === "string" && /^[1-9][0-9]*$/u.test(value), `${label} must be a positive integer string`);
  return Number(value);
}

function releasePhase(value) {
  invariant(RELEASE_PHASES.has(value), "Release phase must be compatibility or migrate-final");
  return value;
}

export async function inspectSource(repositoryRoot = REPOSITORY_ROOT) {
  const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, "worker/package.json"), "utf8"));
  invariant(
    typeof packageJson.version === "string" && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(packageJson.version),
    "worker/package.json must contain a semantic version",
  );

  const routesSource = await readFile(resolve(repositoryRoot, "worker/src/routes.ts"), "utf8");
  const runtimeVersionMatch = routesSource.match(/export\s+const\s+API_VERSION\s*=\s*["']([^"']+)["']/u);
  invariant(runtimeVersionMatch, "worker/src/routes.ts must declare API_VERSION as a string literal");
  invariant(
    runtimeVersionMatch[1] === packageJson.version,
    `Worker API version ${runtimeVersionMatch[1]} does not match worker/package.json ${packageJson.version}`,
  );
  const runtimeSchemaMatch = routesSource.match(/const\s+SCHEMA_VERSION\s*=\s*["']([^"']+)["']/u);
  invariant(runtimeSchemaMatch, "worker/src/routes.ts must declare SCHEMA_VERSION as a string literal");
  const runtimeSchema = runtimeSchemaMatch[1];
  schemaNumber(runtimeSchema, "Runtime schema version");

  const compatibleMatch = routesSource.match(
    /COMPATIBLE_SCHEMAS\s*=\s*Object\.freeze\(\[([^\]]+)\]/u,
  );
  invariant(compatibleMatch, "worker/src/routes.ts must declare COMPATIBLE_SCHEMAS as string literals");
  const compatibleSchemas = [...compatibleMatch[1].matchAll(/["']([1-9][0-9]*)["']/gu)]
    .map((match) => match[1]);
  invariant(compatibleSchemas.length > 0, "COMPATIBLE_SCHEMAS must not be empty");
  invariant(new Set(compatibleSchemas).size === compatibleSchemas.length, "COMPATIBLE_SCHEMAS must not contain duplicates");
  for (const [index, schema] of compatibleSchemas.entries()) {
    schemaNumber(schema, "Compatible schema");
    if (index > 0) {
      invariant(
        Number(schema) === Number(compatibleSchemas[index - 1]) + 1,
        "COMPATIBLE_SCHEMAS must be a contiguous ascending range",
      );
    }
  }
  invariant(compatibleSchemas.includes(runtimeSchema), "COMPATIBLE_SCHEMAS must include the target schema");

  const migrationsDirectory = resolve(repositoryRoot, "worker/migrations");
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .sort();
  invariant(migrationFiles.length > 0, "At least one numbered D1 migration is required");

  const migrations = [];
  for (const [index, name] of migrationFiles.entries()) {
    const migrationNumber = Number(name.slice(0, 4));
    invariant(
      migrationNumber === index + 1,
      `D1 migrations must be contiguous from 0001; expected ${String(index + 1).padStart(4, "0")}, found ${name}`,
    );
    const sql = await readFile(resolve(migrationsDirectory, name), "utf8");
    const schemaMatch = sql.match(/VALUES\s*\(\s*["']schema_version["']\s*,\s*["']([^"']+)["']\s*\)/iu);
    invariant(schemaMatch, `${name} must record its schema_version in schema_meta`);
    invariant(schemaMatch[1] === String(migrationNumber), `${name} records schema ${schemaMatch[1]}, expected ${migrationNumber}`);
    migrations.push({ name, schema: schemaMatch[1] });
  }

  const migrationSchema = migrations.at(-1).schema;
  invariant(runtimeSchema === migrationSchema, `Worker schema ${runtimeSchema} does not match latest migration schema ${migrationSchema}`);
  return {
    service: SERVICE_NAME,
    version: packageJson.version,
    schema: runtimeSchema,
    compatibleSchemas,
    migrations,
  };
}

function findFailedD1Operation(value) {
  if (Array.isArray(value)) return value.some(findFailedD1Operation);
  if (!value || typeof value !== "object") return false;
  if (value.success === false) return true;
  return Object.values(value).some(findFailedD1Operation);
}

function collectSchemaValues(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaValues(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value.results)) {
    for (const row of value.results) {
      if (row && typeof row === "object" && Object.hasOwn(row, "value")) output.push(String(row.value));
    }
  }
  for (const nested of Object.values(value)) collectSchemaValues(nested, output);
  return output;
}

export function extractDatabaseSchema(databaseResult) {
  invariant(!findFailedD1Operation(databaseResult), "The D1 schema query reported a failed operation");
  const values = [...new Set(collectSchemaValues(databaseResult))];
  invariant(values.length === 1, `Expected one D1 schema_version value, found ${values.length}`);
  schemaNumber(values[0], "Remote D1 schema version");
  return values[0];
}

export function extractActiveVersion(deployment) {
  invariant(deployment && typeof deployment === "object", "Worker deployment status must be an object");
  invariant(Array.isArray(deployment.versions), "Worker deployment status must contain versions");
  invariant(
    deployment.versions.length === 1 && Number(deployment.versions[0]?.percentage) === 100,
    "Production must have exactly one Worker version serving 100% of traffic before this release",
  );
  const versionId = deployment.versions[0].version_id;
  invariant(
    typeof versionId === "string" && /^[0-9A-Za-z][0-9A-Za-z._-]{5,127}$/u.test(versionId),
    "Active Worker version ID is missing or malformed",
  );
  return versionId;
}

function expectedFeatures(schema) {
  const value = Number(schema);
  return Object.fromEntries(Object.entries(FEATURE_SCHEMA).map(([name, minimum]) => [name, value >= minimum]));
}

export function validateHealthContract(health, {
  version,
  schema,
  targetSchema,
  workerVersionId,
  httpStatus = "200",
  requireCompatibility = false,
}) {
  const errors = [];
  if (String(httpStatus) !== "200") errors.push(`health HTTP status was ${httpStatus}, expected 200`);
  if (!health || typeof health !== "object") errors.push("health response was not a JSON object");
  if (health?.ok !== true) errors.push("health response did not contain ok=true");
  if (health?.service !== SERVICE_NAME) errors.push(`health service was ${health?.service ?? "missing"}`);
  if (workerVersionId !== undefined && health?.workerVersionId !== workerVersionId) {
    errors.push(`health Worker version was ${health?.workerVersionId ?? "missing"}, expected ${workerVersionId}`);
  }
  if (version !== undefined && health?.version !== version) errors.push(`health version was ${health?.version ?? "missing"}, expected ${version}`);
  if (schema !== undefined && health?.schema !== schema) errors.push(`health schema was ${health?.schema ?? "missing"}, expected actual schema ${schema}`);

  if (requireCompatibility) {
    if (health?.targetSchema !== targetSchema) {
      errors.push(`health targetSchema was ${health?.targetSchema ?? "missing"}, expected ${targetSchema}`);
    }
    if (!Array.isArray(health?.compatibleSchemas)) {
      errors.push("health compatibleSchemas was missing or not an array");
    } else {
      const unique = new Set(health.compatibleSchemas);
      if (unique.size !== health.compatibleSchemas.length || [...unique].some((value) => !/^[1-9][0-9]*$/u.test(String(value)))) {
        errors.push("health compatibleSchemas must contain unique positive-integer strings");
      }
      if (!unique.has(schema)) errors.push(`health compatibleSchemas does not include current schema ${schema}`);
      if (!unique.has(targetSchema)) errors.push(`health compatibleSchemas does not include target schema ${targetSchema}`);
    }
    const expected = expectedFeatures(schema);
    if (!health?.features || typeof health.features !== "object" || Array.isArray(health.features)) {
      errors.push("health feature readiness was missing or not an object");
    } else {
      for (const [feature, ready] of Object.entries(expected)) {
        if (health.features[feature] !== ready) {
          errors.push(`health feature ${feature} readiness was ${String(health.features[feature])}, expected ${ready} on schema ${schema}`);
        }
      }
    }
  }
  return errors;
}

function migrationsAreComplete(migrationList) {
  return /No migrations to apply!?/iu.test(migrationList);
}

function timestamp() {
  return new Date().toISOString();
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

function expectedDeploymentMessage(receipt, phase) {
  if (!receipt.release.commit || !receipt.release.runId) return null;
  if (phase === "compatibility" && receipt.safety.schemaChanged) {
    return `JAKH compatibility ${receipt.release.commit} target schema ${receipt.source.schema} run ${receipt.release.runId}`;
  }
  return `JAKH final ${receipt.release.commit} schema ${receipt.source.schema} run ${receipt.release.runId}`;
}

export function buildPreflight({
  phase,
  source,
  deployment,
  health,
  databaseResult,
  migrationList,
  environment = process.env,
}) {
  releasePhase(phase);
  const activeVersion = extractActiveVersion(deployment);
  const databaseSchema = extractDatabaseSchema(databaseResult);
  const schemaChanged = databaseSchema !== source.schema;
  const context = releaseContext(environment);
  const errors = validateHealthContract(health, {
    version: phase === "migrate-final" ? source.version : undefined,
    schema: databaseSchema,
    targetSchema: source.schema,
    // A first compatibility rollout may replace a legacy Worker that predates
    // version_metadata. The separate predecessor proof keeps automatic
    // rollback disabled unless that exact old version proves quarantine-safe.
    workerVersionId: phase === "migrate-final" ? activeVersion : undefined,
    requireCompatibility: phase === "migrate-final",
  });

  if (schemaNumber(source.schema, "Target schema") < schemaNumber(databaseSchema, "Current schema")) {
    errors.push(`target schema ${source.schema} would downgrade remote schema ${databaseSchema}`);
  }
  if (schemaChanged && migrationsAreComplete(migrationList)) {
    errors.push(`target schema is ${source.schema}, but Wrangler reports no pending migrations from schema ${databaseSchema}`);
  }
  if (!schemaChanged && !migrationsAreComplete(migrationList)) {
    errors.push(`Wrangler reports pending migrations even though D1 is already at target schema ${source.schema}`);
  }
  if (!source.compatibleSchemas.includes(databaseSchema)) {
    errors.push(`source compatibility range does not include current D1 schema ${databaseSchema}`);
  }
  if (phase === "migrate-final" && !schemaChanged) {
    errors.push("migrate-final requires pending schema work; use compatibility for a code-only release");
  }
  if (phase === "migrate-final") {
    const expectedPrefix = context.commit
      ? `JAKH compatibility ${context.commit} target schema ${source.schema} run `
      : null;
    const activeMessage = deployment.annotations?.["workers/message"];
    if (!expectedPrefix || typeof activeMessage !== "string" || !activeMessage.startsWith(expectedPrefix)) {
      errors.push("active compatibility Worker was not deployed from this exact source commit and target schema");
    }
  }

  const receipt = {
    formatVersion: RECEIPT_FORMAT_VERSION,
    createdAt: timestamp(),
    phase,
    release: context,
    source,
    safety: {
      workerRollbackTarget: activeVersion,
      automaticWorkerRollback: false,
      rollbackProof: null,
      provenCompatibilityWorker: phase === "migrate-final" ? activeVersion : null,
      schemaChanged,
      databaseMutationAllowed: phase === "migrate-final",
      compatibilityEvidenceSource: phase === "migrate-final" ? "active-worker-health-contract" : null,
      automaticDatabaseRollback: false,
      databaseRollbackNotice: "Worker rollback never reverses D1 migrations.",
    },
    preDeployment: {
      capturedAt: timestamp(),
      activeWorkerVersion: activeVersion,
      workerDeployment: deployment,
      health,
      databaseSchema,
      migrationsComplete: migrationsAreComplete(migrationList),
    },
    result: "preflight-pending",
  };
  return { receipt, errors };
}

export function buildPostCompatibility({ receipt, deployment, health, httpStatus, databaseResult, migrationList }) {
  invariant(receipt.phase === "compatibility", "post-compatibility requires a compatibility-phase receipt");
  const activeVersion = extractActiveVersion(deployment);
  const databaseSchema = extractDatabaseSchema(databaseResult);
  const errors = [];
  if (activeVersion === receipt.preDeployment.activeWorkerVersion) errors.push("compatibility deployment did not produce a new active Worker version");
  const expectedMessage = expectedDeploymentMessage(receipt, "compatibility");
  if (expectedMessage && deployment.annotations?.["workers/message"] !== expectedMessage) {
    errors.push("active Worker deployment message does not identify this release run");
  }
  if (databaseSchema !== receipt.preDeployment.databaseSchema) errors.push("D1 schema changed during the code-only compatibility phase");
  if (migrationsAreComplete(migrationList) !== receipt.preDeployment.migrationsComplete) {
    errors.push("D1 migration state changed during the code-only compatibility phase");
  }
  errors.push(...validateHealthContract(health, {
    version: receipt.source.version,
    schema: receipt.preDeployment.databaseSchema,
    targetSchema: receipt.source.schema,
    workerVersionId: activeVersion,
    httpStatus,
    requireCompatibility: true,
  }));
  receipt.compatibilityDeployment = {
    capturedAt: timestamp(),
    activeWorkerVersion: activeVersion,
    workerDeployment: deployment,
    healthHttpStatus: String(httpStatus),
    health,
    databaseSchema,
    migrationsComplete: migrationsAreComplete(migrationList),
  };
  receipt.result = errors.length === 0
    ? (receipt.safety.schemaChanged ? "compatibility-worker-verified" : "code-only-final-worker-verified")
    : "compatibility-verification-failed";
  return { receipt, errors };
}

export function buildPostMigration({ receipt, deployment, health, httpStatus, databaseResult, migrationList }) {
  invariant(receipt.phase === "migrate-final", "post-migration requires a migrate-final receipt");
  const activeVersion = extractActiveVersion(deployment);
  const databaseSchema = extractDatabaseSchema(databaseResult);
  const errors = [];
  if (activeVersion !== receipt.safety.provenCompatibilityWorker) {
    errors.push("the active compatibility Worker changed while D1 migrations were being applied");
  }
  if (databaseSchema !== receipt.source.schema) errors.push(`D1 schema is ${databaseSchema}, expected ${receipt.source.schema} after migrations`);
  if (!migrationsAreComplete(migrationList)) errors.push("Wrangler still reports pending migrations after migration apply");
  errors.push(...validateHealthContract(health, {
    version: receipt.source.version,
    schema: receipt.source.schema,
    targetSchema: receipt.source.schema,
    workerVersionId: activeVersion,
    httpStatus,
    requireCompatibility: true,
  }));
  receipt.afterMigrations = {
    capturedAt: timestamp(),
    activeWorkerVersion: activeVersion,
    workerDeployment: deployment,
    healthHttpStatus: String(httpStatus),
    health,
    databaseSchema,
    migrationsComplete: migrationsAreComplete(migrationList),
  };
  receipt.result = errors.length === 0 ? "migration-compatibility-passed" : "migration-compatibility-failed";
  return { receipt, errors };
}

export function buildPostDeploy({ receipt, deployment, health, httpStatus, databaseResult, migrationList }) {
  invariant(receipt.phase === "migrate-final", "post-deploy requires a migrate-final receipt");
  const activeVersion = extractActiveVersion(deployment);
  const databaseSchema = extractDatabaseSchema(databaseResult);
  const errors = [];
  if (activeVersion === receipt.safety.provenCompatibilityWorker) errors.push("final deployment did not produce a new active Worker version");
  const expectedMessage = expectedDeploymentMessage(receipt, "final");
  if (expectedMessage && deployment.annotations?.["workers/message"] !== expectedMessage) {
    errors.push("active Worker deployment message does not identify this final release run");
  }
  if (databaseSchema !== receipt.source.schema) errors.push(`D1 schema is ${databaseSchema}, expected ${receipt.source.schema}`);
  if (!migrationsAreComplete(migrationList)) errors.push("Wrangler reports pending migrations after final Worker deployment");
  errors.push(...validateHealthContract(health, {
    version: receipt.source.version,
    schema: receipt.source.schema,
    targetSchema: receipt.source.schema,
    workerVersionId: activeVersion,
    httpStatus,
    requireCompatibility: true,
  }));
  receipt.postDeployment = {
    capturedAt: timestamp(),
    activeWorkerVersion: activeVersion,
    workerDeployment: deployment,
    healthHttpStatus: String(httpStatus),
    health,
    databaseSchema,
    migrationsComplete: migrationsAreComplete(migrationList),
  };
  receipt.result = errors.length === 0 ? "deployed-and-verified" : "post-deploy-verification-failed";
  return { receipt, errors };
}

export function buildPostRollback({ receipt, deployment, health, httpStatus, databaseResult, migrationList }) {
  const activeVersion = extractActiveVersion(deployment);
  const databaseSchema = extractDatabaseSchema(databaseResult);
  const expectedSchema = receipt.phase === "compatibility"
    ? receipt.preDeployment.databaseSchema
    : receipt.source.schema;
  const errors = [];
  if (activeVersion !== receipt.safety.workerRollbackTarget) {
    errors.push(`rollback activated ${activeVersion}, expected ${receipt.safety.workerRollbackTarget}`);
  }
  if (databaseSchema !== expectedSchema) errors.push(`D1 schema is ${databaseSchema}, expected ${expectedSchema}; D1 is not automatically reversed`);
  if (receipt.phase === "migrate-final" && !migrationsAreComplete(migrationList)) {
    errors.push("Wrangler reports pending migrations after final-phase Worker rollback");
  }
  errors.push(...validateHealthContract(health, {
    version: receipt.phase === "compatibility" ? receipt.preDeployment.health.version : receipt.source.version,
    schema: expectedSchema,
    targetSchema: receipt.source.schema,
    workerVersionId: activeVersion,
    httpStatus,
    requireCompatibility: receipt.phase === "migrate-final",
  }));
  receipt.rollback = {
    capturedAt: timestamp(),
    activeWorkerVersion: activeVersion,
    workerDeployment: deployment,
    healthHttpStatus: String(httpStatus),
    health,
    databaseSchema,
    databaseRolledBack: false,
    migrationsComplete: migrationsAreComplete(migrationList),
  };
  receipt.result = errors.length === 0 ? "worker-rolled-back-and-verified" : "worker-rollback-verification-failed";
  return { receipt, errors };
}

export function applyRuntimeProof({
  receipt,
  stage,
  deploymentBefore,
  deploymentAfter,
  monitorReport,
  allowCompatibleSchema,
  generatedAt,
}) {
  invariant(
    ["rollback-target", "post-migration", "candidate", "rollback"].includes(stage),
    "runtime proof stage must be rollback-target, post-migration, candidate, or rollback",
  );
  if (stage === "post-migration") {
    invariant(receipt.phase === "migrate-final", "post-migration runtime proof requires migrate-final");
    invariant(receipt.afterMigrations, "post-migration state must be verified before its runtime proof");
  }
  if (stage === "rollback") invariant(receipt.rollback, "rollback state must be verified before its runtime proof");
  if (stage === "candidate") {
    const candidate = receipt.phase === "compatibility" ? receipt.compatibilityDeployment : receipt.postDeployment;
    invariant(candidate, "candidate state must be verified before its runtime proof");
  }
  const targetVersion = stage === "rollback-target"
    ? receipt.safety.workerRollbackTarget
    : stage === "post-migration"
      ? receipt.safety.provenCompatibilityWorker
      : stage === "candidate"
        ? (receipt.phase === "compatibility"
            ? receipt.compatibilityDeployment.activeWorkerVersion
            : receipt.postDeployment.activeWorkerVersion)
      : receipt.safety.workerRollbackTarget;
  const proof = buildVersionBoundMonitorProof({
    targetVersion,
    deploymentBefore,
    deploymentAfter,
    monitorReport,
    scope: "api",
    allowCompatibleSchema,
    generatedAt,
  });
  if (stage === "rollback-target") {
    receipt.safety.rollbackProof = proof;
    receipt.safety.automaticWorkerRollback = proof.safe;
  } else if (stage === "post-migration") {
    receipt.afterMigrations.runtimeProof = proof;
    receipt.safety.rollbackProof = proof;
    receipt.safety.automaticWorkerRollback = proof.safe;
    if (!proof.safe) receipt.result = "migration-quarantine-proof-failed";
  } else if (stage === "candidate") {
    const candidate = receipt.phase === "compatibility" ? receipt.compatibilityDeployment : receipt.postDeployment;
    candidate.runtimeProof = proof;
    if (!proof.safe) receipt.result = "post-deploy-verification-failed";
  } else {
    receipt.rollback.runtimeProof = proof;
    if (!proof.safe) receipt.result = "worker-rollback-verification-failed";
  }
  return { receipt, proof };
}

export function finalizeReceipt(receipt, outcomes) {
  receipt.finalizedAt = timestamp();
  receipt.workflowSteps = outcomes;
  if (outcomes.preflight === "failure") receipt.result = "preflight-failed";
  else if (outcomes.rollbackProof === "failure") receipt.result = "rollback-target-proof-failed";
  else if (receipt.phase === "compatibility") {
    if (outcomes.compatibilityDeploy === "failure") receipt.result = "compatibility-worker-deploy-failed";
    else if (outcomes.productionVerification === "failure" && receipt.safety.automaticWorkerRollback !== true) receipt.result = "automatic-worker-rollback-withheld-unsafe-predecessor";
    else if (outcomes.productionVerification === "failure" && outcomes.workerRollback === "failure") receipt.result = "automatic-worker-rollback-failed";
    else if (outcomes.productionVerification === "failure" && outcomes.workerRollback === "success" && outcomes.rollbackVerification === "failure") receipt.result = "worker-rollback-verification-failed";
  } else if (outcomes.migrationAuthorization !== "success") receipt.result = "migration-authorization-blocked";
  else if (outcomes.migrations === "failure") receipt.result = "migration-apply-failed";
  else if (outcomes.migrationCompatibility === "failure") receipt.result = "migration-compatibility-failed";
  else if (outcomes.migrationQuarantineProof === "failure") receipt.result = "migration-quarantine-proof-failed";
  else if (outcomes.finalDeploy === "failure") receipt.result = "worker-deploy-failed";
  else if (outcomes.productionVerification === "failure" && receipt.safety.automaticWorkerRollback !== true) receipt.result = "automatic-worker-rollback-withheld-unsafe-predecessor";
  else if (outcomes.productionVerification === "failure" && outcomes.workerRollback === "failure") receipt.result = "automatic-worker-rollback-failed";
  else if (outcomes.productionVerification === "failure" && outcomes.workerRollback === "success" && outcomes.rollbackVerification === "failure") receipt.result = "worker-rollback-verification-failed";
  if (
    outcomes.productionVerification === "failure"
    && receipt.safety.automaticWorkerRollback === true
    && outcomes.workerRollback !== "success"
    && !receipt.rollback
  ) {
    receipt.result = "post-deploy-verification-failed-without-confirmed-rollback";
  }
  return receipt;
}

function failOnErrors(errors) {
  if (errors.length === 0) return;
  for (const error of errors) process.stderr.write(`::error title=API release safety gate::${error}\n`);
  throw new Error(`${errors.length} API release safety gate(s) failed`);
}

async function readHealth(path) {
  try {
    return await readJson(path);
  } catch (error) {
    return { parseError: error.message };
  }
}

async function appendOutputs(path, values) {
  if (!path) return;
  await appendFile(path, `${Object.entries(values).map(([name, value]) => `${name}=${value}`).join("\n")}\n`, "utf8");
}

async function loadCapturedState(options) {
  return {
    deployment: await readJson(requireOption(options, "deployment")),
    health: await readHealth(requireOption(options, "health")),
    databaseResult: await readJson(requireOption(options, "database")),
    migrationList: await readFile(requireOption(options, "migrations"), "utf8"),
  };
}

async function commandPreflight(options) {
  const source = await inspectSource();
  const phase = releasePhase(requireOption(options, "phase"));
  const { receipt, errors } = buildPreflight({ phase, source, ...await loadCapturedState(options) });
  await writeJson(requireOption(options, "receipt"), receipt);
  await appendOutputs(options["github-output"], {
    "rollback-version": receipt.safety.workerRollbackTarget,
    "target-schema": receipt.source.schema,
    "current-schema": receipt.preDeployment.databaseSchema,
    "schema-changed": receipt.safety.schemaChanged,
  });
  failOnErrors(errors);
}

async function commandStateTransition(options, builder) {
  const receiptPath = requireOption(options, "receipt");
  const receipt = await readJson(receiptPath);
  const result = builder({
    receipt,
    ...await loadCapturedState(options),
    httpStatus: requireOption(options, "http-status"),
  });
  await writeJson(receiptPath, result.receipt);
  failOnErrors(result.errors);
}

function booleanOption(options, name, fallback = false) {
  const value = options[name];
  if (value === undefined) return fallback;
  invariant(value === "true" || value === "false", `--${name} must be true or false`);
  return value === "true";
}

async function commandRuntimeProof(options) {
  const receiptPath = requireOption(options, "receipt");
  const receipt = await readJson(receiptPath);
  const stage = requireOption(options, "stage");
  const result = applyRuntimeProof({
    receipt,
    stage,
    deploymentBefore: await readJson(requireOption(options, "deployment-before")),
    deploymentAfter: await readJson(requireOption(options, "deployment-after")),
    monitorReport: await readJson(requireOption(options, "monitor")),
    allowCompatibleSchema: booleanOption(options, "allow-compatible-schema"),
  });
  await writeJson(receiptPath, result.receipt);
  await appendOutputs(options["github-output"], { "rollback-safe": result.proof.safe });
  const requireSafe = booleanOption(options, "require-safe");
  const errors = [
    ...result.proof.bindingErrors,
    ...(requireSafe ? result.proof.monitorErrors : []),
  ];
  failOnErrors(errors);
}

async function commandProbe(options) {
  const stage = requireOption(options, "stage");
  const receipt = await readJson(requireOption(options, "receipt"));
  const health = await readHealth(requireOption(options, "health"));
  invariant(["compatibility", "migration", "final", "rollback"].includes(stage), "--stage must be compatibility, migration, final, or rollback");
  const isRollback = stage === "rollback";
  const phaseARollback = isRollback && receipt.phase === "compatibility";
  const schema = stage === "compatibility" || phaseARollback
    ? receipt.preDeployment.databaseSchema
    : receipt.source.schema;
  const version = phaseARollback ? receipt.preDeployment.health.version : receipt.source.version;
  const errors = validateHealthContract(health, {
    version,
    schema,
    targetSchema: receipt.source.schema,
    workerVersionId: requireOption(options, "expected-worker-version"),
    httpStatus: requireOption(options, "http-status"),
    requireCompatibility: !phaseARollback,
  });
  invariant(errors.length === 0, errors.join("; "));
}

async function commandFinalize(options) {
  const receiptPath = requireOption(options, "receipt");
  const receipt = await readJson(receiptPath);
  finalizeReceipt(receipt, {
    preflight: requireOption(options, "preflight-outcome"),
    compatibilityDeploy: requireOption(options, "compatibility-deploy-outcome"),
    migrations: requireOption(options, "migrations-outcome"),
    migrationCompatibility: requireOption(options, "migration-compatibility-outcome"),
    finalDeploy: requireOption(options, "final-deploy-outcome"),
    productionVerification: requireOption(options, "production-verification-outcome"),
    workerRollback: requireOption(options, "worker-rollback-outcome"),
    rollbackVerification: requireOption(options, "rollback-verification-outcome"),
    rollbackProof: requireOption(options, "rollback-proof-outcome"),
    migrationQuarantineProof: requireOption(options, "migration-quarantine-proof-outcome"),
    migrationAuthorization: requireOption(options, "migration-authorization-outcome"),
  });
  await writeJson(receiptPath, receipt);
}

async function commandSummary(options) {
  const receipt = await readJson(requireOption(options, "receipt"));
  const summary = [
    "## API production release receipt",
    "",
    `- Result: **${receipt.result}**`,
    `- Phase: \`${receipt.phase}\``,
    `- Source: \`${receipt.release.commit ?? "unknown"}\``,
    `- Target API: \`${receipt.source.version}\`, schema \`${receipt.source.schema}\``,
    `- Preflight D1 schema: \`${receipt.preDeployment.databaseSchema}\``,
    `- Worker rollback target: \`${receipt.safety.workerRollbackTarget}\``,
    `- Automatic Worker rollback eligible: \`${receipt.safety.automaticWorkerRollback === true}\``,
    `- Database mutation allowed in this phase: \`${receipt.safety.databaseMutationAllowed}\``,
    "- D1 automatic rollback: `false`",
  ];
  if (receipt.safety.rollbackProof) {
    summary.push(`- Rollback quarantine proof: \`${receipt.safety.rollbackProof.safe ? "safe" : "unsafe"}\``);
    if (receipt.safety.rollbackProof.monitorErrors?.length) {
      summary.push(`- Rollback withheld reason: ${receipt.safety.rollbackProof.monitorErrors.join("; ")}`);
    }
  }
  if (receipt.compatibilityDeployment?.activeWorkerVersion) summary.push(`- Compatibility Worker: \`${receipt.compatibilityDeployment.activeWorkerVersion}\``);
  if (receipt.postDeployment?.activeWorkerVersion) summary.push(`- Final Worker: \`${receipt.postDeployment.activeWorkerVersion}\``);
  if (receipt.rollback?.activeWorkerVersion) {
    summary.push(`- Active Worker after rollback: \`${receipt.rollback.activeWorkerVersion}\``);
    summary.push(`- D1 schema after Worker rollback: \`${receipt.rollback.databaseSchema}\` (not reversed)`);
  }
  await appendFile(requireOption(options, "github-summary"), `${summary.join("\n")}\n`, "utf8");
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  switch (command) {
    case "validate-source": {
      const source = await inspectSource();
      process.stdout.write(`API release source is consistent: ${source.service} ${source.version}, target schema ${source.schema}, compatible schemas ${source.compatibleSchemas.join(", ")}.\n`);
      break;
    }
    case "preflight": await commandPreflight(options); break;
    case "post-compatibility": await commandStateTransition(options, buildPostCompatibility); break;
    case "post-migration": await commandStateTransition(options, buildPostMigration); break;
    case "post-deploy": await commandStateTransition(options, buildPostDeploy); break;
    case "post-rollback": await commandStateTransition(options, buildPostRollback); break;
    case "runtime-proof": await commandRuntimeProof(options); break;
    case "active-version": {
      process.stdout.write(extractActiveVersion(await readJson(requireOption(options, "deployment"))));
      break;
    }
    case "probe": await commandProbe(options); break;
    case "finalize": await commandFinalize(options); break;
    case "summary": await commandSummary(options); break;
    default: throw new Error(`Unknown command: ${command ?? "missing"}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
