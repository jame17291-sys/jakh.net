import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const htmlFiles = fs.readdirSync(root).filter((name) => name.endsWith(".html")).sort();
const dataFiles = fs.readdirSync(path.join(root, "data")).filter((name) => name.endsWith(".json")).sort();
const localReference = /\b(?:href|src)=["']([^"'<>]+)["']/giu;
const idAttribute = /\bid=["']([^"']+)["']/giu;
const inlineScript = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/giu;

function fail(message) {
  failures.push(message);
}

function localPath(reference) {
  if (
    !reference
    || reference.startsWith("#")
    || reference.startsWith("data:")
    || reference.startsWith("mailto:")
    || reference.startsWith("tel:")
    || reference.startsWith("javascript:")
    || /^[a-z][a-z0-9+.-]*:\/\//iu.test(reference)
  ) return null;
  const clean = decodeURIComponent(reference.split(/[?#]/u)[0] || "");
  if (!clean) return null;
  return path.join(root, clean === "/" ? "index.html" : clean.replace(/^\/+/u, ""));
}

for (const file of htmlFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const ids = new Set();
  for (const match of source.matchAll(idAttribute)) {
    const id = match[1];
    if (!id) continue;
    if (ids.has(id)) fail(`${file}: duplicate id "${id}"`);
    ids.add(id);
  }

  for (const match of source.matchAll(localReference)) {
    const resolved = localPath(match[1] || "");
    if (resolved && !fs.existsSync(resolved)) {
      fail(`${file}: missing local reference ${path.relative(root, resolved)}`);
    }
  }

  let scriptIndex = 0;
  for (const match of source.matchAll(inlineScript)) {
    const attributes = match[1] || "";
    const type = attributes.match(/\btype=["']([^"']+)["']/iu)?.[1]?.toLowerCase();
    if (type && type !== "text/javascript" && type !== "application/javascript" && type !== "module") continue;
    const code = match[2]?.trim();
    if (!code) continue;
    scriptIndex += 1;
    try {
      new vm.Script(code, { filename: `${file}:inline-${scriptIndex}` });
    } catch (error) {
      fail(`${file}: invalid inline script ${scriptIndex}: ${error.message}`);
    }
  }
}

const catalogPath = path.join(root, "data", "catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const catalogSlugs = new Set();
const allCardIds = new Set();

for (const category of catalog.categories || []) {
  if (!category.slug || catalogSlugs.has(category.slug)) fail(`catalog: invalid or duplicate slug "${category.slug}"`);
  catalogSlugs.add(category.slug);
  const expectedPage = path.join(root, category.href || "");
  const expectedData = path.join(root, "data", `${category.slug}.json`);
  if (!fs.existsSync(expectedPage)) fail(`catalog: missing page for ${category.slug}`);
  if (!fs.existsSync(expectedData)) fail(`catalog: missing data for ${category.slug}`);
}

for (const file of dataFiles) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(root, "data", file), "utf8"));
  } catch (error) {
    fail(`data/${file}: invalid JSON: ${error.message}`);
    continue;
  }
  if (file === "catalog.json") continue;
  const cards = Array.isArray(parsed) ? parsed : parsed.cards;
  if (!Array.isArray(cards)) {
    fail(`data/${file}: expected an array of cards`);
    continue;
  }
  const slug = file.replace(/\.json$/u, "");
  const metadata = (catalog.categories || []).find((category) => category.slug === slug);
  if (!metadata) fail(`data/${file}: category is missing from catalog`);
  if (metadata?.count !== cards.length) fail(`data/${file}: catalog count ${metadata?.count} does not match ${cards.length}`);

  for (const [index, card] of cards.entries()) {
    const label = `data/${file} card ${index + 1}`;
    if (!card?.id || allCardIds.has(card.id)) fail(`${label}: missing or duplicate id "${card?.id}"`);
    if (card?.id) allCardIds.add(card.id);
    if (!["easy", "medium", "hard", "very-advanced"].includes(card?.difficulty)) {
      fail(`${label}: invalid difficulty "${card?.difficulty}"`);
    }
    for (const field of ["question", "answer"]) {
      if (!card?.[field]?.en?.trim() || !card?.[field]?.ar?.trim()) fail(`${label}: incomplete bilingual ${field}`);
    }
    if (card?.subcategory && (!card.subcategory.en?.trim() || !card.subcategory.ar?.trim())) {
      fail(`${label}: incomplete bilingual subcategory`);
    }
  }
}

for (const file of ["app.js", "sw.js", "fluid-shader.js"]) {
  try {
    new vm.Script(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
  } catch (error) {
    fail(`${file}: invalid JavaScript: ${error.message}`);
  }
}

const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
if (!appSource.includes("https://api.jakh.net")) fail("app.js: production API origin is not configured");
if (/fetch\(\s*["']\/api\//u.test(appSource)) fail("app.js: stale same-origin API fetch remains");

const assetVersions = new Set();
for (const file of htmlFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  for (const match of source.matchAll(/(?:app\.js|styles\.css)\?v=(\d+)/gu)) assetVersions.add(match[1]);
}
if (assetVersions.size !== 1) fail(`HTML asset versions are inconsistent: ${[...assetVersions].join(", ") || "none"}`);

if (failures.length) {
  console.error(`Static validation failed with ${failures.length} issue(s):`);
  for (const issue of failures) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(
  `Static validation passed: ${htmlFiles.length} pages, ${catalogSlugs.size} categories, ${allCardIds.size} cards.`,
);
