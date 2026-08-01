import assert from "node:assert/strict";
import test from "node:test";

import { API_RELEASE_CONTRACT, QUARANTINED_SITE_ROUTES } from "./monitor-production.mjs";
import { buildPagesQuarantineReceipt } from "./pages-quarantine-receipt.mjs";

function manifest() {
  return {
    service: "jakh-site",
    buildId: "a".repeat(64),
    fileCount: 596,
    totalBytes: 26_831_311,
    files: Object.fromEntries(Array.from({ length: 596 }, (_, index) => [`/file-${index}`, {}])),
    routes: { "/": "/index.html", "/__404__": "/404.html" },
    aliases: {},
    publication: {
      state: "safety-quarantine-active",
      policySha256: API_RELEASE_CONTRACT.contentPublication.manifestSha256,
      fullQuestions: 3_553,
      publicQuestions: 3_275,
      quarantinedQuestions: 278,
      publicCategories: 51,
      quarantinedCategories: [...API_RELEASE_CONTRACT.contentPublication.quarantinedCategories],
    },
  };
}

function monitorReport(siteOrigin) {
  const results = [
    ["Site: catalog data", 200],
    ["Site: public card index", 200],
    ["Site: en public search index", 200],
    ["Site: ar public search index", 200],
    ...QUARANTINED_SITE_ROUTES.map(({ name }) => [`Site quarantine: ${name}`, 404]),
  ].map(([name, status]) => ({ name, status, elapsedMs: 1, bytes: 1, attempts: 1, workerVersionId: null }));
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-01T08:00:00.000Z",
    status: "success",
    monitor: {
      scope: "pages",
      siteOrigin,
      apiOrigin: "https://api.jakh.net",
      allowCompatibleSchema: false,
    },
    totalChecks: results.length,
    passedChecks: results.length,
    failedChecks: 0,
    contentPublicationContract: API_RELEASE_CONTRACT.contentPublication,
    apiReleaseContract: API_RELEASE_CONTRACT,
    results,
    failures: [],
  };
}

const preDeploymentHosts = {
  schemaVersion: 1,
  hosts: ["https://jakh.net", "https://www.jakh.net"].map((requestedOrigin) => ({
    requestedOrigin,
    safe: true,
    terminalStatus: 200,
    initialSiteVersion: null,
    initialWorkerVersion: null,
    terminalSiteVersion: null,
    terminalWorkerVersion: null,
  })),
};

test("Pages receipt binds the exact manifest and successful 404 quarantine proof", () => {
  const receipt = buildPagesQuarantineReceipt({
    manifest: manifest(),
    manifestBytes: Buffer.from("exact-manifest-bytes\n"),
    monitorReports: {
      apex: monitorReport("https://jakh.net"),
      www: monitorReport("https://www.jakh.net"),
    },
    preDeploymentHosts,
    deploymentUrl: "https://jakh.net/",
    environment: {
      GITHUB_REPOSITORY: "owner/repo",
      GITHUB_SHA: "abc123",
      GITHUB_RUN_ID: "99",
      JAKH_CHANGE_REFERENCE: "change-123",
    },
    generatedAt: new Date("2026-08-01T09:00:00.000Z"),
  });
  assert.equal(receipt.result, "deployed-and-quarantine-verified");
  assert.equal(receipt.artifact.buildId, "a".repeat(64));
  assert.equal(receipt.artifact.fileCount, 596);
  assert.equal(receipt.verification.hosts.apex.monitorStatus, "success");
  assert.equal(receipt.verification.hosts.www.monitorStatus, "success");
  assert.match(receipt.artifact.manifestSha256, /^[a-f0-9]{64}$/u);
  assert.equal(receipt.release.commit, "abc123");
  assert.deepEqual(receipt.errors, []);
});

test("Pages receipt fails on digest drift, held-route success, or a Worker-served origin", () => {
  const report = monitorReport("https://jakh.net");
  report.contentPublicationContract = {
    ...report.contentPublicationContract,
    manifestSha256: "0".repeat(64),
  };
  report.results.find(({ name }) => name.startsWith("Site quarantine:")).status = 200;
  report.monitor.siteOrigin = "https://preview.example";
  const receipt = buildPagesQuarantineReceipt({
    manifest: manifest(),
    manifestBytes: Buffer.from("manifest"),
    monitorReports: {
      apex: report,
      www: monitorReport("https://preview.example"),
    },
    preDeploymentHosts: {
      ...preDeploymentHosts,
      hosts: preDeploymentHosts.hosts.filter(({ requestedOrigin }) => requestedOrigin !== "https://www.jakh.net"),
    },
    deploymentUrl: "https://preview.example/",
  });
  assert.equal(receipt.result, "pages-quarantine-verification-failed");
  assert.match(receipt.errors.join("\n"), /digest|expected 404|www monitor|pre-deployment evidence/u);
});
