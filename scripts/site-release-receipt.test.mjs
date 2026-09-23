import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRuntimeProof,
  runSmoke,
  smokeDefinitions,
} from "./site-release-receipt.mjs";
import {
  CONTENT_PUBLICATION_CONTRACT,
  PRIMARY_API_ORIGIN,
  PRIMARY_SITE_ORIGIN,
  QUARANTINED_SITE_ROUTES,
} from "./monitor-production.mjs";

const BUILD_ID = "a".repeat(64);
const WORKER_VERSION = "11111111-1111-4111-8111-111111111111";
const CANDIDATE_VERSION = "22222222-2222-4222-8222-222222222222";

function siteMonitor({ siteContract = "release-baseline", layout = "pre-navigation", version = WORKER_VERSION } = {}) {
  const names = [
    "Site: catalog data", "Site: public card index", "Site: en public search index", "Site: ar public search index",
    ...QUARANTINED_SITE_ROUTES.map(({ name }) => `Site quarantine: ${name}`),
    ...(siteContract === "release-baseline" ? ["Site: version-bound navigation baseline"] : []),
  ];
  return {
    schemaVersion: 1, status: "success", failedChecks: 0, failures: [],
    monitor: {
      scope: "site", siteContract, allowCompatibleSchema: false,
      siteOrigin: PRIMARY_SITE_ORIGIN, apiOrigin: PRIMARY_API_ORIGIN,
      navigationLayout: layout, expectedWorkerVersion: version,
    },
    contentPublicationContract: CONTENT_PUBLICATION_CONTRACT,
    results: names.map((name) => ({
      name, status: name.startsWith("Site quarantine:") ? 410 : 200, workerVersionId: version,
    })),
  };
}

function proveStage(stage, monitorReport, { domainCutover = false, afterVersion } = {}) {
  const version = stage === "candidate" ? CANDIDATE_VERSION : WORKER_VERSION;
  return applyRuntimeProof({
    receipt: {
      safety: { domainCutover, workerRollbackTarget: WORKER_VERSION, automaticRollback: false },
      postDeployment: { activeWorkerVersion: CANDIDATE_VERSION },
      rollback: { activeWorkerVersion: WORKER_VERSION },
    },
    stage,
    deploymentBefore: { versions: [{ version_id: version, percentage: 100 }] },
    deploymentAfter: { versions: [{ version_id: afterVersion || version, percentage: 100 }] },
    monitorReport,
  });
}

function headersFor(definition, { wrongLegacyTarget = false, wrongRetiredSeoTarget = false } = {}) {
  const isLegacyRedirect = definition.name.includes("legacy-") && definition.name.endsWith("-direct-redirect");
  const isRetiredSeoRedirect = definition.name.startsWith("retired-seo/");
  const headers = {
    "cache-control": definition.name === "not-found"
      ? "no-store"
      : definition.name.includes("legacy-") || isRetiredSeoRedirect
        ? "public, max-age=86400"
        : "public, max-age=0, must-revalidate",
    "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
    "permissions-policy": "camera=()",
    "referrer-policy": "strict-origin-when-cross-origin",
    "strict-transport-security": "max-age=31536000",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-jakh-site-version": BUILD_ID,
    "x-jakh-worker-version": WORKER_VERSION,
  };
  if (definition.location) {
    headers.location = (wrongLegacyTarget && isLegacyRedirect) || (wrongRetiredSeoTarget && isRetiredSeoRedirect)
      ? "https://riddlearabia.com/wrong-target"
      : definition.location;
  }
  return headers;
}

function smokeFetch({ wrongLegacyTarget = false, wrongRetiredSeoTarget = false } = {}) {
  const definitions = new Map(
    smokeDefinitions("aaaaaaaaaaaaaaaa").map((definition) => [definition.url, definition]),
  );
  return async (input) => {
    const url = String(input);
    const definition = definitions.get(url);
    assert.ok(definition, `unexpected smoke URL ${url}`);
    return new Response(null, {
      status: definition.status,
      headers: headersFor(definition, { wrongLegacyTarget, wrongRetiredSeoTarget }),
    });
  };
}

