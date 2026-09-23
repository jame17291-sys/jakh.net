import assert from "node:assert/strict";
import test from "node:test";

import {
  API_RELEASE_CONTRACT,
  PRIMARY_API_ORIGIN,
  PRIMARY_SITE_ORIGIN,
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

function releaseBaselineReport(layout = "pre-navigation") {
  const baseline = report("site");
  Object.assign(baseline.monitor, {
    siteContract: "release-baseline",
    siteOrigin: PRIMARY_SITE_ORIGIN,
    apiOrigin: PRIMARY_API_ORIGIN,
    expectedWorkerVersion: VERSION,
    navigationLayout: layout,
  });
  baseline.results.push({
    name: "Site: version-bound navigation baseline",
    status: 200,
    workerVersionId: VERSION,
  });
  baseline.totalChecks += 1;
  baseline.passedChecks += 1;
  return baseline;
}

function baselineProof(monitorReport, overrides = {}) {
  return buildVersionBoundMonitorProof({
    targetVersion: VERSION,
    deploymentBefore: deployment(),
    deploymentAfter: deployment(),
    monitorReport,
    scope: "site",
    siteContract: "release-baseline",
    ...overrides,
  });
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

test("legacy-cutover evidence cannot satisfy a current-site proof", () => {
  const legacy = report("site");
  legacy.monitor.siteContract = "legacy-cutover";
  assert.match(validateScopedMonitorReport(legacy, { scope: "site" }).join("\n"), /site contract/u);
  assert.deepEqual(validateScopedMonitorReport(legacy, { scope: "site", siteContract: "legacy-cutover" }), []);
  legacy.monitor.siteOrigin = "https://riddlearabia.com";
  assert.match(validateScopedMonitorReport(legacy, {
    scope: "site", siteContract: "legacy-cutover",
  }).join("\n"), /legacy site and API origins/u);
});

test("explicit release baseline accepts either recognized layout only for its exact unchanged Worker", () => {
  for (const layout of ["current", "pre-navigation"]) {
    const proof = baselineProof(releaseBaselineReport(layout));
    assert.equal(proof.safe, true, layout);
    assert.equal(proof.siteContract, "release-baseline");
    assert.equal(proof.targetVersion, VERSION);
    assert.deepEqual(proof.bindingErrors, []);
    assert.deepEqual(proof.monitorErrors, []);
  }
});

test("release baseline requires production site scope, explicit version, recognized layout and successful classifier", () => {
  const cases = [
    ["missing expected version", (r) => { delete r.monitor.expectedWorkerVersion; }, /exact predecessor Worker version/u],
    ["different expected version", (r) => { r.monitor.expectedWorkerVersion = "22222222-2222-4222-8222-222222222222"; }, /exact rollback target/u],
    ["missing layout", (r) => { delete r.monitor.navigationLayout; }, /recognized navigation layout/u],
    ["unknown layout", (r) => { r.monitor.navigationLayout = "legacy-cutover"; }, /recognized navigation layout/u],
    ["wrong site origin", (r) => { r.monitor.siteOrigin = "https://jakh.net"; }, /production site and API origins/u],
    ["wrong API origin", (r) => { r.monitor.apiOrigin = "https://api.jakh.net"; }, /production site and API origins/u],
    ["missing classifier", (r) => { r.results = r.results.filter(({ name }) => name !== "Site: version-bound navigation baseline"); }, /missing required check: Site: version-bound navigation baseline/u],
    ["failed classifier status", (r) => { r.results.at(-1).status = 503; }, /returned 503, expected 200/u],
    ["unbound classifier", (r) => { delete r.results.at(-1).workerVersionId; }, /served Worker missing/u],
  ];
  for (const [label, mutate, expected] of cases) {
    const baseline = releaseBaselineReport();
    mutate(baseline);
    const proof = baselineProof(baseline);
    assert.equal(proof.safe, false, label);
    assert.match(proof.monitorErrors.join("\n"), expected, label);
  }
  for (const scope of ["api", "pages"]) {
    assert.match(validateScopedMonitorReport(releaseBaselineReport(), {
      scope, siteContract: "release-baseline",
    }).join("\n"), /production site and API origins in site scope/u);
  }
});

test("release baseline retains quarantine, publication, every-response identity and deployment stability safeguards", () => {
  const cases = [
    ["missing quarantine", (r) => { r.results = r.results.filter(({ name }) => !name.startsWith("Site quarantine:")); }, /missing required check: Site quarantine/u],
    ["wrong quarantine response", (r) => { r.results.find(({ name }) => name.startsWith("Site quarantine:")).status = 200; }, /expected 410/u],
    ["policy drift", (r) => { r.contentPublicationContract = { ...r.contentPublicationContract, manifestSha256: "0".repeat(64) }; }, /policy digest/u],
    ["mixed response versions", (r) => { r.results[0].workerVersionId = "22222222-2222-4222-8222-222222222222"; }, /served Worker/u],
    ["failed monitor", (r) => { r.status = "failure"; r.failedChecks = 1; }, /did not pass/u],
  ];
  for (const [label, mutate, expected] of cases) {
    const baseline = releaseBaselineReport();
    mutate(baseline);
    const proof = baselineProof(baseline);
    assert.equal(proof.safe, false, label);
    assert.match(proof.monitorErrors.join("\n"), expected, label);
  }
  for (const after of [deployment("22222222-2222-4222-8222-222222222222"), deployment(VERSION, 50)]) {
    const proof = baselineProof(releaseBaselineReport(), { deploymentAfter: after });
    assert.equal(proof.safe, false);
    assert.ok(proof.bindingErrors.length > 0);
  }
});

test("a release-baseline report never satisfies the default current-site proof, even with current navigation", () => {
  for (const layout of ["current", "pre-navigation"]) {
    const proof = baselineProof(releaseBaselineReport(layout), { siteContract: "current" });
    assert.equal(proof.safe, false, layout);
    assert.match(proof.monitorErrors.join("\n"), /site contract/u);
  }
  const wrongLayout = releaseBaselineReport();
  wrongLayout.monitor.siteContract = "current";
  assert.match(validateScopedMonitorReport(wrongLayout, { scope: "site" }).join("\n"), /cannot accept a predecessor navigation layout/u);
  const unknown = report("site");
  unknown.monitor.siteContract = "unknown";
  assert.match(validateScopedMonitorReport(unknown, { scope: "site", siteContract: "unknown" }).join("\n"), /site contract is invalid/u);
});
