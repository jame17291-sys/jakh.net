import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPostCompatibility,
  buildPostDeploy,
  buildPostMigration,
  buildPostRollback,
  buildPreflight,
  extractActiveVersion,
  extractDatabaseSchema,
  finalizeReceipt,
  inspectSource,
  validateHealthContract,
} from "./api-release-receipt.mjs";

const OLD_VERSION_ID = "11111111-1111-4111-8111-111111111111";
const COMPATIBILITY_VERSION_ID = "22222222-2222-4222-8222-222222222222";
const FINAL_VERSION_ID = "33333333-3333-4333-8333-333333333333";
const RELEASE_ENV = {
  GITHUB_SHA: "abc123",
  GITHUB_RUN_ID: "98765",
  GITHUB_ACTOR: "release-operator",
};

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

function basicHealth(version, schema, workerVersionId = OLD_VERSION_ID) {
  return { ok: true, service: "jakh-api", version, schema, workerVersionId };
}

function compatibilityHealth(schema, overrides = {}) {
  const value = Number(schema);
  return {
    ok: true,
    service: "jakh-api",
    version: "1.5.0",
    workerVersionId: overrides.workerVersionId ?? COMPATIBILITY_VERSION_ID,
    schema,
    targetSchema: "9",
    compatibleSchemas: ["8", "9"],
    features: {
      registration: value >= 7,
      accountRecovery: value >= 7,
      accountDeletion: value >= 8,
      contentStudio: value >= 9,
    },
    ...overrides,
  };
}

function source() {
  return {
    service: "jakh-api",
    version: "1.5.0",
    schema: "9",
    compatibleSchemas: ["8", "9"],
    migrations: Array.from({ length: 9 }, (_, index) => ({
      name: `${String(index + 1).padStart(4, "0")}_migration.sql`,
      schema: String(index + 1),
    })),
  };
}

function compatibilityPreflight(overrides = {}) {
  const result = buildPreflight({
    phase: "compatibility",
    source: source(),
    deployment: deployment(OLD_VERSION_ID),
    health: basicHealth("1.4.0", "8"),
    databaseResult: database("8"),
    migrationList: "Migrations to be applied:\n0009_content_studio.sql",
    environment: RELEASE_ENV,
    ...overrides,
  });
  assert.deepEqual(result.errors, []);
  return result.receipt;
}

function codeOnlyPreflight(overrides = {}) {
  const result = buildPreflight({
    phase: "compatibility",
    source: source(),
    deployment: deployment(OLD_VERSION_ID),
    health: compatibilityHealth("9", { workerVersionId: OLD_VERSION_ID }),
    databaseResult: database("9"),
    migrationList: "✅ No migrations to apply!",
    environment: RELEASE_ENV,
    ...overrides,
  });
  assert.deepEqual(result.errors, []);
  return result.receipt;
}

function finalPreflight(overrides = {}) {
  const result = buildPreflight({
    phase: "migrate-final",
    source: source(),
    deployment: deployment(
      COMPATIBILITY_VERSION_ID,
      100,
      "JAKH compatibility abc123 target schema 9 run 12345",
    ),
    health: compatibilityHealth("8"),
    databaseResult: database("8"),
    migrationList: "Migrations to be applied:\n0009_content_studio.sql",
    environment: RELEASE_ENV,
    ...overrides,
  });
  assert.deepEqual(result.errors, []);
  return result.receipt;
}

test("repository Worker, compatibility range, and migrations are internally consistent", async () => {
  const releaseSource = await inspectSource();
  assert.equal(releaseSource.service, "jakh-api");
  assert.equal(releaseSource.schema, "9");
  assert.deepEqual(releaseSource.compatibleSchemas, ["8", "9"]);
  assert.equal(releaseSource.schema, releaseSource.migrations.at(-1).schema);
  assert.deepEqual(
    releaseSource.migrations.map((migration) => migration.schema),
    Array.from({ length: releaseSource.migrations.length }, (_, index) => String(index + 1)),
  );
});

