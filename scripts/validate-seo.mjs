#!/usr/bin/env node

/**
 * A release gate for the intentionally compact Riddle Arabia search surface.
 * It protects against a return to mass-generated topic/pagination SEO while
 * checking that each curated bilingual experience is complete and useful.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RETIRED_LEGACY_SEO_DIRECTORIES,
  RIDDLE_ARABIA_GAME_CATALOG,
  RIDDLE_ARABIA_SEO_PAGES,
} from "./riddlearabia-seo.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = process.env.JAKH_SEO_VALIDATION_ROOT
  ? path.resolve(process.env.JAKH_SEO_VALIDATION_ROOT)
  : defaultRoot;
const siteOrigin = "https://riddlearabia.com";
const failures = [];
const ignoredDirectories = new Set([".git", ".wrangler", "coverage", "dist", "node_modules", "site-worker", "worker", "_site"]);
const GAME_SLUGS = RIDDLE_ARABIA_GAME_CATALOG.map((game) => game.slug);

function fail(scope, message) {
  failures.push(`${scope}: ${message}`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/gu, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&amp;/giu, "&");
}

function parseAttributes(tag) {
  const attributes = new Map();
  const opening = String(tag).match(/^<[^\s/>]+/u)?.[0] || "";
  const source = String(tag).slice(opening.length);
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of source.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    if (!attributes.has(name)) attributes.set(name, decodeHtml(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attributes;
}

function tags(source, name) {
  const pattern = new RegExp(`<${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, "giu");
  return [...source.matchAll(pattern)].map((match) => ({ raw: match[0], attributes: parseAttributes(match[0]) }));
}

function attr(tag, name) {
  return tag.attributes.get(name.toLowerCase()) || "";
}

function meta(source, name, value) {
  return tags(source, "meta")
    .filter((tag) => attr(tag, name).toLowerCase() === value.toLowerCase())
    .map((tag) => attr(tag, "content"));
}

function links(source, relation) {
  return tags(source, "link").filter((tag) => attr(tag, "rel").toLowerCase().split(/\s+/u).includes(relation));
}

function routeForFile(relative) {
  const segments = relative.split("/");
  const filename = segments.pop();
  if (filename === "index.html") return segments.length ? `/${segments.join("/")}/` : "/";
  return `/${[...segments, filename.replace(/\.html$/iu, "")].join("/")}`;
}

function listHtmlFiles(directory = root) {
  const paths = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) paths.push(...listHtmlFiles(path.join(directory, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      paths.push(path.join(directory, entry.name));
    }
  }
  return paths.sort((left, right) => left.localeCompare(right));
}

function parseSiteUrl(raw, scope, label) {
  try {
    const url = new URL(cleanText(raw));
    if (url.origin !== siteOrigin) {
      fail(scope, `${label} must use ${siteOrigin}, found "${raw}"`);
      return null;
    }
    if (url.search || url.hash || /\.html\/?$/iu.test(url.pathname)) {
      fail(scope, `${label} must be a clean canonical URL, found "${raw}"`);
      return null;
    }
    return `${siteOrigin}${url.pathname}`;
  } catch {
    fail(scope, `${label} is not an absolute Riddle Arabia URL: "${raw}"`);
    return null;
  }
}

function jsonLdDocuments(page) {
  const documents = [];
  const pattern = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/giu;
  for (const match of page.source.matchAll(pattern)) {
    const attributes = parseAttributes(`<script${match[1]}>`);
    if (attr({ attributes }, "type").toLowerCase() !== "application/ld+json") continue;
    try {
      documents.push(JSON.parse(match[2]));
    } catch (error) {
      fail(page.relative, `invalid JSON-LD: ${error.message}`);
    }
  }
  return documents;
}

function jsonLdNodes(documents) {
  const nodes = [];
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    if (value["@type"]) nodes.push(value);
    for (const nested of Object.values(value)) visit(nested);
  };
  documents.forEach(visit);
  return nodes;
}

function hasType(node, expected) {
  const types = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];
  return types.some((type) => String(type).toLowerCase() === expected.toLowerCase());
}

function rasterInfo(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mime: "image/png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const format = bytes.toString("ascii", 12, 16);
    if (format === "VP8 ") return { mime: "image/webp", width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (format === "VP8X") return { mime: "image/webp", width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (format === "VP8L") {
      const bits = bytes.readUInt32LE(21);
      return { mime: "image/webp", width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
  }
  return null;
}

const socialImagePath = path.join(root, "assets/riddlearabia-og-image-v2.png");
const socialImage = fs.existsSync(socialImagePath) ? rasterInfo(socialImagePath) : null;
if (!socialImage) fail("assets/riddlearabia-og-image-v2.png", "missing or unsupported social image");

const pages = listHtmlFiles().map((file) => {
  const relative = path.relative(root, file).split(path.sep).join("/");
  const source = fs.readFileSync(file, "utf8");
  const canonicalLinks = links(source, "canonical");
  const canonical = canonicalLinks.length === 1
    ? parseSiteUrl(attr(canonicalLinks[0], "href"), relative, "canonical")
    : null;
  if (relative !== "404.html" && canonicalLinks.length !== 1) fail(relative, `expected exactly one canonical link, found ${canonicalLinks.length}`);
  const robots = meta(source, "name", "robots").join(",").toLowerCase();
  const noindex = /(?:^|[,\s])noindex(?:$|[,\s])/u.test(robots);
  const html = tags(source, "html")[0];
  const body = tags(source, "body")[0];
  return {
    file,
    relative,
    source,
    route: routeForFile(relative),
    canonical,
    noindex,
    indexable: relative !== "404.html" && !noindex,
    lang: attr(html || { attributes: new Map() }, "lang").toLowerCase(),
    dir: attr(html || { attributes: new Map() }, "dir").toLowerCase(),
    body,
    nodes: [],
  };
});
for (const page of pages) page.nodes = jsonLdNodes(jsonLdDocuments(page));

const pagesByRelative = new Map(pages.map((page) => [page.relative, page]));
const pagesByCanonical = new Map();
for (const page of pages) {
  if (page.relative === "404.html") {
    if (!page.noindex) fail(page.relative, "404 page must be noindex");
    continue;
  }
  if (!page.canonical) continue;
  const expected = `${siteOrigin}${page.route}`;
  if (page.canonical !== expected) fail(page.relative, `canonical must self-map to ${expected}`);
  if (pagesByCanonical.has(page.canonical)) fail(page.relative, `duplicates canonical used by ${pagesByCanonical.get(page.canonical).relative}`);
  else pagesByCanonical.set(page.canonical, page);
  if (page.lang !== "en" && page.lang !== "ar") fail(page.relative, `html lang must be en or ar, found ${page.lang || "missing"}`);
  if (page.lang === "ar" && page.dir !== "rtl") fail(page.relative, "Arabic page must declare dir=rtl");
  if (page.indexable) {
    const values = (name, value) => meta(page.source, name, value);
    for (const [attribute, name] of [["property", "og:url"], ["property", "og:image"], ["property", "og:image:type"], ["property", "og:image:width"], ["property", "og:image:height"], ["name", "twitter:card"], ["name", "twitter:image"]]) {
      if (values(attribute, name).length !== 1) fail(page.relative, `expected exactly one ${name}`);
    }
    if (values("property", "og:url")[0] !== page.canonical) fail(page.relative, "og:url must equal canonical");
    const expectedImage = `${siteOrigin}/assets/riddlearabia-og-image-v2.png`;
    if (values("property", "og:image")[0] !== expectedImage) fail(page.relative, "og:image must use the Riddle Arabia social image");
    if (socialImage) {
      if (values("property", "og:image:type")[0] !== socialImage.mime) fail(page.relative, "og:image:type does not match the raster");
      if (values("property", "og:image:width")[0] !== String(socialImage.width)) fail(page.relative, "og:image:width does not match the raster");
      if (values("property", "og:image:height")[0] !== String(socialImage.height)) fail(page.relative, "og:image:height does not match the raster");
    }
    if (values("name", "twitter:card")[0] !== "summary_large_image") fail(page.relative, "twitter:card must be summary_large_image");
    if (values("name", "twitter:image")[0] !== expectedImage) fail(page.relative, "twitter:image must equal og:image");
    if (!page.source.includes("privacy-consent.js?v=")) fail(page.relative, "must load the privacy-consent gate");
  }
}

function alternateMap(page) {
  const map = new Map();
  for (const link of links(page.source, "alternate")) {
    const language = attr(link, "hreflang").toLowerCase();
    if (!language) continue;
    if (map.has(language)) fail(page.relative, `duplicate hreflang=${language}`);
    const target = parseSiteUrl(attr(link, "href"), page.relative, `hreflang=${language}`);
    if (target) map.set(language, target);
  }
  return map;
}

function assertPair({ enRelative, arRelative, enPath, arPath, label, indexable = true }) {
  const en = pagesByRelative.get(enRelative);
  const ar = pagesByRelative.get(arRelative);
  if (!en || !ar) {
    fail(label, `missing localized pair (${enRelative}, ${arRelative})`);
    return;
  }
  const enCanonical = `${siteOrigin}${enPath}`;
  const arCanonical = `${siteOrigin}${arPath}`;
  for (const [page, lang, canonical] of [[en, "en", enCanonical], [ar, "ar", arCanonical]]) {
    if (page.canonical !== canonical) fail(page.relative, `canonical must be ${canonical}`);
    if (page.lang !== lang) fail(page.relative, `html lang must be ${lang}`);
    if (page.indexable !== indexable) fail(page.relative, `indexability must be ${indexable}`);
    const alternates = alternateMap(page);
    for (const [targetLang, target] of [["en", enCanonical], ["ar", arCanonical], ["x-default", enCanonical]]) {
      if (alternates.get(targetLang) !== target) fail(page.relative, `hreflang=${targetLang} must be ${target}`);
    }
  }
}

const catalogPath = path.join(root, "data/catalog.json");
const catalog = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, "utf8")) : { categories: [] };
const categories = Array.isArray(catalog.categories) ? catalog.categories : [];
if (categories.length !== 56) fail("data/catalog.json", `expected 56 source categories, found ${categories.length}`);

for (const category of categories) {
  const slug = category.slug;
  const enRelative = `${slug}.html`;
  const arRelative = `ar/topics/${slug}/index.html`;
  assertPair({
    enRelative,
    arRelative,
    enPath: `/${slug}`,
    arPath: `/ar/topics/${slug}/`,
    label: `functional topic ${slug}`,
    indexable: false,
  });
  for (const page of [pagesByRelative.get(enRelative), pagesByRelative.get(arRelative)]) {
    if (!page) continue;
    if (attr(page.body || { attributes: new Map() }, "data-page") !== "category") fail(page.relative, "must retain data-page=category for app functionality");
    if (attr(page.body || { attributes: new Map() }, "data-category") !== slug) fail(page.relative, `must bind data-category=${slug}`);
    if (!/\bsrc="\/app\.js\?v=/u.test(page.source)) fail(page.relative, "must load the functional category app");
    if (/<article\b[^>]*(?:riddle-card|seo-qa-card)/iu.test(page.source)) fail(page.relative, "must not retain legacy static SEO card markup");
  }
}

function loadSourceCard(slug, id) {
  const filename = path.join(root, "data", `${slug}.json`);
  if (!fs.existsSync(filename)) {
    fail("source cards", `missing ${slug}.json`);
    return null;
  }
  const cards = JSON.parse(fs.readFileSync(filename, "utf8"));
  const card = cards.find((candidate) => candidate.id === id);
  if (!card) fail("source cards", `missing ${slug}/${id}`);
  return card || null;
}

function quizNode(page) {
  const nodes = page.nodes.filter((node) => hasType(node, "Quiz"));
  if (nodes.length !== 1) {
    fail(page.relative, `expected one Quiz node, found ${nodes.length}`);
    return null;
  }
  return nodes[0];
}

for (const experience of RIDDLE_ARABIA_SEO_PAGES) {
  const isGames = experience.kind === "games";
  for (const lang of ["en", "ar"]) {
    const relative = lang === "en"
      ? `${experience.paths.en.slice(1)}.html`
      : `${experience.paths.ar.slice(1)}index.html`;
    const page = pagesByRelative.get(relative);
    if (!page) {
      fail(experience.key, `missing ${lang} experience page`);
      continue;
    }
    const other = lang === "en" ? "ar" : "en";
    const enRelative = `${experience.paths.en.slice(1)}.html`;
    const arRelative = `${experience.paths.ar.slice(1)}index.html`;
    assertPair({ enRelative, arRelative, enPath: experience.paths.en, arPath: experience.paths.ar, label: experience.key });
    if (!page.source.includes("/assets/riddlearabia-logo.webp")) fail(relative, "must use the supplied Riddle Arabia logo");
    if (!page.source.includes(`data-seo-experience="${experience.key}"`)) fail(relative, "missing explicit SEO experience marker");
    if (isGames) {
      const collections = page.nodes.filter((node) => hasType(node, "CollectionPage"));
      const lists = page.nodes.filter((node) => hasType(node, "ItemList"));
      if (collections.length !== 1 || collections[0].url !== page.canonical) fail(relative, "requires a self-canonical CollectionPage");
      if (lists.length !== 1 || lists[0].numberOfItems !== GAME_SLUGS.length) fail(relative, "requires the complete game ItemList");
      for (const game of RIDDLE_ARABIA_GAME_CATALOG) {
        const expectedPath = lang === "ar" ? `/ar/games/${game.slug}/` : `/${game.slug}`;
        if (!page.source.includes(`href="${expectedPath}"`)) fail(relative, `missing game link ${expectedPath}`);
      }
      continue;
    }
    const quiz = quizNode(page);
    if (!quiz) continue;
    if (quiz.url !== page.canonical || quiz["@id"] !== `${page.canonical}#quiz`) fail(relative, "Quiz URL and @id must use the canonical page");
    if (quiz.inLanguage !== lang) fail(relative, `Quiz inLanguage must be ${lang}`);
    const expectedCards = experience.cards.map(([slug, id]) => loadSourceCard(slug, id)).filter(Boolean);
    const expectedIds = expectedCards.map((card) => card.id);
    const actualIds = (quiz.hasPart || []).map((part) => decodeURIComponent(String(part?.["@id"] || "").split("#").at(-1) || ""));
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) fail(relative, "Quiz question IDs do not match the original curated source selection");
    for (const card of expectedCards) {
      if (cleanText(card.question?.[lang]) && !page.source.includes(escapeHtml(card.question[lang]))) fail(relative, `visible question is missing ${card.id}`);
      if (cleanText(card.answer?.[lang]) && !page.source.includes(escapeHtml(card.answer[lang]))) fail(relative, `visible answer is missing ${card.id}`);
    }
    const subjects = (quiz.educationalAlignment || [])
      .filter((item) => item?.alignmentType === "educationalSubject")
      .map((item) => item.targetName);
    if (JSON.stringify(subjects) !== JSON.stringify(experience.subjects[lang])) fail(relative, "Quiz educational subjects do not match the editorial brief");
  }
}

assertPair({ enRelative: "collections.html", arRelative: "ar/collections/index.html", enPath: "/collections", arPath: "/ar/collections/", label: "collections" });
assertPair({ enRelative: "about.html", arRelative: "ar/about/index.html", enPath: "/about", arPath: "/ar/about/", label: "about" });
for (const [relative, type] of [["collections.html", "CollectionPage"], ["ar/collections/index.html", "CollectionPage"], ["about.html", "AboutPage"], ["ar/about/index.html", "AboutPage"]]) {
  const page = pagesByRelative.get(relative);
  if (!page) continue;
  if (page.nodes.filter((node) => hasType(node, type)).length !== 1) fail(relative, `requires exactly one ${type} structured-data node`);
  if (!page.source.includes("/assets/riddlearabia-logo.webp")) fail(relative, "must use the supplied Riddle Arabia logo");
}

const sharedPairs = [
  ["index.html", "ar/index.html", "/", "/ar/"],
  ["mind-lab.html", "ar/mind-lab/index.html", "/mind-lab", "/ar/mind-lab/"],
  ["play.html", "ar/play/index.html", "/play", "/ar/play/"],
  ["privacy.html", "ar/privacy/index.html", "/privacy", "/ar/privacy/"],
  ...GAME_SLUGS.map((slug) => [`${slug}.html`, `ar/games/${slug}/index.html`, `/${slug}`, `/ar/games/${slug}/`]),
];
for (const [enRelative, arRelative, enPath, arPath] of sharedPairs) {
  assertPair({ enRelative, arRelative, enPath, arPath, label: `shared ${enPath}` });
}

for (const legacy of RETIRED_LEGACY_SEO_DIRECTORIES) {
  if (fs.existsSync(path.join(root, legacy))) fail(legacy, "retired legacy SEO directory still exists");
}
for (const file of pages) {
  if (/(?:^|\/)page\/\d+\/index\.html$/u.test(file.relative)) fail(file.relative, "legacy pagination artifacts must not exist");
}
const generatedPublicPaths = [
  "sitemap.xml",
  "collections.html",
  "about.html",
  "ar/collections/index.html",
  "ar/about/index.html",
  ...RIDDLE_ARABIA_SEO_PAGES.flatMap((page) => [
    `${page.paths.en.slice(1)}.html`,
    `${page.paths.ar.slice(1)}index.html`,
  ]),
];
for (const relative of generatedPublicPaths) {
  const source = read(relative);
  if (/\bJAKH(?:\s+Riddles)?\b/iu.test(source) || /(?:https?:\/\/)?(?:www\.)?jakh\.net/iu.test(source)) {
    fail(relative, "contains retired JAKH public branding or host");
  }
  if (/\/(?:en\/(?:riddles-with-answers|kids-riddles-with-answers|logic-puzzles-with-answers|general-knowledge-quiz-questions|spacetoon-quiz|football-rules-quiz)|ar\/(?:alghaz-ma-alhal|alghaz-lil-atfal-ma-alhal|alghaz-mantiqiyya-ma-alhal|asila-amma-wa-ajwiba|ikhtibar-spacetoon|ikhtibar-qawanin-korat-alqadam))\/?/iu.test(source)) {
    fail(relative, "contains a retired legacy SEO route");
  }
}

const robotsPath = path.join(root, "robots.txt");
if (!fs.existsSync(robotsPath)) fail("robots.txt", "file is missing");
else {
  const robots = fs.readFileSync(robotsPath, "utf8");
  if (!robots.includes(`${siteOrigin}/sitemap.xml`)) fail("robots.txt", "must point to the Riddle Arabia sitemap");
  if (/jakh\.net/iu.test(robots)) fail("robots.txt", "must not name the retired host");
}

const sitemapPath = path.join(root, "sitemap.xml");
const sitemapUrls = new Set();
const sitemapAlternates = new Map();
if (!fs.existsSync(sitemapPath)) {
  fail("sitemap.xml", "file is missing");
} else {
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  if (!sitemap.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"')) fail("sitemap.xml", "missing xhtml namespace");
  for (const match of sitemap.matchAll(/<url>([\s\S]*?)<\/url>/gu)) {
    const block = match[1];
    const loc = cleanText(block.match(/<loc>([^<]+)<\/loc>/u)?.[1]);
    const canonical = parseSiteUrl(loc, "sitemap.xml", "loc");
    if (!canonical) continue;
    if (sitemapUrls.has(canonical)) fail("sitemap.xml", `duplicate URL ${canonical}`);
    sitemapUrls.add(canonical);
    const alternates = new Map();
    for (const link of [...block.matchAll(/<xhtml:link\b[^>]*>/giu)]) {
      const attributes = parseAttributes(link[0]);
      if ((attributes.get("rel") || "").toLowerCase() !== "alternate") continue;
      const language = (attributes.get("hreflang") || "").toLowerCase();
      const target = parseSiteUrl(attributes.get("href") || "", "sitemap.xml", `hreflang=${language}`);
      if (language && target) alternates.set(language, target);
    }
    sitemapAlternates.set(canonical, alternates);
  }
}
const indexablePages = pages.filter((page) => page.indexable && page.canonical);
const indexableCanonicals = new Set(indexablePages.map((page) => page.canonical));
for (const canonical of indexableCanonicals) {
  if (!sitemapUrls.has(canonical)) fail("sitemap.xml", `missing indexable canonical ${canonical}`);
}
for (const canonical of sitemapUrls) {
  if (!indexableCanonicals.has(canonical)) fail("sitemap.xml", `contains non-indexable or missing canonical ${canonical}`);
  const page = pagesByCanonical.get(canonical);
  const expectedAlternates = alternateMap(page);
  const actualAlternates = sitemapAlternates.get(canonical) || new Map();
  for (const [lang, target] of expectedAlternates) {
    if (actualAlternates.get(lang) !== target) fail("sitemap.xml", `${canonical} hreflang=${lang} must match its page`);
  }
}

const titleSets = { en: new Set(), ar: new Set() };
for (const page of indexablePages) {
  const title = cleanText(page.source.match(/<title>([\s\S]*?)<\/title>/iu)?.[1]);
  const description = cleanText(meta(page.source, "name", "description")[0]);
  if (!title || !description) fail(page.relative, "indexable page needs title and description");
  if (titleSets[page.lang]?.has(title)) fail(page.relative, `duplicates the ${page.lang} title "${title}"`);
  titleSets[page.lang]?.add(title);
}

const generator = read("scripts/generate-seo-pages.mjs");
if (/seo-collections/iu.test(generator) || /SEO_COLLECTIONS/u.test(generator)) {
  fail("scripts/generate-seo-pages.mjs", "must not depend on the retired SEO collections program");
}

if (failures.length) {
  const unique = [...new Set(failures)].sort((left, right) => left.localeCompare(right));
  console.error(`SEO validation failed with ${unique.length} issue${unique.length === 1 ? "" : "s"}:`);
  for (const issue of unique) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(
  `SEO validation passed: ${indexablePages.length} indexable pages, `
  + `${RIDDLE_ARABIA_SEO_PAGES.length} original bilingual experience pairs, `
  + `${categories.length * 2} functional noindex topic shells, and ${sitemapUrls.size} sitemap URLs.`,
);
