import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  buildStaticSite,
  FINGERPRINT_PREFIX_LENGTH,
  FINGERPRINT_SOURCE_PATHS,
  inlineScriptHashes,
  isDeployableFile,
} from "../../scripts/build-static-site.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function assertFingerprintBytes(manifest, outputDirectory) {
  for (const [stable, fingerprinted] of Object.entries(manifest.fingerprints)) {
    assert.ok(manifest.files[stable], `stable compatibility file is missing: ${stable}`);
    const bytes = await readFile(join(outputDirectory, fingerprinted.slice(1)));
    const actual = digest(bytes);
    assert.equal(actual, manifest.files[fingerprinted].sha256, `${fingerprinted} bytes must match the manifest`);
    assert.match(fingerprinted, new RegExp(`\\.${actual.slice(0, FINGERPRINT_PREFIX_LENGTH)}\\.[^.]+$`, "u"));
  }
}

async function artifactPaths(directory, prefix = "") {
  const paths = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) paths.push(...await artifactPaths(directory, relativePath));
    else if (entry.isFile()) paths.push(`/${relativePath}`);
  }
  return paths.sort((left, right) => left.localeCompare(right, "en"));
}

async function assertCompleteInventory(manifest, outputDirectory) {
  const paths = await artifactPaths(outputDirectory);
  assert.deepEqual(paths, Object.keys(manifest.files).sort((left, right) => left.localeCompare(right, "en")));
  for (const path of paths) {
    const bytes = await readFile(join(outputDirectory, path.slice(1)));
    assert.deepEqual(manifest.files[path], { sha256: digest(bytes), bytes: bytes.length }, `${path} inventory record`);
  }
}