test("compatibility preflight records a no-mutation phase and exact rollback target", () => {
  const receipt = compatibilityPreflight();
  assert.equal(receipt.phase, "compatibility");
  assert.equal(receipt.safety.workerRollbackTarget, OLD_VERSION_ID);
  assert.equal(receipt.safety.databaseMutationAllowed, false);
  assert.equal(receipt.safety.provenCompatibilityWorker, null);
  assert.equal(receipt.preDeployment.databaseSchema, "8");
});

test("compatibility deployment must leave D1 untouched and prove the live contract", () => {
  const receipt = compatibilityPreflight();
  const successful = buildPostCompatibility({
    receipt,
    deployment: deployment(
      COMPATIBILITY_VERSION_ID,
      100,
      "JAKH compatibility abc123 target schema 9 run 98765",
    ),
    health: compatibilityHealth("8"),
    httpStatus: "200",
    databaseResult: database("8"),
    migrationList: "Migrations to be applied:\n0009_content_studio.sql",
  });
  assert.deepEqual(successful.errors, []);
  assert.equal(successful.receipt.result, "compatibility-worker-verified");

  const mutated = buildPostCompatibility({
    receipt: compatibilityPreflight(),
    deployment: deployment(
      COMPATIBILITY_VERSION_ID,
      100,
      "JAKH compatibility abc123 target schema 9 run 98765",
    ),
    health: compatibilityHealth("9"),
    httpStatus: "200",
    databaseResult: database("9"),
    migrationList: "✅ No migrations to apply!",
  });
  assert.match(mutated.errors.join("\n"), /D1 schema changed/u);
});

test("code-only compatibility phase records exact final evidence without mutating D1", () => {
  const successful = buildPostCompatibility({
    receipt: codeOnlyPreflight(),
    deployment: deployment(
      COMPATIBILITY_VERSION_ID,
      100,
      "JAKH final abc123 schema 9 run 98765",
    ),
    health: compatibilityHealth("9"),
    httpStatus: "200",
    databaseResult: database("9"),
    migrationList: "✅ No migrations to apply!",
  });
  assert.deepEqual(successful.errors, []);
  assert.equal(successful.receipt.safety.databaseMutationAllowed, false);
  assert.equal(successful.receipt.result, "code-only-final-worker-verified");

  const mislabeled = buildPostCompatibility({
    receipt: codeOnlyPreflight(),
    deployment: deployment(
      COMPATIBILITY_VERSION_ID,
      100,
      "JAKH compatibility abc123 target schema 9 run 98765",
    ),
    health: compatibilityHealth("9"),
    httpStatus: "200",
    databaseResult: database("9"),
    migrationList: "✅ No migrations to apply!",
  });
  assert.match(mislabeled.errors.join("\n"), /does not identify this release run/u);
});

test("migrate-final refuses before mutation without active compatibility evidence", () => {
  const legacy = buildPreflight({
    phase: "migrate-final",
    source: source(),
    deployment: deployment(COMPATIBILITY_VERSION_ID),
    health: basicHealth("1.5.0", "8"),
    databaseResult: database("8"),
    migrationList: "Migrations to be applied:\n0009_content_studio.sql",
  });
  assert.match(legacy.errors.join("\n"), /targetSchema|compatibleSchemas|feature readiness/u);

  const missingTarget = buildPreflight({
    phase: "migrate-final",
    source: source(),
    deployment: deployment(COMPATIBILITY_VERSION_ID),
    health: compatibilityHealth("8", { compatibleSchemas: ["8"] }),
    databaseResult: database("8"),
    migrationList: "Migrations to be applied:\n0009_content_studio.sql",
  });
  assert.match(missingTarget.errors.join("\n"), /does not include target schema 9/u);

  const falseReadiness = buildPreflight({
    phase: "migrate-final",
    source: source(),
    deployment: deployment(COMPATIBILITY_VERSION_ID),
    health: compatibilityHealth("8", {
      features: { registration: true, accountRecovery: true, accountDeletion: true, contentStudio: true },
    }),
    databaseResult: database("8"),
    migrationList: "Migrations to be applied:\n0009_content_studio.sql",
  });
  assert.match(falseReadiness.errors.join("\n"), /contentStudio readiness was true, expected false/u);
});

