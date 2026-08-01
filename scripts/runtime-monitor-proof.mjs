import { createHash } from "node:crypto";

import {
  CONTENT_PUBLICATION_CONTRACT,
  QUARANTINED_SITE_ROUTES,
} from "./monitor-production.mjs";

function sameStringArray(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function publicationErrors(contract) {
  const errors = [];
  if (contract?.state !== CONTENT_PUBLICATION_CONTRACT.state) errors.push("monitor publication state is invalid");
  if (contract?.quarantinedQuestions !== CONTENT_PUBLICATION_CONTRACT.quarantinedQuestions) {
    errors.push("monitor quarantined question total is invalid");
  }
  if (contract?.publicQuestions !== CONTENT_PUBLICATION_CONTRACT.publicQuestions) {
    errors.push("monitor public question total is invalid");
  }
  if (contract?.manifestSha256 !== CONTENT_PUBLICATION_CONTRACT.manifestSha256) {
    errors.push("monitor quarantine policy digest is invalid");
  }
  if (!sameStringArray(contract?.quarantinedCategories, CONTENT_PUBLICATION_CONTRACT.quarantinedCategories)) {
    errors.push("monitor quarantined category set is invalid");
  }
  return errors;
}

function activeVersion(deployment, label) {
  if (!deployment || typeof deployment !== "object" || !Array.isArray(deployment.versions)) {
    throw new Error(`${label} deployment status is malformed`);
  }
  if (deployment.versions.length !== 1 || Number(deployment.versions[0]?.percentage) !== 100) {
    throw new Error(`${label} must show exactly one Worker version serving 100%`);
  }
  const version = deployment.versions[0]?.version_id;
  if (typeof version !== "string" || !/^[0-9A-Za-z][0-9A-Za-z._-]{5,127}$/u.test(version)) {
    throw new Error(`${label} active Worker version is missing or malformed`);
  }
  return version;
}

function expectedResultStatus(scope, name) {
  if (!name.startsWith("Site quarantine:")) return null;
  return scope === "pages" ? 404 : 410;
}

function requiredCheckNames(scope) {
  if (scope === "api") {
    return [
      "API: health and allowed CORS",
      "API quarantine: held leaderboard category",
      "API quarantine: held Battle category",
    ];
  }
  return [
    "Site: catalog data",
    "Site: public card index",
    "Site: en public search index",
    "Site: ar public search index",
    ...QUARANTINED_SITE_ROUTES.map(({ name }) => `Site quarantine: ${name}`),
  ];
}

export function validateScopedMonitorReport(report, {
  scope,
  allowCompatibleSchema = false,
} = {}) {
  const errors = [];
  if (!new Set(["api", "site", "pages"]).has(scope)) errors.push("expected monitor scope is invalid");
  if (!report || typeof report !== "object" || Array.isArray(report)) return ["monitor report is malformed"];
  if (report.schemaVersion !== 1) errors.push("monitor report schema version is invalid");
  if (report.status !== "success" || report.failedChecks !== 0 || !Array.isArray(report.failures) || report.failures.length !== 0) {
    errors.push("scoped runtime monitor did not pass");
  }
  if (report.monitor?.scope !== scope) errors.push(`monitor scope was ${report.monitor?.scope ?? "missing"}, expected ${scope}`);
  if (report.monitor?.allowCompatibleSchema !== allowCompatibleSchema) {
    errors.push("monitor schema-compatibility mode does not match the requested proof");
  }
  errors.push(...publicationErrors(report.contentPublicationContract));
  const resultByName = new Map(
    (Array.isArray(report.results) ? report.results : []).map((result) => [result?.name, result]),
  );
  for (const name of requiredCheckNames(scope)) {
    const result = resultByName.get(name);
    if (!result) {
      errors.push(`monitor report is missing required check: ${name}`);
      continue;
    }
    const expectedStatus = expectedResultStatus(scope, name);
    if (expectedStatus !== null && result.status !== expectedStatus) {
      errors.push(`${name} returned ${String(result.status)}, expected ${expectedStatus}`);
    }
  }
  return errors;
}

export function buildVersionBoundMonitorProof({
  targetVersion,
  deploymentBefore,
  deploymentAfter,
  monitorReport,
  scope,
  allowCompatibleSchema = false,
  generatedAt = new Date(),
}) {
  const bindingErrors = [];
  let versionBefore = null;
  let versionAfter = null;
  try {
    versionBefore = activeVersion(deploymentBefore, "pre-monitor");
  } catch (error) {
    bindingErrors.push(error.message);
  }
  try {
    versionAfter = activeVersion(deploymentAfter, "post-monitor reread");
  } catch (error) {
    bindingErrors.push(error.message);
  }
  if (versionBefore && versionBefore !== targetVersion) {
    bindingErrors.push(`pre-monitor version ${versionBefore} differs from rollback target ${targetVersion}`);
  }
  if (versionAfter && versionAfter !== targetVersion) {
    bindingErrors.push(`post-monitor version ${versionAfter} differs from rollback target ${targetVersion}`);
  }
  if (versionBefore && versionAfter && versionBefore !== versionAfter) {
    bindingErrors.push(`active Worker changed during monitor proof (${versionBefore} to ${versionAfter})`);
  }
  const monitorErrors = validateScopedMonitorReport(monitorReport, { scope, allowCompatibleSchema });
  if (scope !== "pages") {
    const prefix = scope === "api" ? "API" : "Site";
    for (const result of Array.isArray(monitorReport?.results) ? monitorReport.results : []) {
      if (result?.name?.startsWith(prefix) && result.workerVersionId !== targetVersion) {
        monitorErrors.push(
          `${result.name} served Worker ${result.workerVersionId || "missing"}, expected ${targetVersion}`,
        );
      }
    }
  }
  const errors = [...bindingErrors, ...monitorErrors];
  return {
    schemaVersion: 1,
    capturedAt: generatedAt.toISOString(),
    scope,
    allowCompatibleSchema,
    targetVersion,
    versionBefore,
    versionAfter,
    monitorSha256: createHash("sha256").update(JSON.stringify(monitorReport)).digest("hex"),
    safe: errors.length === 0,
    bindingErrors,
    monitorErrors,
  };
}
