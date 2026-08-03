#!/usr/bin/env node

import { appendFile, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { loadProductionQuarantine } from "./publication-quarantine.mjs";

const FINAL_SCHEMA = "9";
const SERVICE_NAME = "jakh-api";
const FINAL_MESSAGE = /^JAKH final ([0-9a-f]{40}) schema ([1-9][0-9]*) run ([1-9][0-9]*)$/u;
const VERSION_ID = /^[0-9A-Za-z][0-9A-Za-z._-]{5,127}$/u;
const publicationQuarantine = loadProductionQuarantine();
const EXPECTED_PUBLICATION = Object.freeze({
  state: "safety-quarantine-active",
  categories: Object.freeze([...publicationQuarantine.categorySlugs].sort()),
  quarantinedQuestions: publicationQuarantine.manifest.totalCards,
  publicQuestions: 3_275,
  manifestSha256: publicationQuarantine.policySha256,
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseArguments(argv) {
  const [command, ...tokens] = argv;
  const options = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    if (Object.hasOwn(options, name)) throw new Error(`Duplicate option --${name}`);
    options[name] = value;
    index += 1;
  }
  return { command, options };
}

function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing required --${name}`);
  return value;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read valid JSON from ${path}: ${error.message}`);
  }
}

export function verifyStaticApiRelease({
  deployment,
  health,
  httpStatus,
  expectedCommit,
  expectedSchema = FINAL_SCHEMA,
}) {
  const errors = [];
  const expectedMessage = `JAKH final ${expectedCommit} schema ${expectedSchema} run <id>`;

  if (!/^[0-9a-f]{40}$/u.test(expectedCommit)) {
    errors.push("expected source commit must be a full lowercase 40-character Git SHA");
  }
  if (expectedSchema !== FINAL_SCHEMA) {
    errors.push(`static production release requires final API schema ${FINAL_SCHEMA}`);
  }

  let activeVersion = null;
  let deploymentMessage = null;
  let apiReleaseRunId = null;
  if (!isRecord(deployment)) {
    errors.push("Cloudflare Worker deployment status was not an object");
  } else {
    const versions = deployment.versions;
    if (!Array.isArray(versions)) {
      errors.push("Cloudflare Worker deployment status did not contain a versions array");
    } else if (
      versions.length !== 1
      || (versions[0]?.percentage !== 100 && versions[0]?.percentage !== "100")
    ) {
      errors.push("live API must have exactly one active Worker version serving 100% of traffic");
    } else if (typeof versions[0]?.version_id !== "string" || !VERSION_ID.test(versions[0].version_id)) {
      errors.push("active API Worker version ID was missing or malformed");
    } else {
      activeVersion = versions[0].version_id;
    }

    deploymentMessage = deployment.annotations?.["workers/message"] ?? null;
    const match = typeof deploymentMessage === "string" ? FINAL_MESSAGE.exec(deploymentMessage) : null;
    if (!match) {
      errors.push(`active API deployment message must exactly match ${expectedMessage}`);
    } else {
      const [, observedCommit, observedSchema, observedRunId] = match;
      apiReleaseRunId = observedRunId;
      if (observedCommit !== expectedCommit) {
        errors.push(`active API source commit was ${observedCommit}, expected ${expectedCommit}`);
      }
      if (observedSchema !== expectedSchema) {
        errors.push(`active API deployment schema was ${observedSchema}, expected ${expectedSchema}`);
      }
    }
  }

  if (String(httpStatus) !== "200") {
    errors.push(`API health HTTP status was ${String(httpStatus)}, expected 200`);
  }
  if (!isRecord(health)) {
    errors.push("API health response was not a JSON object");
  } else {
    if (health.ok !== true) errors.push("API health response did not contain ok=true");
    if (health.service !== SERVICE_NAME) {
      errors.push(`API health service was ${String(health.service ?? "missing")}, expected ${SERVICE_NAME}`);
    }
    if (health.workerVersionId !== activeVersion) {
      errors.push(
        `API health Worker version was ${String(health.workerVersionId ?? "missing")}, expected active version ${String(activeVersion ?? "missing")}`,
      );
    }
    if (health.schema !== expectedSchema) {
      errors.push(`API health schema was ${String(health.schema ?? "missing")}, expected ${expectedSchema}`);
    }
    if (health.targetSchema !== expectedSchema) {
      errors.push(`API health targetSchema was ${String(health.targetSchema ?? "missing")}, expected ${expectedSchema}`);
    }
    if (!Array.isArray(health.compatibleSchemas) || !health.compatibleSchemas.includes(expectedSchema)) {
      errors.push(`API health compatibleSchemas did not include ${expectedSchema}`);
    }
    for (const feature of ["registration", "accountRecovery", "accountDeletion", "contentStudio"]) {
      if (health.features?.[feature] !== true) {
        errors.push(`API health feature ${feature} was not ready on schema ${expectedSchema}`);
      }
    }
    const publication = health.contentPublication;
    if (!isRecord(publication)) {
      errors.push("API health contentPublication was missing or invalid");
    } else {
      if (publication.state !== EXPECTED_PUBLICATION.state) {
        errors.push(`API health content publication state was ${String(publication.state ?? "missing")}`);
      }
      if (publication.quarantinedQuestions !== EXPECTED_PUBLICATION.quarantinedQuestions) {
        errors.push(`API health quarantined question total was ${String(publication.quarantinedQuestions ?? "missing")}`);
      }
      if (publication.publicQuestions !== EXPECTED_PUBLICATION.publicQuestions) {
        errors.push(`API health public question total was ${String(publication.publicQuestions ?? "missing")}`);
      }
      if (publication.manifestSha256 !== EXPECTED_PUBLICATION.manifestSha256) {
        errors.push("API health quarantine manifest SHA-256 differed from the release source");
      }
      const categories = Array.isArray(publication.quarantinedCategories)
        ? [...publication.quarantinedCategories].sort()
        : [];
      if (
        categories.length !== EXPECTED_PUBLICATION.categories.length
        || categories.some((slug, index) => slug !== EXPECTED_PUBLICATION.categories[index])
      ) {
        errors.push("API health quarantined categories differed from the release source");
      }
    }
  }

  return {
    errors,
    evidence: {
      expectedCommit,
      expectedSchema,
      activeVersion,
      deploymentId: isRecord(deployment) && typeof deployment.id === "string" ? deployment.id : null,
      deploymentMessage,
      apiReleaseRunId,
      healthHttpStatus: String(httpStatus),
      health,
    },
  };
}

