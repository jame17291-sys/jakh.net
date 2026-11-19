import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyRuntimeProof,
  candidateVersion,
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

function headersFor(definition, { wrongLegacyTarget = false, wrongRetiredSeoTarget = false, notFoundCache = "no-store" } = {}) {
  const isLegacyRedirect = definition.name.includes("legacy-") && definition.name.endsWith("-direct-redirect");
  const isRetiredSeoRedirect = definition.name.startsWith("retired-seo/");
  const headers = {
    "cache-control": definition.name === "not-found"
      ? notFoundCache
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

function smokeFetch({ wrongLegacyTarget = false, wrongRetiredSeoTarget = false, notFoundCache = "no-store", legacySiteOrigins = [] } = {}) {
  const definitions = new Map(
    smokeDefinitions("aaaaaaaaaaaaaaaa", { legacySiteOrigins }).map((definition) => [definition.url, definition]),
  );
  return async (input) => {
    const url = String(input);
    const definition = definitions.get(url);
    assert.ok(definition, `unexpected smoke URL ${url}`);
    return new Response(null, {
      status: definition.status,
      headers: headersFor(definition, { wrongLegacyTarget, wrongRetiredSeoTarget, notFoundCache }),
    });
  };
}

test("404 smoke accepts legacy and transformation-safe storage denial while rejecting cacheable policies", async () => {
  for (const notFoundCache of ["no-store", "no-store, no-transform"]) {
    const report = await runSmoke({ expectedBuildId: BUILD_ID, expectedWorkerVersionId: WORKER_VERSION,
      fetchImpl: smokeFetch({ notFoundCache }) });
    assert.equal(report.ok, true, `${notFoundCache}: ${report.errors.join('; ')}`);
  }
  for (const notFoundCache of ["public, max-age=60", "no-cache, no-transform", "no-transform", "x-no-store", "no-store=0"]) {
    const report = await runSmoke({ expectedBuildId: BUILD_ID, expectedWorkerVersionId: WORKER_VERSION,
      fetchImpl: smokeFetch({ notFoundCache }) });
    assert.equal(report.ok, false, notFoundCache);
    assert.ok(report.errors.some(error => error.startsWith("not-found: unexpected Cache-Control")), notFoundCache);
  }
});

test("separately requested legacy smoke requires direct redirects to the canonical host", async () => {
  const legacySiteOrigins = ["https://old.example", "https://www.old.example"];
  const definitions = smokeDefinitions("aaaaaaaaaaaaaaaa", { legacySiteOrigins });
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
    legacySiteOrigins,
    fetchImpl: smokeFetch({ legacySiteOrigins }),
  });
  assert.equal(report.ok, true);
  assert.equal(report.probes.filter(({ name }) => name.includes("legacy-")).length, 2);
});

test("separately requested legacy smoke rejects redirects that do not reach the primary host", async () => {
  const legacySiteOrigins = ["https://old.example"];
  const report = await runSmoke({
    expectedBuildId: BUILD_ID,
    expectedWorkerVersionId: WORKER_VERSION,
    legacySiteOrigins,
    fetchImpl: smokeFetch({ wrongLegacyTarget: true, legacySiteOrigins }),
  });
  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /legacy-old\.example-direct-redirect: Location/u);
});

