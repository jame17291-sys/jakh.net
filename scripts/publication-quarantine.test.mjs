import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildExpectedProductionQuarantine,
  isQuarantinedArtifactPath,
  isQuarantinedRequestPath,
  loadProductionQuarantine,
  normalizeQuarantineRequestPath,
  publicCardIndexProjection,
  publicCatalogProjection,
  publicSearchArtifacts,
} from "./publication-quarantine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedCategories = new Map([
  ["survival", 40],
  ["law-middle-east", 48],
  ["medical-questions", 100],
  ["pharmacy", 50],
  ["economics-and-finance", 40],
]);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

test("production quarantine is an exact, deterministic 278-card decision manifest", () => {
  const quarantine = loadProductionQuarantine(root);
  assert.deepEqual(quarantine.manifest, buildExpectedProductionQuarantine(root));
  assert.equal(quarantine.manifest.totalCards, 278);
  assert.equal(quarantine.cardIds.size, 278);
  assert.ok(quarantine.sensitiveTextFragments.size > 556);
  assert.equal(quarantine.sensitiveTextFragments.has("What is hypothermia?"), true);
  assert.equal(quarantine.sensitiveTextFragments.has("Water"), false);
  assert.deepEqual(
    new Map(quarantine.manifest.categories.map(({ slug, cardCount }) => [slug, cardCount])),
    expectedCategories,
  );
  for (const category of quarantine.manifest.categories) {
    assert.equal(new Set(category.cardIds).size, category.cardCount, category.slug);
  }

  const application = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const literal = application.match(/const QUARANTINED_CATEGORY_SLUGS = new Set\(\[([^\]]+)\]\);/u)?.[1] || "";
  const applicationSlugs = [...literal.matchAll(/'([a-z0-9-]+)'/gu)].map((match) => match[1]);
  assert.deepEqual(
    applicationSlugs,
    quarantine.manifest.categories.map(({ slug }) => slug),
    "app.js quarantine list drifted from the exact publication manifest",
  );
});

test("request quarantine normalization blocks encoded aliases and fails closed on ambiguous paths", () => {
  const { categorySlugs } = loadProductionQuarantine(root);
  for (const pathname of [
    "/%73urvival",
    "/survival%2ehtml",
    "/AR//TOPICS/%73URVIVAL//page/2/?card=1",
    "/ar/topics/survival.html",
    "/ar/topics/survival.html/archive",
    "/ar/topics/survival%2ehtml",
    "/data/%73urvival.json",
    "/data/survival%2ejson?old=1",
    "/data/survival.json/",
    "/data/survival.json/archive",
    "/data/%73urvival.json%2farchive",
    "/survival%3Fx=1",
    "/survival%23fragment",
    "/data/survival.json%3Fx=1",
    "/data/survival.json%23fragment",
    "/science%00/safe",
    "/safe/%252e%252e/survival",
    "/%25252573urvival",
    "/data/%ZZ.json",
  ]) {
    assert.equal(isQuarantinedRequestPath(pathname, categorySlugs), true, pathname);
  }
  assert.equal(isQuarantinedRequestPath("/survival-guide", categorySlugs), false);
  assert.equal(isQuarantinedRequestPath("/data/survival.json-safe", categorySlugs), false);
  assert.equal(isQuarantinedRequestPath("/science?next=/survival", categorySlugs), false);
  assert.equal(normalizeQuarantineRequestPath("/safe/%252e%252e/survival"), "/survival");
  assert.equal(normalizeQuarantineRequestPath("/%25252573urvival"), null);
  assert.equal(normalizeQuarantineRequestPath("/%ZZ"), null);
});

test("artifact quarantine derives held asset names and directories from the manifest", () => {
  const future = { categorySlugs: new Set(["future-held"]) };
  for (const relativePath of [
    "assets/future-held.svg",
    "assets/future-held/card.png",
    "assets/future-held/deep/card.webp",
  ]) assert.equal(isQuarantinedArtifactPath(relativePath, future), true, relativePath);
  assert.equal(isQuarantinedArtifactPath("assets/future-held-guide.svg", future), false);
  assert.equal(isQuarantinedArtifactPath("assets/science/card.webp", future), false);
  assert.equal(isQuarantinedArtifactPath("ar/topics/future-held.html", future), true);
});

test("public catalog, card index, and search projections expose exactly 51 categories and 3,275 cards", () => {
  const quarantine = loadProductionQuarantine(root);
  const fullCatalog = readJson("data/catalog.json");
  const publicCatalog = publicCatalogProjection(fullCatalog, quarantine);
  assert.equal(fullCatalog.categories.length, 56, "editorial category source changed");
  assert.equal(fullCatalog.site.totalQuestions, 3_553, "editorial card source changed");
  assert.equal(publicCatalog.categories.length, 51);
  assert.equal(publicCatalog.site.totalQuestions, 3_275);
  assert.equal(publicCatalog.site.publication.quarantinedQuestions, 278);
  for (const category of publicCatalog.categories) {
    assert.equal(quarantine.categorySlugs.has(category.slug), false);
    assert.equal((category.related || []).some((slug) => quarantine.categorySlugs.has(slug)), false);
  }
  for (const section of publicCatalog.sections) {
    assert.equal(section.members.some((slug) => quarantine.categorySlugs.has(slug)), false);
  }
  const categoryBySlug = new Map(publicCatalog.categories.map((category) => [category.slug, category]));
  const sectionTotals = new Map(publicCatalog.sections.map((section) => [
    section.key,
    {
      topics: section.members.length,
      questions: section.members.reduce(
        (total, slug) => total + Number(categoryBySlug.get(slug)?.count || 0),
        0,
      ),
    },
  ]));
  assert.deepEqual(sectionTotals, new Map([
    ["mind", { topics: 8, questions: 480 }],
    ["science", { topics: 9, questions: 730 }],
    ["tech", { topics: 11, questions: 420 }],
    ["world", { topics: 11, questions: 570 }],
    ["culture", { topics: 12, questions: 1_075 }],
  ]));
  assert.doesNotMatch(publicCatalog.sections.find(({ key }) => key === "science").description.en, /medicine|pharmacy/iu);
  assert.doesNotMatch(publicCatalog.sections.find(({ key }) => key === "world").description.en, /\blaw\b/iu);

  const publicIndex = publicCardIndexProjection(readJson("data/card-index.json"), quarantine);
  assert.equal(Object.keys(publicIndex).length, 3_275);
  for (const cardId of quarantine.cardIds) assert.equal(publicIndex[cardId], undefined, cardId);

  const search = publicSearchArtifacts({ catalog: fullCatalog, root, quarantine });
  for (const language of ["en", "ar"]) {
    const shard = JSON.parse(search.get(`data/search-index.${language}.json`));
    assert.equal(shard.total, 3_275);
    assert.equal(shard.categories.length, 51);
    assert.equal(shard.cards.length, 3_275);
    assert.equal(shard.cards.some((row) => quarantine.cardIds.has(row[1])), false);
  }
});
