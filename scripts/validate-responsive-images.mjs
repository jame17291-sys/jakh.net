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
  "ar/mind-lab/index.html",
  ...(catalog.categories || []).flatMap(({ slug }) => [
    `${slug}.html`,
    `ar/topics/${slug}/index.html`,
  ]),
];
for (const relative of generatedFiles) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) {
    failures.push(`${relative}: missing generated topic or directory page`);
    continue;
  }
  const html = fs.readFileSync(target, "utf8");
  if (/assets\/backgrounds(?:_new)?\//u.test(html)) failures.push(`${relative}: references obsolete category media`);
  for (const category of catalog.categories || []) {
    if (html.includes(`/assets/${category.slug}.svg`)) {
      failures.push(`${relative}: unnecessarily loads ${category.slug} artwork on a compact question route`);
    }
  }
  if (relative === "mind-lab.html" || relative === "ar/mind-lab/index.html") {
    const directory = html.match(/<!-- SEO:DIRECTORY:START -->([\s\S]*?)<!-- SEO:DIRECTORY:END -->/u)?.[1] || "";
    if (!directory) failures.push(`${relative}: missing no-script topic directory`);
    if (/<img\b|category-card-bg|category-card-image|\bhas-art\b/u.test(directory)) {
      failures.push(`${relative}: compact topic directory must not request card artwork`);
    }
    const cards = [...directory.matchAll(/<a class="category-card compact-topic-card" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)];
    if (cards.length !== (catalog.categories || []).length || new Set(cards.map(([, href]) => href)).size !== cards.length) {
      failures.push(`${relative}: expected one compact no-script link per source topic`);
    }
    for (const category of catalog.categories || []) {
      const expected = relative.startsWith("ar/") ? `/ar/topics/${category.slug}/` : `/${category.slug}`;
      if (!cards.some(([, href]) => href === expected)) failures.push(`${relative}: missing compact topic link ${expected}`);
    }
    continue;
  }

  // Topic pages prioritize the question grid. The category binding loads its
  // question data, not the previous decorative hero illustration.
  const category = (catalog.categories || []).find(({ slug }) => (
    relative === `${slug}.html` || relative === `ar/topics/${slug}/index.html`
  ));
  if (category) {
    if (!new RegExp(`<body\\b[^>]*\\bdata-category="${category.slug}"`, "u").test(html)) {
      failures.push(`${relative}: missing category binding for question data`);
    }
    if (/<img\b[^>]*\bid="categoryImage"/u.test(html)) {
      failures.push(`${relative}: obsolete dynamic category illustration mount`);
    }
    if (!/<div\b[^>]*\bid="cardGrid"/u.test(html)) {
      failures.push(`${relative}: missing question grid`);
    }
    if (!/<script\b[^>]*\bsrc="\/app\.js\?v=/u.test(html)) {
      failures.push(`${relative}: missing application runtime for question practice`);
    }
  }
}

if (failures.length) {
  console.error(`Unified category image validation failed with ${failures.length} issue(s):`);
  for (const issue of failures) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Unified category images valid: ${(catalog.categories || []).length} deterministic 640x420 SVG assets; ${generatedFiles.length} compact directory/topic pages without decorative artwork or legacy media requests.`);