test("post-cutover smoke requires direct legacy redirects to the new canonical host", async () => {
  const definitions = smokeDefinitions("aaaaaaaaaaaaaaaa");
  assert.deepEqual(
    definitions
      .filter((definition) => definition.name.includes("legacy-"))
      .map((definition) => definition.location),
    [
      "https://riddlearabia.com/science?site_probe=aaaaaaaaaaaaaaaa",
      "https://riddlearabia.com/science?site_probe=aaaaaaaaaaaaaaaa",
    ],
  );

  const report = await runSmoke({
    expectedBuildId: BUILD_ID,
    expectedWorkerVersionId: WORKER_VERSION,
    fetchImpl: smokeFetch(),
  });
  assert.equal(report.ok, true);
  assert.equal(report.probes.filter(({ name }) => name.includes("legacy-")).length, 2);
});

test("post-cutover smoke rejects a legacy redirect that is not direct to riddlearabia.com", async () => {
  const report = await runSmoke({
    expectedBuildId: BUILD_ID,
    expectedWorkerVersionId: WORKER_VERSION,
    fetchImpl: smokeFetch({ wrongLegacyTarget: true }),
  });
  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /legacy-jakh\.net-direct-redirect: Location/u);
});

test("post-cutover smoke verifies all retired SEO routes reach their curated replacements in one hop", async () => {
  const definitions = smokeDefinitions("aaaaaaaaaaaaaaaa")
    .filter(({ name }) => name.startsWith("retired-seo/"));
  assert.equal(definitions.length, 12);
  assert.deepEqual(definitions[0], {
    name: "retired-seo/en/riddles-with-answers",
    url: "https://riddlearabia.com/en/riddles-with-answers?site_probe=aaaaaaaaaaaaaaaa",
    status: 301,
    location: "https://riddlearabia.com/riddles?site_probe=aaaaaaaaaaaaaaaa",
    cache: /max-age=86400/iu,
  });
  assert.deepEqual(definitions.at(-1), {
    name: "retired-seo/ar/ikhtibar-qawanin-korat-alqadam",
    url: "https://riddlearabia.com/ar/ikhtibar-qawanin-korat-alqadam?site_probe=aaaaaaaaaaaaaaaa",
    status: 301,
    location: "https://riddlearabia.com/ar/topics/football/?site_probe=aaaaaaaaaaaaaaaa",
    cache: /max-age=86400/iu,
  });

  const report = await runSmoke({
    expectedBuildId: BUILD_ID,
    expectedWorkerVersionId: WORKER_VERSION,
    fetchImpl: smokeFetch(),
  });
  assert.equal(report.ok, true);

  const failed = await runSmoke({
    expectedBuildId: BUILD_ID,
    expectedWorkerVersionId: WORKER_VERSION,
    fetchImpl: smokeFetch({ wrongRetiredSeoTarget: true }),
  });
  assert.equal(failed.ok, false);
  assert.match(failed.errors.join("\n"), /retired-seo\/en\/riddles-with-answers: Location/u);
});

test("pre-cutover baseline smoke can explicitly avoid requiring legacy redirects", () => {
  const definitions = smokeDefinitions("baseline", {
    siteOrigin: "https://jakh.net",
    legacySiteOrigins: [],
  });
  assert.equal(definitions.some(({ name }) => name.includes("legacy-")), false);
  assert.equal(
    definitions.find(({ name }) => name === "www-one-hop-alias")?.url,
    "https://www.jakh.net/science.html?site_probe=baseline",
  );
});