test("generated production manifest is complete, one-hop, and excludes repository internals", async () => {
  const manifest = JSON.parse(await readFile(join(repositoryRoot, "site-worker/generated/site-manifest.json"), "utf8"));
  assert.match(manifest.buildId, /^[a-f0-9]{64}$/u);
  assert.match(manifest.sourceGraphId, /^[a-f0-9]{64}$/u);
  assert.equal(manifest.offlineCacheIdentity, `sg-${manifest.sourceGraphId}`);
  assert.equal(manifest.service, "jakh-site");
  assert.equal(Object.keys(manifest.files).length, manifest.fileCount);
  assert.equal(manifest.routes["/"], "/index.html");
  assert.equal(manifest.routes["/__404__"], "/404.html");
  assert.equal(manifest.aliases["/index.html"], "/");
  assert.equal(manifest.aliases["/science.html"], "/science");
  assert.equal(manifest.aliases["/ar/topics/science/index.html"], "/ar/topics/science/");
  assert.ok(Object.keys(manifest.aliases).length > 400);
  for (const [alias, target] of Object.entries(manifest.aliases)) {
    assert.equal(manifest.aliases[target], undefined, `${alias} must not redirect through ${target}`);
    assert.ok(manifest.routes[target], `${alias} target ${target} must resolve to an HTML artifact`);
  }
  for (const forbidden of ["/package.json", "/package-lock.json", "/SECURITY.md", "/CNAME"]) {
    assert.equal(manifest.files[forbidden], undefined);
  }
  assert.equal(Object.keys(manifest.files).some((path) => /\/(?:scripts|worker|site-worker|docs)\//u.test(path)), false);
  assert.ok(manifest.inlineScripts["/"].length > 0, "root JSON-LD must receive a CSP hash");
  assert.deepEqual(Object.keys(manifest.fingerprints).sort(), [...FINGERPRINT_SOURCE_PATHS].sort());
  await assertFingerprintBytes(manifest, join(repositoryRoot, "site-worker/dist"));
  await assertCompleteInventory(manifest, join(repositoryRoot, "site-worker/dist"));

  const rootHtml = await readFile(join(repositoryRoot, "site-worker/dist/index.html"), "utf8");
  assert.match(rootHtml, new RegExp(manifest.fingerprints["/app.js"].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(rootHtml, new RegExp(manifest.fingerprints["/styles.css"].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  const application = await readFile(join(repositoryRoot, "site-worker/dist", manifest.fingerprints["/app.js"].slice(1)), "utf8");
  for (const stable of ["/battle-mode.js", "/battle-mode.css", "/search-leaderboard.js", "/search-leaderboard.css"]) {
    assert.match(application, new RegExp(manifest.fingerprints[stable].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  const search = await readFile(join(repositoryRoot, "site-worker/dist", manifest.fingerprints["/search-leaderboard.js"].slice(1)), "utf8");
  assert.match(search, new RegExp(manifest.fingerprints["/data/search-index.en.json"].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(search, new RegExp(manifest.fingerprints["/data/search-index.ar.json"].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  const serviceWorker = await readFile(join(repositoryRoot, "site-worker/dist/sw.js"), "utf8");
  assert.match(serviceWorker, new RegExp(`const CACHE_VERSION = '${manifest.offlineCacheIdentity}';`, "u"));
  for (const stable of ["/app.js", "/styles.css", "/privacy.css"]) {
    assert.match(serviceWorker, new RegExp(manifest.fingerprints[stable].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});

test("fixture fingerprints are deterministic and leaf changes propagate through dependents", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "jakh-site-build-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const source = join(temporary, "source");
  await mkdir(join(source, "data"), { recursive: true });
  await mkdir(join(source, "docs"), { recursive: true });
  const index = '<!doctype html><link rel="canonical" href="https://jakh.net/"><link rel="stylesheet" href="styles.css?v=old"><link rel="stylesheet" href="/privacy.css?v=old"><script>window.test=1;</script><script src="app.js?v=old"></script>';
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "index.html"), index, "utf8");
  await writeFile(join(source, "404.html"), "<!doctype html><title>Missing</title>", "utf8");
  await writeFile(join(source, "app.js"), "const paths=['/battle-mode.js','/battle-mode.css','/search-leaderboard.js','/search-leaderboard.css'];\n", "utf8");
  await writeFile(join(source, "styles.css"), "body{color:#123}\n", "utf8");
  await writeFile(join(source, "privacy.css"), ".privacy{display:block}\n", "utf8");
  await writeFile(join(source, "battle-mode.js"), "export const battle=1;\n", "utf8");
  await writeFile(join(source, "battle-mode.css"), ".battle{display:block}\n", "utf8");
  await writeFile(join(source, "search-leaderboard.js"), "const fetchJson=(path)=>path; const language='en'; export const data=fetchJson(`/data/search-index.${language}.json`);\n", "utf8");
  await writeFile(join(source, "search-leaderboard.css"), ".search{display:block}\n", "utf8");
  await writeFile(join(source, "data/search-index.en.json"), '{"language":"en","items":[1]}\n', "utf8");
  await writeFile(join(source, "data/search-index.ar.json"), '{"language":"ar","items":[2]}\n', "utf8");
  await writeFile(join(source, "sw.js"), "const CACHE_VERSION = 'v80';\nconst REQUIRED_CORE_ASSETS = [\n  '/app.js',\n  '/styles.css',\n];\n", "utf8");
  await writeFile(join(source, "robots.txt"), "User-agent: *\n", "utf8");
  await writeFile(join(source, "package.json"), "{}\n", "utf8");
  await writeFile(join(source, "docs/secret.json"), '{"token":"never"}\n', "utf8");

  const fileList = [
    "index.html", "404.html", "app.js", "styles.css", "privacy.css",
    "battle-mode.js", "battle-mode.css", "search-leaderboard.js", "search-leaderboard.css",
    "data/search-index.en.json", "data/search-index.ar.json", "sw.js", "robots.txt",
    "package.json", "docs/secret.json",
  ];

  const first = await buildStaticSite({
    sourceRoot: source,
    outputDirectory: join(temporary, "first-dist"),
    manifestPath: join(temporary, "first.json"),
    manifestModulePath: join(temporary, "first.js"),
    fileList,
  });
  const repeated = await buildStaticSite({
    sourceRoot: source,
    outputDirectory: join(temporary, "repeat-dist"),
    manifestPath: join(temporary, "repeat.json"),
    manifestModulePath: join(temporary, "repeat.js"),
    fileList,
  });
  assert.deepEqual(repeated, first, "same source graph must produce the same build and cache identities");
  assert.equal(first.fileCount, 22);
  assert.deepEqual(first.inlineScripts["/"], inlineScriptHashes('<script>window.test=1;</script>'));
  assert.equal(first.files["/package.json"], undefined);
  assert.equal(first.files["/docs/secret.json"], undefined);
  assert.equal(first.files["/app.js"].sha256, digest(await readFile(join(source, "app.js"))));
  await assertFingerprintBytes(first, join(temporary, "first-dist"));
  await assertCompleteInventory(first, join(temporary, "first-dist"));

  const builtHtml = await readFile(join(temporary, "first-dist/index.html"), "utf8");
  assert.match(builtHtml, new RegExp(first.fingerprints["/app.js"].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.doesNotMatch(builtHtml, /(?:app\.js|styles\.css|privacy\.css)\?v=/u);
  const builtSw = await readFile(join(temporary, "first-dist/sw.js"), "utf8");
  assert.match(builtSw, new RegExp(first.offlineCacheIdentity, "u"));
  assert.doesNotMatch(builtSw, /CACHE_VERSION = 'v80'/u);
  assert.doesNotMatch(builtSw, /['"]\/(?:app\.js|styles\.css|privacy\.css)['"]/u);

  await writeFile(join(source, "data/search-index.en.json"), '{"language":"en","items":[1,3]}\n', "utf8");
  const second = await buildStaticSite({
    sourceRoot: source,
    outputDirectory: join(temporary, "second-dist"),
    manifestPath: join(temporary, "second.json"),
    manifestModulePath: join(temporary, "second.js"),
    fileList,
  });
  assert.notEqual(second.buildId, first.buildId);
  assert.notEqual(second.offlineCacheIdentity, first.offlineCacheIdentity);
  assert.notEqual(second.fingerprints["/data/search-index.en.json"], first.fingerprints["/data/search-index.en.json"]);
  assert.equal(second.fingerprints["/data/search-index.ar.json"], first.fingerprints["/data/search-index.ar.json"]);
  assert.notEqual(second.fingerprints["/search-leaderboard.js"], first.fingerprints["/search-leaderboard.js"]);
  assert.notEqual(second.fingerprints["/app.js"], first.fingerprints["/app.js"]);
  assert.equal(second.fingerprints["/styles.css"], first.fingerprints["/styles.css"]);
  assert.equal(second.fingerprints["/battle-mode.js"], first.fingerprints["/battle-mode.js"]);

  await writeFile(join(source, "robots.txt"), "User-agent: *\nDisallow: /private\n", "utf8");
  const third = await buildStaticSite({
    sourceRoot: source,
    outputDirectory: join(temporary, "third-dist"),
    manifestPath: join(temporary, "third.json"),
    manifestModulePath: join(temporary, "third.js"),
    fileList,
  });
  assert.deepEqual(third.fingerprints, second.fingerprints, "unrelated leaves must not perturb asset fingerprints");
  assert.notEqual(third.offlineCacheIdentity, second.offlineCacheIdentity, "every deployable graph change must rotate offline caches");
});

test("deploy allow-list is explicit", () => {
  assert.equal(isDeployableFile("assets/logo.webp"), true);
  assert.equal(isDeployableFile(".well-known/security.txt"), true);
  assert.equal(isDeployableFile("scripts/private.json"), false);
  assert.equal(isDeployableFile("worker/package.json"), false);
  assert.equal(isDeployableFile("local-secret.json"), true, "tracked public JSON is allowed; untracked files never enter the list");
  assert.equal(isDeployableFile("../escape.html"), false);
});
