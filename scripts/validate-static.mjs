import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  conciseScorableAnswer,
  hasScorableAnswer,
  normalizeScorableAnswer,
  reviewValidationErrors,
} from "./content-review-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const maxExplicitAnswersPerLanguage = 8;
const ignoredHtmlDirectories = new Set([
  ".git",
  ".wrangler",
  "_site",
  "coverage",
  "dist",
  "node_modules",
]);

function discoverHtmlFiles(directory = root) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredHtmlDirectories.has(entry.name)) {
        files.push(...discoverHtmlFiles(path.join(directory, entry.name)));
      }
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      files.push(path.relative(root, path.join(directory, entry.name)).split(path.sep).join("/"));
    }
  }
  return files;
}

const htmlFiles = discoverHtmlFiles().sort();
const dataFiles = fs.readdirSync(path.join(root, "data")).filter((name) => name.endsWith(".json")).sort();
const localReference = /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/giu;
const idAttribute = /\sid\s*=\s*["']([^"']+)["']/giu;
const inlineScript = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/giu;
const inlineEventHandler = /<[a-z][^>]*?(?:\s|\/)(on[a-z][a-z0-9:.-]*)\s*=/giu;

function fail(message) {
  failures.push(message);
}

function stableObjectJson(value) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value || {}).sort(([left], [right]) => left.localeCompare(right))),
  );
}

function decodeUrlCodePoint(digits, radix) {
  const codePoint = Number.parseInt(digits, radix);
  if (
    !Number.isInteger(codePoint)
    || codePoint < 0
    || codePoint > 0x10FFFF
    || (codePoint >= 0xD800 && codePoint <= 0xDFFF)
  ) return "\uFFFD";
  return String.fromCodePoint(codePoint);
}

