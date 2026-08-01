import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildContentReviewReport,
  buildEvidenceCoverage,
  CONTENT_REVIEW_COMPLETE_HIGH_STAKES_TOTAL,
  CONTENT_REVIEW_COMPLETE_TOTAL,
} from "./content-review-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const completeGate = args.includes("--complete");

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
const evidencePath = path.join(root, "docs", "content-review", "evidence.json");
const evidenceStore = fs.existsSync(evidencePath)
  ? JSON.parse(fs.readFileSync(evidencePath, "utf8"))
  : null;
const evidenceCoverage = buildEvidenceCoverage(entries, evidenceStore, { asOf });
report.evidenceCoverage = evidenceCoverage;
for (const error of evidenceCoverage.validationErrors) {
  report.errors.push({
    category: null,
    id: null,
    error,
  });
}
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
if ((checkOnly || completeGate) && output) {
  throw new Error("--check and --complete are read-only and cannot be combined with --output");
} else if (output) {
  const target = path.resolve(root, output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serialized);
} else if (checkOnly || completeGate) {
  process.stdout.write(
    "Content review summary: "
    + `${report.summary.reviewed}/${report.summary.total} reviewed; `
    + `${evidenceCoverage.summary.evidenceComplete}/${evidenceCoverage.summary.total} evidence-complete; `
    + `${report.summary.highStakes.reviewed}/${report.summary.highStakes.total} high-stakes reviewed; `
    + `${report.errors.length} validation error(s); `
    + `${report.staleReviewedCards.length} stale; `
    + `${evidenceCoverage.summary.overdueMutable} overdue mutable.\n`,
  );
} else {
  process.stdout.write(serialized);
}

if (
  checkOnly
  && (
    report.errors.length
    || report.staleReviewedCards.length
    || evidenceCoverage.summary.overdueMutable
  )
) {
  console.error(
    `Content review check failed with ${report.errors.length} validation error(s), `
    + `${report.staleReviewedCards.length} stale reviewed card(s), and `
    + `${evidenceCoverage.summary.overdueMutable} overdue mutable card(s).`,
  );
  process.exitCode = 1;
}

if (completeGate) {
  const evidence = evidenceCoverage.summary;
  const complete = report.summary.total === CONTENT_REVIEW_COMPLETE_TOTAL
    && report.summary.reviewed === CONTENT_REVIEW_COMPLETE_TOTAL
    && report.summary.pending === 0
    && evidence.total === CONTENT_REVIEW_COMPLETE_TOTAL
    && evidence.reviewed === CONTENT_REVIEW_COMPLETE_TOTAL
    && evidence.pending === 0
    && evidence.evidenceComplete === CONTENT_REVIEW_COMPLETE_TOTAL
    && report.summary.highStakes.total === CONTENT_REVIEW_COMPLETE_HIGH_STAKES_TOTAL
    && report.summary.highStakes.reviewed === CONTENT_REVIEW_COMPLETE_HIGH_STAKES_TOTAL
    && report.summary.highStakes.pending === 0
    && evidence.highStakes.total === CONTENT_REVIEW_COMPLETE_HIGH_STAKES_TOTAL
    && evidence.highStakes.reviewed === CONTENT_REVIEW_COMPLETE_HIGH_STAKES_TOTAL
    && evidence.highStakes.evidenceComplete === CONTENT_REVIEW_COMPLETE_HIGH_STAKES_TOTAL
    && report.errors.length === 0
    && report.staleReviewedCards.length === 0
    && evidence.overdueMutable === 0;
  if (!complete) {
    console.error(
      "Content review completion gate failed: "
      + `reviewed ${report.summary.reviewed}/${CONTENT_REVIEW_COMPLETE_TOTAL}; `
      + `evidence-complete ${evidence.evidenceComplete}/${CONTENT_REVIEW_COMPLETE_TOTAL}; `
      + `pending ${report.summary.pending}; high-stakes reviewed `
      + `${report.summary.highStakes.reviewed}/${CONTENT_REVIEW_COMPLETE_HIGH_STAKES_TOTAL}; `
      + `high-stakes evidence-complete ${evidence.highStakes.evidenceComplete}/`
      + `${CONTENT_REVIEW_COMPLETE_HIGH_STAKES_TOTAL}; validation errors ${report.errors.length}; `
      + `stale ${report.staleReviewedCards.length}; overdue mutable ${evidence.overdueMutable}.`,
    );
    process.exitCode = 1;
  }
}