export function compareStaticApiEvidence(before, after) {
  const errors = [];
  if (before?.result !== "verified" || after?.result !== "verified") {
    errors.push("both static/API gate receipts must be verified before comparison");
  }
  for (const field of [
    "expectedCommit",
    "expectedSchema",
    "activeVersion",
    "deploymentId",
    "deploymentMessage",
    "apiReleaseRunId",
  ]) {
    if (before?.[field] !== after?.[field]) {
      errors.push(`live API ${field} changed during the static release`);
    }
  }
  if (before?.health?.workerVersionId !== before?.activeVersion) {
    errors.push("pre-static API health was not bound to its active Worker version");
  }
  if (after?.health?.workerVersionId !== after?.activeVersion) {
    errors.push("post-static API health was not bound to its active Worker version");
  }
  return {
    errors,
    evidence: {
      activeVersion: before?.activeVersion ?? null,
      deploymentId: before?.deploymentId ?? null,
      apiReleaseRunId: before?.apiReleaseRunId ?? null,
      expectedCommit: before?.expectedCommit ?? null,
      expectedSchema: before?.expectedSchema ?? null,
      beforeCheckedAt: before?.checkedAt ?? null,
      afterCheckedAt: after?.checkedAt ?? null,
    },
  };
}

async function verifyCommand(options) {
  const expectedCommit = requireOption(options, "expected-commit");
  const expectedSchema = requireOption(options, "expected-schema");
  const result = verifyStaticApiRelease({
    deployment: await readJson(requireOption(options, "deployment")),
    health: await readJson(requireOption(options, "health")),
    httpStatus: requireOption(options, "http-status"),
    expectedCommit,
    expectedSchema,
  });
  const receipt = {
    formatVersion: 1,
    checkedAt: new Date().toISOString(),
    result: result.errors.length === 0 ? "verified" : "blocked",
    ...result.evidence,
    errors: result.errors,
  };
  await writeFile(requireOption(options, "receipt"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      process.stderr.write(`::error title=Static/API release gate::${error}\n`);
    }
    throw new Error(`${result.errors.length} static/API release gate(s) failed`);
  }

  if (options["github-output"]) {
    await appendFile(options["github-output"], [
      `api-worker-version=${result.evidence.activeVersion}`,
      `api-release-run-id=${result.evidence.apiReleaseRunId}`,
      `api-release-commit=${expectedCommit}`,
      `api-release-schema=${expectedSchema}`,
      "",
    ].join("\n"), "utf8");
  }
  process.stdout.write(
    `Live API verified: commit ${expectedCommit}, schema ${expectedSchema}, Worker ${result.evidence.activeVersion}.\n`,
  );
}

async function compareCommand(options) {
  const result = compareStaticApiEvidence(
    await readJson(requireOption(options, "before")),
    await readJson(requireOption(options, "after")),
  );
  const receipt = {
    formatVersion: 1,
    checkedAt: new Date().toISOString(),
    result: result.errors.length === 0 ? "unchanged" : "blocked",
    ...result.evidence,
    errors: result.errors,
  };
  await writeFile(requireOption(options, "receipt"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  if (result.errors.length) {
    for (const error of result.errors) process.stderr.write(`::error title=Static/API release gate::${error}\n`);
    throw new Error(`${result.errors.length} static/API identity comparison gate(s) failed`);
  }
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === "verify") await verifyCommand(options);
  else if (command === "compare") await compareCommand(options);
  else throw new Error(`Unknown command: ${command ?? "missing"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
