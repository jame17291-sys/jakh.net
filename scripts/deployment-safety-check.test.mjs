import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseJsonc, parseSafetyOptions, runSafetyChecks, SAFETY_CHECK_IDS, validateBranchProtection, validateWranglerLocks } from "./deployment-safety-check.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHA = "a".repeat(40);
function protection() { return { required_status_checks: { strict: true, checks: [{ context: "validate", app_id: 15368 }, { context: "Browser regression", app_id: 15368 }] },
  required_pull_request_reviews: {}, allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false }, required_conversation_resolution: { enabled: true } }; }
function executor({ failures = new Set(), branch = "main", remoteSha = SHA, changes = "" } = {}) {
  const calls = [];
  return { calls, execute: async (file, args, options) => {
    calls.push({ file, args, options });
    assert.equal(options.shell, undefined);
    if (failures.has(args.join(" "))) throw new Error("secret-sensitive-error-output");
    let stdout = "";
    if (file === "gh") stdout = JSON.stringify(args[1].endsWith("/protection") ? protection() : { name: "main", protected: true, commit: { sha: remoteSha } });
    else if (file === "git") stdout = args[0] === "rev-parse" ? SHA : args[0] === "branch" ? branch : changes;
    else if (args.length === 1 && args[0] === "scripts/content-review-report.mjs") stdout = JSON.stringify({ errors: [], evidenceCoverage: { summary: { total: 4103, evidenceComplete: 0 } } });
    return { stdout };
  } };
}
const fetchImpl = async () => new Response(JSON.stringify({ ok: true, service: "jakh-api", schema: "10", targetSchema: "10", compatibleSchemas: ["9", "10"],
  workerVersionId: "12345678-1234-4123-8123-123456789012", features: { registration: true, accountRecovery: true, accountDeletion: true, contentStudio: true, adminMfa: true } }), { status: 200, headers: { "content-type": "application/json" } });

test("safety arguments reject unknown options while preserving literal output paths", () => {
  assert.deepEqual(parseSafetyOptions(["--check", "--verbose", "--output=/private/tmp/a $(whoami).json"]), { check: true, verbose: true, output: "/private/tmp/a $(whoami).json" });
  for (const args of [["--force"], ["--check", "--check"], ["--output"], ["--output=a", "--output=b"], ["--output=\u0000a"]]) assert.throws(() => parseSafetyOptions(args));
});
test("JSONC reader preserves strings and supports comments and trailing commas", () => {
  assert.deepEqual(parseJsonc('{"url":"https://example.test/a/*literal*/", // comment\n"text":",}", "value":[1,2,], /* end */}'), { url: "https://example.test/a/*literal*/", text: ",}", value: [1, 2] });
  assert.throws(() => parseJsonc('{"name":"unterminated}'));
  assert.throws(() => parseJsonc('{ /* unfinished'));
});
test("protection must enforce normal trusted checks, pull requests and immutable history", () => {
  validateBranchProtection(protection());
  for (const change of [value => { value.required_status_checks.strict = false; }, value => { value.required_status_checks.checks[0].app_id = 999; },
    value => { value.required_status_checks.checks.pop(); }, value => { value.allow_force_pushes.enabled = true; }, value => { delete value.required_pull_request_reviews; },
    value => { value.required_conversation_resolution.enabled = false; }]) { const value = protection(); change(value); assert.throws(() => validateBranchProtection(value)); }
});
test("Wrangler must be exactly pinned and match both installed lock records", () => {
  const pkg = { devDependencies: { wrangler: "4.131.0" } };
  const lock = { lockfileVersion: 3, packages: { "": pkg, "node_modules/wrangler": { version: "4.131.0" } } };
  assert.equal(validateWranglerLocks(pkg, pkg, lock, lock), "4.131.0");
  assert.throws(() => validateWranglerLocks(pkg, { devDependencies: { wrangler: "^4.131.0" } }, lock, lock));
  const stale = structuredClone(lock); stale.packages["node_modules/wrangler"].version = "4.129.0";
  assert.throws(() => validateWranglerLocks(pkg, pkg, lock, stale));
});
test("all ten real checks pass with exact protected source; unfinished editorial work is disclosed", async () => {
  const { execute, calls } = executor();
  const report = await runSafetyChecks({ root: ROOT, execute, fetchImpl });
  assert.equal(report.status, "passed", JSON.stringify(report)); assert.deepEqual(report.checks.map(check => check.id), SAFETY_CHECK_IDS);
  assert.deepEqual(report.summary, { passed: 10, failed: 0, warnings: 1 });
  assert.equal(report.mode, "inspection_only"); assert.ok(report.limitations.includes("not_migration_authorization"));
  assert.equal(report.checks.find(check => check.id === "content_governance").warning, "editorial_review_incomplete");
  assert.equal(calls.filter(call => call.file === "npm" && call.args.includes("audit")).length, 3);
  assert.ok(calls.some(call => call.file === "npm" && call.args.join(" ") === "--prefix worker run check"));
  assert.ok(calls.every(call => !call.args.includes("deploy") && !call.args.includes("migrations") && !call.args.includes("dispatch")));
});
test("an audit or compiler failure remains failed and does not prevent remaining checks", async () => {
  const { execute } = executor({ failures: new Set(["audit --audit-level=high --json", "--prefix worker run check"]) });
  const report = await runSafetyChecks({ root: ROOT, execute, fetchImpl });
  assert.equal(report.status, "failed"); assert.equal(report.summary.failed, 2); assert.equal(report.checks.length, 10);
  assert.ok(!JSON.stringify(report).includes("secret-sensitive-error-output"));
});
test("feature branches, stale main tips and dirty source fail source verification", async () => {
  for (const state of [{ branch: "feature/test" }, { remoteSha: "b".repeat(40) }, { changes: " M worker/src/routes.ts" }]) {
    const report = await runSafetyChecks({ root: ROOT, execute: executor(state).execute, fetchImpl });
    assert.equal(report.status, "failed"); assert.equal(report.checks[1].status, "failed");
  }
});
test("unavailable or incompatible live API is a failure, never a warning-only pass", async () => {
  const report = await runSafetyChecks({ root: ROOT, execute: executor().execute, fetchImpl: async () => new Response("unavailable", { status: 503 }) });
  assert.equal(report.status, "failed"); assert.equal(report.checks[2].status, "failed");
});
test("executor wrappers returning nonzero codes cannot accidentally report success", async () => {
  const base = executor().execute;
  const report = await runSafetyChecks({ root: ROOT, fetchImpl, execute: async (file, args, options) => file === "npm" ? { code: 1, stdout: "" } : base(file, args, options) });
  assert.equal(report.status, "failed"); assert.equal(report.checks[4].status, "failed"); assert.equal(report.checks[5].status, "failed");
});
