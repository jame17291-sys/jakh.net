import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { verifyStaticApiRelease } from "./static-api-release-gate.mjs";

const EXPECTED_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const OTHER_COMMIT = "89abcdef0123456789abcdef0123456789abcdef";
const VERSION_A = "11111111-1111-4111-8111-111111111111";
const VERSION_B = "22222222-2222-4222-8222-222222222222";

function deployment({
  commit = EXPECTED_COMMIT,
  schema = "8",
  runId = "987654321",
  message = `JAKH final ${commit} schema ${schema} run ${runId}`,
  versions = [{ version_id: VERSION_A, percentage: 100 }],
} = {}) {
  return {
    id: "deployment-verified",
    annotations: { "workers/message": message },
    versions,
  };
}

function health(overrides = {}) {
  return {
    ok: true,
    service: "jakh-api",
    version: "1.4.0",
    schema: "8",
    targetSchema: "8",
    compatibleSchemas: ["6", "7", "8"],
    features: {
      registration: true,
      accountRecovery: true,
      accountDeletion: true,
    },
    ...overrides,
  };
}

function verify(overrides = {}) {
  return verifyStaticApiRelease({
    deployment: deployment(),
    health: health(),
    httpStatus: "200",
    expectedCommit: EXPECTED_COMMIT,
    expectedSchema: "8",
    ...overrides,
  });
}

test("accepts one 100% Worker with the exact final message and schema-8 health", () => {
  const result = verify();
  assert.deepEqual(result.errors, []);
  assert.equal(result.evidence.activeVersion, VERSION_A);
  assert.equal(result.evidence.apiReleaseRunId, "987654321");
});

test("rejects an active API deployed from a different source commit", () => {
  const result = verify({ deployment: deployment({ commit: OTHER_COMMIT }) });
  assert.match(result.errors.join("\n"), /source commit was .* expected/u);
});

test("rejects the wrong deployment or live health schema", () => {
  const wrongMessageSchema = verify({ deployment: deployment({ schema: "7" }) });
  assert.match(wrongMessageSchema.errors.join("\n"), /deployment schema was 7, expected 8/u);

  const wrongHealthSchema = verify({ health: health({ schema: "7" }) });
  assert.match(wrongHealthSchema.errors.join("\n"), /health schema was 7, expected 8/u);
});

test("rejects split traffic even when the release message and health are otherwise valid", () => {
  const result = verify({
    deployment: deployment({
      versions: [
        { version_id: VERSION_A, percentage: 90 },
        { version_id: VERSION_B, percentage: 10 },
      ],
    }),
  });
  assert.match(result.errors.join("\n"), /exactly one active Worker version serving 100%/u);
});

test("rejects malformed or inexact deployment messages", () => {
  const malformedMessages = [
    `JAKH final ${EXPECTED_COMMIT} schema 8`,
    `JAKH final ${EXPECTED_COMMIT.slice(0, 12)} schema 8 run 987654321`,
    `prefix JAKH final ${EXPECTED_COMMIT} schema 8 run 987654321`,
    `JAKH final ${EXPECTED_COMMIT} schema 8 run release-987654321`,
    `JAKH compatibility ${EXPECTED_COMMIT} target schema 8 run 987654321`,
  ];
  for (const message of malformedMessages) {
    const result = verify({ deployment: deployment({ message }) });
    assert.match(result.errors.join("\n"), /must exactly match/u, message);
  }
});

test("rejects unhealthy or partially ready schema-8 responses", () => {
  assert.match(
    verify({ httpStatus: "503" }).errors.join("\n"),
    /HTTP status was 503/u,
  );
  assert.match(
    verify({ health: health({ features: { registration: true, accountRecovery: true, accountDeletion: false } }) })
      .errors.join("\n"),
    /accountDeletion was not ready/u,
  );
});

test("static workflow builds once, tests that artifact, and gates deployment on live API evidence", async () => {
  const workflow = await readFile(new URL("../.github/workflows/static-site.yml", import.meta.url), "utf8");
  const buildPosition = workflow.indexOf("npm run build:site");
  const browserPosition = workflow.indexOf("npm run test:browser:matrix");
  const accessibilityPosition = workflow.indexOf("npm run test:a11y");
  const apiGatePosition = workflow.indexOf("id: api_before");
  const deployPosition = workflow.indexOf("id: deploy");
  const postGatePosition = workflow.indexOf("id: api_after");

  assert.ok(buildPosition > 0 && buildPosition < browserPosition);
  assert.ok(buildPosition < accessibilityPosition);
  assert.equal(workflow.match(/npm run build:site/gu)?.length, 1);
  assert.match(workflow, /JAKH_SITE_ROOT: \$\{\{ github\.workspace \}\}\/site-worker\/dist/u);
  assert.match(workflow, /JAKH_SITE_MANIFEST: \$\{\{ github\.workspace \}\}\/site-worker\/generated\/site-manifest\.json/u);
  assert.match(workflow, /CLOUDFLARE_API_RELEASE_READ_TOKEN/u);
  assert.ok(apiGatePosition > accessibilityPosition && apiGatePosition < deployPosition);
  assert.ok(postGatePosition > deployPosition);
  assert.match(workflow, /static-api-release-gate\.mjs verify/gu);
  assert.match(workflow, /--expected-commit "\$GITHUB_SHA" \\\n\s+--expected-schema 8/gu);
  assert.match(workflow, /candidate-artifact-inventory\.json/u);
  assert.match(workflow, /API dry-run artifact: inventoried only; it is not evidence of a live API release/u);
  assert.doesNotMatch(workflow, /Cross-artifact release SHA/u);
});
