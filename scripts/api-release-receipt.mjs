#!/usr/bin/env node

import { appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIR, "..");
const SERVICE_NAME = "jakh-api";
const RECEIPT_FORMAT_VERSION = 1;

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

export async function inspectSource(repositoryRoot = REPOSITORY_ROOT) {
  const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, "worker/package.json"), "utf8"));
  invariant(
    typeof packageJson.version === "string" && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(packageJson.version),
    "worker/package.json must contain a semantic version"
  );

  const routesSource = await readFile(resolve(repositoryRoot, "worker/src/routes.ts"), "utf8");
  const runtimeSchemaMatch = routesSource.match(/const\s+SCHEMA_VERSION\s*=\s*["']([^"']+)["']/u);
  invariant(runtimeSchemaMatch, "worker/src/routes.ts must declare SCHEMA_VERSION as a string literal");
  const runtimeSchema = runtimeSchemaMatch[1];
  schemaNumber(runtimeSchema, "Runtime schema version");

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
      `D1 migrations must be contiguous from 0001; expected ${String(index + 1).padStart(4, "0")}, found ${name}`
    );
    const sql = await readFile(resolve(migrationsDirectory, name), "utf8");
    const schemaMatch = sql.match(
      /VALUES\s*\(\s*["']schema_version["']\s*,\s*["']([^"']+)["']\s*\)/iu
    );
    invariant(schemaMatch, `${name} must record its schema_version in schema_meta`);
    invariant(
      schemaMatch[1] === String(migrationNumber),
      `${name} records schema ${schemaMatch[1]}, expected ${migrationNumber}`
    );
    migrations.push({ name, schema: schemaMatch[1] });
  }

  const migrationSchema = migrations.at(-1).schema;
  invariant(
    runtimeSchema === migrationSchema,
    `Worker schema ${runtimeSchema} does not match latest migration schema ${migrationSchema}`
  );

  return {
    service: SERVICE_NAME,
    version: packageJson.version,
    schema: runtimeSchema,
    migrations,
  };
}

function findFailedD1Operation(value) {
  if (Array.isArray(value)) {
    return value.some(findFailedD1Operation);
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  if (value.success === false) {
    return true;
  }
  return Object.values(value).some(findFailedD1Operation);
}

function collectSchemaValues(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSchemaValues(item, output);
    }
    return output;
  }
  if (!value || typeof value !== "object") {
    return output;
  }
  if (Array.isArray(value.results)) {
    for (const row of value.results) {
      if (row && typeof row === "object" && Object.hasOwn(row, "value")) {
        output.push(String(row.value));
      }
    }
  }
  for (const nested of Object.values(value)) {
    collectSchemaValues(nested, output);
  }
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
    "Production must have exactly one Worker version serving 100% of traffic before this release"
  );
  const versionId = deployment.versions[0].version_id;
  invariant(
    typeof versionId === "string" && /^[0-9A-Za-z][0-9A-Za-z._-]{5,127}$/u.test(versionId),
    "Active Worker version ID is missing or malformed"
  );
  return versionId;
}