test("migrate-final requires the active compatibility Worker from the exact source commit", () => {
  const wrongCommit = buildPreflight({
    phase: "migrate-final",
    source: source(),
    deployment: deployment(
      COMPATIBILITY_VERSION_ID,
      100,
      "JAKH compatibility older-commit target schema 9 run 12345",
    ),
    health: compatibilityHealth("8"),
    databaseResult: database("8"),
    migrationList: "Migrations to be applied:\n0009_content_studio.sql",
    environment: RELEASE_ENV,
  });
  assert.match(wrongCommit.errors.join("\n"), /exact source commit and target schema/u);
});

test("migrate-final binds rollback to the exact active compatibility Worker", () => {
  const receipt = finalPreflight();
  assert.equal(receipt.safety.provenCompatibilityWorker, COMPATIBILITY_VERSION_ID);
  assert.equal(receipt.safety.workerRollbackTarget, COMPATIBILITY_VERSION_ID);
  assert.equal(receipt.safety.databaseMutationAllowed, true);
  assert.equal(receipt.safety.compatibilityEvidenceSource, "active-worker-health-contract");
});

test("post-migration requires the same compatibility Worker healthy on target schema", () => {
  const success = buildPostMigration({
    receipt: finalPreflight(),
    deployment: deployment(COMPATIBILITY_VERSION_ID),
    health: compatibilityHealth("9", { workerVersionId: COMPATIBILITY_VERSION_ID }),
    httpStatus: "200",
    databaseResult: database("9"),
    migrationList: "✅ No migrations to apply!",
  });
  assert.deepEqual(success.errors, []);
  assert.equal(success.receipt.result, "migration-compatibility-passed");

  const changedWorker = buildPostMigration({
    receipt: finalPreflight(),
    deployment: deployment(OLD_VERSION_ID),
    health: compatibilityHealth("9"),
    httpStatus: "200",
    databaseResult: database("9"),
    migrationList: "✅ No migrations to apply!",
  });
  assert.match(changedWorker.errors.join("\n"), /active compatibility Worker changed/u);
});

test("final deployment is verified and can roll back to the proven compatible Worker", () => {
  const migrated = buildPostMigration({
    receipt: finalPreflight(),
    deployment: deployment(COMPATIBILITY_VERSION_ID),
    health: compatibilityHealth("9"),
    httpStatus: "200",
    databaseResult: database("9"),
    migrationList: "✅ No migrations to apply!",
  }).receipt;
  const deployed = buildPostDeploy({
    receipt: migrated,
    deployment: deployment(FINAL_VERSION_ID, 100, "JAKH final abc123 schema 9 run 98765"),
    health: compatibilityHealth("9", { workerVersionId: FINAL_VERSION_ID }),
    httpStatus: "200",
    databaseResult: database("9"),
    migrationList: "✅ No migrations to apply!",
  });
  assert.deepEqual(deployed.errors, []);
  assert.equal(deployed.receipt.result, "deployed-and-verified");

  const rollback = buildPostRollback({
    receipt: deployed.receipt,
    deployment: deployment(COMPATIBILITY_VERSION_ID),
    health: compatibilityHealth("9", { workerVersionId: COMPATIBILITY_VERSION_ID }),
    httpStatus: "200",
    databaseResult: database("9"),
    migrationList: "✅ No migrations to apply!",
  });
  assert.deepEqual(rollback.errors, []);
  assert.equal(rollback.receipt.rollback.databaseRolledBack, false);
});

