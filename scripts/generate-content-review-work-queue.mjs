import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildContentReviewWorkQueue,
  CONTENT_REVIEW_COMPLETE_HIGH_STAKES_TOTAL,
  CONTENT_REVIEW_COMPLETE_TOTAL,
  CONTENT_WORK_PACKET_TOTAL,
} from "./content-review-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const target = path.join(root, "docs", "content-review", "work-queue.json");

function optionValue(option) {
  const index = args.indexOf(option);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalog.json"), "utf8"));
const evidence = JSON.parse(
  fs.readFileSync(path.join(root, "docs", "content-review", "evidence.json"), "utf8"),
);
const entries = [];
for (const category of catalog.categories || []) {
  const cards = JSON.parse(
    fs.readFileSync(path.join(root, "data", `${category.slug}.json`), "utf8"),
  );
  if (!Array.isArray(cards)) throw new Error(`Invalid card data for ${category.slug}`);
  for (const card of cards) entries.push({ category: category.slug, card });
}

let persistedAsOf = null;
if (checkOnly && fs.existsSync(target)) {
  try {
    persistedAsOf = JSON.parse(fs.readFileSync(target, "utf8")).asOf || null;
  } catch {
    // The byte comparison below will report malformed or stale output.
  }
}
const asOf = optionValue("--as-of")
  || persistedAsOf
  || new Date().toISOString().slice(0, 10);
const queue = buildContentReviewWorkQueue(entries, evidence, {
  asOf,
  catalogCategories: catalog.categories || [],
});

if (queue.summary.cards !== CONTENT_REVIEW_COMPLETE_TOTAL) {
  throw new Error(
    `Work queue has ${queue.summary.cards} cards; closure contract requires ${CONTENT_REVIEW_COMPLETE_TOTAL}`,
  );
}
if (queue.summary.highStakes.total !== CONTENT_REVIEW_COMPLETE_HIGH_STAKES_TOTAL) {
  throw new Error(
    `Work queue has ${queue.summary.highStakes.total} high-stakes cards; `
    + `closure contract requires ${CONTENT_REVIEW_COMPLETE_HIGH_STAKES_TOTAL}`,
  );
}
if (queue.summary.packets !== CONTENT_WORK_PACKET_TOTAL) {
  throw new Error(
    `Work queue has ${queue.summary.packets} packets; expected ${CONTENT_WORK_PACKET_TOTAL}`,
  );
}
if (queue.validationErrors.length) {
  throw new Error(`Evidence store has ${queue.validationErrors.length} validation error(s)`);
}

const serialized = `${JSON.stringify(queue, null, 2)}\n`;
if (checkOnly) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (current !== serialized) {
    console.error(
      "docs/content-review/work-queue.json is stale. "
      + "Run node scripts/generate-content-review-work-queue.mjs.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Content review work queue is current: ${queue.summary.packets} packets, `
      + `${queue.summary.cards} cards.`,
    );
  }
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized);
  console.log(
    `Generated ${queue.summary.packets} content-review packets for ${queue.summary.cards} cards.`,
  );
}
