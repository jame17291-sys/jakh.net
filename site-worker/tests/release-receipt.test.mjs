import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildPostDeploy,
  buildPostRollback,
  buildPreflight,
  extractActiveVersion,
  finalizeReceipt,
  runSmoke,
  validateManifest,
} from "../../scripts/site-release-receipt.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "site-worker/generated/site-manifest.json"), "utf8"));
const OLD_BUILD = "1".repeat(64);
const OLD_VERSION = "11111111-1111-4111-8111-111111111111";
const NEW_VERSION = "22222222-2222-4222-8222-222222222222";
const RELEASE_ENV = {
  GITHUB_SHA: "abc123",
  GITHUB_RUN_ID: "98765",
  GITHUB_REF: "refs/heads/main",
  GITHUB_ACTOR: "release-owner",
};

function deployment(versionId, message, percentage = 100) {
  return {
    versions: [{ version_id: versionId, percentage }],
    ...(message ? { annotations: { "workers/message": message } } : {}),
  };
}

function securityHeaders(buildId, workerVersionId = OLD_VERSION) {
  return {
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=()",
    "x-frame-options": "DENY",
    "x-jakh-site-version": buildId,
    "x-jakh-worker-version": workerVersionId,
  };
}

function smoke(buildId, workerVersionId = OLD_VERSION) {
  return {
    ok: true,
    observedBuildId: buildId,
    observedWorkerVersionId: workerVersionId,
    probes: [{ name: "apex", status: 200, headers: securityHeaders(buildId, workerVersionId) }],
    errors: [],
  };
}

function preflight() {
  const result = buildPreflight({
    manifest,
    deployment: deployment(OLD_VERSION),
    baselineSmoke: smoke(OLD_BUILD),
    environment: RELEASE_ENV,
  });
  assert.deepEqual(result.errors, []);
  return result.receipt;
}

test("source manifest and single-version preflight are fail-closed", () => {
  assert.deepEqual(validateManifest(manifest), []);
  const receipt = preflight();
  assert.equal(receipt.safety.workerRollbackTarget, OLD_VERSION);
  assert.equal(receipt.safety.rollbackBuildId, OLD_BUILD);
  assert.equal(receipt.candidate.buildId, manifest.buildId);
  assert.throws(() => extractActiveVersion(deployment(OLD_VERSION, null, 99)), /exactly one Worker version/u);
  const noOp = buildPreflight({ manifest, deployment: deployment(OLD_VERSION), baselineSmoke: smoke(manifest.buildId) });
  assert.match(noOp.errors.join("\n"), /already live/u);
});