test("compatibility-phase rollback expects the original Worker and untouched schema", () => {
  const receipt = compatibilityPreflight();
  receipt.compatibilityDeployment = { activeWorkerVersion: COMPATIBILITY_VERSION_ID };
  const rollback = buildPostRollback({
    receipt,
    deployment: deployment(OLD_VERSION_ID),
    health: basicHealth("1.4.0", "8"),
    httpStatus: "200",
    databaseResult: database("8"),
    migrationList: "Migrations to be applied:\n0009_content_studio.sql",
  });
  assert.deepEqual(rollback.errors, []);
  assert.equal(rollback.receipt.result, "worker-rolled-back-and-verified");
});

test("health validation rejects unsupported claims and malformed compatibility arrays", () => {
  const errors = validateHealthContract(compatibilityHealth("8", {
    compatibleSchemas: ["8", "8", "9"],
  }), {
    version: "1.5.0",
    schema: "8",
    targetSchema: "9",
    requireCompatibility: true,
  });
  assert.match(errors.join("\n"), /unique positive-integer strings/u);
});

test("split traffic and ambiguous D1 state remain hard failures", () => {
  assert.throws(() => extractActiveVersion({
    versions: [
      { version_id: OLD_VERSION_ID, percentage: 90 },
      { version_id: COMPATIBILITY_VERSION_ID, percentage: 10 },
    ],
  }), /exactly one Worker version/u);
  assert.equal(extractDatabaseSchema(database("6")), "6");
  assert.throws(() => extractDatabaseSchema([{ results: [], success: false }]), /failed operation/u);
  assert.throws(
    () => extractDatabaseSchema([{ results: [{ value: "6" }, { value: "7" }], success: true }]),
    /Expected one/u,
  );
});

test("final receipt cannot hide a failed exact Worker rollback", () => {
  const receipt = finalPreflight();
  receipt.result = "post-deploy-verification-failed";
  receipt.safety.automaticWorkerRollback = true;
  finalizeReceipt(receipt, {
    preflight: "success",
    compatibilityDeploy: "skipped",
    migrations: "success",
    migrationCompatibility: "success",
    finalDeploy: "success",
    productionVerification: "failure",
    workerRollback: "failure",
    rollbackVerification: "skipped",
    rollbackProof: "success",
    migrationQuarantineProof: "success",
    migrationAuthorization: "success",
  });
  assert.equal(receipt.result, "post-deploy-verification-failed-without-confirmed-rollback");
});

