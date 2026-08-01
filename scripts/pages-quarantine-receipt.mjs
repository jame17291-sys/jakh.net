#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { CONTENT_PUBLICATION_CONTRACT } from "./monitor-production.mjs";
import { validateScopedMonitorReport } from "./runtime-monitor-proof.mjs";
import { validateManifest } from "./site-release-receipt.mjs";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function parseArguments(argv) {
  const [command, ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const token = tokens[index];
    const value = tokens[index + 1];
    invariant(token?.startsWith("--") && value && !value.startsWith("--"), `Invalid argument ${token || "missing"}`);
    options[token.slice(2)] = value;
  }
  return { command, options };
}

function requireOption(options, name) {
  const value = options[name];
  invariant(typeof value === "string" && value.length > 0, `Missing required --${name}`);
  return value;
}

function releaseContext(environment) {
  return {
    repository: environment.GITHUB_REPOSITORY ?? null,
    commit: environment.GITHUB_SHA ?? null,
    ref: environment.GITHUB_REF ?? null,
    runId: environment.GITHUB_RUN_ID ?? null,
    runAttempt: environment.GITHUB_RUN_ATTEMPT ?? null,
    actor: environment.GITHUB_ACTOR ?? null,
    changeReference: environment.JAKH_CHANGE_REFERENCE ?? null,
  };
}

