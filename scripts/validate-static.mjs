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

function stableObjectJson(value) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value || {}).sort(([left], [right]) => left.localeCompare(right))),
  );
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
const cardIndexPath = path.join(root, "data", "card-index.json");
const cardIndex = fs.existsSync(cardIndexPath)
  ? JSON.parse(fs.readFileSync(cardIndexPath, "utf8"))
  : null;
const workerCardIndexPath = path.join(root, "worker", "src", "card-index.json");
const workerCardIndex = fs.existsSync(workerCardIndexPath)
  ? JSON.parse(fs.readFileSync(workerCardIndexPath, "utf8"))
  : null;
const catalogSlugs = new Set();
const categoriesBySlug = new Map();
const allCardIds = new Set();
const expectedCardIndex = {};
let expectedQuestionTotal = 0;

for (const category of catalog.categories || []) {
  if (!category.slug || catalogSlugs.has(category.slug)) fail(`catalog: invalid or duplicate slug "${category.slug}"`);
  catalogSlugs.add(category.slug);
  categoriesBySlug.set(category.slug, category);
  const expectedPage = path.join(root, category.href || "");
  const expectedData = path.join(root, "data", `${category.slug}.json`);
  if (!fs.existsSync(expectedPage)) fail(`catalog: missing page for ${category.slug}`);
  if (!fs.existsSync(expectedData)) fail(`catalog: missing data for ${category.slug}`);
}

const sectionKeys = new Set();
const sectionBySlug = new Map();
if ((catalog.sections || []).length !== 5) {
  fail(`catalog: expected 5 directory sections, found ${(catalog.sections || []).length}`);
}
for (const [index, section] of (catalog.sections || []).entries()) {
  const label = `catalog section ${index + 1}`;
  if (!section?.key || sectionKeys.has(section.key)) fail(`${label}: missing or duplicate key "${section?.key}"`);
  if (section?.key) sectionKeys.add(section.key);
  if (!section?.title?.en?.trim() || !section?.title?.ar?.trim()) fail(`${label}: incomplete bilingual title`);
  if (!section?.description?.en?.trim() || !section?.description?.ar?.trim()) {
    fail(`${label}: incomplete bilingual description`);
  }
  if (!Array.isArray(section?.members) || !section.members.length) {
    fail(`${label}: expected at least one category member`);
    continue;
  }
  for (const slug of section.members) {
    if (!catalogSlugs.has(slug)) fail(`${label}: unknown category member "${slug}"`);
    if (sectionBySlug.has(slug)) {
      fail(`${label}: category "${slug}" also belongs to section "${sectionBySlug.get(slug)?.key}"`);
    } else {
      sectionBySlug.set(slug, section);
    }
  }
}

for (const category of catalog.categories || []) {
  const section = sectionBySlug.get(category.slug);
  if (!section) {
    fail(`catalog: category "${category.slug}" is not assigned to a directory section`);
  } else {
    if (category.cluster_key !== section.key) {
      fail(`catalog: ${category.slug} cluster_key "${category.cluster_key}" does not match section "${section.key}"`);
    }
    if (stableObjectJson(category.cluster) !== stableObjectJson(section.title)) {
      fail(`catalog: ${category.slug} cluster title does not match section "${section.key}"`);
    }
  }
  if (!Array.isArray(category.related)) {
    fail(`catalog: ${category.slug} needs a related category list`);
  } else {
    const related = new Set();
    for (const slug of category.related) {
      if (slug === category.slug) fail(`catalog: ${category.slug} cannot relate to itself`);
      if (!catalogSlugs.has(slug)) fail(`catalog: ${category.slug} references unknown related category "${slug}"`);
      if (related.has(slug)) fail(`catalog: ${category.slug} repeats related category "${slug}"`);
      related.add(slug);
    }
  }
}