function decodeUrlCharacterReferences(reference) {
  return String(reference)
    .replace(/&#x([0-9a-f]+);?/giu, (_, digits) => decodeUrlCodePoint(digits, 16))
    .replace(/&#([0-9]+);?/gu, (_, digits) => decodeUrlCodePoint(digits, 10))
    .replace(/&colon;/giu, ":")
    .replace(/&(?:tab|newline);/giu, "");
}

function isJavascriptUrl(reference) {
  return decodeUrlCharacterReferences(reference)
    .replace(/[\u0000-\u0020\u007f]+/gu, "")
    .toLowerCase()
    .startsWith("javascript:");
}

function localPath(reference, sourceFile) {
  if (
    !reference
    || reference.startsWith("#")
    || reference.startsWith("data:")
    || reference.startsWith("mailto:")
    || reference.startsWith("tel:")
    || reference.startsWith("//")
    || /^[a-z][a-z0-9+.-]*:/iu.test(reference)
  ) return null;
  let clean;
  try {
    clean = decodeURIComponent(reference.split(/[?#]/u)[0] || "");
  } catch {
    return { invalid: true, candidates: [] };
  }
  if (!clean) return null;
  const isRootRelative = clean.startsWith("/");
  const base = isRootRelative ? root : path.dirname(path.join(root, sourceFile));
  const route = isRootRelative ? clean.replace(/^\/+/u, "") : clean;
  const target = path.resolve(base, route || ".");
  const rootPrefix = `${root}${path.sep}`;
  if (target !== root && !target.startsWith(rootPrefix)) {
    return { invalid: true, candidates: [target] };
  }

  const candidates = [];
  if (!route || clean.endsWith("/")) {
    candidates.push(path.join(target, "index.html"));
  } else {
    candidates.push(target);
    if (!path.extname(target)) {
      candidates.push(`${target}.html`);
      candidates.push(path.join(target, "index.html"));
    }
  }
  const resolved = candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  return { invalid: false, resolved, candidates };
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

  for (const match of source.matchAll(inlineEventHandler)) {
    fail(`${file}: inline event handler "${match[1]}" is forbidden`);
  }

  for (const match of source.matchAll(localReference)) {
    const reference = match[1] ?? match[2] ?? match[3] ?? "";
    if (isJavascriptUrl(reference)) {
      fail(`${file}: JavaScript URL is forbidden in "${reference}"`);
      continue;
    }
    const resolution = localPath(reference, file);
    if (resolution?.invalid) {
      fail(`${file}: invalid local reference "${reference}"`);
    } else if (resolution && !resolution.resolved) {
      const tried = resolution.candidates
        .map((candidate) => path.relative(root, candidate).split(path.sep).join("/"))
        .join(" or ");
      fail(`${file}: missing local reference "${reference}" (tried ${tried})`);
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
  if (Object.hasOwn(category, "verifiedQuestionCount")) {
    fail(`catalog: ${category.slug} uses misleading legacy field verifiedQuestionCount`);
  }
  catalogSlugs.add(category.slug);
  categoriesBySlug.set(category.slug, category);
  const expectedHref = `/${category.slug}`;
  if (category.href !== expectedHref) {
    fail(`catalog: ${category.slug} href must be "${expectedHref}", found "${category.href}"`);
  }
  const expectedPage = path.join(root, `${category.slug}.html`);
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
  if (
    file === "catalog.json"
    || file === "card-index.json"
    || /^search-index(?:\.(?:en|ar))?\.json$/u.test(file)
  ) continue;
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
  let scorableQuestionCount = 0;
  let reviewedQuestionCount = 0;
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
    for (const error of reviewValidationErrors(card?.review, slug)) {
      fail(`${label}: ${error}`);
    }
    if (card?.review?.status === "reviewed") reviewedQuestionCount += 1;
    if (card?.acceptedAnswers !== undefined) {
      if (
        !card.acceptedAnswers
        || typeof card.acceptedAnswers !== "object"
        || Array.isArray(card.acceptedAnswers)
      ) {
        fail(`${label}: acceptedAnswers must be a bilingual object`);
      } else {
        for (const language of ["en", "ar"]) {
          const answers = card.acceptedAnswers[language];
          if (answers === undefined) continue;
          if (!Array.isArray(answers)) {
            fail(`${label}: acceptedAnswers.${language} must be an array`);
          } else if (answers.length > maxExplicitAnswersPerLanguage) {
            fail(`${label}: acceptedAnswers.${language} exceeds ${maxExplicitAnswersPerLanguage} entries`);
          } else if (answers.some((answer) => !conciseScorableAnswer(answer))) {
            fail(`${label}: acceptedAnswers.${language} entries must be at most 96 characters and 14 words`);
          } else {
            const normalized = answers.map(normalizeScorableAnswer);
            if (new Set(normalized).size !== normalized.length) {
              fail(`${label}: acceptedAnswers.${language} contains duplicate normalized answers`);
            }
          }
        }
      }
    }
    if (
      hasScorableAnswer(card, "en")
      && hasScorableAnswer(card, "ar")
    ) scorableQuestionCount += 1;
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
  if (metadata?.scorableQuestionCount !== scorableQuestionCount) {
    fail(`data/${file}: catalog scorable question count is stale`);
  }
  if (metadata?.reviewedQuestionCount !== reviewedQuestionCount) {
    fail(`data/${file}: catalog reviewed question count is stale`);
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
const directorySearchStart = appSource.indexOf("function renderCategoryDirectory()");
const directorySearchEnd = appSource.indexOf("\nfunction renderClusterTabBar()", directorySearchStart);
if (directorySearchStart < 0 || directorySearchEnd < 0) {
  fail("app.js: category directory search renderer is missing");
} else {
  const directorySearchSource = appSource.slice(directorySearchStart, directorySearchEnd);
  if (/\b(?:section\.(?:title|description)|meta\.cluster)\b/u.test(directorySearchSource)) {
    fail("app.js: category search must not match shared section metadata");
  }
}

const assetVersions = new Map();
let assetReferenceCount = 0;
const versionedRuntimeAsset = "app\\.js|styles\\.css|site-i18n\\.js|game-i18n\\.js|privacy-consent\\.js|privacy-page\\.js";
const versionedRuntimeReference = new RegExp(
  `\\b(?:href|src)=["']((?:/)?(?:${versionedRuntimeAsset})(?:\\?[^"']*)?)["']`,
  "giu",
);
const parsedVersionedRuntimeReference = new RegExp(
  `^/?(${versionedRuntimeAsset})\\?v=(\\d+)$`,
  "u",
);
for (const file of htmlFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  for (const match of source.matchAll(versionedRuntimeReference)) {
    assetReferenceCount += 1;
    const parsed = match[1]?.match(parsedVersionedRuntimeReference);
    if (!parsed) {
      fail(`${file}: unversioned runtime asset reference "${match[1]}"`);
      continue;
    }
    const [, asset, version] = parsed;
    if (!assetVersions.has(asset)) assetVersions.set(asset, new Set());
    assetVersions.get(asset).add(version);
  }
}
if (!assetReferenceCount) fail("HTML contains no versioned runtime asset references");
for (const [asset, versions] of assetVersions) {
  if (versions.size !== 1) fail(`${asset} versions are inconsistent: ${[...versions].join(", ")}`);
}

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
  let online = true;
  let fetchLabel = "precache";

  function keyOf(request, ignoreSearch = false) {
    const value = typeof request === "string" ? request : request.url;
    const url = new URL(value, origin);
    if (ignoreSearch) {
      url.search = "";
      url.hash = "";
    }
    return url.href;
  }

  function contentTypeFor(pathname) {
    if (pathname.endsWith(".css")) return "text/css";
    if (pathname.endsWith(".js")) return "text/javascript";
    if (pathname.endsWith(".json")) return "application/json";
    if (pathname.endsWith(".webmanifest")) return "application/manifest+json";
    if (pathname.endsWith(".svg")) return "image/svg+xml";
    if (pathname.endsWith(".png")) return "image/png";
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
    if (pathname.endsWith(".webp")) return "image/webp";
    if (pathname.endsWith(".ico")) return "image/x-icon";
    if (pathname.endsWith(".woff2")) return "font/woff2";
    return "text/html";
  }

  function createFetchResponse(url) {
    const headers = {
      "content-type": url.searchParams.has("wrong-type") ? "text/plain" : contentTypeFor(url.pathname),
    };
    if (url.searchParams.has("no-store")) headers["cache-control"] = "private, no-store";
    const response = new Response(`${fetchLabel}:${url.pathname}${url.search}`, { headers });
    Object.defineProperty(response, "type", {
      value: url.searchParams.has("non-basic") ? "cors" : "basic",
    });
    return response;
  }

  class MemoryCache {
    constructor() {
      this.entries = new Map();
    }

    async add(request) {
      const url = new URL(typeof request === "string" ? request : request.url, origin);
      this.entries.set(url.href, createFetchResponse(url));
    }

    async put(request, response) {
      this.entries.set(keyOf(request), response);
    }

    async match(request, options = {}) {
      const key = keyOf(request, options.ignoreSearch);
      if (!options.ignoreSearch) return this.entries.get(key)?.clone();
      for (const [storedKey, response] of this.entries) {
        if (keyOf(storedKey, true) === key) return response.clone();
      }
      return undefined;
    }

    async keys() {
      return [...this.entries.keys()].map(key => new Request(key));
    }

    async delete(request) {
      return this.entries.delete(keyOf(request));
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
    async skipWaiting() {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  };

  const context = vm.createContext({
    Request,
    URL,
    Response,
    Promise,
    caches: fakeCaches,
    fetch: async (request) => {
      if (!online) throw new Error("offline");
      const url = new URL(typeof request === "string" ? request : request.url, origin);
      return createFetchResponse(url);
    },
    self: fakeSelf,
  });
  new vm.Script(source, { filename: "sw.js" }).runInContext(context);

  async function dispatchWithLifetime(type, event = {}) {
    const lifetimes = [];
    listeners.get(type)?.({
      ...event,
      waitUntil(value) {
        lifetimes.push(Promise.resolve(value));
      },
    });
    await Promise.all(lifetimes);
    return lifetimes.length;
  }

  async function dispatchFetch(url, mode) {
    let responsePromise;
    const lifetimes = [];
    listeners.get("fetch")?.({
      request: { url: new URL(url, origin).href, method: "GET", mode },
      respondWith(value) { responsePromise = value; },
      waitUntil(value) { lifetimes.push(Promise.resolve(value)); },
    });
    if (!responsePromise) throw new Error(`No response handler for ${url}`);
    const response = await responsePromise;
    await Promise.all(lifetimes);
    return response;
  }

  try {
    await dispatchWithLifetime("install");
    online = false;
    const firstVersionSet = assetVersions.values().next().value;
    const version = firstVersionSet?.values().next().value || "missing";
    const cases = [
      ["/?daily=1", "navigate", "precache:/"],
      ["/mind-lab?offline=1", "navigate", "precache:/mind-lab"],
      ["/play", "navigate", "precache:/play"],
      ["/collections?offline=1", "navigate", "precache:/collections"],
      ["/about", "navigate", "precache:/about"],
      [`/app.js?v=${version}`, "same-origin", "precache:/app.js"],
      [`/styles.css?v=${version}`, "same-origin", "precache:/styles.css"],
      [`/privacy-consent.js?v=${version}`, "same-origin", "precache:/privacy-consent.js"],
      [`/privacy-page.js?v=${version}`, "same-origin", "precache:/privacy-page.js"],
    ];
    for (const [url, mode, expected] of cases) {
      const response = await dispatchFetch(url, mode);
      const body = await response.text();
      if (body !== expected) fail(`sw.js: offline ${url} returned "${body}" instead of "${expected}"`);
    }

    fetchLabel = "network";
    online = true;
    await dispatchFetch("/science?seed=1", "navigate");
    online = false;
    const normalizedResponse = await dispatchFetch("/science?different=1", "navigate");
    const normalizedBody = await normalizedResponse.text();
    if (normalizedBody !== "network:/science?seed=1") {
      fail(`sw.js: navigation cache did not normalize query strings (returned "${normalizedBody}")`);
    }

    for (const marker of ["no-store", "wrong-type", "non-basic"]) {
      online = true;
      await dispatchFetch(`/privacy?${marker}=1`, "navigate");
      online = false;
      const response = await dispatchFetch(`/privacy?retry=${marker}`, "navigate");
      const body = await response.text();
      if (body !== "precache:/privacy") {
        fail(`sw.js: cached a ${marker} navigation response`);
      }
    }

    online = true;
    for (let index = 0; index < 70; index += 1) {
      await dispatchFetch(`/cache-limit-check-${index}`, "navigate");
    }
    const navigationStore = [...stores.entries()]
      .find(([name]) => name.startsWith("jakh-v") && !name.startsWith("jakh-assets"))?.[1];
    const navigationEntryCount = navigationStore ? (await navigationStore.keys()).length : 0;
    if (navigationEntryCount > 64) {
      fail(`sw.js: navigation cache grew to ${navigationEntryCount} entries`);
    }

    let handledCrossOrigin = false;
    listeners.get("fetch")?.({
      request: { url: "https://example.com/app.js", method: "GET", mode: "same-origin" },
      respondWith() { handledCrossOrigin = true; },
      waitUntil() {},
    });
    if (handledCrossOrigin) fail("sw.js: handled a cross-origin request");

    await fakeCaches.open("jakh-obsolete");
    await dispatchWithLifetime("activate");
    if ((await fakeCaches.keys()).includes("jakh-obsolete")) fail("sw.js: activate did not delete an obsolete cache");

    if (/\b(?:CLEAR_CACHE|SKIP_WAITING)\b/u.test(source)) {
      fail("sw.js: retains a page-message cache/lifecycle command without a sender");
    }
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