export function buildPagesQuarantineReceipt({
  manifest,
  manifestBytes,
  monitorReports,
  preDeploymentHosts,
  deploymentUrl,
  environment = process.env,
  generatedAt = new Date(),
}) {
  const apexMonitor = monitorReports?.apex;
  const wwwMonitor = monitorReports?.www;
  const errors = [
    ...validateManifest(manifest),
    ...validateScopedMonitorReport(apexMonitor, { scope: "pages" }).map((error) => `apex: ${error}`),
    ...validateScopedMonitorReport(wwwMonitor, { scope: "pages" }).map((error) => `www: ${error}`),
  ];
  if (manifest.fileCount !== 596) errors.push(`Pages artifact contains ${String(manifest.fileCount)} files instead of 596`);
  const publication = manifest.publication;
  if (publication?.state !== CONTENT_PUBLICATION_CONTRACT.state) errors.push("artifact publication state is invalid");
  if (publication?.policySha256 !== CONTENT_PUBLICATION_CONTRACT.manifestSha256) errors.push("artifact quarantine digest is invalid");
  if (publication?.publicCategories !== 51) errors.push("artifact public category total is not 51");
  if (publication?.publicQuestions !== CONTENT_PUBLICATION_CONTRACT.publicQuestions) errors.push("artifact public question total is not 3275");
  if (publication?.quarantinedQuestions !== CONTENT_PUBLICATION_CONTRACT.quarantinedQuestions) {
    errors.push("artifact quarantined question total is not 278");
  }
  let normalizedDeploymentUrl = null;
  try {
    normalizedDeploymentUrl = new URL(deploymentUrl).href;
  } catch {
    errors.push("Pages deployment URL is invalid");
  }
  if (apexMonitor?.monitor?.siteOrigin !== "https://jakh.net") {
    errors.push("Pages apex monitor did not verify https://jakh.net");
  }
  if (wwwMonitor?.monitor?.siteOrigin !== "https://www.jakh.net") {
    errors.push("Pages www monitor did not verify https://www.jakh.net");
  }
  const hostEvidence = Array.isArray(preDeploymentHosts?.hosts) ? preDeploymentHosts.hosts : [];
  for (const expectedOrigin of ["https://jakh.net", "https://www.jakh.net"]) {
    const evidence = hostEvidence.find((entry) => entry?.requestedOrigin === expectedOrigin);
    if (!evidence) {
      errors.push(`pre-deployment evidence is missing ${expectedOrigin}`);
      continue;
    }
    if (evidence.safe !== true || evidence.terminalStatus !== 200) {
      errors.push(`pre-deployment host ${expectedOrigin} was not a safe legacy endpoint`);
    }
    if (evidence.initialSiteVersion !== null || evidence.initialWorkerVersion !== null
      || evidence.terminalSiteVersion !== null || evidence.terminalWorkerVersion !== null) {
      errors.push(`pre-deployment host ${expectedOrigin} still exposed Worker release headers`);
    }
  }
  const bytes = Buffer.isBuffer(manifestBytes) ? manifestBytes : Buffer.from(manifestBytes || "");
  const preDeploymentBytes = Buffer.from(JSON.stringify(preDeploymentHosts || null));
  return {
    schemaVersion: 1,
    service: "jakh-legacy-pages",
    state: "quarantine-safe-rollback-baseline",
    generatedAt: generatedAt.toISOString(),
    release: releaseContext(environment),
    deployment: {
      url: normalizedDeploymentUrl,
      workflowRunId: environment.GITHUB_RUN_ID ?? null,
    },
    artifact: {
      buildId: manifest?.buildId ?? null,
      fileCount: manifest?.fileCount ?? null,
      totalBytes: manifest?.totalBytes ?? null,
      manifestSha256: createHash("sha256").update(bytes).digest("hex"),
      publication: publication ?? null,
    },
    verification: {
      preDeploymentHosts: preDeploymentHosts ?? null,
      preDeploymentHostsSha256: createHash("sha256").update(preDeploymentBytes).digest("hex"),
      hosts: {
        apex: {
          monitorGeneratedAt: apexMonitor?.generatedAt ?? null,
          monitorStatus: apexMonitor?.status ?? "missing",
          monitorSha256: createHash("sha256").update(JSON.stringify(apexMonitor ?? null)).digest("hex"),
          report: apexMonitor,
        },
        www: {
          monitorGeneratedAt: wwwMonitor?.generatedAt ?? null,
          monitorStatus: wwwMonitor?.status ?? "missing",
          monitorSha256: createHash("sha256").update(JSON.stringify(wwwMonitor ?? null)).digest("hex"),
          report: wwwMonitor,
        },
      },
    },
    result: errors.length === 0 ? "deployed-and-quarantine-verified" : "pages-quarantine-verification-failed",
    errors,
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  invariant(command === "create", "Expected create command");
  const manifestPath = requireOption(options, "manifest");
  const manifestBytes = await readFile(manifestPath);
  const receipt = buildPagesQuarantineReceipt({
    manifest: JSON.parse(manifestBytes.toString("utf8")),
    manifestBytes,
    monitorReports: {
      apex: await readJson(requireOption(options, "monitor-apex")),
      www: await readJson(requireOption(options, "monitor-www")),
    },
    preDeploymentHosts: await readJson(requireOption(options, "predeploy-hosts")),
    deploymentUrl: requireOption(options, "deployment-url"),
  });
  await writeFile(requireOption(options, "receipt"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  if (options["github-summary"]) {
    await appendFile(options["github-summary"], [
      "## Legacy Pages quarantine receipt",
      "",
      `- Result: \`${receipt.result}\``,
      `- Commit: \`${receipt.release.commit || "unknown"}\``,
      `- Build: \`${receipt.artifact.buildId || "unknown"}\``,
      `- Manifest SHA-256: \`${receipt.artifact.manifestSha256}\``,
      `- Artifact files: \`${receipt.artifact.fileCount}\``,
      `- Public corpus: \`${receipt.artifact.publication?.publicCategories || "unknown"}\` categories / \`${receipt.artifact.publication?.publicQuestions || "unknown"}\` cards`,
      "",
    ].join("\n"), "utf8");
  }
  for (const error of receipt.errors) process.stderr.write(`::error title=Legacy Pages quarantine gate::${error}\n`);
  if (receipt.errors.length) throw new Error(`${receipt.errors.length} Legacy Pages quarantine gate(s) failed`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