test("primary release and rollback smoke succeed without reaching unavailable retired domains", async () => {
  const checkedOrigins = new Set();
  const primaryFetch = smokeFetch();
  const report = await runSmoke({
    expectedBuildId: BUILD_ID,
    expectedWorkerVersionId: WORKER_VERSION,
    fetchImpl: (input, options) => {
      const origin = new URL(input).origin;
      checkedOrigins.add(origin);
      if (/\.jakh\.net$|^https:\/\/jakh\.net$/u.test(origin)) throw new Error("retired domain is unavailable");
      return primaryFetch(input, options);
    },
  });
  assert.equal(report.ok, true, report.errors.join("\n"));
  assert.deepEqual(report.legacySiteOrigins, []);
  assert.equal(report.probes.some(({ name }) => name.startsWith("legacy-")), false);
  assert.deepEqual([...checkedOrigins].sort(), ["https://riddlearabia.com", "https://www.riddlearabia.com"]);
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

// On 2026-11-19 the deployment API still reported the predecessor two seconds
// after a deploy. The smoke check was told to expect that old version, saw the
// correct new one, and a good release was rolled back.
const RELEASE_COMMIT = "c".repeat(40);
const candidateReceipt = () => ({
  release: { commit: RELEASE_COMMIT, runId: "4242" },
  candidate: { buildId: BUILD_ID },
  safety: { workerRollbackTarget: WORKER_VERSION },
});
const deploymentStatus = (version, message) => ({
  versions: [{ version_id: version, percentage: 100 }],
  annotations: { "workers/message": message },
});
const RELEASE_MESSAGE = `JAKH site ${RELEASE_COMMIT} build ${BUILD_ID} run 4242`;

test("the candidate Worker version is only taken from this release's own deployment", () => {
  assert.equal(
    candidateVersion({ receipt: candidateReceipt(), deployment: deploymentStatus(CANDIDATE_VERSION, RELEASE_MESSAGE) }),
    CANDIDATE_VERSION,
  );
  assert.throws(
    () => candidateVersion({ receipt: candidateReceipt(), deployment: deploymentStatus(WORKER_VERSION, "JAKH site earlier release") }),
    /still reports the rollback target/u,
    "a stale status naming the predecessor is never the candidate",
  );
  assert.throws(
    () => candidateVersion({ receipt: candidateReceipt(), deployment: deploymentStatus(CANDIDATE_VERSION, "JAKH site another release") }),
    /does not identify this exact release/u,
    "another deployment's version is never the candidate",
  );
  assert.throws(
    () => candidateVersion({ receipt: { ...candidateReceipt(), release: {} }, deployment: deploymentStatus(CANDIDATE_VERSION, RELEASE_MESSAGE) }),
    /does not identify the commit and run/u,
  );
  assert.throws(() => candidateVersion({
    receipt: candidateReceipt(),
    deployment: { versions: [{ version_id: CANDIDATE_VERSION, percentage: 50 }, { version_id: WORKER_VERSION, percentage: 50 }] },
  }), /exactly one Worker version/u);
});

test("the candidate-version command prints the version or fails quietly so the workflow can retry", () => {
  const script = fileURLToPath(new URL("./site-release-receipt.mjs", import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), "jakh-candidate-version-"));
  try {
    const receipt = join(directory, "receipt.json"), fresh = join(directory, "fresh.json"), stale = join(directory, "stale.json");
    writeFileSync(receipt, JSON.stringify(candidateReceipt()));
    writeFileSync(fresh, JSON.stringify(deploymentStatus(CANDIDATE_VERSION, RELEASE_MESSAGE)));
    writeFileSync(stale, JSON.stringify(deploymentStatus(WORKER_VERSION, "JAKH site earlier release")));
    assert.equal(
      execFileSync(process.execPath, [script, "candidate-version", "--receipt", receipt, "--deployment", fresh], { encoding: "utf8" }),
      CANDIDATE_VERSION,
    );
    const refused = spawnSync(process.execPath, [script, "candidate-version", "--receipt", receipt, "--deployment", stale], { encoding: "utf8" });
    assert.equal(refused.status, 1);
    assert.equal(refused.stdout, "", "a stale status prints no version");
    assert.match(refused.stderr, /still reports the rollback target/u);
    assert.doesNotMatch(refused.stderr, /::error/u, "a retried read raises no failure annotation");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the static release waits for its own deployment before telling the smoke check what to expect", () => {
  const workflow = readFileSync(new URL("../.github/workflows/static-site.yml", import.meta.url), "utf8");
  const start = workflow.indexOf("- name: Capture exact candidate Worker identity before smoke");
  const end = workflow.indexOf("- name: Smoke exact candidate");
  assert.ok(start > 0 && end > start);
  const step = workflow.slice(start, end);
  assert.match(step, /for attempt in \{1\.\.12\}; do/u);
  assert.match(step, /site-release-receipt\.mjs candidate-version \\\n\s+--receipt "\$RECEIPT_DIR\/release-receipt\.json" \\\n\s+--deployment "\$RECEIPT_DIR\/deployment-after-initial\.json"/u);
  assert.doesNotMatch(step, /site-release-receipt\.mjs active-version/u, "an unchecked single read is not the expected version");
  assert.match(step, /if \[ -z "\$worker_version" \]; then\n\s+echo "::error title=Static site release safety gate::[^"]+"\n\s+exit 1/u);
  assert.match(workflow, /--expected-worker-version "\$\{\{ steps\.candidate_identity\.outputs\.worker-version \}\}"/u);
});

// Runs the workflow's own shell for the two status reads against a stand-in
// "wrangler" whose answers follow a plan (fresh, stale or fail per read).
function runStatusStep({ stepName, nextStepName, plan, judge = false }) {
  const workflow = readFileSync(new URL("../.github/workflows/static-site.yml", import.meta.url), "utf8");
  const start = workflow.indexOf(`- name: ${stepName}`);
  const end = workflow.indexOf(`- name: ${nextStepName}`, start);
  assert.ok(start > 0 && end > start, `${stepName}: step not found`);
  const step = workflow.slice(start, end);
  const script = fileURLToPath(new URL("./site-release-receipt.mjs", import.meta.url));
  let body = step.slice(step.indexOf("run: |") + "run: |\n".length)
    .split("\n").map((line) => line.replace(/^ {10}/u, "")).join("\n")
    .replaceAll("node scripts/site-release-receipt.mjs", `"${process.execPath}" "${script}"`)
    .replaceAll("${{ steps.candidate_identity.outputs.worker-version }}", CANDIDATE_VERSION);
  assert.doesNotMatch(body, /\$\{\{/u, `${stepName}: every workflow expression is resolved for the test`);
  if (judge) {
    // Stand in for the post-deploy gate: report which version the last read named.
    const gate = body.indexOf(`"${process.execPath}" "${script}" post-deploy`);
    assert.ok(gate > 0, `${stepName}: the post-deploy gate still follows the wait`);
    body = `${body.slice(0, gate)}echo "judged=$(cat "$RECEIPT_DIR/deployment-after.json")"\n`;
  }
  const directory = mkdtempSync(join(tmpdir(), "jakh-status-step-"));
  try {
    const bin = join(directory, "site-worker", "node_modules", ".bin");
    mkdirSync(bin, { recursive: true });
    mkdirSync(join(directory, "receipts"));
    writeFileSync(join(directory, "receipts", "release-receipt.json"), JSON.stringify(candidateReceipt()));
    writeFileSync(join(directory, "fresh.json"), JSON.stringify(deploymentStatus(CANDIDATE_VERSION, RELEASE_MESSAGE)));
    writeFileSync(join(directory, "stale.json"), JSON.stringify(deploymentStatus(WORKER_VERSION, "JAKH site earlier release")));
    writeFileSync(join(bin, "wrangler"), [
      "#!/usr/bin/env bash",
      "n=$(cat \"$COUNT\" 2>/dev/null || echo 0); n=$((n+1)); echo \"$n\" > \"$COUNT\"",
      "mode=$(echo \"$PLAN\" | cut -d, -f\"$n\"); [ -z \"$mode\" ] && mode=$(echo \"$PLAN\" | awk -F, '{print $NF}')",
      "case \"$mode\" in",
      `  fresh) cat "${join(directory, "fresh.json")}";;`,
      `  stale) cat "${join(directory, "stale.json")}";;`,
      "  *) echo 'A request to the Cloudflare API failed.' >&2; exit 1;;",
      "esac",
      "",
    ].join("\n"));
    chmodSync(join(bin, "wrangler"), 0o755);
    writeFileSync(join(directory, "step.sh"), `sleep() { echo waited >> "$WAITS"; }\n${body}`);
    const result = spawnSync("bash", ["step.sh"], {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...process.env,
        RECEIPT_DIR: join(directory, "receipts"),
        GITHUB_OUTPUT: join(directory, "github-output"),
        COUNT: join(directory, "count"),
        WAITS: join(directory, "waits"),
        PLAN: plan,
      },
    });
    const read = (name) => (existsSync(join(directory, name)) ? readFileSync(join(directory, name), "utf8") : "");
    return {
      status: result.status,
      stdout: result.stdout,
      output: read("github-output").trim(),
      reads: Number(read("count").trim() || 0),
      waits: read("waits").split("\n").filter(Boolean).length,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("the identity step waits out stale and failed status reads, then fails closed", () => {
  const identity = (plan) => runStatusStep({
    stepName: "Capture exact candidate Worker identity before smoke",
    nextStepName: "Smoke exact candidate",
    plan,
  });
  const expected = `worker-version=${CANDIDATE_VERSION}`;
  assert.deepEqual(identity("fresh"), { status: 0, stdout: "", output: expected, reads: 1, waits: 0 });
  // 2026-11-19: the first read after the deploy still named the predecessor.
  assert.deepEqual(identity("stale,stale,fresh"), { status: 0, stdout: "", output: expected, reads: 3, waits: 2 });
  assert.deepEqual(identity("stale,fail,fresh"), { status: 0, stdout: "", output: expected, reads: 3, waits: 2 });
  for (const plan of ["stale", "fail"]) {
    const never = identity(plan);
    assert.equal(never.status, 1, `${plan}: the gate fails, so the release rolls back`);
    assert.equal(never.output, "", `${plan}: no version is handed to the smoke check`);
    assert.equal(never.reads, 12);
    assert.equal(never.waits, 11);
    assert.match(never.stdout, /^::error title=Static site release safety gate::/u);
  }
});

test("the verification step re-reads until the status names the verified version, and the gate judges the last read", () => {
  const verification = (plan) => runStatusStep({
    stepName: "Verify active Worker version and release identity",
    nextStepName: "Re-prove live API after static deployment",
    plan,
    judge: true,
  });
  const judged = (run) => JSON.parse(run.stdout.replace(/^judged=/u, "")).versions[0].version_id;
  const fresh = verification("fresh");
  assert.deepEqual([fresh.status, fresh.reads, fresh.waits, judged(fresh)], [0, 1, 0, CANDIDATE_VERSION]);
  const recovered = verification("stale,fail,fresh");
  assert.deepEqual([recovered.status, recovered.reads, recovered.waits, judged(recovered)], [0, 3, 2, CANDIDATE_VERSION]);
  const stale = verification("stale");
  assert.deepEqual([stale.reads, stale.waits, judged(stale)], [12, 11, WORKER_VERSION], "a status that stays stale reaches the gate unchanged");
});
