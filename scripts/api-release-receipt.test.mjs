import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPostDeploy,
  buildPostMigration,
  buildPostRollback,
  buildPreflight,
  extractActiveVersion,
  extractDatabaseSchema,
  finalizeReceipt,
  inspectSource,
} from "./api-release-receipt.mjs";

const OLD_VERSION_ID = "11111111-1111-4111-8111-111111111111";
const NEW_VERSION_ID = "22222222-2222-4222-8222-222222222222";

function deployment(versionId, percentage = 100, message) {
  return {
    id: `deployment-${versionId}`,
    created_on: "2026-08-01T00:00:00.000Z",
    ...(message ? { annotations: { "workers/message": message } } : {}),
    versions: [{ version_id: versionId, percentage }],
  };
}

function database(schema) {
  return [{ results: [{ value: schema }], success: true }];
}

function health(version, schema) {
  return { ok: true, service: "jakh-api", version, schema };
}

function source(schema = "5", version = "1.4.0") {
  return {
    service: "jakh-api",
    version,
    schema,
    migrations: Array.from({ length: Number(schema) }, (_, index) => ({
      name: `${String(index + 1).padStart(4, "0")}_migration.sql`,
      schema: String(index + 1),
    })),
  };
}

function successfulPreflight(overrides = {}) {
  const result = buildPreflight({
    source: source(),
    deployment: deployment(OLD_VERSION_ID),
    health: health("1.4.0", "5"),
    databaseResult: database("5"),
    migrationList: "✅ No migrations to apply!",
    environment: {
      GITHUB_SHA: "abc123",
      GITHUB_RUN_ID: "98765",
      GITHUB_ACTOR: "release-operator",
    },
    ...overrides,
  });
  assert.deepEqual(result.errors, []);
  return result.receipt;
}

test("repository Worker and migrations declare one consistent schema", async () => {
  const releaseSource = await inspectSource();
  assert.equal(releaseSource.service, "jakh-api");
  assert.match(releaseSource.version, /^\d+\.\d+\.\d+/u);
  assert.deepEqual(
    releaseSource.migrations.map((migration) => migration.schema),
    Array.from({ length: releaseSource.migrations.length }, (_, index) => String(index + 1))
  );
  assert.equal(releaseSource.schema, releaseSource.migrations.at(-1).schema);
});

test("deployment workflow rolls back an explicit version non-interactively", async () => {
  const workflow = await readFile(new URL("../.github/workflows/api-deploy.yml", import.meta.url), "utf8");
  assert.match(workflow, /rollback \$\{\{ steps\.preflight\.outputs\.rollback-version \}\}/u);
  assert.match(workflow, /--message "Automatic rollback/u);
  assert.doesNotMatch(workflow, /rollback[^\n]*--yes|--yes[^\n]*rollback/u);
});

test("preflight records the exact single-version rollback target", () => {
  const receipt = successfulPreflight();
  assert.equal(receipt.safety.workerRollbackTarget, OLD_VERSION_ID);
  assert.equal(receipt.safety.schemaChanged, false);
  assert.equal(receipt.safety.automaticDatabaseRollback, false);
});

test("split production traffic is rejected because rollback could not restore it exactly", () => {
  assert.throws(
    () =>
      extractActiveVersion({
        versions: [
          { version_id: OLD_VERSION_ID, percentage: 90 },
          { version_id: NEW_VERSION_ID, percentage: 10 },
        ],
      }),
    /exactly one Worker version/u
  );
});

test("schema-changing release requires an explicit compatibility declaration", () => {
  const result = buildPreflight({
    source: source("6", "1.5.0"),
    deployment: deployment(OLD_VERSION_ID),
    health: health("1.4.0", "5"),
    databaseResult: database("5"),
    migrationList: "Migrations to be applied:\n0006_expand.sql",
  });
  assert.match(result.errors.join("\n"), /rollback-compatible-schema=6/u);

  const declared = buildPreflight({
    source: source("6", "1.5.0"),
    deployment: deployment(OLD_VERSION_ID),
    health: health("1.4.0", "5"),
    databaseResult: database("5"),
    migrationList: "Migrations to be applied:\n0006_expand.sql",
    rollbackCompatibleSchema: "6",
  });
  assert.deepEqual(declared.errors, []);
});

test("post-migration gate requires the previous Worker to stay healthy on the new schema", () => {
  const receipt = successfulPreflight({
    source: source("6", "1.5.0"),
    databaseResult: database("5"),
    migrationList: "Migrations to be applied:\n0006_expand.sql",
    rollbackCompatibleSchema: "6",
  });
  const result = buildPostMigration({
    receipt,
    deployment: deployment(OLD_VERSION_ID),
    health: health("1.4.0", "5"),
    databaseResult: database("6"),
    migrationList: "✅ No migrations to apply!",
  });
  assert.match(result.errors.join("\n"), /health schema was 5, expected 6/u);
  assert.equal(result.receipt.result, "migration-compatibility-failed");
});

test("verified deployment records the new Worker and migrated D1 state", () => {
  const receipt = successfulPreflight();
  const migrationResult = buildPostMigration({
    receipt,
    deployment: deployment(OLD_VERSION_ID),
    health: health("1.4.0", "5"),
    databaseResult: database("5"),
    migrationList: "✅ No migrations to apply!",
  });
  assert.deepEqual(migrationResult.errors, []);

  const deployResult = buildPostDeploy({
    receipt: migrationResult.receipt,
    deployment: deployment(NEW_VERSION_ID, 100, "GitHub Actions abc123 run 98765"),
    health: health("1.4.0", "5"),
    httpStatus: "200",
    databaseResult: database("5"),
    migrationList: "✅ No migrations to apply!",
  });
  assert.deepEqual(deployResult.errors, []);
  assert.equal(deployResult.receipt.result, "deployed-and-verified");
  assert.equal(deployResult.receipt.postDeployment.activeWorkerVersion, NEW_VERSION_ID);
});

test("rollback receipt proves the Worker reverted while D1 did not", () => {
  const receipt = successfulPreflight();
  receipt.postDeployment = { activeWorkerVersion: NEW_VERSION_ID };
  receipt.result = "post-deploy-verification-failed";

  const result = buildPostRollback({
    receipt,
    deployment: deployment(OLD_VERSION_ID),
    health: health("1.4.0", "5"),
    httpStatus: "200",
    databaseResult: database("5"),
    migrationList: "✅ No migrations to apply!",
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.result, "worker-rolled-back-and-verified");
  assert.equal(result.receipt.rollback.databaseRolledBack, false);
});

test("D1 parser rejects ambiguous or failed schema queries", () => {
  assert.equal(extractDatabaseSchema(database("5")), "5");
  assert.throws(() => extractDatabaseSchema([{ results: [], success: false }]), /failed operation/u);
  assert.throws(
    () => extractDatabaseSchema([{ results: [{ value: "4" }, { value: "5" }], success: true }]),
    /Expected one/u
  );
});

test("final receipt cannot hide a failed automatic Worker rollback", () => {
  const receipt = successfulPreflight();
  receipt.result = "post-deploy-verification-failed";
  finalizeReceipt(receipt, {
    migrations: "success",
    migrationCompatibility: "success",
    workerDeploy: "success",
    productionVerification: "failure",
    workerRollback: "failure",
    rollbackVerification: "skipped",
  });
  assert.equal(receipt.result, "automatic-worker-rollback-failed");
  assert.equal(receipt.workflowSteps.workerRollback, "failure");
});
