import assert from "node:assert/strict";
import test from "node:test";

import {
  runSmoke,
  smokeDefinitions,
} from "./site-release-receipt.mjs";

const BUILD_ID = "a".repeat(64);
const WORKER_VERSION = "11111111-1111-4111-8111-111111111111";

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