for (const file of dataFiles) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(root, "data", file), "utf8"));
  } catch (error) {
    fail(`data/${file}: invalid JSON: ${error.message}`);
    continue;
  }
  if (file === "catalog.json" || file === "card-index.json" || file === "search-index.json") continue;
  if (!Array.isArray(parsed)) {
    fail(`data/${file}: category files must be plain card arrays; metadata belongs in data/catalog.json`);
    continue;
  }
  const cards = parsed;
  const slug = file.replace(/\.json$/u, "");
  const metadata = categoriesBySlug.get(slug);
  if (!metadata) fail(`data/${file}: category is missing from catalog`);
  if (metadata?.count !== cards.length) fail(`data/${file}: catalog count ${metadata?.count} does not match ${cards.length}`);
  expectedQuestionTotal += cards.length;
  const difficultyCounts = {};
  const topicCounts = new Map();
  const topicEnglishByArabic = new Map();

  for (const [index, card] of cards.entries()) {
    const label = `data/${file} card ${index + 1}`;
    if (!card?.id || allCardIds.has(card.id)) fail(`${label}: missing or duplicate id "${card?.id}"`);
    if (card?.id) allCardIds.add(card.id);
    if (!["easy", "medium", "hard", "very-advanced"].includes(card?.difficulty)) {
      fail(`${label}: invalid difficulty "${card?.difficulty}"`);
    }
    if (card?.id && card?.difficulty) expectedCardIndex[card.id] = [slug, card.difficulty];
    if (card?.difficulty) difficultyCounts[card.difficulty] = (difficultyCounts[card.difficulty] || 0) + 1;
    for (const field of ["question", "answer"]) {
      if (!card?.[field]?.en?.trim() || !card?.[field]?.ar?.trim()) fail(`${label}: incomplete bilingual ${field}`);
    }
    const topicEn = card?.subcategory?.en?.trim();
    const topicAr = card?.subcategory?.ar?.trim();
    if (!topicEn || !topicAr) {
      fail(`${label}: incomplete bilingual subcategory`);
    } else {
      if (!topicCounts.has(topicEn)) {
        topicCounts.set(topicEn, {
          en: topicEn,
          ar: topicAr,
          count: 0,
        });
      } else if (topicCounts.get(topicEn).ar !== topicAr) {
        fail(`${label}: topic "${topicEn}" has inconsistent Arabic labels`);
      }
      if (topicEnglishByArabic.has(topicAr) && topicEnglishByArabic.get(topicAr) !== topicEn) {
        fail(`${label}: Arabic topic "${topicAr}" maps to inconsistent English labels`);
      } else {
        topicEnglishByArabic.set(topicAr, topicEn);
      }
      topicCounts.get(topicEn).count += 1;
    }
  }

  if (topicCounts.size > 10) {
    fail(`data/${file}: taxonomy has ${topicCounts.size} subcategories; maximum is 10`);
  }
  for (const topic of topicCounts.values()) {
    if (topic.count < 2) {
      fail(`data/${file}: subcategory "${topic.en}" has ${topic.count} card; minimum is 2`);
    }
  }

  const expectedDifficultyCounts = Object.fromEntries(
    ["easy", "medium", "hard", "very-advanced"]
      .filter((difficulty) => difficultyCounts[difficulty])
      .map((difficulty) => [difficulty, difficultyCounts[difficulty]]),
  );
  if (JSON.stringify(metadata?.difficultyCounts || {}) !== JSON.stringify(expectedDifficultyCounts)) {
    fail(`data/${file}: catalog difficulty counts are stale`);
  }
  const expectedTopics = [...topicCounts.values()].sort((left, right) => (
    right.count - left.count || left.en.localeCompare(right.en)
  ));
  if (JSON.stringify(metadata?.topics || []) !== JSON.stringify(expectedTopics)) {
    fail(`data/${file}: catalog topics are stale`);
  }
}

if (catalog.site?.totalQuestions !== expectedQuestionTotal) {
  fail(`catalog: site total ${catalog.site?.totalQuestions} does not match ${expectedQuestionTotal}`);
}

if (!cardIndex) {
  fail("data/card-index.json: missing generated card index");
} else if (stableObjectJson(cardIndex) !== stableObjectJson(expectedCardIndex)) {
  fail("data/card-index.json: generated card index is stale; run node scripts/generate-card-index.mjs");
}
if (!workerCardIndex) {
  fail("worker/src/card-index.json: missing generated card index");
} else if (stableObjectJson(workerCardIndex) !== stableObjectJson(expectedCardIndex)) {
  fail("worker/src/card-index.json: generated card index is stale; run node scripts/generate-card-index.mjs");
}

