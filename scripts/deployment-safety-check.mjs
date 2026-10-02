#!/usr/bin/env node
// Inspection only: this command never dispatches a release or mutates remote D1.
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { inspectSource, validateHealthContract } from "./api-release-receipt.mjs";
import { REPOSITORY } from "./deployment-receipt-monitor.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const exec = promisify(execFile);
const EXACT_VERSION = /^\d+\.\d+\.\d+$/u;
const SHA = /^[a-f0-9]{40}$/u;
export const SAFETY_CHECK_IDS = Object.freeze([
  "branch_protection", "protected_main_source", "api_schema_compatibility", "wrangler_lock_alignment",
  "dependency_security", "api_typecheck", "release_policy_tests", "content_governance",
  "artifact_contracts", "worker_configuration",
]);
function assert(value) { if (!value) throw new Error("check_failed"); }

export function parseSafetyOptions(argv) {
  const options = { check: false, verbose: false };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (["--check", "--verbose"].includes(token)) {
      const key = token.slice(2); assert(!options[key]); options[key] = true; continue;
    }
    assert(!options.output && (token === "--output" || token.startsWith("--output=")));
    const value = token === "--output" ? argv[++index] : token.slice(9);
    assert(typeof value === "string" && value.length > 0 && value.length <= 4096 && !value.startsWith("--") && !/[\x00-\x1f\x7f]/u.test(value));
    options.output = resolve(value);
  }
  return options;
}

// Small JSONC reader for the existing Wrangler configurations; strings containing
// URLs or comment markers are preserved. No evaluation or dependency loading.
export function parseJsonc(source) {
  let text = "";
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quoted) {
      text += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') { quoted = true; text += character; continue; }
    if (character === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") index++;
      text += "\n"; continue;
    }
    if (character === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2); assert(end >= 0); index = end + 1; text += " "; continue;
    }
    text += character;
  }
  assert(!quoted);
  let clean = "";
  quoted = false; escaped = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (!quoted && character === "," && /^[\s]*[}\]]/u.test(text.slice(index + 1))) continue;
    clean += character;
    if (quoted && escaped) escaped = false;
    else if (quoted && character === "\\") escaped = true;
    else if (character === '"') quoted = !quoted;
  }
  return JSON.parse(clean);
}

export function validateBranchProtection(protection) {
  const checks = protection?.required_status_checks;
  const contexts = new Set();
  for (const check of checks?.checks || []) if (check.app_id === 15368) contexts.add(check.context);
  assert(checks?.strict === true && contexts.has("validate") && contexts.has("Browser regression"));
  assert(protection.required_pull_request_reviews && protection.allow_force_pushes?.enabled === false
    && protection.allow_deletions?.enabled === false && protection.required_conversation_resolution?.enabled === true);
}

export function validateWranglerLocks(worker, site, workerLock, siteLock) {
  const version = worker.devDependencies?.wrangler;
  assert(EXACT_VERSION.test(version || "") && site.devDependencies?.wrangler === version);
  for (const lock of [workerLock, siteLock]) {
    assert(lock.lockfileVersion === 3 && lock.packages?.[""]?.devDependencies?.wrangler === version
      && lock.packages?.["node_modules/wrangler"]?.version === version);
  }
  return version;
}