test("workflow statically separates no-migration compatibility from gated migration-final", async () => {
  const workflow = await readFile(new URL("../.github/workflows/api-deploy.yml", import.meta.url), "utf8");
  const monitorWorkflow = await readFile(
    new URL("../.github/workflows/production-monitor.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /run-name: API \$\{\{ inputs\.release_phase \}\}/u);
  assert.match(workflow, /group: jakh-production-release/u);
  assert.match(workflow, /environment: production/u);
  assert.match(workflow, /github\.ref_protected/u);
  assert.match(workflow, /required_reviewers/u);
  assert.match(workflow, /protected_branches/u);
  assert.match(workflow, /release_phase:/u);
  assert.match(workflow, /compatibility:/u);
  assert.match(workflow, /migrate-final:/u);
  assert.match(workflow, /preflight[\s\S]+--phase migrate-final/u);
  assert.match(workflow, /recovery-evidence\.mjs bookmark/u);
  assert.match(workflow, /d1 migrations apply DB --remote/u);
  assert.ok(workflow.indexOf("--phase migrate-final") < workflow.indexOf("id: migration_authorization"));
  assert.ok(workflow.indexOf("id: migration_authorization") < workflow.indexOf("d1 migrations apply DB --remote"));
  const encryptBackup = workflow.indexOf("node scripts/d1-backup.mjs encrypt");
  const restoreBackup = workflow.indexOf("node scripts/d1-backup.mjs verify");
  const attestBackup = workflow.indexOf("node scripts/d1-backup.mjs attest");
  const uploadBackup = workflow.indexOf("Store the tested encrypted backup off-account before mutation");
  const authorizeMutation = workflow.indexOf("node scripts/d1-backup.mjs authorize");
  const applyMigrations = workflow.indexOf("d1 migrations apply DB --remote");
  assert.ok(encryptBackup > 0);
  assert.ok(encryptBackup < restoreBackup);
  assert.ok(restoreBackup < attestBackup);
  assert.ok(attestBackup < uploadBackup);
  assert.ok(uploadBackup < authorizeMutation);
  assert.ok(authorizeMutation < applyMigrations);
  assert.match(workflow, /pre-migration\.sql\.jakh/u);
  assert.match(workflow, /retention-days: 35/u);
  assert.match(workflow, /Plaintext backup retained/u);
  assert.doesNotMatch(workflow, /D1 mutation blocked::migrate-final is intentionally disabled/u);
  assert.match(workflow, /migration_authorization[\s\S]+exit 1/u);
  assert.match(workflow, /steps\.migration_authorization\.outcome == 'success'/u);
  const compatibilityJob = workflow.slice(
    workflow.indexOf("  compatibility:"),
    workflow.indexOf("  migrate-final:"),
  );
  assert.doesNotMatch(compatibilityJob, /d1 migrations apply|recovery-evidence\.mjs bookmark/u);
  assert.match(compatibilityJob, /SCHEMA_CHANGED:[\s\S]+JAKH compatibility[\s\S]+JAKH final/u);
  assert.match(compatibilityJob, /steps\.deployment_message\.outputs\.value/u);
  assert.match(workflow, /rollback \$\{\{ steps\.preflight\.outputs\.rollback-version \}\}/u);
  assert.doesNotMatch(workflow, /rollback[^\n]*--yes|--yes[^\n]*rollback/u);
  assert.equal(workflow.match(/id: runtime_monitor/gu)?.length, 2);
  assert.match(workflow, /--stage rollback-target/u);
  assert.match(workflow, /--stage post-migration/u);
  assert.match(workflow, /--stage candidate/u);
  assert.match(workflow, /--stage rollback/u);
  assert.match(workflow, /--expected-worker-version/u);
  assert.match(workflow, /steps\.rollback_proof\.outputs\.rollback-safe == 'true'/u);
  assert.match(workflow, /JAKH_MONITOR_ALLOW_COMPATIBLE_SCHEMA: "true"/u);
  assert.equal(workflow.match(/JAKH_MONITOR_EXPECTED_WORKER_VERSION/gu)?.length, 7);
  assert.equal(workflow.match(/JAKH_MONITOR_MAX_ATTEMPTS/gu)?.length, 7);
  assert.equal(workflow.match(/JAKH_MONITOR_RETRY_DELAY_MS/gu)?.length, 7);
  assert.equal(workflow.match(/expected-worker-version=\$expected_worker_version/gu)?.length, 2);
  assert.equal(workflow.match(/for attempt in \{1\.\.18\}/gu)?.length, 5);
  assert.equal(workflow.match(/\[ "\$attempt" -lt 18 \]/gu)?.length, 5);
  assert.doesNotMatch(workflow, /for attempt in 1 2 3 4 5 6/u);
  assert.match(workflow, /--migration-authorization-outcome/u);
  assert.match(
    monitorWorkflow,
    /workflow_run\.name == 'Deploy API'[\s\S]+startsWith\(github\.event\.workflow_run\.display_title, 'API compatibility ·'\)/u,
  );
  assert.match(monitorWorkflow, /JAKH_MONITOR_SCOPE:[\s\S]+workflow_run\.name == 'Deploy API'[\s\S]+&& 'api'/u);
  assert.doesNotMatch(monitorWorkflow, /API migrate-final[^\n]+ALLOW_COMPATIBLE/u);
});
