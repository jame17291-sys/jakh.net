import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function load(relativePath) {
  return JSON.parse(read(relativePath));
}

function loadCorpus() {
  const catalog = load("data/catalog.json");
  const categories = (catalog.categories || []).map(category => category.slug);
  const expected = { en: [], ar: [] };
  for (const [categoryIndex, slug] of categories.entries()) {
    const topics = catalog.categories[categoryIndex].topics || [];
    for (const card of load(`data/${slug}.json`)) {
      const subtopic = topics.findIndex(topic => topic.en === card.subcategory.en);
      assert.ok(subtopic >= 0, `${card.id}: subtopic is listed in the catalog`);
      assert.equal(topics[subtopic].ar, card.subcategory.ar, `${card.id}: Arabic subtopic matches the catalog`);
      for (const language of ["en", "ar"]) {
        expected[language].push([
          categoryIndex,
          card.id,
          card.question[language],
          card.answer[language],
          subtopic,
        ]);
      }
    }
  }
  return { catalog, categories, expected };
}

function searchRuntime() {
  const source = read("search-leaderboard.js");
  const start = source.indexOf("function normalizeGlobalSearchText(");
  const end = source.indexOf("\nexport function createSearchLeaderboard(", start);
  assert.ok(start >= 0 && end > start, "global-search ranking functions must remain extractable");
  const context = vm.createContext({});
  const runtimeSource = source.slice(start, end).replaceAll("export function ", "function ");
  vm.runInContext(
    `${runtimeSource}\n`
    + "globalThis.searchRuntime = { normalizeGlobalSearchText, rankGlobalSearch };",
    context,
  );
  return context.searchRuntime;
}

test("language shards exactly cover the 4,103-card corpus within explicit byte budgets", () => {
  const { catalog, categories, expected } = loadCorpus();
  const manifestText = read("data/search-index.json");
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.version, 3);
  assert.equal(manifest.total, 4_103);
  assert.equal(catalog.site.totalQuestions, 4_103);
  assert.ok(Buffer.byteLength(manifestText) < 1_024, "manifest should not contain card content");

  let combinedBytes = 0;
  for (const language of ["en", "ar"]) {
    const relativePath = `data/search-index.${language}.json`;
    const serialized = read(relativePath);
    const shard = JSON.parse(serialized);
    const bytes = Buffer.byteLength(serialized);
    combinedBytes += bytes;
    assert.equal(shard.version, 3);
    assert.equal(shard.language, language);
    assert.equal(shard.total, 4_103);
    assert.deepEqual(shard.categories, categories);
    assert.deepEqual(shard.cards, expected[language]);
    assert.equal(new Set(shard.cards.map(row => row[1])).size, 4_103);
    assert.equal(manifest.shards[language].url, `/${relativePath}`);
    assert.equal(manifest.shards[language].cards, 4_103);
    assert.equal(manifest.shards[language].bytes, bytes);
    assert.equal(
      manifest.shards[language].sha256,
      crypto.createHash("sha256").update(serialized).digest("hex"),
    );
    assert.ok(bytes <= manifest.budgets.maxShardBytes, `${language} shard exceeds its raw-byte budget`);
    assert.equal(fs.statSync(path.join(dataDir, `search-index.${language}.json`)).size, bytes);
  }
  assert.ok(combinedBytes <= manifest.budgets.maxCombinedBytes);
});

test("ranking is language-local, deterministic, and returns every hit before the UI limit", () => {
  const { rankGlobalSearch } = searchRuntime();
  const categories = [{ slug: "history", title: { en: "History", ar: "التاريخ" } }];
  const index = {
    categories: ["history"],
    cards: [
      [0, "question-exact", "Exact target", "Other answer"],
      [0, "answer-exact", "A target appears here", "Exact target"],
      [0, "prefix-only", "Exact target with a suffix", "Unrelated"],
      ...Array.from({ length: 40 }, (_, indexValue) => (
        [0, `common-${String(indexValue).padStart(2, "0")}`, `The common result ${indexValue}`, "Example"]
      )),
    ],
  };
  const exactHits = rankGlobalSearch(index, categories, "Exact target", "en");
  assert.deepEqual(Array.from(exactHits.slice(0, 3), hit => hit.id), [
    "question-exact",
    "answer-exact",
    "prefix-only",
  ]);
  const answerOnly = rankGlobalSearch({
    categories: ["history"],
    cards: [
      [0, "answer-exact", "A loosely related phrase", "Answer target"],
      [0, "question-prefix", "Answer target with suffix", "Other"],
    ],
  }, categories, "Answer target", "en");
  assert.equal(answerOnly[0].id, "answer-exact", "an exact answer must beat a non-exact question");
  assert.equal(rankGlobalSearch(index, categories, "the", "en").length, 41);
});

test("results carry the card's subtopic and can be found by it", () => {
  const { rankGlobalSearch } = searchRuntime();
  const categories = [{
    slug: "tv-shows-trivia",
    title: { en: "TV Shows Trivia", ar: "مسلسلات" },
    topics: [{ en: "Breaking Bad", ar: "بريكينغ باد" }, { en: "The Wire", ar: "ذا واير" }],
  }];
  const index = {
    categories: ["tv-shows-trivia"],
    cards: [
      [0, "tv-1", "Who plays William Rawls?", "John Doman", 1],
      [0, "tv-2", "Who is Heisenberg?", "Walter White", 0],
    ],
  };
  const byQuestion = rankGlobalSearch(index, categories, "William Rawls", "en");
  assert.equal(byQuestion[0].subtopic, "The Wire");
  assert.deepEqual(Array.from(rankGlobalSearch(index, categories, "The Wire", "en"), hit => hit.id), ["tv-1"]);
  const arabic = rankGlobalSearch({ ...index, cards: [[0, "tv-1", "مين يلعب دور ويليام رولز؟", "جون دومان", 1]] }, categories, "ذا واير", "ar");
  assert.equal(arabic[0].subtopic, "ذا واير");

  const featureSource = read("search-leaderboard.js");
  assert.match(featureSource, /payload\?\.version !== 3/u);
  assert.match(featureSource, /row\.length === 5/u);
  assert.match(featureSource, /class="gs-result-subtopic"/u);
});

test("Arabic normalization and the runtime loader remain shard-specific", () => {
  const { normalizeGlobalSearchText, rankGlobalSearch } = searchRuntime();
  assert.equal(normalizeGlobalSearchText("إِجَابَةٌ", "ar"), "اجابة");
  const categories = [{ slug: "example", title: { en: "Example", ar: "أمثلة" } }];
  const hits = rankGlobalSearch({
    categories: ["example"],
    cards: [[0, "arabic-1", "مَا هِيَ الإِجَابَةُ؟", "الإِجَابَةُ"]],
  }, categories, "ما هي الاجابة", "ar");
  assert.equal(hits[0].id, "arabic-1");

  const featureSource = read("search-leaderboard.js");
  assert.match(featureSource, /fetchJson\(`\/data\/search-index\.\$\{language\}\.json`\)/u);
  assert.doesNotMatch(featureSource, /fetchJson\(['"]\/data\/search-index\.json['"]\)/u);
  assert.match(featureSource, /\?card=\$\{encodeURIComponent\(id\)\}/u);
});
