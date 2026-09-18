import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RIDDLE_ARABIA_SEO_PAGES } from "./riddlearabia-seo.mjs";
import { inspectFeaturedCollections } from "./content-review-featured-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(fs.readFileSync(path.join(root, "docs/content-review/featured-policy.json"), "utf8"));
const slugs = new Set(
  RIDDLE_ARABIA_SEO_PAGES
    .filter((page) => page.kind !== "games")
    .flatMap((page) => page.cards.map(([slug]) => slug)),
);
const cardsByCategory = Object.fromEntries(
  [...slugs].map((slug) => [slug, JSON.parse(fs.readFileSync(path.join(root, "data", `${slug}.json`), "utf8"))]),
);
const report = inspectFeaturedCollections(RIDDLE_ARABIA_SEO_PAGES, cardsByCategory, policy);
console.log(`Featured editorial checks: ${report.cardCount} selections across ${report.collectionCount} collections; ${report.errors.length} errors. Factual verification remains separate.`);
for (const error of report.errors) console.error(error);
if (report.errors.length) process.exitCode = 1;
