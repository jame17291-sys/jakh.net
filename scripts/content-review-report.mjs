import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildContentReviewReport } from "./content-review-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");

function optionValue(option) {
  const index = args.indexOf(option);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

const asOf = optionValue("--as-of") || new Date().toISOString().slice(0, 10);
const output = optionValue("--output");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalog.json"), "utf8"));
const entries = [];

for (const category of catalog.categories || []) {
  const cards = JSON.parse(
    fs.readFileSync(path.join(root, "data", `${category.slug}.json`), "utf8"),
  );
  if (!Array.isArray(cards)) throw new Error(`Invalid card data for ${category.slug}`);
  for (const card of cards) entries.push({ category: category.slug, card });
}

const report = buildContentReviewReport(entries, { asOf });
const metadataBySlug = new Map((catalog.categories || []).map((category) => [category.slug, category]));
for (const category of report.categories) {
  const metadata = metadataBySlug.get(category.slug);
  if (metadata?.reviewedQuestionCount !== category.reviewed) {
    report.errors.push({
      category: category.slug,
      id: null,
      error: `catalog reviewedQuestionCount is ${metadata?.reviewedQuestionCount}; expected ${category.reviewed}`,
    });
  }
  if (metadata?.scorableQuestionCount !== category.scorable) {
    report.errors.push({
      category: category.slug,
      id: null,
      error: `catalog scorableQuestionCount is ${metadata?.scorableQuestionCount}; expected ${category.scorable}`,
    });
  }
  if (Object.hasOwn(metadata || {}, "verifiedQuestionCount")) {
    report.errors.push({
      category: category.slug,
      id: null,
      error: "catalog still contains the misleading verifiedQuestionCount field",
    });
  }
}
report.summary.validationErrors = report.errors.length;

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (checkOnly && output) {
  throw new Error("--check is read-only and cannot be combined with --output");
} else if (output) {
  const target = path.resolve(root, output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized);
} else {
  process.stdout.write(serialized);
}

if (checkOnly && (report.errors.length || report.staleReviewedCards.length)) {
  if (output) {
    console.error(
      `Content review check failed with ${report.errors.length} validation error(s) `
      + `and ${report.staleReviewedCards.length} stale reviewed card(s).`,
    );
  }
  process.exitCode = 1;
}