export async function runSafetyChecks({ root = ROOT, execute = exec, fetchImpl = fetch } = {}) {
  const json = async relative => JSON.parse(await readFile(resolve(root, relative), "utf8"));
  const command = async (file, args) => {
    const result = await execute(file, args, { cwd: root, encoding: "utf8", timeout: 10 * 60_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" } });
    // Injected executors and process wrappers may return a code rather than throw.
    assert(result.code === undefined || result.code === 0);
    return result.stdout || "";
  };
  const gh = async suffix => JSON.parse(await command("gh", ["api", `repos/${REPOSITORY}/${suffix}`]));
  const definitions = [
    ["branch_protection", async () => {
      const protection = await gh("branches/main/protection"); validateBranchProtection(protection);
      return "Protected main requires both validation checks and the pull request policy.";
    }],
    ["protected_main_source", async () => {
      const [head, branch, changes, main] = await Promise.all([
        command("git", ["rev-parse", "HEAD"]), command("git", ["branch", "--show-current"]),
        command("git", ["status", "--porcelain", "--untracked-files=all"]), gh("branches/main"),
      ]);
      assert(SHA.test(head.trim()) && branch.trim() === "main" && !changes.trim()
        && main.name === "main" && main.protected === true && main.commit?.sha === head.trim());
      return `Clean main is the current protected tip ${head.trim()}.`;
    }],
    ["api_schema_compatibility", async () => {
      const source = await inspectSource(root);
      const response = await fetchImpl("https://api.riddlearabia.com/api/health", {
        method: "GET", redirect: "error", signal: AbortSignal.timeout(20_000), headers: { accept: "application/json" },
      });
      assert(response.status === 200 && (response.headers.get("content-type") || "").includes("application/json"));
      const reader = response.body?.getReader(); assert(reader);
      const chunks = [];
      let bytes = 0;
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 64 * 1024) { await reader.cancel(); throw new Error("check_failed"); }
          chunks.push(Buffer.from(part.value));
        }
      } finally { reader.releaseLock(); }
      const body = Buffer.concat(chunks).toString("utf8");
      const health = JSON.parse(body);
      assert(/^[1-9][0-9]*$/u.test(health.schema || "") && source.compatibleSchemas.includes(health.schema)
        && /^[0-9A-Za-z][0-9A-Za-z._-]{5,127}$/u.test(health.workerVersionId || ""));
      assert(validateHealthContract(health, { schema: health.schema, targetSchema: health.targetSchema,
        workerVersionId: health.workerVersionId, requireCompatibility: true }).length === 0);
      return `Source schema ${source.schema} supports API-reported D1 schema ${health.schema}; migration authorization remains separate.`;
    }],
    ["wrangler_lock_alignment", async () => {
      const version = validateWranglerLocks(...await Promise.all([
        json("worker/package.json"), json("site-worker/package.json"), json("worker/package-lock.json"), json("site-worker/package-lock.json"),
      ]));
      return `Both Worker manifests and lockfiles pin Wrangler ${version}.`;
    }],
    ["dependency_security", async () => {
      for (const prefix of [null, "worker", "site-worker"]) {
        await command("npm", [...(prefix ? ["--prefix", prefix] : []), "audit", "--audit-level=high", "--json"]);
      }
      return "All three dependency audits passed at the high severity threshold.";
    }],
    ["api_typecheck", async () => {
      await command("npm", ["--prefix", "worker", "run", "check"]);
      return "The API TypeScript check passed without emitting files.";
    }],
    ["release_policy_tests", async () => {
      await command(process.execPath, ["--test", "scripts/api-release-receipt.test.mjs", "scripts/site-release-receipt.test.mjs",
        "scripts/static-api-release-gate.test.mjs", "scripts/autopilot-policy.test.mjs", "scripts/autopilot-repairs.test.mjs",
        "scripts/autopilot-orchestration.test.mjs", "scripts/autopilot-github-app.test.mjs"]);
      return "Release receipts, API continuity, and bounded maintenance tests passed; required CI remains separate.";
    }],
    ["content_governance", async () => {
      await command(process.execPath, ["scripts/content-review-report.mjs", "--check"]);
      await command(process.execPath, ["scripts/generate-production-quarantine.mjs", "--check"]);
      const report = JSON.parse(await command(process.execPath, ["scripts/content-review-report.mjs"]));
      const summary = report.evidenceCoverage?.summary;
      assert(counter(summary?.total) && summary.total > 0 && counter(summary.evidenceComplete)
        && summary.evidenceComplete <= summary.total && report.errors?.length === 0);
      return { message: `Editorial governance and quarantine passed; ${summary.evidenceComplete}/${summary.total} cards have complete evidence.`,
        warning: summary.evidenceComplete < summary.total ? "editorial_review_incomplete" : null };
    }],
    ["artifact_contracts", async () => {
      await command(process.execPath, ["--test", "scripts/api-artifact-confidentiality.test.mjs", "scripts/runtime-monitor-proof.test.mjs"]);
      return "Artifact confidentiality, retention, and version-bound runtime proof tests passed.";
    }],
    ["worker_configuration", async () => {
      for (const [directory, name, primary] of [["worker", "jakh-api", "api.riddlearabia.com"], ["site-worker", "jakh-site", "riddlearabia.com"]]) {
        const config = parseJsonc(await readFile(resolve(root, directory, "wrangler.jsonc"), "utf8"));
        assert(config.name === name && config.workers_dev === false && config.version_metadata?.binding === "CF_VERSION_METADATA"
          && config.routes?.some(route => route.pattern === primary && route.custom_domain === true));
        assert(typeof config.main === "string" && !config.main.startsWith("/") && !config.main.split(/[\\/]/u).includes(".."));
        assert((await lstat(resolve(root, directory, config.main))).isFile());
        if (directory === "worker") assert(config.d1_databases?.some(database => database.binding === "DB"
          && database.database_name === "jakh-db" && database.migrations_dir === "migrations" && /^[a-f0-9-]{36}$/u.test(database.database_id || "")));
        else assert(config.assets?.binding === "ASSETS" && config.assets?.directory === "./dist" && config.assets.run_worker_first === true);
      }
      return "Both JSONC configurations bind the expected production domains, version metadata, database, and assets.";
    }],
  ];
  const checks = [];
  for (const [id, check] of definitions) {
    try {
      const detail = await check();
      checks.push({ id, status: "passed", message: typeof detail === "string" ? detail : detail.message, warning: detail.warning || null });
    } catch {
      // Dependency/API errors can contain secrets. Keep only the fixed check ID.
      checks.push({ id, status: "failed", message: "Check failed or could not be verified. Inspect this check directly before release.", warning: null });
    }
  }
  const passed = checks.filter(check => check.status === "passed").length;
  return { version: 1, repository: REPOSITORY, mode: "inspection_only", status: passed === SAFETY_CHECK_IDS.length ? "passed" : "failed",
    summary: { passed, failed: checks.length - passed, warnings: checks.filter(check => check.warning).length }, checks,
    limitations: ["not_release_authorization", "not_migration_authorization", "not_live_deployment_proof", "not_editorial_completion"] };
}
function counter(value) { return Number.isSafeInteger(value) && value >= 0; }

async function main() {
  const options = parseSafetyOptions(process.argv.slice(2));
  const report = await runSafetyChecks();
  if (options.output) {
    let cursor = dirname(options.output);
    while (true) {
      assert(!(await lstat(cursor)).isSymbolicLink());
      const parent = dirname(cursor); if (parent === cursor) break; cursor = parent;
    }
    const file = await open(options.output, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
    try { await file.writeFile(`${JSON.stringify(report, null, 2)}\n`); } finally { await file.close(); }
  }
  for (const check of report.checks) process.stdout.write(`${check.status.toUpperCase()} ${check.id}: ${check.message}\n`);
  process.stdout.write(`Safety inspection ${report.status}: ${report.summary.passed}/10 passed, ${report.summary.failed} failed. This does not authorize deployment or D1 mutation.\n`);
  if (options.verbose) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === "passed" ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { process.stderr.write("Safety inspection failed: invalid options or output path.\n"); process.exitCode = 1; });
}
