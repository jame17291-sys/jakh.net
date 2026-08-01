#!/usr/bin/env node

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_CONFIG = path.join(WORKER_DIR, "wrangler.jsonc");
const DEFAULT_MIGRATIONS = path.join(WORKER_DIR, "migrations");
const WRANGLER_BIN = path.join(WORKER_DIR, "node_modules", "wrangler", "bin", "wrangler.js");

export const FORMAT_VERSION = 1;
export const PRODUCTION_DATABASE_NAME = "jakh-db";
export const DRILL_DATABASE_NAME = "jakh-recovery-drill";
export const DRILL_CONFIRMATION = `RESTORE ${DRILL_DATABASE_NAME}`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOOKMARK_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const SAFE_RUN_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,160}$/;

export function stripJsonComments(input) {
  let output = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    const next = input[index + 1];

    if (lineComment) {
      if (current === "\n") {
        lineComment = false;
        output += current;
      }
      continue;
    }

    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false;
        index += 1;
      } else if (current === "\n") {
        output += current;
      }
      continue;
    }

    if (inString) {
      output += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }

    if (current === '"') {
      inString = true;
      output += current;
    } else if (current === "/" && next === "/") {
      lineComment = true;
      index += 1;
    } else if (current === "/" && next === "*") {
      blockComment = true;
      index += 1;
    } else {
      output += current;
    }
  }

  return output;
}

export function removeTrailingCommas(input) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index];
    if (inString) {
      output += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }

    if (current === '"') {
      inString = true;
      output += current;
      continue;
    }

    if (current === ",") {
      let lookahead = index + 1;
      while (/\s/.test(input[lookahead] ?? "")) lookahead += 1;
      if (input[lookahead] === "}" || input[lookahead] === "]") continue;
    }
    output += current;
  }

  return output;
}

export function parseJsonc(input) {
  return JSON.parse(removeTrailingCommas(stripJsonComments(input)));
}

export function databaseTarget(config, binding) {
  const targets = Array.isArray(config?.d1_databases) ? config.d1_databases : [];
  const target = targets.find(
    (candidate) => candidate.binding === binding || candidate.database_name === binding,
  );
  if (!target) throw new Error(`D1 binding not found: ${binding}`);
  if (!UUID_PATTERN.test(target.database_id ?? "")) {
    throw new Error(`D1 binding ${binding} has an invalid database UUID`);
  }
  return {
    binding: target.binding,
    name: target.database_name,
    id: target.database_id.toLowerCase(),
  };
}

export function assertMainRef(actualRef, requiredRef) {
  if (requiredRef && actualRef !== requiredRef) {
    throw new Error(`Recovery evidence is restricted to ${requiredRef}; received ${actualRef || "unset"}`);
  }
}

export function assertNonProductionTarget({ production, drillName, drillId, confirmation }) {
  if (drillName !== DRILL_DATABASE_NAME) {
    throw new Error(`Restore drill database name must be exactly ${DRILL_DATABASE_NAME}`);
  }
  if (!UUID_PATTERN.test(drillId ?? "")) {
    throw new Error("Restore drill database UUID is missing or invalid");
  }
  if (drillId.toLowerCase() === production.id.toLowerCase()) {
    throw new Error("Restore drill database UUID matches production; operation blocked");
  }
  if (drillName === production.name) {
    throw new Error("Restore drill database name matches production; operation blocked");
  }
  if (confirmation !== DRILL_CONFIRMATION) {
    throw new Error(`Restore drill confirmation must be exactly: ${DRILL_CONFIRMATION}`);
  }
}

export function validateBookmark(bookmark) {
  if (typeof bookmark !== "string" || !BOOKMARK_PATTERN.test(bookmark)) {
    throw new Error("Wrangler returned an invalid Time Travel bookmark");
  }
  return bookmark;
}

export function parseWranglerJson(stdout) {
  try {
    return JSON.parse(stdout.trim());
  } catch {
    throw new Error("Wrangler did not return valid JSON");
  }
}

export function extractRows(payload) {
  const statements = Array.isArray(payload) ? payload.flat(Infinity) : [payload];
  const rows = [];
  for (const statement of statements) {
    if (!statement || typeof statement !== "object") continue;
    if (statement.success === false) throw new Error("D1 statement reported failure");
    if (Array.isArray(statement.results)) rows.push(...statement.results);
  }
  return rows;
}

