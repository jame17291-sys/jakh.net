import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { encryptBackup } from "./d1-backup.mjs";

const workflow = readFileSync(new URL("../.github/workflows/api-deploy.yml", import.meta.url), "utf8");
const exportStep = "Export and immediately encrypt the pre-migration D1 backup";
const restoreStep = "Restore and verify the encrypted backup in ephemeral local D1";
const cleanupStep = "Remove ephemeral plaintext backup workspace";
const plaintext = Buffer.from("CREATE TABLE accounts (secret TEXT);\nINSERT INTO accounts VALUES ('private-account-row');\n");
const key = Buffer.alloc(32, 4);

function step(name) {
  const start = workflow.indexOf(`      - name: ${name}\n`);
  assert.notEqual(start, -1, `missing workflow step: ${name}`);
  const end = workflow.indexOf("\n      - ", start + 1);
  return workflow.slice(start, end === -1 ? undefined : end);
}

function shell(name) {
  const text = step(name);
  const block = text.split("        run: |\n")[1];
  if (block) return block.split("\n").map((line) => line.replace(/^ {10}/u, "")).join("\n");
  const inline = text.match(/^        run: (.+)$/mu)?.[1];
  assert.ok(inline, `missing shell in ${name}`);
  return inline;
}

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "api-backup-confidentiality-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const receiptDir = path.join(root, "jakh-api-release");
  const privateDir = path.join(root, "jakh-api-backup-plaintext");
  mkdirSync(path.join(root, "scripts"));
  mkdirSync(path.join(root, "worker/node_modules/.bin"), { recursive: true });
  mkdirSync(receiptDir);
  copyFileSync(new URL("./d1-backup.mjs", import.meta.url), path.join(root, "scripts/d1-backup.mjs"));
  // A local-only Wrangler stand-in writes an export and SQLite/WAL files before
  // injected failures. The real encryption, decryption, and attestation CLI runs.
  writeFileSync(path.join(root, "worker/node_modules/.bin/wrangler"), `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];
const failure = process.env.BACKUP_TEST_FAILURE;
const privateDir = process.env.PRIVATE_BACKUP_DIR;
if ((fs.statSync(privateDir).mode & 0o777) !== 0o700) process.exit(91);
if (args[0] !== "d1") process.exit(92);
if (args[1] === "export") {
  fs.writeFileSync(args.find((arg) => arg.startsWith("--output=")).slice(9), ${JSON.stringify(plaintext.toString())});
  if (failure === "export") process.exit(31);
  if (failure === "export-signal") process.kill(process.ppid, "SIGTERM");
} else if (args[1] === "execute" && args.includes("--local")) {
  const persist = flag("--persist-to");
  if (persist !== path.join(privateDir, "local-d1")) process.exit(93);
  if (args.includes("--file")) {
    fs.mkdirSync(path.join(persist, "v3/d1"), { recursive: true });
    fs.copyFileSync(flag("--file"), path.join(persist, "v3/d1/database.sqlite"));
    fs.writeFileSync(path.join(persist, "v3/d1/database.sqlite-wal"), "private-account-row");
    fs.writeFileSync(process.env.WRANGLER_LOG_PATH, "private-account-row");
    if (failure === "restore-import") process.exit(32);
  } else if (args.includes("--json")) {
    console.log(JSON.stringify([{ success: true, results: [{ schema_version: failure === "attest" ? "999" : "9", table_count: 20 }] }]));
    if (failure === "restore-query") process.exit(33);
  } else process.exit(94);
} else process.exit(95);
`, { mode: 0o700 });
  const env = {
    ...process.env,
    PS1: "",
    RECEIPT_DIR: receiptDir,
    PRIVATE_BACKUP_DIR: privateDir,
    WRANGLER_LOG_PATH: path.join(privateDir, "wrangler.log"),
    D1_BACKUP_ENCRYPTION_KEY: key.toString("base64"),
  };
  return {
    receiptDir,
    privateDir,
    run(name, extraEnv = {}) {
      return spawnSync("bash", ["-euo", "pipefail", "-c", shell(name)], {
        cwd: root, env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 10_000,
      });
    },
    seedEncryptedBackup() {
      const { encrypted, receipt } = encryptBackup({ plaintext, key });
      writeFileSync(path.join(receiptDir, "pre-migration.sql.jakh"), encrypted);
      writeFileSync(path.join(receiptDir, "pre-migration-backup-receipt.json"), JSON.stringify(receipt));
    },
  };
}

