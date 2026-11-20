import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildPostCompatibility,
  buildPostDeploy,
  buildPostMigration,
  buildPostRollback,
  buildPreflight,
  candidateVersion,
  extractActiveVersion,
  extractDatabaseSchema,
  finalizeReceipt,
  inspectSource,
  rollbackVersion,
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
      adminMfa: value >= 10,
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
  assert.equal(releaseSource.schema, "10");
  assert.deepEqual(releaseSource.compatibleSchemas, ["8", "9", "10"]);
  assert.equal(releaseSource.schema, releaseSource.migrations.at(-1).schema);
  assert.deepEqual(
    releaseSource.migrations.map((migration) => migration.schema),
    Array.from({ length: releaseSource.migrations.length }, (_, index) => String(index + 1)),
  );
});

test("MFA release proves schema-9 compatibility before migration and requires MFA readiness on schema 10", async () => {
  const releaseSource = await inspectSource();
  const before = buildPreflight({
    phase: "compatibility", source: releaseSource, deployment: deployment(OLD_VERSION_ID),
    health: basicHealth("1.5.0", "9"), databaseResult: database("9"),
    migrationList: "Migrations to be applied:\n0010_admin_mfa.sql", environment: RELEASE_ENV,
  });
  assert.deepEqual(before.errors, []);
  assert.equal(before.receipt.safety.databaseMutationAllowed, false);
  const contract = { targetSchema: "10", compatibleSchemas: ["8", "9", "10"] };
  const compatible = buildPostCompatibility({
    receipt: before.receipt,
    deployment: deployment(COMPATIBILITY_VERSION_ID, 100, "JAKH compatibility abc123 target schema 10 run 98765"),
    health: compatibilityHealth("9", contract), httpStatus: "200", databaseResult: database("9"),
    migrationList: "Migrations to be applied:\n0010_admin_mfa.sql",
  });
  assert.deepEqual(compatible.errors, []);
  const migration = buildPreflight({
    phase: "migrate-final", source: releaseSource,
    deployment: deployment(COMPATIBILITY_VERSION_ID, 100, "JAKH compatibility abc123 target schema 10 run 98765"),
    health: compatibilityHealth("9", contract), databaseResult: database("9"),
    migrationList: "Migrations to be applied:\n0010_admin_mfa.sql", environment: RELEASE_ENV,
  });
  assert.deepEqual(migration.errors, []);
  const migrated = buildPostMigration({
    receipt: migration.receipt, deployment: deployment(COMPATIBILITY_VERSION_ID),
    health: compatibilityHealth("10", contract), httpStatus: "200", databaseResult: database("10"),
    migrationList: "✅ No migrations to apply!",
  });
  assert.deepEqual(migrated.errors, []);
  const health = compatibilityHealth("10", contract);
  health.features.adminMfa = false;
  assert.match(validateHealthContract(health, { schema: "10", targetSchema: "10", requireCompatibility: true }).join("\n"), /adminMfa readiness was false, expected true/u);
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

test("both API phases use the independent primary content origin without a legacy CLI override", async () => {
  const [workflow, config] = await Promise.all([
    readFile(new URL("../.github/workflows/api-deploy.yml", import.meta.url), "utf8"),
    readFile(new URL("../worker/wrangler.jsonc", import.meta.url), "utf8"),
  ]);
  const defaultOrigin = config.match(/"STATIC_ORIGIN"\s*:\s*"([^"]+)"/u)?.[1];
  assert.equal(defaultOrigin, "https://riddlearabia.com");
  const deploySteps = [...workflow.matchAll(
    /id: (deploy_compatibility|deploy_final)\n[\s\S]*?command: ([^\n]+)/gu,
  )];
  assert.deepEqual(deploySteps.map(match => match[1]), ["deploy_compatibility", "deploy_final"]);
  for (const [, phase, command] of deploySteps) {
    assert.match(command, /^deploy --strict --message /u, phase);
    assert.doesNotMatch(command, /--var\s+STATIC_ORIGIN:|inputs\.domain_cutover/u, phase);
  }
  assert.doesNotMatch(workflow, /https:\/\/(?:api\.|www\.)?jakh\.net\b/u);
});

test("API and static authorization reject retired cutovers before protected release work", async () => {
  for (const filename of ["api-deploy.yml", "static-site.yml"]) {
    const workflow = await readFile(new URL(`../.github/workflows/${filename}`, import.meta.url), "utf8");
    const guard = /      - name: Reject retired domain cutover\n[\s\S]*?        run: \|\n([\s\S]*?)(?=      - )/u.exec(workflow)?.[1];
    assert.ok(guard, `${filename}: explicit cutover rejection is present`);
    assert.ok(workflow.indexOf("Reject retired domain cutover") < workflow.indexOf("uses: actions/checkout"),
      `${filename}: rejection precedes checkout and release actions`);
    assert.match(workflow, /DOMAIN_CUTOVER: \$\{\{ inputs\.domain_cutover \}\}/u);
    assert.match(workflow, /description: "Retired input: keep false\./u);
    const shell = guard.replace(/^          /gmu, "");
    assert.doesNotThrow(() => execFileSync("bash", ["-c", shell], {
      env: { DOMAIN_CUTOVER: "false" }, stdio: "pipe",
    }), `${filename}: normal and Autopilot false input stays supported`);
    for (const value of ["true", ""]) {
      assert.throws(() => execFileSync("bash", ["-c", shell], {
        env: { DOMAIN_CUTOVER: value }, stdio: "pipe",
      }), error => error.status === 1 && /Domain cutover is retired/u.test(String(error.stdout)),
      `${filename}: ${JSON.stringify(value)} fails closed`);
    }
  }
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
  assert.match(workflow, /domain_cutover:/u);
  assert.match(workflow, /BASELINE_API_ORIGIN/u);
  assert.match(workflow, /https:\/\/api\.riddlearabia\.com\/api\/health/u);
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
  assert.match(workflow, /inputs\.domain_cutover != true/u);
  assert.match(workflow, /JAKH_MONITOR_ALLOW_COMPATIBLE_SCHEMA: "true"/u);
  assert.equal(workflow.match(/JAKH_MONITOR_EXPECTED_WORKER_VERSION/gu)?.length, 7);
  assert.equal(workflow.match(/JAKH_MONITOR_MAX_ATTEMPTS/gu)?.length, 7);
  assert.equal(workflow.match(/JAKH_MONITOR_RETRY_DELAY_MS/gu)?.length, 7);
  assert.equal(workflow.match(/expected-worker-version=\$expected_worker_version/gu)?.length, 2);
  // Each expected version comes from a bounded wait for this run's own deployment, never from one unchecked read.
  assert.equal(workflow.match(/expected_worker_version="\$\(node scripts\/api-release-receipt\.mjs candidate-version \\\n\s+--receipt "\$RECEIPT_DIR\/release-receipt\.json" \\\n/gu)?.length, 2);
  assert.doesNotMatch(workflow, /expected_worker_version="\$\(node scripts\/api-release-receipt\.mjs active-version/u);
  assert.equal(workflow.match(/if \[ -z "\$expected_worker_version" \]; then\n\s+echo "::error title=API release safety gate::[^"]+"\n\s+exit 1/gu)?.length, 2);
  assert.equal(workflow.match(/node scripts\/api-release-receipt\.mjs rollback-version \\\n\s+--receipt "\$RECEIPT_DIR\/release-receipt\.json" \\\n/gu)?.length, 2);
  assert.equal(workflow.match(/for attempt in \{1\.\.12\}; do/gu)?.length, 4);
  assert.equal(workflow.match(/if \[ "\$attempt" -lt 12 \]; then sleep 5; fi/gu)?.length, 4);
  assert.equal(workflow.match(/::error title=API rollback mismatch::/gu)?.length, 2);
  assert.equal(workflow.match(/for attempt in \{1\.\.18\}/gu)?.length, 5);
  assert.equal(workflow.match(/\[ "\$attempt" -lt 18 \]/gu)?.length, 5);
  assert.doesNotMatch(workflow, /for attempt in 1 2 3 4 5 6/u);
  assert.match(workflow, /--migration-authorization-outcome/u);
  assert.match(monitorWorkflow, /ref: \$\{\{ github\.event_name == 'workflow_run' && github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/u);
  assert.match(monitorWorkflow, /name: Load classifier from the monitor workflow revision[\s\S]+persist-credentials: false\n\s+ref: \$\{\{ github\.workflow_sha \}\}\n\s+path: \.monitor-workflow\n\s+sparse-checkout: \/scripts\/monitor-workflow-context\.mjs\n\s+sparse-checkout-cone-mode: false/u);
  assert.match(monitorWorkflow, /id: context\n\s+run: node \.monitor-workflow\/scripts\/monitor-workflow-context\.mjs/u);
  assert.equal(monitorWorkflow.match(/JAKH_MONITOR_SCOPE: \$\{\{ steps\.context\.outputs\.scope \}\}/gu)?.length, 2);
  assert.match(monitorWorkflow, /JAKH_MONITOR_ALLOW_COMPATIBLE_SCHEMA: \$\{\{ steps\.context\.outputs\.allow-compatible-schema \}\}/u);
  assert.doesNotMatch(monitorWorkflow, /workflow_run\.name ==/u);
  assert.doesNotMatch(monitorWorkflow, /API migrate-final[^\n]+ALLOW_COMPATIBLE/u);
});

// On 2026-11-19 the deployment API still reported the predecessor two seconds
// after a static deploy, and a correct release was rolled back. The API
// workflow read the status once in the same way, in both phases and after
// every rollback.
const COMPATIBILITY_MESSAGE = "JAKH compatibility abc123 target schema 9 run 98765";
const FINAL_MESSAGE = "JAKH final abc123 schema 9 run 98765";
const COMPATIBILITY_ROLLBACK_MESSAGE = "Automatic compatibility rollback after GitHub Actions run 98765";
const FINAL_ROLLBACK_MESSAGE = "Automatic final rollback after GitHub Actions run 98765";
const EARLIER_MESSAGE = "JAKH final earlier-commit schema 8 run 4";

test("the candidate Worker version is only taken from this run's own deployment", () => {
  assert.equal(candidateVersion({
    receipt: compatibilityPreflight(), deployment: deployment(COMPATIBILITY_VERSION_ID, 100, COMPATIBILITY_MESSAGE),
  }), COMPATIBILITY_VERSION_ID);
  assert.equal(candidateVersion({
    receipt: codeOnlyPreflight(), deployment: deployment(COMPATIBILITY_VERSION_ID, 100, FINAL_MESSAGE),
  }), COMPATIBILITY_VERSION_ID, "a code-only release deploys under the final message");
  assert.equal(candidateVersion({
    receipt: finalPreflight(), deployment: deployment(FINAL_VERSION_ID, 100, FINAL_MESSAGE),
  }), FINAL_VERSION_ID);

  assert.throws(
    () => candidateVersion({ receipt: compatibilityPreflight(), deployment: deployment(OLD_VERSION_ID, 100, EARLIER_MESSAGE) }),
    /still reports the predecessor/u,
    "a stale status naming the predecessor is never the candidate",
  );
  assert.throws(
    () => candidateVersion({
      receipt: finalPreflight(),
      deployment: deployment(COMPATIBILITY_VERSION_ID, 100, "JAKH compatibility abc123 target schema 9 run 12345"),
    }),
    /still reports the predecessor/u,
    "after the final deploy the compatibility Worker is the predecessor",
  );
  // A re-run keeps its run ID, so the predecessor can carry this run's message.
  assert.throws(
    () => candidateVersion({ receipt: codeOnlyPreflight(), deployment: deployment(OLD_VERSION_ID, 100, FINAL_MESSAGE) }),
    /still reports the predecessor/u,
  );
  for (const [receipt, message] of [
    [compatibilityPreflight(), "JAKH compatibility abc123 target schema 9 run 11111"],
    [compatibilityPreflight(), FINAL_MESSAGE],
    [codeOnlyPreflight(), COMPATIBILITY_MESSAGE],
    [finalPreflight(), "JAKH final other-commit schema 9 run 98765"],
    [finalPreflight(), undefined],
  ]) {
    assert.throws(
      () => candidateVersion({ receipt, deployment: deployment(FINAL_VERSION_ID, 100, message) }),
      /does not identify this run's own deployment/u,
      `another deployment's version is never the candidate: ${message}`,
    );
  }
  assert.throws(
    () => candidateVersion({ receipt: { ...finalPreflight(), release: {} }, deployment: deployment(FINAL_VERSION_ID, 100, FINAL_MESSAGE) }),
    /does not identify the commit and run/u,
  );
  const withoutPredecessor = finalPreflight();
  withoutPredecessor.safety.provenCompatibilityWorker = null;
  assert.throws(
    () => candidateVersion({ receipt: withoutPredecessor, deployment: deployment(FINAL_VERSION_ID, 100, FINAL_MESSAGE) }),
    /does not record the predecessor/u,
  );
  assert.throws(
    () => candidateVersion({ receipt: {}, deployment: deployment(FINAL_VERSION_ID, 100, FINAL_MESSAGE) }),
    /Release phase must be/u,
  );
  assert.throws(() => candidateVersion({
    receipt: finalPreflight(),
    deployment: { versions: [{ version_id: FINAL_VERSION_ID, percentage: 50 }, { version_id: COMPATIBILITY_VERSION_ID, percentage: 50 }] },
  }), /exactly one Worker version/u);
});

test("a rollback is only confirmed by the rollback target under this run's rollback message", () => {
  assert.equal(rollbackVersion({
    receipt: compatibilityPreflight(), deployment: deployment(OLD_VERSION_ID, 100, COMPATIBILITY_ROLLBACK_MESSAGE),
  }), OLD_VERSION_ID);
  assert.equal(rollbackVersion({
    receipt: finalPreflight(), deployment: deployment(COMPATIBILITY_VERSION_ID, 100, FINAL_ROLLBACK_MESSAGE),
  }), COMPATIBILITY_VERSION_ID);
  assert.throws(
    () => rollbackVersion({ receipt: compatibilityPreflight(), deployment: deployment(COMPATIBILITY_VERSION_ID, 100, COMPATIBILITY_MESSAGE) }),
    /does not yet report the rollback target/u,
    "a stale status naming the failed candidate is not the rollback",
  );
  for (const [receipt, target, message] of [
    [compatibilityPreflight(), OLD_VERSION_ID, EARLIER_MESSAGE],
    [compatibilityPreflight(), OLD_VERSION_ID, FINAL_ROLLBACK_MESSAGE],
    [compatibilityPreflight(), OLD_VERSION_ID, "Automatic compatibility rollback after GitHub Actions run 11111"],
    [finalPreflight(), COMPATIBILITY_VERSION_ID, COMPATIBILITY_ROLLBACK_MESSAGE],
    [finalPreflight(), COMPATIBILITY_VERSION_ID, undefined],
  ]) {
    assert.throws(
      () => rollbackVersion({ receipt, deployment: deployment(target, 100, message) }),
      /is not this run's rollback/u,
      `the target under another deployment is not this rollback: ${message}`,
    );
  }
  assert.throws(
    () => rollbackVersion({ receipt: { ...finalPreflight(), release: {} }, deployment: deployment(COMPATIBILITY_VERSION_ID, 100, FINAL_ROLLBACK_MESSAGE) }),
    /does not identify the run/u,
  );
  assert.throws(
    () => rollbackVersion({ receipt: { ...finalPreflight(), safety: {} }, deployment: deployment(COMPATIBILITY_VERSION_ID, 100, FINAL_ROLLBACK_MESSAGE) }),
    /does not record the Worker rollback target/u,
  );
});

const RECEIPT_SCRIPT = fileURLToPath(new URL("./api-release-receipt.mjs", import.meta.url));

test("the candidate-version and rollback-version commands print the version or fail quietly so the workflow can retry", () => {
  const directory = mkdtempSync(join(tmpdir(), "jakh-api-awaited-version-"));
  try {
    const write = (name, value) => {
      writeFileSync(join(directory, name), JSON.stringify(value));
      return join(directory, name);
    };
    const receipt = write("receipt.json", finalPreflight());
    const candidate = write("candidate.json", deployment(FINAL_VERSION_ID, 100, FINAL_MESSAGE));
    const rolledBack = write("rolled-back.json", deployment(COMPATIBILITY_VERSION_ID, 100, FINAL_ROLLBACK_MESSAGE));
    for (const [command, fresh, stale, expected, refusal] of [
      ["candidate-version", candidate, rolledBack, FINAL_VERSION_ID, /still reports the predecessor/u],
      ["rollback-version", rolledBack, candidate, COMPATIBILITY_VERSION_ID, /does not yet report the rollback target/u],
    ]) {
      assert.equal(
        execFileSync(process.execPath, [RECEIPT_SCRIPT, command, "--receipt", receipt, "--deployment", fresh], { encoding: "utf8" }),
        expected,
      );
      for (const unusable of [stale, write("unreadable.json", ""), join(directory, "missing.json")]) {
        const refused = spawnSync(process.execPath, [RECEIPT_SCRIPT, command, "--receipt", receipt, "--deployment", unusable], { encoding: "utf8" });
        assert.equal(refused.status, 1, command);
        assert.equal(refused.stdout, "", `${command}: an unusable status prints no version`);
        assert.doesNotMatch(refused.stderr, /::error/u, `${command}: a retried read raises no failure annotation`);
        if (unusable === stale) assert.match(refused.stderr, refusal);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the rollback messages the waits look for are the ones the rollback steps send", async () => {
  const workflow = await readFile(new URL("../.github/workflows/api-deploy.yml", import.meta.url), "utf8");
  const messages = [...workflow.matchAll(
    /rollback \$\{\{ steps\.preflight\.outputs\.rollback-version \}\}\n\s+--message "([^"]+)"/gu,
  )].map((match) => match[1].replace("${{ github.run_id }}", "98765"));
  assert.deepEqual(messages, [COMPATIBILITY_ROLLBACK_MESSAGE, FINAL_ROLLBACK_MESSAGE]);
});

// Runs the start of a workflow step's own shell, up to the health probe so
// nothing reaches the network, against a stand-in "wrangler" whose answers
// follow a plan: a named status, or a failed read, per call.
function runStatusStep({ stepName, nextStepName, receipt, statuses, plan, rollbackTarget, report = "" }) {
  const workflow = readFileSync(new URL("../.github/workflows/api-deploy.yml", import.meta.url), "utf8");
  const start = workflow.indexOf(`- name: ${stepName}\n`);
  const end = workflow.indexOf(`- name: ${nextStepName}\n`, start);
  assert.ok(start > 0 && end > start, `${stepName}: step not found`);
  const step = workflow.slice(start, end);
  const shell = step.slice(step.indexOf("run: |\n") + "run: |\n".length)
    .split("\n").map((line) => line.replace(/^ {10}/u, "")).join("\n");
  const probe = shell.indexOf("set +e\nhealth_status=000\n");
  assert.ok(probe > 0, `${stepName}: the health probe still follows the status read`);
  let body = `${shell.slice(0, probe)}${report}`
    .replaceAll("node scripts/api-release-receipt.mjs", `"${process.execPath}" "${RECEIPT_SCRIPT}"`);
  if (rollbackTarget) body = body.replaceAll("${{ steps.preflight.outputs.rollback-version }}", rollbackTarget);
  assert.doesNotMatch(body, /\$\{\{/u, `${stepName}: every workflow expression is resolved for the test`);
  assert.doesNotMatch(body, /\bcurl\b|monitor-production\.mjs|wrangler d1\b/u, `${stepName}: the test never reaches the network`);
  const directory = mkdtempSync(join(tmpdir(), "jakh-api-status-step-"));
  try {
    const bin = join(directory, "worker", "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    mkdirSync(join(directory, "receipts"));
    mkdirSync(join(directory, "statuses"));
    writeFileSync(join(directory, "receipts", "release-receipt.json"), JSON.stringify(receipt));
    for (const [name, status] of Object.entries(statuses)) {
      writeFileSync(join(directory, "statuses", `${name}.json`), JSON.stringify(status));
    }
    writeFileSync(join(bin, "wrangler"), [
      "#!/usr/bin/env bash",
      "n=$(cat \"$COUNT\" 2>/dev/null || echo 0); n=$((n+1)); echo \"$n\" > \"$COUNT\"",
      "mode=$(echo \"$PLAN\" | cut -d, -f\"$n\"); [ -z \"$mode\" ] && mode=$(echo \"$PLAN\" | awk -F, '{print $NF}')",
      `status="${join(directory, "statuses")}/$mode.json"`,
      "if [ -f \"$status\" ]; then cat \"$status\"; else echo 'A request to the Cloudflare API failed.' >&2; exit 1; fi",
      "",
    ].join("\n"));
    chmodSync(join(bin, "wrangler"), 0o755);
    writeFileSync(join(directory, "step.sh"), `sleep() { echo "$1" >> "$WAITS"; }\n${body}`);
    const result = spawnSync("bash", ["step.sh"], {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        RECEIPT_DIR: join(directory, "receipts"),
        GITHUB_OUTPUT: join(directory, "github-output"),
        COUNT: join(directory, "count"),
        WAITS: join(directory, "waits"),
        PLAN: plan,
      },
    });
    const read = (name) => (existsSync(join(directory, name)) ? readFileSync(join(directory, name), "utf8") : "");
    const waits = read("waits").split("\n").filter(Boolean);
    assert.ok(waits.every((seconds) => seconds === "5"), `${stepName}: every wait is five seconds`);
    return {
      status: result.status,
      stdout: result.stdout,
      annotations: `${result.stdout}${result.stderr}`.match(/::error/gu)?.length ?? 0,
      output: read("github-output").trim(),
      reads: Number(read("count").trim() || 0),
      waits: waits.length,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const DEPLOY_STEPS = [
  {
    label: "compatibility deploy",
    stepName: "Verify compatibility Worker and unchanged D1",
    nextStepName: "Verify live compatibility API quarantine behavior",
    receipt: compatibilityPreflight,
    candidate: COMPATIBILITY_VERSION_ID,
    statuses: {
      fresh: deployment(COMPATIBILITY_VERSION_ID, 100, COMPATIBILITY_MESSAGE),
      stale: deployment(OLD_VERSION_ID, 100, EARLIER_MESSAGE),
      foreign: deployment(FINAL_VERSION_ID, 100, "JAKH compatibility abc123 target schema 9 run 11111"),
    },
  },
  {
    label: "code-only deploy",
    stepName: "Verify compatibility Worker and unchanged D1",
    nextStepName: "Verify live compatibility API quarantine behavior",
    receipt: codeOnlyPreflight,
    candidate: COMPATIBILITY_VERSION_ID,
    statuses: {
      fresh: deployment(COMPATIBILITY_VERSION_ID, 100, FINAL_MESSAGE),
      stale: deployment(OLD_VERSION_ID, 100, EARLIER_MESSAGE),
      foreign: deployment(FINAL_VERSION_ID, 100, COMPATIBILITY_MESSAGE),
    },
  },
  {
    label: "final deploy",
    stepName: "Verify final production health",
    nextStepName: "Verify live final API quarantine behavior",
    receipt: finalPreflight,
    candidate: FINAL_VERSION_ID,
    statuses: {
      fresh: deployment(FINAL_VERSION_ID, 100, FINAL_MESSAGE),
      stale: deployment(COMPATIBILITY_VERSION_ID, 100, "JAKH compatibility abc123 target schema 9 run 12345"),
      foreign: deployment(OLD_VERSION_ID, 100, "JAKH final abc123 schema 9 run 11111"),
    },
  },
];

for (const { label, stepName, nextStepName, receipt, candidate, statuses } of DEPLOY_STEPS) {
  test(`after the ${label} the workflow waits out stale and failed status reads, then fails closed`, () => {
    const identity = (plan) => runStatusStep({ stepName, nextStepName, receipt: receipt(), statuses, plan });
    const expected = `expected-worker-version=${candidate}`;
    assert.deepEqual(identity("fresh"), { status: 0, stdout: "", annotations: 0, output: expected, reads: 1, waits: 0 });
    // 2026-11-19: the first read after a deploy still named the predecessor.
    assert.deepEqual(identity("stale,stale,fresh"), { status: 0, stdout: "", annotations: 0, output: expected, reads: 3, waits: 2 });
    assert.deepEqual(identity("stale,fail,fresh"), { status: 0, stdout: "", annotations: 0, output: expected, reads: 3, waits: 2 });
    assert.deepEqual(identity("fail,foreign,fresh"), { status: 0, stdout: "", annotations: 0, output: expected, reads: 3, waits: 2 });
    for (const plan of ["stale", "fail", "foreign"]) {
      const never = identity(plan);
      assert.equal(never.status, 1, `${plan}: the gate fails, so the release is not verified against a guess`);
      assert.equal(never.output, "", `${plan}: no version is handed to the health and monitor checks`);
      assert.equal(never.reads, 12, plan);
      assert.equal(never.waits, 11, plan);
      assert.match(never.stdout, /^::error title=API release safety gate::/u, plan);
      assert.equal(never.annotations, 1, `${plan}: exactly one failure annotation`);
    }
  });
}

const ROLLBACK_STEPS = [
  {
    label: "compatibility",
    stepName: "Verify exact compatibility rollback",
    nextStepName: "Finalize compatibility receipt",
    receipt: compatibilityPreflight,
    target: OLD_VERSION_ID,
    candidate: COMPATIBILITY_VERSION_ID,
    statuses: {
      fresh: deployment(OLD_VERSION_ID, 100, COMPATIBILITY_ROLLBACK_MESSAGE),
      stale: deployment(COMPATIBILITY_VERSION_ID, 100, COMPATIBILITY_MESSAGE),
      earlier: deployment(OLD_VERSION_ID, 100, EARLIER_MESSAGE),
    },
  },
  {
    label: "final-phase",
    stepName: "Verify exact final-phase Worker rollback",
    nextStepName: "Finalize release receipt",
    receipt: finalPreflight,
    target: COMPATIBILITY_VERSION_ID,
    candidate: FINAL_VERSION_ID,
    statuses: {
      fresh: deployment(COMPATIBILITY_VERSION_ID, 100, FINAL_ROLLBACK_MESSAGE),
      stale: deployment(FINAL_VERSION_ID, 100, FINAL_MESSAGE),
      earlier: deployment(COMPATIBILITY_VERSION_ID, 100, "JAKH compatibility abc123 target schema 9 run 12345"),
    },
  },
];

for (const { label, stepName, nextStepName, receipt, target, candidate, statuses } of ROLLBACK_STEPS) {
  test(`the ${label} rollback verification waits out stale and failed status reads, then fails as before`, () => {
    const rollback = (plan) => runStatusStep({
      stepName, nextStepName, receipt: receipt(), statuses, plan, rollbackTarget: target,
      // Reached only when the unchanged version check accepts the last read.
      report: 'echo "accepted=$initial_worker_version"\n',
    });
    const accepted = { status: 0, stdout: `accepted=${target}\n`, annotations: 0, output: "" };
    assert.deepEqual(rollback("fresh"), { ...accepted, reads: 1, waits: 0 });
    // The first read after a rollback can still name the failed candidate.
    assert.deepEqual(rollback("stale,stale,fresh"), { ...accepted, reads: 3, waits: 2 });
    assert.deepEqual(rollback("stale,fail,fresh"), { ...accepted, reads: 3, waits: 2 });
    assert.deepEqual(rollback("earlier,fresh"), { ...accepted, reads: 2, waits: 1 });
    // The wait only delays the checks: a target that never shows this run's
    // message still passes the unchanged version check.
    assert.deepEqual(rollback("earlier"), { ...accepted, reads: 12, waits: 11 });
    assert.deepEqual(rollback("stale"), {
      status: 1,
      stdout: `::error title=API rollback mismatch::Rollback activated ${candidate} instead of ${target}.\n`,
      annotations: 1,
      output: "",
      reads: 12,
      waits: 11,
    }, "a status that stays stale fails with the same message as a single stale read did");
    const unreadable = rollback("fail");
    assert.notEqual(unreadable.status, 0, "an unreadable status still fails the verification");
    assert.deepEqual([unreadable.stdout, unreadable.reads, unreadable.waits], ["", 12, 11]);
  });
}
