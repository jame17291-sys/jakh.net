import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DRILL_CONFIRMATION,
  DRILL_DATABASE_NAME,
  assertMainRef,
  assertNonProductionTarget,
  assertReceiptSafe,
  captureBookmarkEvidence,
  databaseTarget,
  extractRows,
  parseJsonc,
  quoteSql,
  runRestoreDrill,
} from "../scripts/recovery-evidence.mjs";

const PRODUCTION = {
  binding: "DB",
  name: "jakh-db",
  id: "7fa30e72-85e4-4254-be85-40a9dfd8295c",
};
const DRILL_ID = "014caa1c-cd2b-4c31-8f2a-7659a4b65d7b";

test("JSONC parser preserves comment-like strings and accepts trailing commas", () => {
  const config = parseJsonc(`{
    // comment
    "url": "https://example.test/a//b",
    "d1_databases": [{
      "binding": "DB",
      "database_name": "jakh-db",
      "database_id": "${PRODUCTION.id}",
    }],
  }`);
  assert.equal(config.url, "https://example.test/a//b");
  assert.deepEqual(databaseTarget(config, "DB"), PRODUCTION);
});

test("main-ref guard fails closed", () => {
  assert.doesNotThrow(() => assertMainRef("refs/heads/main", "refs/heads/main"));
  assert.throws(
    () => assertMainRef("refs/heads/feature", "refs/heads/main"),
    /restricted to refs\/heads\/main/,
  );
});

