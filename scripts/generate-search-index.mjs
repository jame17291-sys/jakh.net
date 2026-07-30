import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const target = path.join(dataDir, "search-index.json");
const checkOnly = process.argv.includes("--check");
const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, "catalog.json"), "utf8"));
const categories = [];
const cards = [];

for (const [categoryIndex, category] of (catalog.categories || []).entries()) {
  const source = JSON.parse(
    fs.readFileSync(path.join(dataDir, `${category.slug}.json`), "utf8"),
  );
  if (!Array.isArray(source)) throw new Error(`Invalid card data for ${category.slug}`);
  categories.push(category.slug);
  for (const card of source) {
    if (
      !card?.question?.en
      || !card?.question?.ar
      || !card?.answer?.en
      || !card?.answer?.ar
    ) {
      throw new Error(`Incomplete bilingual search data for ${category.slug}/${card?.id || "unknown"}`);
    }
    cards.push([
      categoryIndex,
      card.question.en,
      card.question.ar,
      card.answer.en,
      card.answer.ar,
    ]);
  }
}

const serialized = `${JSON.stringify({ version: 1, categories, cards })}\n`;
if (checkOnly) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current !== serialized) {
    console.error("data/search-index.json is stale. Run node scripts/generate-search-index.mjs.");
    process.exitCode = 1;
  } else {
    console.log(`Search index is current: ${cards.length} bilingual cards.`);
  }
} else {
  fs.writeFileSync(target, serialized);
  console.log(`Generated compact search index with ${cards.length} bilingual cards.`);
}