test("successful backup and restore retain only ciphertext and attested metadata", (t) => {
  const f = fixture(t);
  for (const name of [exportStep, restoreStep]) {
    const result = f.run(name);
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.equal(existsSync(f.privateDir), false, `${name} must remove all plaintext and local D1 files`);
  }
  const receipt = JSON.parse(readFileSync(path.join(f.receiptDir, "pre-migration-backup-receipt.json")));
  assert.equal(receipt.status, "passed");
  assert.equal(receipt.restoreProof.schemaVersion, "9");
  assert.doesNotMatch(JSON.stringify(receipt), /private-account-row/u);
  assert.equal(existsSync(path.join(f.receiptDir, "local-d1")), false);
});

for (const failure of ["export", "export-signal", "encrypt", "verify", "restore-import", "restore-query", "attest"]) {
  test(`plaintext is cleaned when ${failure} fails`, (t) => {
    const f = fixture(t);
    const isExport = ["export", "export-signal", "encrypt"].includes(failure);
    if (!isExport) f.seedEncryptedBackup();
    const result = f.run(isExport ? exportStep : restoreStep, {
      BACKUP_TEST_FAILURE: failure,
      ...(["encrypt", "verify"].includes(failure) ? { D1_BACKUP_ENCRYPTION_KEY: "invalid" } : {}),
    });
    const expectedStatus = { export: 31, "export-signal": 143, encrypt: 1, verify: 1, "restore-import": 32, "restore-query": 33, attest: 1 }[failure];
    assert.equal(result.status, expectedStatus, result.stderr || result.error?.message);
    assert.equal(result.error, undefined);
    assert.equal(existsSync(f.privateDir), false, result.stderr);
    for (const name of ["pre-migration.sql", "restore.sql", "restore-query.json", "local-d1"]) {
      assert.equal(existsSync(path.join(f.receiptDir, name)), false, `${name} must never be written among release evidence`);
    }
  });
}

test("always-run cleanup removes an orphaned restore workspace before artifact uploads", (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.privateDir, "local-d1"), { recursive: true });
  writeFileSync(path.join(f.privateDir, "local-d1/database.sqlite"), plaintext);
  assert.match(step(cleanupStep), /if: \$\{\{ always\(\) \}\}/u);
  assert.ok(workflow.indexOf(`      - name: ${cleanupStep}`) < workflow.indexOf("      - name: Store the tested encrypted backup"));
  const result = f.run(cleanupStep);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(f.privateDir), false);
});

for (const leftover of ["private-workspace", "nested-sqlite", "sql-export"]) {
  test(`migration authorization rejects retained ${leftover}`, (t) => {
    const f = fixture(t);
    const retainedPath = leftover === "private-workspace"
      ? path.join(f.privateDir, "local-d1/database.sqlite")
      : path.join(f.receiptDir, leftover === "nested-sqlite" ? "local-d1/v3/database.sqlite-wal" : "pre-migration.sql");
    mkdirSync(path.dirname(retainedPath), { recursive: true });
    writeFileSync(retainedPath, plaintext);
    const result = f.run("Authorize mutation from exact compatibility and backup proofs");
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /Plaintext backup retained/u);
    assert.equal(existsSync(path.join(f.receiptDir, "migration-authorization.json")), false);
  });
}

test("90-day receipt artifacts allow only named evidence and exclude all backup content", () => {
  for (const name of ["Upload compatibility receipt", "Upload final release receipt"]) {
    const upload = step(name);
    const paths = upload.split("          path: |\n")[1]?.split(/\n {10}\S/u)[0]
      .split("\n").map((line) => line.trim()).filter(Boolean);
    assert.ok(paths?.length, `${name} must use a file allowlist`);
    for (const item of paths) {
      assert.match(item, /^\$\{\{ runner\.temp \}\}\/jakh-api-release\/[a-z0-9-]+\.(?:json|txt|http)$/u);
      assert.doesNotMatch(item, /restore-query|local-d1|plaintext|\.sql|\.sqlite|\.db/u);
    }
    assert.ok(paths.some((item) => item.endsWith("/release-receipt.json")));
    assert.match(upload, /retention-days: 90/u);
  }
  const backup = step("Store the tested encrypted backup off-account before mutation");
  assert.match(backup, /pre-migration\.sql\.jakh/u);
  assert.match(backup, /retention-days: 35/u);
  for (const name of [exportStep, restoreStep, cleanupStep]) {
    assert.match(step(name), /PRIVATE_BACKUP_DIR: \$\{\{ runner\.temp \}\}\/jakh-api-backup-plaintext/u);
  }
});