test("quarterly workflow requires a protected real restore drill", async () => {
  const workflow = await readFile(
    new URL("../../.github/workflows/recovery-verification.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /github\.event\.schedule == '53 4 1 1,4,7,10 \*'/u);
  assert.match(workflow, /environment: recovery-drill/u);
  assert.match(workflow, /secrets\.CLOUDFLARE_RECOVERY_DRILL_DATABASE_ID/u);
  assert.match(workflow, /'RESTORE jakh-recovery-drill'/u);
});

test("restore guard requires the dedicated name, a different UUID, and typed confirmation", () => {
  assert.doesNotThrow(() =>
    assertNonProductionTarget({
      production: PRODUCTION,
      drillName: DRILL_DATABASE_NAME,
      drillId: DRILL_ID,
      confirmation: DRILL_CONFIRMATION,
    }),
  );
  assert.throws(
    () =>
      assertNonProductionTarget({
        production: PRODUCTION,
        drillName: DRILL_DATABASE_NAME,
        drillId: PRODUCTION.id,
        confirmation: DRILL_CONFIRMATION,
      }),
    /matches production/,
  );
  assert.throws(
    () =>
      assertNonProductionTarget({
        production: PRODUCTION,
        drillName: DRILL_DATABASE_NAME,
        drillId: DRILL_ID,
        confirmation: "yes",
      }),
    /confirmation must be exactly/,
  );
});

test("restore guard runs before any Wrangler command", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "jakh-recovery-test-"));
  const outputPath = path.join(directory, "receipt.json");
  let calls = 0;
  try {
    await assert.rejects(
      runRestoreDrill({
        outputPath,
        drillName: DRILL_DATABASE_NAME,
        drillId: PRODUCTION.id,
        confirmation: DRILL_CONFIRMATION,
        env: {},
        runWrangler: async () => {
          calls += 1;
          throw new Error("must not run");
        },
      }),
      /matches production/,
    );
    assert.equal(calls, 0);
    const receipt = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(receipt.status, "failed");
    assert.equal(receipt.plaintextDatabaseExportCreated, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("restore drill verifies baseline, mutation, undo, and cleanup with synthetic data", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "jakh-recovery-test-"));
  const outputPath = path.join(directory, "drill.json");
  const bookmarks = {
    before: "bookmark_before_1234567890",
    baseline: "bookmark_baseline_1234567",
    mutated: "bookmark_mutated_12345678",
  };
  let currentBookmark = bookmarks.before;
  let baselineValue;
  let mutatedValue;
  let canaryValue = null;
  let restoreCalls = 0;

  const runWrangler = async (args) => {
    if (args.includes("execute")) {
      const sql = args[args.indexOf("--command") + 1];
      if (sql.startsWith("INSERT INTO")) {
        baselineValue = sql.match(/VALUES \('[^']+', '([^']+)'/)[1];
        canaryValue = baselineValue;
        currentBookmark = bookmarks.baseline;
      } else if (sql.startsWith("UPDATE")) {
        mutatedValue = sql.match(/SET value = '([^']+)'/)[1];
        canaryValue = mutatedValue;
        currentBookmark = bookmarks.mutated;
      } else if (sql.startsWith("DELETE")) {
        canaryValue = null;
      }
      if (sql.startsWith("SELECT")) {
        return {
          stdout: JSON.stringify([
            { success: true, results: canaryValue === null ? [] : [{ value: canaryValue }] },
          ]),
          stderr: "",
        };
      }
      return { stdout: JSON.stringify([{ success: true, results: [] }]), stderr: "" };
    }
    if (args.includes("restore")) {
      const bookmark = args[args.indexOf("--bookmark") + 1];
      const previous = currentBookmark;
      currentBookmark = bookmark;
      canaryValue = bookmark === bookmarks.baseline ? baselineValue : mutatedValue;
      restoreCalls += 1;
      return {
        stdout: JSON.stringify({ bookmark, previous_bookmark: previous }),
        stderr: "",
      };
    }
    if (args.includes("time-travel") && args.includes("info")) {
      return { stdout: JSON.stringify({ bookmark: currentBookmark }), stderr: "" };
    }
    throw new Error(`Unexpected Wrangler arguments: ${args.join(" ")}`);
  };

  try {
    const receipt = await runRestoreDrill({
      outputPath,
      drillName: DRILL_DATABASE_NAME,
      drillId: DRILL_ID,
      confirmation: DRILL_CONFIRMATION,
      requiredRef: "refs/heads/main",
      env: { GITHUB_REF: "refs/heads/main", GITHUB_SHA: "b".repeat(40) },
      runWrangler,
      waitOptions: { attempts: 1, delayMs: 0, sleep: async () => {} },
    });
    assert.equal(receipt.status, "passed");
    assert.equal(receipt.database.productionIdentityMismatchVerified, true);
    assert.equal(receipt.checks.baselineVisibleAfterRestore, true);
    assert.equal(receipt.checks.mutationVisibleAfterUndoRestore, true);
    assert.equal(receipt.checks.canaryCleanupVerified, true);
    assert.equal(canaryValue, null);
    assert.equal(restoreCalls, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("bookmark receipt correlates source, migrations, and two read-only bookmarks", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "jakh-recovery-test-"));
  const outputPath = path.join(directory, "bookmark.json");
  const calls = [];
  try {
    const receipt = await captureBookmarkEvidence({
      outputPath,
      env: {
        GITHUB_REF: "refs/heads/main",
        GITHUB_SHA: "a".repeat(40),
        GITHUB_REPOSITORY: "owner/repository",
        GITHUB_RUN_ID: "123",
      },
      requiredRef: "refs/heads/main",
      now: new Date("2026-08-01T00:00:00.000Z"),
      runWrangler: async (args) => {
        calls.push(args);
        return {
          stdout: JSON.stringify({
            bookmark: args.includes("--timestamp")
              ? "historical_bookmark_1234"
              : "current_bookmark_12345678",
          }),
          stderr: "",
        };
      },
    });
    assert.equal(receipt.status, "passed");
    assert.equal(receipt.workflow.gitSha, "a".repeat(40));
    assert.equal(receipt.checks.databaseContentRead, false);
    assert.equal(receipt.release.migrations.files.length, 5);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((args) => args.includes("time-travel") && args.includes("info")));
    assert.ok(calls.every((args) => !args.includes("execute") && !args.includes("restore")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("receipt safety rejects a credential value", () => {
  assert.throws(
    () =>
      assertReceiptSafe(
        { plaintextDatabaseExportCreated: false, accidental: "super-secret-token" },
        { CLOUDFLARE_API_TOKEN: "super-secret-token" },
      ),
    /forbidden environment variable/,
  );
});

test("D1 result parsing and SQL quoting are deterministic", () => {
  assert.deepEqual(
    extractRows([{ success: true, results: [{ value: "ok" }] }]),
    [{ value: "ok" }],
  );
  assert.equal(quoteSql("O'Brien"), "'O''Brien'");
});