export function quoteSql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sanitizeError(error) {
  return String(error?.message ?? error)
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/(api[_ -]?token\s*[:=]\s*)\S+/gi, "$1[redacted]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .slice(0, 500);
}

export function assertReceiptSafe(receipt, env = process.env) {
  const serialized = JSON.stringify(receipt);
  const forbiddenKeys = [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_RECOVERY_READ_TOKEN",
    "CLOUDFLARE_RECOVERY_DRILL_TOKEN",
    "PASSWORD_PEPPER",
    "IP_HASH_SALT",
  ];
  for (const key of forbiddenKeys) {
    if (serialized.includes(key)) throw new Error(`Receipt contains forbidden key name: ${key}`);
    const value = env[key];
    if (typeof value === "string" && value.length >= 8 && serialized.includes(value)) {
      throw new Error(`Receipt contains the value of forbidden environment variable: ${key}`);
    }
  }
  if (receipt.plaintextDatabaseExportCreated !== false) {
    throw new Error("Recovery receipt must explicitly assert that no plaintext database export was created");
  }
}

export async function migrationManifest(migrationsDir = DEFAULT_MIGRATIONS) {
  const fileNames = (await readdir(migrationsDir))
    .filter((name) => /^\d+.*\.sql$/i.test(name))
    .sort();
  if (fileNames.length === 0) throw new Error("No D1 migrations found");

  const digest = createHash("sha256");
  const files = [];
  for (const name of fileNames) {
    const contents = await readFile(path.join(migrationsDir, name), "utf8");
    const fileDigest = sha256(contents);
    files.push({ name, sha256: fileDigest });
    digest.update(name);
    digest.update("\0");
    digest.update(contents);
    digest.update("\0");
  }
  return { sha256: digest.digest("hex"), files };
}

export async function readProductionTarget(configPath = DEFAULT_CONFIG) {
  const config = parseJsonc(await readFile(configPath, "utf8"));
  const target = databaseTarget(config, "DB");
  if (target.name !== PRODUCTION_DATABASE_NAME) {
    throw new Error(`Production DB binding must resolve to ${PRODUCTION_DATABASE_NAME}`);
  }
  return target;
}