function validateHealth(health, { version, schema, httpStatus = "200" }) {
  const errors = [];
  if (String(httpStatus) !== "200") errors.push(`health HTTP status was ${httpStatus}, expected 200`);
  if (!health || typeof health !== "object") errors.push("health response was not a JSON object");
  if (health?.ok !== true) errors.push("health response did not contain ok=true");
  if (health?.service !== SERVICE_NAME) errors.push(`health service was ${health?.service ?? "missing"}`);
  if (version !== undefined && health?.version !== version) {
    errors.push(`health version was ${health?.version ?? "missing"}, expected ${version}`);
  }
  if (schema !== undefined && health?.schema !== schema) {
    errors.push(`health schema was ${health?.schema ?? "missing"}, expected ${schema}`);
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

export function buildPreflight({
  source,
  deployment,
  health,
  databaseResult,
  migrationList,
  rollbackCompatibleSchema = "",
  environment = process.env,
}) {
  const activeVersion = extractActiveVersion(deployment);
  const databaseSchema = extractDatabaseSchema(databaseResult);
  const errors = validateHealth(health, { schema: databaseSchema });
  const schemaChanged = databaseSchema !== source.schema;

  if (schemaNumber(source.schema, "Target schema") < schemaNumber(databaseSchema, "Current schema")) {
    errors.push(`target schema ${source.schema} would downgrade remote schema ${databaseSchema}`);
  }
  if (schemaChanged && migrationsAreComplete(migrationList)) {
    errors.push(`target schema is ${source.schema}, but Wrangler reports no pending migrations from schema ${databaseSchema}`);
  }
  if (!schemaChanged && !migrationsAreComplete(migrationList)) {
    errors.push(`Wrangler reports pending migrations even though D1 is already at target schema ${source.schema}`);
  }
  if (schemaChanged && rollbackCompatibleSchema !== source.schema) {
    errors.push(
      `schema-changing releases require rollback-compatible-schema=${source.schema} after verifying the active Worker against that schema`
    );
  }

  const receipt = {
    formatVersion: RECEIPT_FORMAT_VERSION,
    createdAt: timestamp(),
    release: releaseContext(environment),
    source,
    safety: {
      workerRollbackTarget: activeVersion,
      schemaChanged,
      rollbackCompatibilityDeclaration: rollbackCompatibleSchema || null,
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

export function buildPostMigration({ receipt, deployment, health, httpStatus, databaseResult, migrationList }) {
  const activeVersion = extractActiveVersion(deployment);
  const databaseSchema = extractDatabaseSchema(databaseResult);
  const errors = [];
  if (activeVersion !== receipt.preDeployment.activeWorkerVersion) {
    errors.push("the active Worker changed while D1 migrations were being applied");
  }
  if (databaseSchema !== receipt.source.schema) {
    errors.push(`D1 schema is ${databaseSchema}, expected ${receipt.source.schema} after migrations`);
  }
  if (!migrationsAreComplete(migrationList)) {
    errors.push("Wrangler still reports pending migrations after migration apply");
  }
  errors.push(
    ...validateHealth(health, {
      version: receipt.preDeployment.health.version,
      schema: receipt.source.schema,
      httpStatus,
    })
  );

  receipt.afterMigrations = {
    capturedAt: timestamp(),
    activeWorkerVersion: activeVersion,
    workerDeployment: deployment,
    healthHttpStatus: String(httpStatus ?? "200"),
    health,
    databaseSchema,
    migrationsComplete: migrationsAreComplete(migrationList),
  };
  receipt.result = errors.length === 0 ? "migration-compatibility-passed" : "migration-compatibility-failed";
  return { receipt, errors };
}

export function buildPostDeploy({ receipt, deployment, health, httpStatus, databaseResult, migrationList }) {
  const activeVersion = extractActiveVersion(deployment);
  const databaseSchema = extractDatabaseSchema(databaseResult);
  const errors = [];
  const expectedMessage =
    receipt.release.commit && receipt.release.runId
      ? `GitHub Actions ${receipt.release.commit} run ${receipt.release.runId}`
      : null;
  if (activeVersion === receipt.preDeployment.activeWorkerVersion) {
    errors.push("Worker deployment did not produce a new active version");
  }
  if (expectedMessage && deployment.annotations?.["workers/message"] !== expectedMessage) {
    errors.push("active Worker deployment message does not identify this GitHub release run");
  }
  if (databaseSchema !== receipt.source.schema) {
    errors.push(`D1 schema is ${databaseSchema}, expected ${receipt.source.schema}`);
  }
  if (!migrationsAreComplete(migrationList)) {
    errors.push("Wrangler reports pending migrations after Worker deployment");
  }
  errors.push(
    ...validateHealth(health, {
      version: receipt.source.version,
      schema: receipt.source.schema,
      httpStatus,
    })
  );

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
  const errors = [];
  if (activeVersion !== receipt.preDeployment.activeWorkerVersion) {
    errors.push(`rollback activated ${activeVersion}, expected ${receipt.preDeployment.activeWorkerVersion}`);
  }
  if (databaseSchema !== receipt.source.schema) {
    errors.push(
      `D1 schema is ${databaseSchema}, expected migrated schema ${receipt.source.schema}; D1 is not automatically reversed`
    );
  }
  if (!migrationsAreComplete(migrationList)) {
    errors.push("Wrangler reports pending migrations after Worker rollback");
  }
  errors.push(
    ...validateHealth(health, {
      version: receipt.preDeployment.health.version,
      schema: receipt.source.schema,
      httpStatus,
    })
  );

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

export function finalizeReceipt(receipt, outcomes) {
  receipt.finalizedAt = timestamp();
  receipt.workflowSteps = outcomes;

  if (outcomes.migrations === "failure") {
    receipt.result = "migration-apply-failed";
  } else if (outcomes.migrationCompatibility === "failure") {
    receipt.result = "migration-compatibility-failed";
  } else if (outcomes.workerDeploy === "failure") {
    receipt.result = "worker-deploy-failed";
  } else if (outcomes.productionVerification === "failure" && outcomes.workerRollback === "failure") {
    receipt.result = "automatic-worker-rollback-failed";
  } else if (
    outcomes.productionVerification === "failure" &&
    outcomes.workerRollback === "success" &&
    outcomes.rollbackVerification === "failure"
  ) {
    receipt.result = "worker-rollback-verification-failed";
  } else if (
    outcomes.productionVerification === "failure" &&
    outcomes.workerRollback !== "success" &&
    !receipt.rollback
  ) {
    receipt.result = "post-deploy-verification-failed-without-confirmed-rollback";
  }

  return receipt;
}

function failOnErrors(errors) {
  if (errors.length === 0) return;
  for (const error of errors) {
    process.stderr.write(`::error title=API release safety gate::${error}\n`);
  }
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
  const lines = Object.entries(values).map(([name, value]) => `${name}=${value}`).join("\n");
  await appendFile(path, `${lines}\n`, "utf8");
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
  const state = await loadCapturedState(options);
  const { receipt, errors } = buildPreflight({
    source,
    ...state,
    rollbackCompatibleSchema: options["rollback-compatible-schema"] ?? "",
  });
  await writeJson(requireOption(options, "receipt"), receipt);
  await appendOutputs(options["github-output"], {
    "rollback-version": receipt.safety.workerRollbackTarget,
    "target-schema": receipt.source.schema,
    "schema-changed": receipt.safety.schemaChanged,
  });
  failOnErrors(errors);
}

async function commandPostMigration(options) {
  const receiptPath = requireOption(options, "receipt");
  const receipt = await readJson(receiptPath);
  const state = await loadCapturedState(options);
  const result = buildPostMigration({ receipt, ...state, httpStatus: options["http-status"] ?? "200" });
  await writeJson(receiptPath, result.receipt);
  failOnErrors(result.errors);
}

async function commandPostDeploy(options) {
  const receiptPath = requireOption(options, "receipt");
  const receipt = await readJson(receiptPath);
  const state = await loadCapturedState(options);
  const result = buildPostDeploy({
    receipt,
    ...state,
    httpStatus: requireOption(options, "http-status"),
  });
  await writeJson(receiptPath, result.receipt);
  failOnErrors(result.errors);
}

async function commandPostRollback(options) {
  const receiptPath = requireOption(options, "receipt");
  const receipt = await readJson(receiptPath);
  const state = await loadCapturedState(options);
  const result = buildPostRollback({
    receipt,
    ...state,
    httpStatus: requireOption(options, "http-status"),
  });
  await writeJson(receiptPath, result.receipt);
  failOnErrors(result.errors);
}

async function commandProbe(options) {
  const phase = requireOption(options, "phase");
  const receipt = await readJson(requireOption(options, "receipt"));
  const health = await readHealth(requireOption(options, "health"));
  const expectedVersion =
    phase === "rollback" || phase === "migration"
      ? receipt.preDeployment.health.version
      : receipt.source.version;
  invariant(
    phase === "deploy" || phase === "migration" || phase === "rollback",
    "--phase must be deploy, migration, or rollback"
  );
  const errors = validateHealth(health, {
    version: expectedVersion,
    schema: receipt.source.schema,
    httpStatus: requireOption(options, "http-status"),
  });
  invariant(errors.length === 0, errors.join("; "));
}

async function commandFinalize(options) {
  const receiptPath = requireOption(options, "receipt");
  const receipt = await readJson(receiptPath);
  finalizeReceipt(receipt, {
    migrations: requireOption(options, "migrations-outcome"),
    migrationCompatibility: requireOption(options, "migration-compatibility-outcome"),
    workerDeploy: requireOption(options, "worker-deploy-outcome"),
    productionVerification: requireOption(options, "production-verification-outcome"),
    workerRollback: requireOption(options, "worker-rollback-outcome"),
    rollbackVerification: requireOption(options, "rollback-verification-outcome"),
  });
  await writeJson(receiptPath, receipt);
}

async function commandSummary(options) {
  const receipt = await readJson(requireOption(options, "receipt"));
  const summary = [
    "## API production release receipt",
    "",
    `- Result: **${receipt.result}**`,
    `- Source: \`${receipt.release.commit ?? "unknown"}\``,
    `- Target API: \`${receipt.source.version}\`, schema \`${receipt.source.schema}\``,
    `- Worker rollback target: \`${receipt.safety.workerRollbackTarget}\``,
    `- Schema changed: \`${receipt.safety.schemaChanged}\``,
    "- D1 automatic rollback: `false`",
  ];
  if (receipt.postDeployment?.activeWorkerVersion) {
    summary.push(`- Deployed Worker: \`${receipt.postDeployment.activeWorkerVersion}\``);
  }
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
      process.stdout.write(
        `API release source is consistent: ${source.service} ${source.version}, schema ${source.schema}, ${source.migrations.length} migrations.\n`
      );
      break;
    }
    case "preflight":
      await commandPreflight(options);
      break;
    case "post-migration":
      await commandPostMigration(options);
      break;
    case "post-deploy":
      await commandPostDeploy(options);
      break;
    case "post-rollback":
      await commandPostRollback(options);
      break;
    case "probe":
      await commandProbe(options);
      break;
    case "finalize":
      await commandFinalize(options);
      break;
    case "summary":
      await commandSummary(options);
      break;
    default:
      throw new Error(`Unknown command: ${command ?? "missing"}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
