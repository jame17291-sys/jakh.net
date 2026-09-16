import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  buildStaticSite,
  assertPublicProjection,
  FINGERPRINT_PREFIX_LENGTH,
  FINGERPRINT_SOURCE_PATHS,
  inlineScriptHashes,
  isDeployableFile,
  normalizeAdminRuntimeConfig,
  rewriteKnownHtmlClaims,
} from "../../scripts/build-static-site.mjs";
import {
  isQuarantinedArtifactPath,
  loadProductionQuarantine,
  publicCategoryCardsProjection,
} from "../../scripts/publication-quarantine.mjs";
import { isRetiredPublicSeoArtifactPath } from "../../scripts/public-seo-release-contract.mjs";
import { RETIRED_SEO_ROUTE_REDIRECTS } from "../src/seo-route-migrations.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const expectedHeldAssets = [
  "assets/medical-questions.svg",
  "assets/law-middle-east.svg",
  "assets/economics-and-finance.svg",
  "assets/pharmacy.svg",
];

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function cardTextFragments(html) {
  return [...String(html).matchAll(
    /<p\b[^>]*\bclass=["'][^"']*\bcard-(?:question|answer)\b[^"']*["'][^>]*>[\s\S]*?<\/p>/giu,
  )].map((match) => match[0]);
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
  const quarantineBytes = await readFile(join(repositoryRoot, "docs/content-review/production-quarantine.json"));
  const quarantine = loadProductionQuarantine(repositoryRoot);
  assert.match(manifest.buildId, /^[a-f0-9]{64}$/u);
  assert.match(manifest.sourceGraphId, /^[a-f0-9]{64}$/u);
  assert.equal(manifest.offlineCacheIdentity, `sg-${manifest.sourceGraphId}`);
  assert.equal(manifest.service, "jakh-site");
  assert.deepEqual(manifest.adminRuntime, {
    apiOrigin: "https://api.riddlearabia.com/api",
    environment: "production",
  });
  assert.deepEqual(manifest.publication, {
    state: "safety-quarantine-active",
    policySha256: digest(quarantineBytes),
    fullQuestions: 3_553,
    publicQuestions: 3_275,
    quarantinedQuestions: 278,
    publicCategories: 51,
    quarantinedCategories: [
      "survival",
      "law-middle-east",
      "medical-questions",
      "pharmacy",
      "economics-and-finance",
    ],
  });
  assert.equal(Object.keys(manifest.files).length, manifest.fileCount);
  assert.equal(manifest.routes["/"], "/index.html");
  assert.equal(manifest.routes["/__404__"], "/404.html");
  assert.equal(manifest.aliases["/index.html"], "/");
  assert.equal(manifest.aliases["/science.html"], "/science");
  assert.equal(manifest.aliases["/ar/topics/science/index.html"], "/ar/topics/science/");
  assert.equal(manifest.aliases["/ar/topics/science.html"], "/ar/topics/science/");
  for (const route of ["/riddles", "/ar/alghaz/", "/logic-challenges", "/brain-games", "/ar/alab-al-dimagh/", "/akshifha", "/ar/games/akshifha/"]) {
    assert.ok(manifest.routes[route], `curated SEO route is missing: ${route}`);
  }
  for (const { from, to } of RETIRED_SEO_ROUTE_REDIRECTS) {
    assert.equal(manifest.routes[from], undefined, `retired SEO route must not be deployed: ${from}`);
    assert.equal(manifest.aliases[from], undefined, `retired SEO route must not be a static alias: ${from}`);
    assert.ok(manifest.routes[to], `retired SEO redirect target must be deployed: ${from} -> ${to}`);
  }
  // The compact Riddle Arabia architecture removes generated /page/N/ aliases
  // while retaining clean-path, .html, and localized route compatibility.
  assert.ok(Object.keys(manifest.aliases).length >= 300);
  for (const [alias, target] of Object.entries(manifest.aliases)) {
    assert.equal(manifest.aliases[target], undefined, `${alias} must not redirect through ${target}`);
    assert.ok(manifest.routes[target], `${alias} target ${target} must resolve to an HTML artifact`);
  }
  for (const forbidden of ["/package.json", "/package-lock.json", "/SECURITY.md", "/CNAME"]) {
    assert.equal(manifest.files[forbidden], undefined);
  }
  for (const relativePath of expectedHeldAssets) {
    assert.equal(manifest.files[`/${relativePath}`], undefined, relativePath);
  }
  assert.ok(manifest.files["/assets/riddlearabia-logo.webp"], "supplied Riddle Arabia logo is missing");
  assert.equal(manifest.files["/assets/riddlearabia-mark.svg"], undefined, "retired public logo asset is deployable");
  assert.equal(Object.keys(manifest.files).some((path) => /\/(?:scripts|worker|site-worker|docs)\//u.test(path)), false);
  for (const artifactPath of [
    ...Object.keys(manifest.files),
    ...Object.keys(manifest.routes),
    ...Object.keys(manifest.aliases),
  ]) {
    assert.equal(isQuarantinedArtifactPath(artifactPath, quarantine), false, artifactPath);
  }
  for (const artifactPath of Object.keys(manifest.files)) {
    assert.equal(isRetiredPublicSeoArtifactPath(artifactPath), false, `retired SEO artifact was deployed: ${artifactPath}`);
  }
  assert.ok(manifest.inlineScripts["/"].length > 0, "root JSON-LD must receive a CSP hash");
  assert.deepEqual(Object.keys(manifest.fingerprints).sort(), [...FINGERPRINT_SOURCE_PATHS].sort());
  await assertFingerprintBytes(manifest, join(repositoryRoot, "site-worker/dist"));
  await assertCompleteInventory(manifest, join(repositoryRoot, "site-worker/dist"));

  const rootHtml = await readFile(join(repositoryRoot, "site-worker/dist/index.html"), "utf8");
  assert.match(rootHtml, new RegExp(manifest.fingerprints["/app.js"].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(rootHtml, new RegExp(manifest.fingerprints["/styles.css"].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  const adminHtml = await readFile(join(repositoryRoot, "site-worker/dist/admin.html"), "utf8");
  for (const stable of ["/admin-config.js", "/admin.js", "/admin.css"]) {
    assert.match(adminHtml, new RegExp(manifest.fingerprints[stable].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.match(adminHtml, /data-admin-api-origin="https:\/\/api\.riddlearabia\.com\/api"/u);
  assert.match(adminHtml, /data-admin-environment="production"/u);
  const application = await readFile(join(repositoryRoot, "site-worker/dist", manifest.fingerprints["/app.js"].slice(1)), "utf8");
  for (const relativePath of expectedHeldAssets) {
    assert.equal(application.includes(relativePath), false, relativePath);
  }
  for (const stable of ["/battle-mode.js", "/battle-mode.css", "/search-leaderboard.js", "/search-leaderboard.css"]) {
    assert.match(application, new RegExp(manifest.fingerprints[stable].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  const search = await readFile(join(repositoryRoot, "site-worker/dist", manifest.fingerprints["/search-leaderboard.js"].slice(1)), "utf8");
  assert.match(search, new RegExp(manifest.fingerprints["/data/search-index.en.json"].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(search, new RegExp(manifest.fingerprints["/data/search-index.ar.json"].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  const serviceWorker = await readFile(join(repositoryRoot, "site-worker/dist/sw.js"), "utf8");
  assert.match(serviceWorker, new RegExp(`const CACHE_VERSION = '${manifest.offlineCacheIdentity}';`, "u"));
  for (const stable of ["/app.js", "/styles.css", "/privacy.css", "/akshifha.js", "/akshifha-engine.js", "/akshifha-cases.js", "/akshifha-copy.js", "/akshifha.css"]) {
    assert.match(serviceWorker, new RegExp(manifest.fingerprints[stable].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  const akshifha = await readFile(join(repositoryRoot, "site-worker/dist", manifest.fingerprints["/akshifha.js"].slice(1)), "utf8");
  for (const dependency of ["/akshifha-engine.js", "/akshifha-cases.js", "/akshifha-copy.js"]) {
    assert.ok(akshifha.includes(manifest.fingerprints[dependency]), `Akshifha entry must pin ${dependency}`);
    assert.equal(akshifha.includes(`'${dependency}'`) || akshifha.includes(`"${dependency}"`), false);
    assert.equal(akshifha.includes(`'.${dependency}'`) || akshifha.includes(`".${dependency}"`), false);
  }
  for (const document of ["akshifha.html", "ar/games/akshifha/index.html"]) {
    const html = await readFile(join(repositoryRoot, "site-worker/dist", document), "utf8");
    for (const stable of ["/akshifha.js", "/akshifha.css", "/styles.css"]) {
      assert.ok(html.includes(manifest.fingerprints[stable]), `${document} must pin ${stable}`);
    }
  }

  const publicCatalog = JSON.parse(await readFile(join(repositoryRoot, "site-worker/dist/data/catalog.json"), "utf8"));
  const publicCardIndex = JSON.parse(await readFile(join(repositoryRoot, "site-worker/dist/data/card-index.json"), "utf8"));
  assert.equal(publicCatalog.categories.length, 51);
  assert.equal(publicCatalog.site.totalQuestions, 3_275);
  assert.equal(publicCatalog.site.publication, undefined, "public catalog must not expose release governance metadata");
  assert.ok(
    publicCatalog.categories.every((category) => !Object.hasOwn(category, "reviewedQuestionCount")),
    "public catalog must not expose reviewer metrics",
  );
  assert.equal(Object.keys(publicCardIndex).length, 3_275);
  const publicCardsById = new Map();
  for (const category of publicCatalog.categories) {
    const sourcePath = join(repositoryRoot, `data/${category.slug}.json`);
    const deployedPath = join(repositoryRoot, `site-worker/dist/data/${category.slug}.json`);
    const sourceCards = JSON.parse(await readFile(sourcePath, "utf8"));
    const deployedCards = JSON.parse(await readFile(deployedPath, "utf8"));
    assert.deepEqual(
      deployedCards,
      publicCategoryCardsProjection(sourceCards),
      `${category.slug} card data must match the sanitized public projection`,
    );
    assert.ok(deployedCards.every((card) => !Object.hasOwn(card, "review")), `${category.slug} card data leaks review metadata`);
    for (const card of deployedCards) publicCardsById.set(card.id, card);
  }
  for (const language of ["en", "ar"]) {
    const shard = JSON.parse(await readFile(join(repositoryRoot, `site-worker/dist/data/search-index.${language}.json`), "utf8"));
    assert.equal(shard.categories.length, 51, language);
    assert.equal(shard.total, 3_275, language);
    assert.equal(shard.cards.length, 3_275, language);
    assert.equal(shard.cards.some((row) => quarantine.cardIds.has(row[1])), false, language);
    for (const [, cardId, question, answer] of shard.cards) {
      const sourceCard = publicCardsById.get(cardId);
      assert.ok(sourceCard, `${language} search row references known public card ${cardId}`);
      assert.equal(question, sourceCard.question[language], `${language} search question ${cardId}`);
      assert.equal(answer, sourceCard.answer[language], `${language} search answer ${cardId}`);
    }
  }

  for (const artifactPath of Object.keys(manifest.files).filter((path) => path.endsWith(".html"))) {
    const sourcePath = join(repositoryRoot, artifactPath.slice(1));
    let sourceHtml;
    try {
      sourceHtml = await readFile(sourcePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    const sourceFragments = cardTextFragments(sourceHtml);
    if (sourceFragments.length === 0) continue;
    const deployedHtml = await readFile(join(repositoryRoot, "site-worker/dist", artifactPath.slice(1)), "utf8");
    assert.deepEqual(cardTextFragments(deployedHtml), sourceFragments, `${artifactPath} card copy must remain byte-exact`);
  }

  const sectionContracts = [
    ["mind", 8, 480],
    ["science", 9, 730],
    ["tech", 11, 420],
    ["world", 11, 570],
    ["culture", 12, 1_075],
  ];
  const mindLab = await readFile(join(repositoryRoot, "site-worker/dist/mind-lab.html"), "utf8");
  const arabicMindLab = await readFile(join(repositoryRoot, "site-worker/dist/ar/mind-lab/index.html"), "utf8");
  assert.match(mindLab, /data-cluster="all"[\s\S]*?class="ml-cluster-tab-count">51 topics</u);
  assert.match(arabicMindLab, /data-cluster="all"[\s\S]*?class="ml-cluster-tab-count">51 موضوعًا</u);
  for (const [section, topics, questions] of sectionContracts) {
    assert.match(mindLab, new RegExp(`data-cluster="${section}"[\\s\\S]*?class="ml-cluster-tab-count">${topics} topics`, "u"));
    assert.match(mindLab, new RegExp(`id="section-${section}"[\\s\\S]*?class="directory-section-count">${topics} topics · ${questions.toLocaleString("en-US")} questions`, "u"));
    assert.match(arabicMindLab, new RegExp(`data-cluster="${section}"[\\s\\S]*?class="ml-cluster-tab-count">${topics} موضوعًا`, "u"));
    assert.match(arabicMindLab, new RegExp(`id="section-${section}"[\\s\\S]*?class="directory-section-count">${topics} موضوعًا · ${questions.toLocaleString("en-US")} سؤال`, "u"));
  }

  const arabicHome = await readFile(join(repositoryRoot, "site-worker/dist/ar/index.html"), "utf8");
  assert.match(arabicHome, /id="badgeCategories">51<\/span>/u);
  assert.match(arabicHome, /data-i18n="portalMindStat">51 موضوعًا<\/span>/u);
  const builtApplication = await readFile(join(repositoryRoot, "site-worker/dist/app.js"), "utf8");
  assert.match(builtApplication, /portalMindStat: '51 موضوعًا'/u);
  assert.doesNotMatch(builtApplication, /portalMindStat: '56 موضوعًا'/u);
  assert.doesNotMatch(builtApplication, /Pending safety review|مراجعة السلامة/u);
  assert.doesNotMatch(builtApplication, /c\.review\?\.status === 'reviewed'/u);

  const webManifest = await readFile(join(repositoryRoot, "site-worker/dist/manifest.webmanifest"), "utf8");
  assert.match(webManifest, /Arabic riddles, shared challenges, and browser brain games in English and Arabic/u);
  assert.doesNotMatch(webManifest, /3,500\+|3,200\+|56 categories|51 categories/u);
  const sitemap = await readFile(join(repositoryRoot, "site-worker/dist/sitemap.xml"), "utf8");
  for (const slug of quarantine.categorySlugs) {
    assert.doesNotMatch(sitemap, new RegExp(`/(?:ar/topics/)?${slug}(?:[</]|$)`, "u"));
  }
  const privacy = await readFile(join(repositoryRoot, "site-worker/dist/privacy.html"), "utf8");
  assert.doesNotMatch(privacy, /GitHub Pages serves the public website/u);
});

test("artifact text scan rejects held Q/A encodings but permits policy identifiers", () => {
  const quarantine = loadProductionQuarantine(repositoryRoot);
  const publication = { publicCategories: 51, publicQuestions: 3_275 };
  assert.doesNotThrow(() => assertPublicProjection(new Map([
    ["publication-policy.txt", Buffer.from(
      "safety-quarantine-active survival law-middle-east medical-questions pharmacy economics-and-finance",
    )],
  ]), { publication, quarantine }));

  for (const [relativePath, leakedText] of [
    ["held-question.json", JSON.stringify({ copy: "What is the longest bone in the human body?" })],
    ["held-advice.svg", "<text>The sinoatrial (SA) node</text>"],
    ["held-html.xml", "<p>What are the hallmarks of cancer (Hanahan &amp; Weinberg)?</p>"],
    ["held-url.txt", encodeURIComponent("What is hypothermia?")],
  ]) {
    assert.throws(
      () => assertPublicProjection(
        new Map([[relativePath, Buffer.from(leakedText)]]),
        { publication, quarantine },
      ),
      /held question, answer, or advice text leaked/u,
      relativePath,
    );
  }
});

test("published-count rewrites are scoped away from card question and answer copy", () => {
  const source = [
    '<meta name="description" content="3,553 questions across 56 categories">',
    "<title>3,500+ questions across 56 topics</title>",
    '<p class="card-question">Which archive contains 3,553 records across 56 categories?</p>',
    '<p class="card-answer"><strong>It contains 3,500+ records.</strong></p>',
  ].join("\n");
  const rewritten = rewriteKnownHtmlClaims(source, {
    fullCategories: 56,
    fullQuestions: 3_553,
    publicCategories: 51,
    publicQuestions: 3_275,
  });
  assert.match(rewritten, /3,275 questions across 51 categories/u);
  assert.match(rewritten, /3,200\+ questions across 51 topics/u);
  assert.deepEqual(cardTextFragments(rewritten), cardTextFragments(source));
});

test("admin runtime configuration accepts only safe API origins and environment identifiers", () => {
  assert.deepEqual(normalizeAdminRuntimeConfig(), {
    apiOrigin: "https://api.riddlearabia.com/api",
    environment: "production",
  });
  assert.deepEqual(normalizeAdminRuntimeConfig({
    apiOrigin: "http://127.0.0.1:8787/api/",
    environment: "Staging",
  }), {
    apiOrigin: "http://127.0.0.1:8787/api",
    environment: "staging",
  });
  assert.throws(
    () => normalizeAdminRuntimeConfig({ apiOrigin: "http://api.riddlearabia.com/api" }),
    /must use HTTPS/u,
  );
  assert.throws(
    () => normalizeAdminRuntimeConfig({ apiOrigin: "https://api.riddlearabia.com/not-api" }),
    /must end with \/api/u,
  );
  assert.throws(
    () => normalizeAdminRuntimeConfig({ environment: "production<script>" }),
    /lowercase identifier/u,
  );
});

test("fixture fingerprints are deterministic and leaf changes propagate through dependents", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "jakh-site-build-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const source = join(temporary, "source");
  await mkdir(join(source, "data"), { recursive: true });
  await mkdir(join(source, "docs"), { recursive: true });
  const index = '<!doctype html><link rel="canonical" href="https://riddlearabia.com/"><link rel="stylesheet" href="styles.css?v=old"><link rel="stylesheet" href="/privacy.css?v=old"><script>window.test=1;</script><script src="app.js?v=old"></script>';
  const admin = '<!doctype html><html data-admin-api-origin="https://api.riddlearabia.com/api" data-admin-environment="production"><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; connect-src \'self\' https://api.riddlearabia.com"><link rel="canonical" href="https://riddlearabia.com/admin"><link rel="stylesheet" href="/admin.css?v=old"><script src="/admin-config.js?v=old"></script><script src="/admin.js?v=old"></script></head></html>';
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "index.html"), index, "utf8");
  await writeFile(join(source, "404.html"), "<!doctype html><title>Missing</title>", "utf8");
  await writeFile(join(source, "admin.html"), admin, "utf8");
  await writeFile(join(source, "app.js"), "const paths=['/battle-mode.js','/battle-mode.css','/search-leaderboard.js','/search-leaderboard.css'];\n", "utf8");
  await writeFile(join(source, "admin-config.js"), "globalThis.RIDDLE_ARABIA_ADMIN_CONFIG = {};\n", "utf8");
  await writeFile(join(source, "admin.js"), "globalThis.adminLoaded = true;\n", "utf8");
  await writeFile(join(source, "admin.css"), ".admin{display:block}\n", "utf8");
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
    "index.html", "404.html", "admin.html", "app.js", "admin-config.js", "admin.js", "admin.css", "styles.css", "privacy.css",
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
    adminApiOrigin: "https://api.staging.riddlearabia.com/api",
    adminEnvironment: "staging",
  });
  const repeated = await buildStaticSite({
    sourceRoot: source,
    outputDirectory: join(temporary, "repeat-dist"),
    manifestPath: join(temporary, "repeat.json"),
    manifestModulePath: join(temporary, "repeat.js"),
    fileList,
    adminApiOrigin: "https://api.staging.riddlearabia.com/api",
    adminEnvironment: "staging",
  });
  assert.deepEqual(repeated, first, "same source graph must produce the same build and cache identities");
  assert.equal(first.fileCount, 29);
  assert.deepEqual(first.inlineScripts["/"], inlineScriptHashes('<script>window.test=1;</script>'));
  assert.equal(first.files["/package.json"], undefined);
  assert.equal(first.files["/docs/secret.json"], undefined);
  assert.equal(first.files["/app.js"].sha256, digest(await readFile(join(source, "app.js"))));
  await assertFingerprintBytes(first, join(temporary, "first-dist"));
  await assertCompleteInventory(first, join(temporary, "first-dist"));

  const builtHtml = await readFile(join(temporary, "first-dist/index.html"), "utf8");
  assert.match(builtHtml, new RegExp(first.fingerprints["/app.js"].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.doesNotMatch(builtHtml, /(?:app\.js|styles\.css|privacy\.css)\?v=/u);
  const builtAdmin = await readFile(join(temporary, "first-dist/admin.html"), "utf8");
  for (const stable of ["/admin-config.js", "/admin.js", "/admin.css"]) {
    assert.match(builtAdmin, new RegExp(first.fingerprints[stable].replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.doesNotMatch(builtAdmin, /(?:admin-config|admin)\.js\?v=|admin\.css\?v=/u);
  assert.match(builtAdmin, /data-admin-api-origin="https:\/\/api\.staging\.riddlearabia\.com\/api"/u);
  assert.match(builtAdmin, /data-admin-environment="staging"/u);
  assert.match(builtAdmin, /connect-src 'self' https:\/\/api\.riddlearabia\.com https:\/\/api\.staging\.riddlearabia\.com/u);
  assert.deepEqual(first.adminRuntime, {
    apiOrigin: "https://api.staging.riddlearabia.com/api",
    environment: "staging",
  });
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
    adminApiOrigin: "https://api.staging.riddlearabia.com/api",
    adminEnvironment: "staging",
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
    adminApiOrigin: "https://api.staging.riddlearabia.com/api",
    adminEnvironment: "staging",
  });
  assert.deepEqual(third.fingerprints, second.fingerprints, "unrelated leaves must not perturb asset fingerprints");
  assert.notEqual(third.offlineCacheIdentity, second.offlineCacheIdentity, "every deployable graph change must rotate offline caches");
});

test("deploy allow-list is explicit", () => {
  assert.equal(isDeployableFile("assets/riddlearabia-logo.webp"), true);
  assert.equal(isDeployableFile("assets/riddlearabia-mark.svg"), false);
  assert.equal(isDeployableFile("assets/logo.webp"), false);
  assert.equal(isDeployableFile("assets/og-image.jpg"), false);
  assert.equal(isDeployableFile(".well-known/security.txt"), true);
  assert.equal(isDeployableFile("scripts/private.json"), false);
  assert.equal(isDeployableFile("worker/package.json"), false);
  assert.equal(isDeployableFile("local-secret.json"), true, "tracked public JSON is allowed; untracked files never enter the list");
  assert.equal(isDeployableFile("../escape.html"), false);
});

test("Akshifha module leaves propagate through the published entry and offline graph", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "akshifha-build-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const source = join(temporary, "source");
  await mkdir(join(source, "ar/games/akshifha"), { recursive: true });
  const leaves = ["/akshifha-engine.js", "/akshifha-cases.js", "/akshifha-copy.js"];
  const assets = ["/akshifha.js", "/akshifha.css", ...leaves];
  const sourceHtml = '<link rel="stylesheet" href="/akshifha.css"><script type="module" src="/akshifha.js"></script>';
  const sources = {
    "index.html": '<link rel="canonical" href="https://riddlearabia.com/">',
    "404.html": '<title>Not found</title>',
    "akshifha.html": `<link rel="canonical" href="https://riddlearabia.com/akshifha">${sourceHtml}`,
    "ar/games/akshifha/index.html": `<link rel="canonical" href="https://riddlearabia.com/ar/games/akshifha/">${sourceHtml}`,
    "akshifha.js": 'import { solve } from "./akshifha-engine.js";\nimport { cases } from "/akshifha-cases.js";\nimport { copy } from \'./akshifha-copy.js\';\nexport const game = { solve, cases, copy };\n',
    "akshifha-engine.js": 'export const solve = () => true;\n',
    "akshifha-cases.js": 'export const cases = ["delivery"];\n',
    "akshifha-copy.js": 'export const copy = { next: "Next" };\n',
    "akshifha.css": '.game { color: navy; }\n',
    "sw.js": `const CACHE_VERSION = 'fixture';\nconst REQUIRED_CORE_ASSETS = ${JSON.stringify(assets)};\n`,
  };
  for (const [path, contents] of Object.entries(sources)) {
    await writeFile(join(source, path), contents, "utf8");
  }
  let buildNumber = 0;
  const build = async (fileList = Object.keys(sources)) => {
    buildNumber += 1;
    const outputDirectory = join(temporary, `dist-${buildNumber}`);
    const manifest = await buildStaticSite({
      sourceRoot: source,
      outputDirectory,
      manifestPath: join(temporary, `manifest-${buildNumber}.json`),
      manifestModulePath: join(temporary, `manifest-${buildNumber}.js`),
      fileList,
    });
    return { manifest, outputDirectory };
  };
  const verifyGraph = async ({ manifest, outputDirectory }) => {
    await assertFingerprintBytes(manifest, outputDirectory);
    await assertCompleteInventory(manifest, outputDirectory);
    const entry = await readFile(join(outputDirectory, manifest.fingerprints["/akshifha.js"].slice(1)), "utf8");
    const imports = [...entry.matchAll(/\bfrom\s*(['"])([^'"]+)\1/gu)].map((match) => match[2]);
    assert.deepEqual(imports, leaves.map((path) => manifest.fingerprints[path]));
    for (const specifier of imports) {
      assert.ok(manifest.files[specifier], `${specifier} resolves to an emitted module`);
    }
    const sw = await readFile(join(outputDirectory, "sw.js"), "utf8");
    for (const asset of assets) assert.ok(sw.includes(manifest.fingerprints[asset]), `offline cache pins ${asset}`);
    for (const page of ["akshifha.html", "ar/games/akshifha/index.html"]) {
      const html = await readFile(join(outputDirectory, page), "utf8");
      assert.ok(html.includes(manifest.fingerprints["/akshifha.js"]));
      assert.ok(html.includes(manifest.fingerprints["/akshifha.css"]));
    }
    assert.equal(manifest.routes["/akshifha"], "/akshifha.html");
    assert.equal(manifest.aliases["/akshifha.html"], "/akshifha");
    assert.equal(manifest.routes["/ar/games/akshifha/"], "/ar/games/akshifha/index.html");
    assert.equal(manifest.aliases["/ar/games/akshifha.html"], "/ar/games/akshifha/");
  };
  let previous = await build();
  await verifyGraph(previous);
  assert.deepEqual((await build()).manifest, previous.manifest, "unchanged modules produce identical artifacts");
  for (const leaf of leaves) {
    await writeFile(join(source, leaf.slice(1)), `${sources[leaf.slice(1)]}// revision two\n`, "utf8");
    const next = await build();
    await verifyGraph(next);
    assert.notEqual(next.manifest.fingerprints[leaf], previous.manifest.fingerprints[leaf]);
    assert.notEqual(next.manifest.fingerprints["/akshifha.js"], previous.manifest.fingerprints["/akshifha.js"], `${leaf} changes the entry URL`);
    assert.notEqual(next.manifest.offlineCacheIdentity, previous.manifest.offlineCacheIdentity);
    for (const sibling of assets.filter((path) => path !== leaf && path !== "/akshifha.js")) {
      assert.equal(next.manifest.fingerprints[sibling], previous.manifest.fingerprints[sibling]);
    }
    previous = next;
  }
  await assert.rejects(
    build(Object.keys(sources).filter((path) => path !== "akshifha-cases.js")),
    /requires fingerprinted dependency \/akshifha-cases\.js/u,
  );
});
