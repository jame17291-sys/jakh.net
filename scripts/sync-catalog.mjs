import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "data", "catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const maxExplicitAnswersPerLanguage = 8;

function normalizeVerifiedAnswer(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\u0610-\u061a\u0640\u064b-\u065f\u0670\u06d6-\u06ed]/gu, "")
    .replace(/[أإآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/\p{P}+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function conciseVerifiedAnswer(value) {
  const normalized = normalizeVerifiedAnswer(value);
  return normalized.length > 0
    && normalized.length <= 96
    && normalized.split(" ").length <= 14;
}

function acceptedAnswersAreValid(value) {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  for (const language of ["en", "ar"]) {
    const answers = value[language];
    if (answers === undefined) continue;
    if (
      !Array.isArray(answers)
      || answers.length > maxExplicitAnswersPerLanguage
      || answers.some((answer) => !conciseVerifiedAnswer(answer))
    ) return false;
    const normalized = answers.map(normalizeVerifiedAnswer);
    if (new Set(normalized).size !== normalized.length) return false;
  }
  return true;
}

function hasConciseVerifiedAnswer(card, language) {
  return conciseVerifiedAnswer(card?.answer?.[language])
    || (
      Array.isArray(card?.acceptedAnswers?.[language])
      && card.acceptedAnswers[language].some(conciseVerifiedAnswer)
    );
}

const categoriesBySlug = new Map(
  (catalog.categories || []).map((category) => [category.slug, category]),
);
const sectionBySlug = new Map();

for (const section of catalog.sections || []) {
  if (!section?.key || !section?.title?.en || !section?.title?.ar) {
    throw new Error("Every catalog section needs a key and bilingual title");
  }
  for (const slug of section.members || []) {
    if (!categoriesBySlug.has(slug)) {
      throw new Error(`Section ${section.key} references unknown category ${slug}`);
    }
    if (sectionBySlug.has(slug)) {
      throw new Error(
        `Category ${slug} belongs to both ${sectionBySlug.get(slug).key} and ${section.key}`,
      );
    }
    sectionBySlug.set(slug, section);
  }
}

for (const category of catalog.categories || []) {
  const section = sectionBySlug.get(category.slug);
  if (!section) throw new Error(`Category ${category.slug} has no section`);

  const source = JSON.parse(
    fs.readFileSync(path.join(root, "data", `${category.slug}.json`), "utf8"),
  );
  if (!Array.isArray(source)) throw new Error(`Invalid card data for ${category.slug}`);
  const cards = source;

  for (const card of cards) {
    if (!acceptedAnswersAreValid(card?.acceptedAnswers)) {
      throw new Error(`Invalid acceptedAnswers in ${category.slug}:${card?.id || "unknown"}`);
    }
  }

  const difficultyCounts = {};
  const topicCounts = new Map();
  for (const card of cards) {
    difficultyCounts[card.difficulty] = (difficultyCounts[card.difficulty] || 0) + 1;
    const topic = card.subcategory;
    if (!topic?.en?.trim()) continue;
    const key = topic.en.trim();
    if (!topicCounts.has(key)) {
      topicCounts.set(key, {
        en: key,
        ar: topic.ar?.trim() || key,
        count: 0,
      });
    }
    topicCounts.get(key).count += 1;
  }

  category.cluster_key = section.key;
  category.cluster = structuredClone(section.title);
  category.href = `/${category.slug}`;
  category.count = cards.length;
  category.verifiedQuestionCount = cards.filter((card) => (
    hasConciseVerifiedAnswer(card, "en")
    && hasConciseVerifiedAnswer(card, "ar")
  )).length;
  category.difficultyCounts = Object.fromEntries(
    ["easy", "medium", "hard", "very-advanced"]
      .filter((difficulty) => difficultyCounts[difficulty])
      .map((difficulty) => [difficulty, difficultyCounts[difficulty]]),
  );
  category.topics = [...topicCounts.values()].sort((left, right) => (
    right.count - left.count
    || left.en.localeCompare(right.en)
  ));
  const sectionIndex = section.members.indexOf(category.slug);
  const sectionPeers = section.members
    .slice(sectionIndex + 1)
    .concat(section.members.slice(0, sectionIndex))
    .filter((slug) => slug !== category.slug);
  const existingRelated = Array.isArray(category.related)
    ? category.related.filter((slug) => categoriesBySlug.has(slug) && slug !== category.slug)
    : [];
  category.related = [...new Set([...existingRelated, ...sectionPeers])].slice(0, 4);
  delete category.subcategories;
}

catalog.site.totalQuestions = [...categoriesBySlug.values()]
  .reduce((total, category) => total + category.count, 0);

const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
const current = fs.readFileSync(catalogPath, "utf8");
if (process.argv.includes("--check")) {
  if (current !== serialized) {
    console.error("data/catalog.json is stale; run node scripts/sync-catalog.mjs");
    process.exitCode = 1;
  } else {
    console.log(
      `Catalog is current: ${catalog.categories.length} categories, `
      + `${catalog.site.totalQuestions} cards.`,
    );
  }
} else {
  fs.writeFileSync(catalogPath, serialized);
  console.log(
    `Synced ${catalog.categories.length} categories and `
    + `${catalog.site.totalQuestions} cards into data/catalog.json.`,
  );
}