for (const file of ["app.js", "sw.js"]) {
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
let assetReferenceCount = 0;
for (const file of htmlFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  for (const match of source.matchAll(/\b(?:href|src)=["']((?:app\.js|styles\.css)(?:\?[^"']*)?)["']/giu)) {
    assetReferenceCount += 1;
    const version = match[1]?.match(/^(?:app\.js|styles\.css)\?v=(\d+)$/u)?.[1];
    if (!version) fail(`${file}: unversioned app/CSS reference "${match[1]}"`);
    else assetVersions.add(version);
  }
}
if (!assetReferenceCount) fail("HTML contains no app.js or styles.css references");
if (assetVersions.size !== 1) fail(`HTML asset versions are inconsistent: ${[...assetVersions].join(", ") || "none"}`);

const faviconPath = path.join(root, "favicon.ico");
if (!fs.existsSync(faviconPath)) {
  fail("favicon.ico: missing");
} else {
  const favicon = fs.readFileSync(faviconPath);
  if (favicon.length < 6 || favicon.readUInt16LE(0) !== 0 || favicon.readUInt16LE(2) !== 1) {
    fail("favicon.ico: invalid ICO header");
  } else {
    const count = favicon.readUInt16LE(4);
    const sizes = new Set();
    if (count < 3 || favicon.length < 6 + (count * 16)) fail("favicon.ico: expected at least three icon entries");
    for (let index = 0; index < count && favicon.length >= 6 + ((index + 1) * 16); index += 1) {
      const base = 6 + (index * 16);
      const width = favicon[base] || 256;
      const height = favicon[base + 1] || 256;
      const bytes = favicon.readUInt32LE(base + 8);
      const offset = favicon.readUInt32LE(base + 12);
      const pngSignature = favicon.subarray(offset, offset + 8);
      sizes.add(`${width}x${height}`);
      if (width !== height || offset + bytes > favicon.length) fail(`favicon.ico: invalid entry ${index + 1}`);
      if (!pngSignature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        fail(`favicon.ico: entry ${index + 1} is not a PNG-compressed icon`);
      }
    }
    for (const size of ["16x16", "32x32", "48x48"]) {
      if (!sizes.has(size)) fail(`favicon.ico: missing ${size} entry`);
    }
  }
}

async function validateServiceWorkerOfflineShell() {
  const source = fs.readFileSync(path.join(root, "sw.js"), "utf8");
  const listeners = new Map();
  const origin = "https://jakh.net";
  const stores = new Map();

  function keyOf(request, ignoreSearch = false) {
    const value = typeof request === "string" ? request : request.url;
    const url = new URL(value, origin);
    if (ignoreSearch) {
      url.search = "";
      url.hash = "";
    }
    return url.href;
  }

  class MemoryCache {
    constructor() {
      this.entries = new Map();
    }

    async add(request) {
      const url = new URL(typeof request === "string" ? request : request.url, origin);
      this.entries.set(url.href, new Response(`precache:${url.pathname}`));
    }

    async put(request, response) {
      this.entries.set(keyOf(request), response);
    }

    async match(request, options = {}) {
      const key = keyOf(request, options.ignoreSearch);
      if (!options.ignoreSearch) return this.entries.get(key);
      for (const [storedKey, response] of this.entries) {
        if (keyOf(storedKey, true) === key) return response;
      }
      return undefined;
    }
  }

  const fakeCaches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new MemoryCache());
      return stores.get(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
    async match(request, options = {}) {
      for (const cache of stores.values()) {
        const response = await cache.match(request, options);
        if (response) return response;
      }
      return undefined;
    },
  };

  const fakeSelf = {
    location: { origin },
    clients: { async claim() {} },
    skipWaiting() {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };

  const context = vm.createContext({
    URL,
    Response,
    Promise,
    caches: fakeCaches,
    fetch: async () => { throw new Error("offline"); },
    self: fakeSelf,
  });
  new vm.Script(source, { filename: "sw.js" }).runInContext(context);

  async function dispatchWithLifetime(type, event = {}) {
    let lifetime;
    listeners.get(type)?.({ ...event, waitUntil(value) { lifetime = value; } });
    if (lifetime) await lifetime;
  }

  async function dispatchFetch(url, mode) {
    let responsePromise;
    listeners.get("fetch")?.({
      request: { url: new URL(url, origin).href, mode },
      respondWith(value) { responsePromise = value; },
    });
    if (!responsePromise) throw new Error(`No response handler for ${url}`);
    return responsePromise;
  }

  try {
    await dispatchWithLifetime("install");
    const version = [...assetVersions][0] || "missing";
    const cases = [
      ["/?daily=1", "navigate", "precache:/"],
      ["/mind-lab.html?offline=1", "navigate", "precache:/mind-lab.html"],
      ["/play.html", "navigate", "precache:/play.html"],
      [`/app.js?v=${version}`, "same-origin", "precache:/app.js"],
      [`/styles.css?v=${version}`, "same-origin", "precache:/styles.css"],
    ];
    for (const [url, mode, expected] of cases) {
      const response = await dispatchFetch(url, mode);
      const body = await response.text();
      if (body !== expected) fail(`sw.js: offline ${url} returned "${body}" instead of "${expected}"`);
    }

    await fakeCaches.open("jakh-obsolete");
    await dispatchWithLifetime("activate");
    if ((await fakeCaches.keys()).includes("jakh-obsolete")) fail("sw.js: activate did not delete an obsolete cache");
  } catch (error) {
    fail(`sw.js: offline shell validation failed: ${error.message}`);
  }
}

await validateServiceWorkerOfflineShell();

if (failures.length) {
  console.error(`Static validation failed with ${failures.length} issue(s):`);
  for (const issue of failures) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(
  `Static validation passed: ${htmlFiles.length} pages, ${catalogSlugs.size} categories, ${allCardIds.size} cards.`,
);