test("only the cutover predecessor accepts the legacy monitor contract", () => {
  const names = [
    "Site: catalog data", "Site: public card index", "Site: en public search index", "Site: ar public search index",
    ...QUARANTINED_SITE_ROUTES.map(({ name }) => `Site quarantine: ${name}`),
  ];
  const monitorReport = {
    schemaVersion: 1, status: "success", failedChecks: 0, failures: [],
    monitor: {
      scope: "site", siteContract: "legacy-cutover", allowCompatibleSchema: false,
      siteOrigin: "https://jakh.net", apiOrigin: "https://api.jakh.net",
    },
    contentPublicationContract: CONTENT_PUBLICATION_CONTRACT,
    results: names.map((name) => ({
      name, status: name.startsWith("Site quarantine:") ? 410 : 200, workerVersionId: WORKER_VERSION,
    })),
  };
  const deployment = { versions: [{ version_id: WORKER_VERSION, percentage: 100 }] };
  const run = (stage, domainCutover) => applyRuntimeProof({
    receipt: {
      safety: { domainCutover, workerRollbackTarget: WORKER_VERSION },
      postDeployment: { activeWorkerVersion: WORKER_VERSION },
      rollback: { activeWorkerVersion: WORKER_VERSION },
    },
    stage, deploymentBefore: deployment, deploymentAfter: deployment, monitorReport,
  });
  const baseline = run("rollback-target", true);
  assert.equal(baseline.proof.safe, true);
  assert.equal(baseline.receipt.safety.automaticRollback, false);
  assert.equal(run("rollback-target", false).proof.safe, false);
  assert.equal(run("candidate", true).proof.safe, false);
  assert.equal(run("rollback", true).proof.safe, false);
});

test("ordinary rollback-target and rollback proofs require explicit version-bound release-baseline evidence", () => {
  for (const layout of ["pre-navigation", "current"]) {
    for (const stage of ["rollback-target", "rollback"]) {
      const { receipt, proof } = proveStage(stage, siteMonitor({ layout }));
      assert.equal(proof.safe, true, `${stage}: ${layout}`);
      assert.equal(proof.siteContract, "release-baseline");
      assert.equal(proof.targetVersion, WORKER_VERSION);
      if (stage === "rollback-target") {
        assert.equal(receipt.safety.automaticRollback, true);
        assert.equal(receipt.safety.rollbackProof, proof);
      } else {
        assert.equal(receipt.rollback.runtimeProof, proof);
      }
      const implicitCurrent = proveStage(stage, siteMonitor({ siteContract: "current", layout: "current" }));
      assert.equal(implicitCurrent.proof.safe, false, "predecessor proof cannot silently use another contract");
      assert.match(implicitCurrent.proof.monitorErrors.join("\n"), /site contract/u);
    }
  }
});

test("candidate proofs stay strict current-site checks regardless of layout or cutover metadata", () => {
  for (const domainCutover of [false, true]) {
    for (const layout of ["pre-navigation", "current"]) {
      const result = proveStage("candidate", siteMonitor({ layout, version: CANDIDATE_VERSION }), { domainCutover });
      assert.equal(result.proof.safe, false, `${layout}, cutover=${domainCutover}`);
      assert.equal(result.proof.siteContract, "current");
      assert.match(result.proof.monitorErrors.join("\n"), /site contract/u);
      assert.equal(result.receipt.result, "post-deploy-verification-failed");
    }
    const valid = proveStage("candidate", siteMonitor({
      siteContract: "current", layout: "current", version: CANDIDATE_VERSION,
    }), { domainCutover });
    assert.equal(valid.proof.safe, true);
    assert.equal(valid.proof.targetVersion, CANDIDATE_VERSION);
    assert.equal(valid.receipt.postDeployment.runtimeProof, valid.proof);
  }
  const renamedBaseline = proveStage("candidate", siteMonitor({
    siteContract: "current", layout: "pre-navigation", version: CANDIDATE_VERSION,
  }));
  assert.equal(renamedBaseline.proof.safe, false);
  assert.match(renamedBaseline.proof.monitorErrors.join("\n"), /predecessor navigation layout/u);
});

test("missing baseline checks and Worker drift withhold rollback eligibility or fail rollback verification", () => {
  for (const stage of ["rollback-target", "rollback"]) {
    const incomplete = siteMonitor();
    incomplete.results = incomplete.results.filter(({ name }) => name !== "Site: version-bound navigation baseline");
    for (const result of [
      proveStage(stage, incomplete),
      proveStage(stage, siteMonitor({ version: CANDIDATE_VERSION })),
      proveStage(stage, siteMonitor(), { afterVersion: CANDIDATE_VERSION }),
    ]) {
      assert.equal(result.proof.safe, false, stage);
      if (stage === "rollback-target") assert.equal(result.receipt.safety.automaticRollback, false);
      else assert.equal(result.receipt.result, "rollback-verification-failed");
    }
  }
});
