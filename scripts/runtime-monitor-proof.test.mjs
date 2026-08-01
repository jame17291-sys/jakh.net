import assert from "node:assert/strict";
import test from "node:test";

import {
  API_RELEASE_CONTRACT,
  QUARANTINED_SITE_ROUTES,
} from "./monitor-production.mjs";
import {
  buildVersionBoundMonitorProof,
  validateScopedMonitorReport,
} from "./runtime-monitor-proof.mjs";

const VERSION = "11111111-1111-4111-8111-111111111111";

function deployment(version = VERSION, percentage = 100) {
  return { versions: [{ version_id: version, percentage }] };
}

function report(scope, { success = true, allowCompatibleSchema = false } = {}) {
  const names = scope === "api"
    ? [
        ["API: health and allowed CORS", 200],
        ["API quarantine: held leaderboard category", 503],
        ["API quarantine: held Battle category", 503],
      ]
    : [
        ["Site: catalog data", 200],
        ["Site: public card index", 200],
        ["Site: en public search index", 200],
        ["Site: ar public search index", 200],
        ...QUARANTINED_SITE_ROUTES.map(({ name }) => [
          `Site quarantine: ${name}`,
          scope === "pages" ? 404 : 410,
        ]),
      ];
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-01T08:00:00.000Z",
    status: success ? "success" : "failure",
    monitor: {
      scope,
      siteOrigin: "https://jakh.net",
      apiOrigin: "https://api.jakh.net",
      allowCompatibleSchema,
    },
    totalChecks: names.length,
    passedChecks: success ? names.length : names.length - 1,
    failedChecks: success ? 0 : 1,
    contentPublicationContract: API_RELEASE_CONTRACT.contentPublication,
    apiReleaseContract: API_RELEASE_CONTRACT,
    results: names.map(([name, status]) => ({
      name,
      status,
      elapsedMs: 1,
      bytes: 1,
      attempts: 1,
      workerVersionId: scope === "pages" ? null : VERSION,
    })),
    failures: success ? [] : [{ name: names[0][0], message: "failed", attempts: 1 }],
  };
}

test("version-bound proof requires one unchanged 100% Worker version", () => {
  const proof = buildVersionBoundMonitorProof({
    targetVersion: VERSION,
    deploymentBefore: deployment(),
    deploymentAfter: deployment(),
    monitorReport: report("api", { allowCompatibleSchema: true }),
    scope: "api",
    allowCompatibleSchema: true,
    generatedAt: new Date("2026-08-01T09:00:00.000Z"),
  });
  assert.equal(proof.safe, true);
  assert.equal(proof.versionBefore, VERSION);
  assert.equal(proof.versionAfter, VERSION);
  assert.match(proof.monitorSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(proof.bindingErrors, []);
  assert.deepEqual(proof.monitorErrors, []);

  const drift = buildVersionBoundMonitorProof({
    targetVersion: VERSION,
    deploymentBefore: deployment(),
    deploymentAfter: deployment("22222222-2222-4222-8222-222222222222"),
    monitorReport: report("api", { allowCompatibleSchema: true }),
    scope: "api",
    allowCompatibleSchema: true,
  });
  assert.equal(drift.safe, false);
  assert.match(drift.bindingErrors.join("\n"), /changed during monitor proof|differs from rollback target/u);
});

test("unsafe predecessor is recorded separately from version-binding failure", () => {
  const proof = buildVersionBoundMonitorProof({
    targetVersion: VERSION,
    deploymentBefore: deployment(),
    deploymentAfter: deployment(),
    monitorReport: report("api", { success: false, allowCompatibleSchema: true }),
    scope: "api",
    allowCompatibleSchema: true,
  });
  assert.equal(proof.safe, false);
  assert.deepEqual(proof.bindingErrors, []);
  assert.match(proof.monitorErrors.join("\n"), /did not pass/u);
});

test("Pages proof requires 404 holds while Worker proof requires 410", () => {
  assert.deepEqual(validateScopedMonitorReport(report("pages"), { scope: "pages" }), []);
  const wrongMode = report("pages");
  wrongMode.monitor.scope = "site";
  assert.match(validateScopedMonitorReport(wrongMode, { scope: "site" }).join("\n"), /expected 410/u);
});

test("proof rejects a missing required quarantine probe or policy digest drift", () => {
  const incomplete = report("api");
  incomplete.results = incomplete.results.filter(({ name }) => name !== "API quarantine: held Battle category");
  incomplete.contentPublicationContract = {
    ...incomplete.contentPublicationContract,
    manifestSha256: "0".repeat(64),
  };
  assert.match(
    validateScopedMonitorReport(incomplete, { scope: "api" }).join("\n"),
    /policy digest|required check/u,
  );
});
