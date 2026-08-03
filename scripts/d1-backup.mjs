#!/usr/bin/env node

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BACKUP_FORMAT = "JAKH-D1-BACKUP-V1";
export const ALGORITHM = "aes-256-gcm";
export const AUTH_TAG_BYTES = 16;
export const MAX_PLAINTEXT_BYTES = 50 * 1024 * 1024;
export const DEFAULT_RETENTION_DAYS = 35;
const SOURCE_PATH = fileURLToPath(import.meta.url);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function encryptionKey(value) {
  invariant(typeof value === "string" && value.trim(), "D1_BACKUP_ENCRYPTION_KEY is required");
  const normalized = value.trim().replaceAll("-", "+").replaceAll("_", "/");
  invariant(/^[A-Za-z0-9+/]+={0,2}$/u.test(normalized), "Backup key must be base64 encoded");
  const key = Buffer.from(normalized, "base64");
  invariant(key.length === 32, "Backup key must decode to exactly 32 bytes");
  return key;
}

function metadata(env, plaintext, retentionDays) {
  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(generatedAt) + retentionDays * 86_400_000).toISOString();
  return {
    formatVersion: 1,
    format: BACKUP_FORMAT,
    algorithm: ALGORITHM,
    generatedAt,
    expiresAt,
    retentionDays,
    repository: env.GITHUB_REPOSITORY || "local",
    ref: env.GITHUB_REF || "local",
    commitSha: env.GITHUB_SHA || "local",
    runId: env.GITHUB_RUN_ID || "local",
    runAttempt: env.GITHUB_RUN_ATTEMPT || "1",
    database: {
      name: env.D1_BACKUP_DATABASE_NAME || "jakh-db",
      id: env.D1_BACKUP_DATABASE_ID || "7fa30e72-85e4-4254-be85-40a9dfd8295c",
    },
    plaintextBytes: plaintext.length,
    plaintextSha256: sha256(plaintext),
  };
}

export function encryptBackup({ plaintext, key, env = {}, retentionDays = DEFAULT_RETENTION_DAYS, nonce = randomBytes(12) }) {
  invariant(Buffer.isBuffer(plaintext), "Backup plaintext must be a Buffer");
  invariant(plaintext.length > 0, "D1 export is empty");
  invariant(plaintext.length <= MAX_PLAINTEXT_BYTES, `D1 export exceeds the ${MAX_PLAINTEXT_BYTES} byte free-storage safety budget`);
  invariant(/(?:CREATE TABLE|INSERT INTO|PRAGMA)/u.test(plaintext.toString("utf8", 0, Math.min(plaintext.length, 65_536))), "Input does not look like a D1 SQL export");
  invariant(Buffer.isBuffer(key) && key.length === 32, "Encryption key must be 32 bytes");
  invariant(Buffer.isBuffer(nonce) && nonce.length === 12, "AES-GCM nonce must be 12 bytes");
  invariant(Number.isInteger(retentionDays) && retentionDays >= 7 && retentionDays <= 35, "Retention must be between 7 and 35 days");

  const header = { ...metadata(env, plaintext, retentionDays), nonce: nonce.toString("base64url") };
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(headerBytes);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(headerBytes.length);
  const encrypted = Buffer.concat([
    Buffer.from(`${BACKUP_FORMAT}\n`, "ascii"),
    headerLength,
    headerBytes,
    ciphertext,
    tag,
  ]);
  const receipt = {
    ...header,
    status: "encrypted",
    encryptedBackupCreated: true,
    plaintextDatabaseExportRetained: false,
    ciphertextBytes: encrypted.length,
    ciphertextSha256: sha256(encrypted),
    keyId: sha256(key).slice(0, 16),
    storage: "github-actions-encrypted-artifact",
    restoreProof: null,
  };
  return { encrypted, receipt };
}

