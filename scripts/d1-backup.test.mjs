import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import test from "node:test";

import {
  attestRestore,
  authorizeMigration,
  decryptBackup,
  encryptBackup,
  encryptionKey,
  SUPPORTED_RESTORE_SCHEMA_VERSIONS,
} from "./d1-backup.mjs";

const sample = Buffer.from("PRAGMA defer_foreign_keys=TRUE;\nCREATE TABLE sample(id INTEGER PRIMARY KEY);\nINSERT INTO sample VALUES(1);\n", "utf8");
const key = randomBytes(32);

test("encrypted backup round-trips without placing data in its receipt", () => {
  const { encrypted, receipt } = encryptBackup({
    plaintext: sample,
    key,
    env: { GITHUB_SHA: "a".repeat(40), GITHUB_REF: "refs/heads/main" },
    nonce: Buffer.alloc(12, 7),
  });
  assert.deepEqual(decryptBackup({ encrypted, key, receipt }), sample);
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /CREATE TABLE|INSERT INTO|sample\(id/u);
  assert.equal(receipt.encryptedBackupCreated, true);
  assert.equal(receipt.plaintextDatabaseExportRetained, false);
  assert.equal(receipt.status, "encrypted");
});

test("tampering and the wrong key fail authenticated decryption", () => {
  const { encrypted, receipt } = encryptBackup({ plaintext: sample, key });
  const tampered = Buffer.from(encrypted);
  tampered[tampered.length - 20] ^= 1;
  assert.throws(() => decryptBackup({ encrypted: tampered, key, receipt }), /checksum/u);
  assert.throws(() => decryptBackup({ encrypted, key: randomBytes(32), receipt }), /authentication/u);
});

test("restore attestation requires one supported schema with a real table inventory", () => {
  const receipt = encryptBackup({ plaintext: sample, key }).receipt;
  const attested = attestRestore(receipt, [{ success: true, results: [{ schema_version: "9", table_count: 20 }] }]);
  assert.equal(attested.status, "passed");
  assert.equal(attested.restoreProof.schemaVersion, "9");
  assert.equal(attested.restoreProof.target, "ephemeral-local-d1");
  assert.equal(attested.restoreProof.destructiveProductionOperation, false);
  assert.throws(() => attestRestore(receipt, [{ success: true, results: [{ schema_version: "8", table_count: 2 }] }]), /too few tables/u);
  assert.throws(() => attestRestore(receipt, [{ success: true, results: [{ schema_version: "5", table_count: 17 }] }]), /unsupported/u);
  assert.throws(() => attestRestore(receipt, [{ success: true, results: [{ schema_version: "10", table_count: 20 }] }]), /unsupported/u);
});

test("restore attestation supports the latest checked-in D1 migration", () => {
  const latestMigration = readdirSync(new URL("../worker/migrations/", import.meta.url))
    .map((name) => name.match(/^(\d{4})_.*\.sql$/u)?.[1])
    .filter(Boolean)
    .sort()
    .at(-1);
  assert.ok(latestMigration, "expected at least one numbered D1 migration");
  assert.ok(
    SUPPORTED_RESTORE_SCHEMA_VERSIONS.includes(String(Number(latestMigration))),
    `restore attestation must support latest D1 schema ${Number(latestMigration)}`,
  );
});

test("backup key parser accepts exactly 256 bits", () => {
  assert.deepEqual(encryptionKey(key.toString("base64")), key);
  assert.deepEqual(encryptionKey(key.toString("base64url")), key);
  assert.throws(() => encryptionKey(Buffer.alloc(16).toString("base64")), /32 bytes/u);
});

test("migration authorization binds one commit, compatibility Worker, and tested ciphertext", () => {
  const commit = "b".repeat(40);
  const result = encryptBackup({
    plaintext: sample,
    key,
    env: { GITHUB_SHA: commit, GITHUB_REF: "refs/heads/main" },
  });
  const backupReceipt = attestRestore(result.receipt, [{ success: true, results: [{ schema_version: "6", table_count: 14 }] }]);
  const releaseReceipt = {
    phase: "migrate-final",
    release: { commit },
    preDeployment: { activeWorkerVersion: "worker-version" },
    safety: { provenCompatibilityWorker: "worker-version", rollbackProof: { safe: true } },
  };
  const authorization = authorizeMigration({
    releaseReceipt,
    backupReceipt,
    encrypted: result.encrypted,
    env: { GITHUB_SHA: commit, GITHUB_REF: "refs/heads/main" },
  });
  assert.equal(authorization.databaseMutationAllowed, true);
  assert.equal(authorization.commitSha, commit);
  assert.throws(() => authorizeMigration({
    releaseReceipt,
    backupReceipt: { ...backupReceipt, commitSha: "c".repeat(40) },
    encrypted: result.encrypted,
    env: { GITHUB_SHA: commit, GITHUB_REF: "refs/heads/main" },
  }), /commit does not match/u);
});
