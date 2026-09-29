import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ILLUSTRATIONS } from "../site-illustrations.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalog.json"), "utf8"));
const failures = [];

// Section and introduction artwork uses two local WebP sizes. Original PNGs
// and superseded drafts are intentionally excluded from the deployed site.
for (const id of ILLUSTRATIONS) {
  for (const width of [480, 960]) {
    const relative = `assets/illustrations/${id}-${width}.webp`;
    if (!fs.existsSync(path.join(root, relative))) failures.push(`${relative}: missing responsive image`);
  }
}

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
    const withoutSections = directory.replace(/<section\b[^>]*class="directory-section-header"[\s\S]*?<\/section>/gu, "");
    if (/<img\b|category-card-bg|category-card-image|\bhas-art\b/u.test(withoutSections)) {
      failures.push(`${relative}: compact topic cards must not request artwork`);
    }
    const sectionImages = [...directory.matchAll(/<img\b[^>]*>/gu)].map(([tag]) => tag);
    if (sectionImages.length !== catalog.sections.length || sectionImages.some((tag) => (
      !tag.includes('class="ra-art ra-art-section"') || !tag.includes('loading="lazy"')
      || !tag.includes('width="960" height="640"') || !tag.includes('alt=""')
      || !tag.includes('srcset=') || !tag.includes('sizes=')
    ))) {
      failures.push(`${relative}: expected one responsive decorative image per section`);
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
  // question data; the compact introduction accent is generated statically.
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

console.log(`Images valid: ${ILLUSTRATIONS.length} responsive illustrations, ${(catalog.categories || []).length} canonical SVG assets; ${generatedFiles.length} directory/topic pages with compact text cards and no legacy media.`);