export function parseEncryptedBackup(encrypted) {
  invariant(Buffer.isBuffer(encrypted), "Encrypted backup must be a Buffer");
  const prefix = Buffer.from(`${BACKUP_FORMAT}\n`, "ascii");
  invariant(encrypted.subarray(0, prefix.length).equals(prefix), "Encrypted backup magic is invalid");
  invariant(encrypted.length >= prefix.length + 4 + AUTH_TAG_BYTES, "Encrypted backup is truncated");
  const headerLength = encrypted.readUInt32BE(prefix.length);
  invariant(headerLength > 0 && headerLength <= 64 * 1024, "Encrypted backup header length is invalid");
  const headerStart = prefix.length + 4;
  const dataStart = headerStart + headerLength;
  invariant(encrypted.length >= dataStart + AUTH_TAG_BYTES, "Encrypted backup payload is truncated");
  const headerBytes = encrypted.subarray(headerStart, dataStart);
  let header;
  try {
    header = JSON.parse(headerBytes.toString("utf8"));
  } catch {
    throw new Error("Encrypted backup header is not valid JSON");
  }
  invariant(header?.format === BACKUP_FORMAT && header?.algorithm === ALGORITHM, "Encrypted backup header contract is invalid");
  const nonce = Buffer.from(String(header.nonce || ""), "base64url");
  invariant(nonce.length === 12, "Encrypted backup nonce is invalid");
  return {
    header,
    headerBytes,
    nonce,
    ciphertext: encrypted.subarray(dataStart, -AUTH_TAG_BYTES),
    tag: encrypted.subarray(-AUTH_TAG_BYTES),
  };
}

export function decryptBackup({ encrypted, key, receipt }) {
  invariant(Buffer.isBuffer(key) && key.length === 32, "Encryption key must be 32 bytes");
  invariant(receipt?.ciphertextSha256 === sha256(encrypted), "Encrypted backup checksum does not match its receipt");
  const parsed = parseEncryptedBackup(encrypted);
  for (const field of ["format", "algorithm", "generatedAt", "plaintextBytes", "plaintextSha256", "nonce"]) {
    invariant(receipt?.[field] === parsed.header[field], `Receipt does not match encrypted header field ${field}`);
  }
  const decipher = createDecipheriv(ALGORITHM, key, parsed.nonce, { authTagLength: AUTH_TAG_BYTES });
  decipher.setAAD(parsed.headerBytes);
  decipher.setAuthTag(parsed.tag);
  let plaintext;
  try {
    plaintext = Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]);
  } catch {
    throw new Error("Encrypted backup authentication failed");
  }
  invariant(plaintext.length === receipt.plaintextBytes, "Decrypted backup size does not match receipt");
  invariant(sha256(plaintext) === receipt.plaintextSha256, "Decrypted backup checksum does not match receipt");
  return plaintext;
}

export function extractRows(payload) {
  const statements = Array.isArray(payload) ? payload.flat(Infinity) : [payload];
  const rows = [];
  for (const statement of statements) {
    if (!statement || typeof statement !== "object") continue;
    invariant(statement.success !== false, "Restore verification query reported failure");
    if (Array.isArray(statement.results)) rows.push(...statement.results);
  }
  return rows;
}

export function attestRestore(receipt, queryPayload, now = new Date()) {
  invariant(receipt?.status === "encrypted", "Only a newly encrypted receipt can be attested");
  const rows = extractRows(queryPayload);
  invariant(rows.length === 1, "Restore verification must return exactly one schema row");
  const schemaVersion = String(rows[0].schema_version ?? "");
  const tableCount = Number(rows[0].table_count);
  invariant(["6", "7", "8"].includes(schemaVersion), `Restored schema version is unsupported: ${schemaVersion || "missing"}`);
  invariant(Number.isInteger(tableCount) && tableCount >= 10, `Restored database has too few tables: ${rows[0].table_count ?? "missing"}`);
  return {
    ...receipt,
    status: "passed",
    restoreProof: {
      verifiedAt: now.toISOString(),
      target: "ephemeral-local-d1",
      destructiveProductionOperation: false,
      schemaVersion,
      tableCount,
      plaintextRemovedAfterVerification: true,
      authenticationTagVerified: true,
      plaintextChecksumVerified: true,
    },
  };
}