export async function defaultRunWrangler(args, { cwd = WORKER_DIR } = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WRANGLER_BIN, ...args], {
      cwd,
      env: { ...process.env, CI: "true", WRANGLER_WRITE_LOGS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 2_000_000) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 2_000_000) child.kill("SIGTERM");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Wrangler command failed (${code}): ${sanitizeError(stderr)}`));
    });
  });
}

function workflowIdentity(env = process.env) {
  const repository = env.GITHUB_REPOSITORY || null;
  const runId = env.GITHUB_RUN_ID || null;
  return {
    repository,
    gitSha: SHA_PATTERN.test(env.GITHUB_SHA ?? "") ? env.GITHUB_SHA.toLowerCase() : null,
    gitRef: env.GITHUB_REF || null,
    workflow: env.GITHUB_WORKFLOW || null,
    runId,
    runAttempt: env.GITHUB_RUN_ATTEMPT || null,
    runUrl:
      repository && runId
        ? `${env.GITHUB_SERVER_URL || "https://github.com"}/${repository}/actions/runs/${runId}`
        : null,
  };
}

async function packageVersion() {
  const packageJson = JSON.parse(await readFile(path.join(WORKER_DIR, "package.json"), "utf8"));
  return packageJson.devDependencies?.wrangler ?? null;
}

function baseReceipt(kind, env = process.env) {
  return {
    formatVersion: FORMAT_VERSION,
    kind,
    generatedAt: new Date().toISOString(),
    status: "running",
    workflow: workflowIdentity(env),
    plaintextDatabaseExportCreated: false,
  };
}

export async function writeReceipt(outputPath, receipt, env = process.env) {
  assertReceiptSafe(receipt, env);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);
}

async function releaseEvidence() {
  return {
    wranglerVersion: await packageVersion(),
    migrations: await migrationManifest(),
  };
}

async function currentBookmark(runWrangler, configPath, binding) {
  const { stdout } = await runWrangler([
    "d1",
    "time-travel",
    "info",
    binding,
    "--config",
    configPath,
    "--json",
  ]);
  return validateBookmark(parseWranglerJson(stdout).bookmark);
}

async function bookmarkAt(runWrangler, configPath, binding, timestamp) {
  const { stdout } = await runWrangler([
    "d1",
    "time-travel",
    "info",
    binding,
    "--timestamp",
    timestamp,
    "--config",
    configPath,
    "--json",
  ]);
  return validateBookmark(parseWranglerJson(stdout).bookmark);
}

export async function captureBookmarkEvidence({
  outputPath,
  configPath = DEFAULT_CONFIG,
  requiredRef,
  lookbackHours = 24,
  runWrangler = defaultRunWrangler,
  env = process.env,
  now = new Date(),
}) {
  const receipt = baseReceipt("d1-bookmark-verification", env);
  try {
    assertMainRef(env.GITHUB_REF, requiredRef);
    const production = await readProductionTarget(configPath);
    const lookbackTimestamp = new Date(now.getTime() - lookbackHours * 3_600_000).toISOString();
    const current = await currentBookmark(runWrangler, configPath, production.binding);
    const historical = await bookmarkAt(
      runWrangler,
      configPath,
      production.binding,
      lookbackTimestamp,
    );
    Object.assign(receipt, {
      status: "passed",
      database: production,
      release: await releaseEvidence(),
      checks: {
        currentBookmark: current,
        historicalBookmark: historical,
        historicalTimestamp: lookbackTimestamp,
        lookbackHours,
        timeTravelReadVerified: true,
        databaseContentRead: false,
      },
    });
  } catch (error) {
    receipt.status = "failed";
    receipt.failure = sanitizeError(error);
    await writeReceipt(outputPath, receipt, env);
    throw error;
  }
  await writeReceipt(outputPath, receipt, env);
  return receipt;
}

async function localSchemaDigest(runWrangler, configPath, persistPath) {
  await runWrangler([
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--persist-to",
    persistPath,
    "--config",
    configPath,
  ]);
  const { stdout } = await runWrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--persist-to",
    persistPath,
    "--command",
    "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE '_cf_%' ORDER BY type, name",
    "--config",
    configPath,
    "--json",
  ]);
  const rows = extractRows(parseWranglerJson(stdout)).map((row) => ({
    type: row.type,
    name: row.name,
    table: row.tbl_name,
    sql: row.sql,
  }));
  if (rows.length === 0) throw new Error("Local migration replay produced an empty schema");
  return { sha256: sha256(JSON.stringify(rows)), objectCount: rows.length };
}

export async function buildReadinessEvidence({
  outputPath,
  configPath = DEFAULT_CONFIG,
  requiredRef,
  runWrangler = defaultRunWrangler,
  env = process.env,
}) {
  const receipt = baseReceipt("recovery-drill-readiness", env);
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "jakh-recovery-readiness-"));
  try {
    assertMainRef(env.GITHUB_REF, requiredRef);
    const production = await readProductionTarget(configPath);
    const schema = await localSchemaDigest(
      runWrangler,
      configPath,
      path.join(temporaryDirectory, "d1-state"),
    );
    Object.assign(receipt, {
      status: "passed",
      database: production,
      release: await releaseEvidence(),
      checks: {
        migrationsReplayLocally: true,
        reconstructedSchema: schema,
        productionContacted: false,
        protectedQuarterlyRemoteDrillRequired: true,
        requiredDrillDatabaseName: DRILL_DATABASE_NAME,
        requiredConfirmation: DRILL_CONFIRMATION,
      },
    });
  } catch (error) {
    receipt.status = "failed";
    receipt.failure = sanitizeError(error);
    await writeReceipt(outputPath, receipt, env);
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  await writeReceipt(outputPath, receipt, env);
  return receipt;
}

async function writeDrillConfig(directory, drillName, drillId) {
  const configPath = path.join(directory, "wrangler.recovery-drill.json");
  const config = {
    name: "jakh-recovery-drill-runner",
    compatibility_date: "2026-07-29",
    d1_databases: [
      {
        binding: "RECOVERY_DRILL_DB",
        database_name: drillName,
        database_id: drillId,
      },
    ],
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return configPath;
}

async function executeRemote(runWrangler, configPath, sql) {
  const { stdout } = await runWrangler([
    "d1",
    "execute",
    "RECOVERY_DRILL_DB",
    "--remote",
    "--yes",
    "--command",
    sql,
    "--config",
    configPath,
    "--json",
  ]);
  return parseWranglerJson(stdout);
}

async function restoreBookmark(runWrangler, configPath, bookmark) {
  const { stdout } = await runWrangler([
    "d1",
    "time-travel",
    "restore",
    "RECOVERY_DRILL_DB",
    "--bookmark",
    bookmark,
    "--config",
    configPath,
    "--json",
  ]);
  const result = parseWranglerJson(stdout);
  validateBookmark(result.bookmark);
  validateBookmark(result.previous_bookmark);
  return result;
}

async function readCanary(runWrangler, configPath, runId) {
  const payload = await executeRemote(
    runWrangler,
    configPath,
    `SELECT value FROM recovery_drill_canary WHERE id = ${quoteSql(runId)} LIMIT 1`,
  );
  const rows = extractRows(payload);
  return rows.length === 1 ? rows[0].value : null;
}

async function waitForValue(
  runWrangler,
  configPath,
  runId,
  expected,
  { attempts = 12, delayMs = 5_000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if ((await readCanary(runWrangler, configPath, runId)) === expected) return attempt;
    if (attempt < attempts) await sleep(delayMs);
  }
  throw new Error("D1 canary did not reach the expected state before the verification timeout");
}

async function waitForChangedBookmark(
  runWrangler,
  configPath,
  previous,
  { attempts = 12, delayMs = 5_000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const bookmark = await currentBookmark(runWrangler, configPath, "RECOVERY_DRILL_DB");
    if (bookmark !== previous) return bookmark;
    if (attempt < attempts) await sleep(delayMs);
  }
  throw new Error("D1 bookmark did not advance before the verification timeout");
}

export async function runRestoreDrill({
  outputPath,
  configPath = DEFAULT_CONFIG,
  drillName,
  drillId,
  confirmation,
  requiredRef,
  runWrangler = defaultRunWrangler,
  env = process.env,
  waitOptions,
}) {
  const receipt = baseReceipt("d1-nonproduction-restore-drill", env);
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "jakh-recovery-drill-"));
  let drillConfig;
  let runId;
  try {
    assertMainRef(env.GITHUB_REF, requiredRef);
    const production = await readProductionTarget(configPath);
    assertNonProductionTarget({ production, drillName, drillId, confirmation });

    runId = env.GITHUB_RUN_ID
      ? `${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT || "1"}`
      : randomUUID();
    if (!SAFE_RUN_ID_PATTERN.test(runId)) throw new Error("Generated drill run ID is invalid");
    const baselineValue = `baseline-${randomBytes(24).toString("hex")}`;
    const mutatedValue = `mutated-${randomBytes(24).toString("hex")}`;
    drillConfig = await writeDrillConfig(temporaryDirectory, drillName, drillId);

    await executeRemote(
      runWrangler,
      drillConfig,
      "CREATE TABLE IF NOT EXISTS recovery_drill_canary (id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)",
    );
    await executeRemote(
      runWrangler,
      drillConfig,
      `DELETE FROM recovery_drill_canary WHERE id = ${quoteSql(runId)}`,
    );
    const beforeBookmark = await currentBookmark(
      runWrangler,
      drillConfig,
      "RECOVERY_DRILL_DB",
    );
    await executeRemote(
      runWrangler,
      drillConfig,
      `INSERT INTO recovery_drill_canary (id, value, updated_at) VALUES (${quoteSql(runId)}, ${quoteSql(baselineValue)}, ${quoteSql(new Date().toISOString())})`,
    );
    const baselineBookmark = await waitForChangedBookmark(
      runWrangler,
      drillConfig,
      beforeBookmark,
      waitOptions,
    );
    await waitForValue(runWrangler, drillConfig, runId, baselineValue, waitOptions);

    await executeRemote(
      runWrangler,
      drillConfig,
      `UPDATE recovery_drill_canary SET value = ${quoteSql(mutatedValue)}, updated_at = ${quoteSql(new Date().toISOString())} WHERE id = ${quoteSql(runId)}`,
    );
    const mutatedBookmark = await waitForChangedBookmark(
      runWrangler,
      drillConfig,
      baselineBookmark,
      waitOptions,
    );
    await waitForValue(runWrangler, drillConfig, runId, mutatedValue, waitOptions);

    const restoreResult = await restoreBookmark(runWrangler, drillConfig, baselineBookmark);
    const baselineAttempts = await waitForValue(
      runWrangler,
      drillConfig,
      runId,
      baselineValue,
      waitOptions,
    );
    const undoResult = await restoreBookmark(runWrangler, drillConfig, mutatedBookmark);
    const undoAttempts = await waitForValue(
      runWrangler,
      drillConfig,
      runId,
      mutatedValue,
      waitOptions,
    );

    await executeRemote(
      runWrangler,
      drillConfig,
      `DELETE FROM recovery_drill_canary WHERE id = ${quoteSql(runId)}`,
    );
    if ((await readCanary(runWrangler, drillConfig, runId)) !== null) {
      throw new Error("Restore drill canary cleanup failed");
    }

    Object.assign(receipt, {
      status: "passed",
      database: {
        name: drillName,
        id: drillId.toLowerCase(),
        productionIdentityMismatchVerified: true,
      },
      release: await releaseEvidence(),
      checks: {
        typedConfirmationVerified: true,
        baselineValueSha256: sha256(baselineValue),
        mutatedValueSha256: sha256(mutatedValue),
        beforeBookmark,
        baselineBookmark,
        mutatedBookmark,
        restoreResultBookmark: restoreResult.bookmark,
        restorePreviousBookmark: restoreResult.previous_bookmark,
        undoResultBookmark: undoResult.bookmark,
        undoPreviousBookmark: undoResult.previous_bookmark,
        baselineVisibleAfterRestore: true,
        mutationVisibleAfterUndoRestore: true,
        canaryCleanupVerified: true,
        baselineVisibilityAttempts: baselineAttempts,
        undoVisibilityAttempts: undoAttempts,
        productionContacted: false,
      },
    });
  } catch (error) {
    receipt.status = "failed";
    receipt.failure = sanitizeError(error);
    await writeReceipt(outputPath, receipt, env);
    throw error;
  } finally {
    if (drillConfig && runId) {
      try {
        await executeRemote(
          runWrangler,
          drillConfig,
          `DELETE FROM recovery_drill_canary WHERE id = ${quoteSql(runId)}`,
        );
      } catch {
        // A failed cleanup is already represented by the failed workflow and receipt.
      }
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
  await writeReceipt(outputPath, receipt, env);
  return receipt;
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

async function runCli() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const outputPath = path.resolve(options.output || path.join(process.cwd(), "recovery-evidence.json"));
  const requiredRef = options["required-ref"];

  if (command === "validate") {
    const production = await readProductionTarget(options.config || DEFAULT_CONFIG);
    const migrations = await migrationManifest(options.migrations || DEFAULT_MIGRATIONS);
    process.stdout.write(
      `Recovery configuration valid for ${production.name}; ${migrations.files.length} migrations tracked.\n`,
    );
    return;
  }
  if (command === "readiness") {
    await buildReadinessEvidence({
      outputPath,
      configPath: options.config || DEFAULT_CONFIG,
      requiredRef,
    });
    return;
  }
  if (command === "bookmark") {
    await captureBookmarkEvidence({
      outputPath,
      configPath: options.config || DEFAULT_CONFIG,
      requiredRef,
      lookbackHours: Number(options["lookback-hours"] || 24),
    });
    return;
  }
  if (command === "drill") {
    await runRestoreDrill({
      outputPath,
      configPath: options.config || DEFAULT_CONFIG,
      requiredRef,
      drillName: options["database-name"] || process.env.RECOVERY_DRILL_DATABASE_NAME,
      drillId: options["database-id"] || process.env.RECOVERY_DRILL_DATABASE_ID,
      confirmation: options.confirmation || process.env.RECOVERY_DRILL_CONFIRMATION,
    });
    return;
  }
  throw new Error("Usage: recovery-evidence.mjs <validate|readiness|bookmark|drill> [options]");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    process.stderr.write(`${sanitizeError(error)}\n`);
    process.exitCode = 1;
  });
}