test("post-deploy binds exact version, build, commit, and smoke", () => {
  const receipt = preflight();
  const message = `JAKH site abc123 build ${manifest.buildId} run 98765`;
  const result = buildPostDeploy({
    receipt,
    deployment: deployment(NEW_VERSION, message),
    smoke: smoke(manifest.buildId, NEW_VERSION),
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.result, "deployed-and-verified");

  const wrongMessage = buildPostDeploy({
    receipt: preflight(),
    deployment: deployment(NEW_VERSION, "unbound deployment"),
    smoke: smoke(manifest.buildId, NEW_VERSION),
  });
  assert.match(wrongMessage.errors.join("\n"), /exact release/u);
});

test("failed candidate can verify exact version and build rollback", () => {
  const receipt = preflight();
  receipt.result = "post-deploy-verification-failed";
  const result = buildPostRollback({
    receipt,
    deployment: deployment(OLD_VERSION),
    smoke: smoke(OLD_BUILD),
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.result, "rolled-back-and-verified");

  const wrongVersion = buildPostRollback({
    receipt: preflight(),
    deployment: deployment(NEW_VERSION),
    smoke: smoke(OLD_BUILD),
  });
  assert.match(wrongVersion.errors.join("\n"), /rollback activated/u);
});

test("final receipt cannot hide an absent or unverified rollback", () => {
  const receipt = preflight();
  receipt.safety.automaticRollback = true;
  finalizeReceipt(receipt, {
    preflight: "success",
    deploy: "success",
    smoke: "failure",
    verification: "failure",
    rollback: "failure",
    rollbackVerification: "skipped",
    rollbackProof: "success",
  });
  assert.equal(receipt.result, "post-deploy-failure-without-rollback");
  finalizeReceipt(receipt, {
    preflight: "success",
    deploy: "success",
    smoke: "failure",
    verification: "failure",
    rollback: "success",
    rollbackVerification: "success",
    rollbackProof: "success",
  });
  assert.equal(receipt.result, "post-deploy-failure-rolled-back");
});

test("smoke probe enforces one-hop redirects and a single build identity", async () => {
  const buildId = "a".repeat(64);
  const fakeFetch = async (input) => {
    const url = new URL(input);
    let status = 200;
    let location = null;
    let cacheControl = "public, max-age=0, must-revalidate";
    if (url.hostname === "www.jakh.net") {
      status = 301;
      location = `https://jakh.net/science?${url.searchParams}`;
      cacheControl = "public, max-age=86400";
    } else if (url.pathname === "/science.html") {
      status = 301;
      location = `https://jakh.net/science?${url.searchParams}`;
      cacheControl = "public, max-age=86400";
    } else if (url.pathname.endsWith("/index.html")) {
      status = 301;
      location = `https://jakh.net/ar/topics/science/?${url.searchParams}`;
      cacheControl = "public, max-age=86400";
    } else if (url.pathname.startsWith("/__site_probe_missing_")) {
      status = 404;
      cacheControl = "no-store";
    }
    return new Response(null, {
      status,
      headers: { ...securityHeaders(buildId), "cache-control": cacheControl, ...(location ? { location } : {}) },
    });
  };
  const report = await runSmoke({ expectedBuildId: buildId, fetchImpl: fakeFetch });
  assert.equal(report.ok, true, report.errors.join("\n"));
  assert.equal(report.probes.length, 6);
});

test("workflow contains exact rollback and required browser gates", async () => {
  const workflow = await readFile(resolve(repositoryRoot, ".github/workflows/static-site.yml"), "utf8");
  const legacyWorkflow = await readFile(resolve(repositoryRoot, ".github/workflows/pages.yml"), "utf8");
  const runbook = await readFile(resolve(repositoryRoot, "site-worker/README.md"), "utf8");
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /DEPLOY jakh-site FROM protected main/u);
  assert.match(workflow, /github\.ref_protected/u);
  assert.match(workflow, /name: production/u);
  assert.match(workflow, /environments\/production/u);
  assert.match(workflow, /required_reviewers/u);
  assert.match(workflow, /protected_branches/u);
  assert.match(workflow, /CLOUDFLARE_STATIC_SITE_API_TOKEN/u);
  assert.match(workflow, /check:performance/u);
  assert.match(workflow, /release-manifest\.mjs create/u);
  assert.match(workflow, /release-manifest\.mjs verify/u);
  assert.match(workflow, /--expected-schema 8/u);
  assert.match(workflow, /worker\/migrations/u);
  assert.match(workflow, /test:browser:matrix/u);
  assert.match(workflow, /test:a11y/u);
  assert.match(workflow, /site-release-receipt\.mjs preflight/u);
  assert.match(workflow, /rollback \$\{\{ steps\.preflight\.outputs\.rollback-version \}\}/u);
  assert.match(workflow, /site-release-receipt\.mjs post-rollback/u);
  assert.doesNotMatch(workflow, /\bpush:/u);
  assert.match(workflow, /group: jakh-production-release/u);
  assert.match(workflow, /--stage rollback-target/u);
  assert.match(workflow, /--stage candidate/u);
  assert.match(workflow, /--stage rollback/u);
  assert.match(workflow, /--expected-worker-version/u);
  assert.match(workflow, /steps\.rollback_proof\.outputs\.rollback-safe == 'true'/u);
  assert.match(workflow, /static-api-release-gate\.mjs compare/u);

  assert.match(legacyWorkflow, /workflow_dispatch:/u);
  assert.match(legacyWorkflow, /DEPLOY LEGACY GITHUB PAGES/u);
  assert.match(legacyWorkflow, /incident_reference/u);
  assert.match(legacyWorkflow, /github\.ref_protected/u);
  assert.match(legacyWorkflow, /environment: production/u);
  assert.match(legacyWorkflow, /required_reviewers/u);
  assert.match(legacyWorkflow, /protected_branches/u);
  assert.match(legacyWorkflow, /x-jakh-site-version/u);
  assert.match(legacyWorkflow, /group: jakh-production-release/u);
  assert.match(legacyWorkflow, /JAKH_MONITOR_SCOPE: pages/u);
  assert.match(legacyWorkflow, /legacy-pages-monitor-apex\.json/u);
  assert.match(legacyWorkflow, /legacy-pages-monitor-www\.json/u);
  assert.match(legacyWorkflow, /--predeploy-hosts/u);
  assert.match(legacyWorkflow, /--monitor-apex/u);
  assert.match(legacyWorkflow, /--monitor-www/u);
  const legacyBuildPosition = legacyWorkflow.indexOf("Prepare exact artifact once");
  const legacyBrowserPosition = legacyWorkflow.indexOf("npm run test:browser:matrix");
  const legacyAccessibilityPosition = legacyWorkflow.indexOf("npm run test:a11y");
  assert.ok(legacyBuildPosition > 0 && legacyBuildPosition < legacyBrowserPosition);
  assert.ok(legacyBuildPosition < legacyAccessibilityPosition);
  assert.equal(legacyWorkflow.match(/build-static-site\.mjs/gu)?.length, 1);
  assert.match(legacyWorkflow, /JAKH_SITE_ROOT: \$\{\{ github\.workspace \}\}\/_site/u);
  assert.match(legacyWorkflow, /JAKH_SITE_MANIFEST: \$\{\{ runner\.temp \}\}\/legacy-pages-manifest\.json/u);
  assert.match(
    legacyWorkflow,
    /uses: actions\/upload-pages-artifact@[^\n]+\n\s+with:\n\s+path: _site\n\s+include-hidden-files: true/u,
  );
  assert.doesNotMatch(legacyWorkflow, /\bpush:/u);

  assert.match(runbook, /BOOTSTRAP jakh-site AND PRESERVE LEGACY DNS ROLLBACK/u);
  assert.match(runbook, /DELETE \/accounts\/\{account_id\}\/workers\/domains\/\{domain_id\}/u);
  assert.match(runbook, /POST \/zones\/\{zone_id\}\/dns_records\/batch/u);
  assert.match(runbook, /field-for-field with the pre-cutover snapshot/u);
  assert.match(runbook, /DEPLOY LEGACY GITHUB PAGES/u);
});