export function authorizeMigration({ releaseReceipt, backupReceipt, encrypted, env = {} }) {
  const commit = env.GITHUB_SHA || releaseReceipt?.release?.commit;
  invariant(/^[0-9a-f]{40}$/iu.test(commit || ""), "Migration authorization requires an exact commit SHA");
  invariant(env.GITHUB_REF === undefined || env.GITHUB_REF === "refs/heads/main", "Migration authorization is restricted to main");
  invariant(releaseReceipt?.phase === "migrate-final", "Release receipt is not migrate-final evidence");
  invariant(releaseReceipt?.release?.commit === commit, "Release receipt commit does not match this run");
  invariant(
    releaseReceipt?.safety?.provenCompatibilityWorker
      && releaseReceipt.safety.provenCompatibilityWorker === releaseReceipt?.preDeployment?.activeWorkerVersion,
    "Release receipt does not bind the active compatibility Worker",
  );
  invariant(releaseReceipt?.safety?.rollbackProof?.safe === true, "Compatibility Worker rollback proof is not safe");
  invariant(backupReceipt?.status === "passed", "Encrypted backup restore proof has not passed");
  invariant(backupReceipt?.commitSha === commit, "Encrypted backup commit does not match this run");
  invariant(backupReceipt?.ref === "refs/heads/main", "Encrypted backup was not created from main");
  invariant(backupReceipt?.database?.name === "jakh-db", "Encrypted backup database name is invalid");
  invariant(backupReceipt?.database?.id === "7fa30e72-85e4-4254-be85-40a9dfd8295c", "Encrypted backup database ID is invalid");
  invariant(backupReceipt?.restoreProof?.target === "ephemeral-local-d1", "Encrypted backup was not restored in isolation");
  invariant(backupReceipt?.restoreProof?.authenticationTagVerified === true, "Backup authentication tag was not verified");
  invariant(backupReceipt?.restoreProof?.plaintextChecksumVerified === true, "Backup plaintext checksum was not verified");
  invariant(backupReceipt?.restoreProof?.plaintextRemovedAfterVerification === true, "Backup plaintext cleanup was not verified");
  invariant(backupReceipt?.ciphertextSha256 === sha256(encrypted), "Uploaded encrypted backup checksum is invalid");
  return {
    formatVersion: 1,
    authorizedAt: new Date().toISOString(),
    commitSha: commit,
    compatibilityWorkerVersion: releaseReceipt.safety.provenCompatibilityWorker,
    backupCiphertextSha256: backupReceipt.ciphertextSha256,
    backupRestoreSchema: backupReceipt.restoreProof.schemaVersion,
    databaseMutationAllowed: true,
  };
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function writePrivate(target, bytes) {
  fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  fs.writeFileSync(target, bytes, { mode: 0o600 });
}

function main() {
  const command = process.argv[2];
  if (command === "encrypt") {
    const input = arg("input");
    const output = arg("output");
    const receiptPath = arg("receipt");
    invariant(input && output && receiptPath, "encrypt requires --input, --output, and --receipt");
    const key = encryptionKey(process.env.D1_BACKUP_ENCRYPTION_KEY);
    const result = encryptBackup({ plaintext: fs.readFileSync(input), key, env: process.env });
    writePrivate(output, result.encrypted);
    writePrivate(receiptPath, `${JSON.stringify(result.receipt, null, 2)}\n`);
    console.log(`Encrypted D1 backup created (${result.receipt.ciphertextBytes} bytes; plaintext content not logged).`);
    return;
  }
  if (command === "verify") {
    const input = arg("input");
    const output = arg("output");
    const receiptPath = arg("receipt");
    invariant(input && output && receiptPath, "verify requires --input, --output, and --receipt");
    const plaintext = decryptBackup({
      encrypted: fs.readFileSync(input),
      key: encryptionKey(process.env.D1_BACKUP_ENCRYPTION_KEY),
      receipt: readJson(receiptPath),
    });
    writePrivate(output, plaintext);
    console.log("Encrypted D1 backup authenticated and decrypted into the isolated restore workspace.");
    return;
  }
  if (command === "attest") {
    const receiptPath = arg("receipt");
    const queryPath = arg("query");
    invariant(receiptPath && queryPath, "attest requires --receipt and --query");
    const attested = attestRestore(readJson(receiptPath), readJson(queryPath));
    writePrivate(receiptPath, `${JSON.stringify(attested, null, 2)}\n`);
    console.log(`Restore proof passed for schema ${attested.restoreProof.schemaVersion} across ${attested.restoreProof.tableCount} tables.`);
    return;
  }
  if (command === "authorize") {
    const releasePath = arg("release-receipt");
    const backupPath = arg("backup-receipt");
    const encryptedPath = arg("encrypted");
    const output = arg("output");
    invariant(releasePath && backupPath && encryptedPath && output, "authorize requires --release-receipt, --backup-receipt, --encrypted, and --output");
    const authorization = authorizeMigration({
      releaseReceipt: readJson(releasePath),
      backupReceipt: readJson(backupPath),
      encrypted: fs.readFileSync(encryptedPath),
      env: process.env,
    });
    writePrivate(output, `${JSON.stringify(authorization, null, 2)}\n`);
    console.log(`D1 mutation authorized for compatibility Worker ${authorization.compatibilityWorkerVersion}.`);
    return;
  }
  throw new Error("Usage: d1-backup.mjs <encrypt|verify|attest|authorize> [options]");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SOURCE_PATH)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
