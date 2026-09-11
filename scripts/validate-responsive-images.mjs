import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalog.json"), "utf8"));
const failures = [];

for (const category of catalog.categories || []) {
  const relative = `assets/${category.slug}.svg`;
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) {
    failures.push(`${relative}: missing unified category illustration`);
    continue;
  }
  const svg = fs.readFileSync(target, "utf8");
  if (!/data-jakh-category-art="v1"/u.test(svg)) failures.push(`${relative}: missing unified-art marker`);
  if (!/width="640" height="420" viewBox="0 0 640 420"/u.test(svg)) {
    failures.push(`${relative}: expected the standard 640x420 view box`);
  }
}

for (const obsolete of ["assets/backgrounds", "assets/backgrounds_new"]) {
  if (fs.existsSync(path.join(root, obsolete))) failures.push(`${obsolete}: obsolete media directory still exists`);
}

const generatedFiles = [
  "mind-lab.html",
  ...(catalog.categories || []).flatMap(({ slug }) => [
    `${slug}.html`,
    `ar/topics/${slug}/index.html`,
  ]),
];
for (const relative of generatedFiles) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) continue;
  const html = fs.readFileSync(target, "utf8");
  if (/assets\/backgrounds(?:_new)?\//u.test(html)) failures.push(`${relative}: references obsolete category media`);
  if (relative === "mind-lab.html") {
    for (const category of catalog.categories || []) {
      const expected = `/assets/${category.slug}.svg`;
      if (!html.includes(expected)) failures.push(`${relative}: missing ${expected}`);
    }
    continue;
  }

  // Topic pages are deliberately noindex application shells in the fresh SEO
  // architecture. Their illustration is attached by app.js from data-category,
  // rather than copied into 112 otherwise-identical HTML documents.
  const category = (catalog.categories || []).find(({ slug }) => (
    relative === `${slug}.html` || relative === `ar/topics/${slug}/index.html`
  ));
  if (category) {
    if (!new RegExp(`<body\\b[^>]*\\bdata-category="${category.slug}"`, "u").test(html)) {
      failures.push(`${relative}: missing category binding for dynamic illustration`);
    }
    if (!/<img\b[^>]*\bid="categoryImage"/u.test(html)) {
      failures.push(`${relative}: missing dynamic category illustration mount`);
    }
    if (!/<script\b[^>]*\bsrc="\/app\.js\?v=/u.test(html)) {
      failures.push(`${relative}: missing application runtime for dynamic illustration`);
    }
  }
}

if (failures.length) {
  console.error(`Unified category image validation failed with ${failures.length} issue(s):`);
  for (const issue of failures) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Unified category images valid: ${(catalog.categories || []).length} deterministic 640x420 SVG illustrations and no legacy media references.`);
