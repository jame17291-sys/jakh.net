import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const checkOnly = process.argv.includes("--check");
const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, "catalog.json"), "utf8"));
const categories = [];
const cardsByLanguage = { en: [], ar: [] };

// These are raw transfer-size ceilings, not aspirational gzip figures. Keeping each
// language below this ceiling makes a search-open fetch materially smaller than the
// former combined bilingual index.
export const SEARCH_SHARD_MAX_BYTES = 800 * 1024;
export const SEARCH_SHARDS_COMBINED_MAX_BYTES = 1_500 * 1024;

for (const [categoryIndex, category] of (catalog.categories || []).entries()) {
  const source = JSON.parse(
    fs.readFileSync(path.join(dataDir, `${category.slug}.json`), "utf8"),
  );
  if (!Array.isArray(source)) throw new Error(`Invalid card data for ${category.slug}`);
  categories.push(category.slug);
  for (const card of source) {
    if (
      typeof card?.id !== "string"
      || !card.id
      || !card?.question?.en
      || !card?.question?.ar
      || !card?.answer?.en
      || !card?.answer?.ar
    ) {
      throw new Error(`Incomplete bilingual search data for ${category.slug}/${card?.id || "unknown"}`);
    }
    for (const language of ["en", "ar"]) {
      cardsByLanguage[language].push([
        categoryIndex,
        card.id,
        card.question[language],
        card.answer[language],
      ]);
    }
  }
}

const total = cardsByLanguage.en.length;
if (cardsByLanguage.ar.length !== total) throw new Error("Search shard totals do not match");
if (catalog.site?.totalQuestions !== total) {
  throw new Error(`Catalog total is ${catalog.site?.totalQuestions}; search source contains ${total}`);
}

const outputs = new Map();
const manifestShards = {};
let combinedBytes = 0;
for (const language of ["en", "ar"]) {
  const relativePath = `data/search-index.${language}.json`;
  const serialized = `${JSON.stringify({
    version: 2,
    language,
    total,
    categories,
    cards: cardsByLanguage[language],
  })}\n`;
  const bytes = Buffer.byteLength(serialized);
  if (bytes > SEARCH_SHARD_MAX_BYTES) {
    throw new Error(`${relativePath} is ${bytes} bytes; budget is ${SEARCH_SHARD_MAX_BYTES}`);
  }
  combinedBytes += bytes;
  outputs.set(relativePath, serialized);
  manifestShards[language] = {
    url: `/${relativePath}`,
    cards: cardsByLanguage[language].length,
    bytes,
    sha256: crypto.createHash("sha256").update(serialized).digest("hex"),
  };
}
if (combinedBytes > SEARCH_SHARDS_COMBINED_MAX_BYTES) {
  throw new Error(
    `Combined search shards are ${combinedBytes} bytes; budget is ${SEARCH_SHARDS_COMBINED_MAX_BYTES}`,
  );
}

outputs.set("data/search-index.json", `${JSON.stringify({
  version: 2,
  total,
  budgets: {
    maxShardBytes: SEARCH_SHARD_MAX_BYTES,
    maxCombinedBytes: SEARCH_SHARDS_COMBINED_MAX_BYTES,
  },
  shards: manifestShards,
})}\n`);

const stale = [];
for (const [relativePath, serialized] of outputs) {
  const target = path.join(root, relativePath);
  if (checkOnly) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
    if (current !== serialized) stale.push(relativePath);
  } else {
    fs.writeFileSync(target, serialized);
  }
}

if (checkOnly && stale.length) {
  console.error(
    `${stale.join(", ")} ${stale.length === 1 ? "is" : "are"} stale. `
    + "Run node scripts/generate-search-index.mjs.",
  );
  process.exitCode = 1;
} else {
  const action = checkOnly ? "current" : "generated";
  console.log(
    `Search indexes ${action}: ${total} cards per language; `
    + `${combinedBytes} combined raw bytes.`,
  );
}
