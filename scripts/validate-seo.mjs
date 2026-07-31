#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SEO_COLLECTIONS } from "./seo-collections.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteOrigin = "https://jakh.net";
const socialImageUrl = `${siteOrigin}/assets/og-image.jpg`;
const excludedDirectories = new Set([
  ".git",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
  "_site",
]);
const failures = [];

function fail(scope, message) {
  failures.push(`${scope}: ${message}`);
}

function normalizeSpace(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/gu, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/giu, "\"")
    .replace(/&apos;/giu, "'")
    .replace(/&#39;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&nbsp;/giu, "\u00a0")
    .replace(/&amp;/giu, "&");
}

function parseAttributes(tag) {
  const attributes = new Map();
  const opening = String(tag).match(/^<[^\s/>]+/u)?.[0] || "";
  const source = String(tag).slice(opening.length);
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of source.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!attributes.has(name)) attributes.set(name, decodeHtml(value));
  }
  return attributes;
}

function extractTags(source, tagName) {
  const pattern = new RegExp(
    `<${tagName}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`,
    "giu",
  );
  return [...source.matchAll(pattern)].map((match) => ({
    raw: match[0],
    attributes: parseAttributes(match[0]),
    index: match.index,
  }));
}

function attr(tag, name) {
  return tag.attributes.get(name.toLowerCase());
}

function hasRel(tag, expected) {
  return (attr(tag, "rel") || "")
    .toLowerCase()
    .split(/\s+/u)
    .includes(expected.toLowerCase());
}

function metaValues(source, keyType, key) {
  return extractTags(source, "meta")
    .filter((tag) => (attr(tag, keyType) || "").toLowerCase() === key.toLowerCase())
    .map((tag) => attr(tag, "content") || "");
}

function walkHtmlFiles(directory = root) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        results.push(...walkHtmlFiles(path.join(directory, entry.name)));
      }
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      results.push(path.join(directory, entry.name));
    }
  }
  return results.sort((left, right) => left.localeCompare(right));
}

function relativeFile(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function routeForFile(relative) {
  const parts = relative.split("/");
  const filename = parts.pop();
  if (filename.toLowerCase() === "index.html") {
    return parts.length ? `/${parts.join("/")}/` : "/";
  }
  return `/${[...parts, filename.replace(/\.html$/iu, "")].join("/")}`;
}

function parseSiteUrl(rawValue, scope, label, options = {}) {
  const { allowHash = false, allowSearch = false } = options;
  let parsed;
  try {
    parsed = new URL(normalizeSpace(rawValue));
  } catch {
    fail(scope, `${label} is not a valid absolute URL: "${rawValue}"`);
    return null;
  }
  if (parsed.origin !== siteOrigin) {
    fail(scope, `${label} must use ${siteOrigin}, found "${rawValue}"`);
    return null;
  }
  if (parsed.username || parsed.password) {
    fail(scope, `${label} must not contain URL credentials`);
    return null;
  }
  if (!allowSearch && parsed.search) {
    fail(scope, `${label} must not contain a query string: "${rawValue}"`);
    return null;
  }
  if (!allowHash && parsed.hash) {
    fail(scope, `${label} must not contain a fragment: "${rawValue}"`);
    return null;
  }
  if (/\.html(?:\/)?$/iu.test(decodeURIComponent(parsed.pathname))) {
    fail(scope, `${label} must be a clean URL without .html: "${rawValue}"`);
    return null;
  }
  return `${siteOrigin}${parsed.pathname}${allowSearch ? parsed.search : ""}${allowHash ? parsed.hash : ""}`;
}

function jsonLdDocuments(page) {
  const documents = [];
  const pattern = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/giu;
  let index = 0;
  for (const match of page.source.matchAll(pattern)) {
    const attributes = parseAttributes(`<script${match[1]}>`);
    if ((attributes.get("type") || "").toLowerCase() !== "application/ld+json") continue;
    index += 1;
    try {
      documents.push(JSON.parse(match[2]));
    } catch (error) {
      fail(page.relative, `JSON-LD block ${index} is invalid JSON: ${error.message}`);
    }
  }
  return documents;
}

function jsonLdNodes(documents) {
  const nodes = [];
  function visit(value, isGraphItem = false) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, isGraphItem);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (isGraphItem || value["@type"]) nodes.push(value);
    if (Array.isArray(value["@graph"])) visit(value["@graph"], true);
  }
  for (const document of documents) visit(document);
  return nodes;
}

function hasType(node, expected) {
  const types = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];
  return types.some((type) => String(type).toLowerCase() === expected.toLowerCase());
}

function extractElementById(source, expectedId) {
  const openingPattern = /<([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu;
  for (const opening of source.matchAll(openingPattern)) {
    const attributes = parseAttributes(opening[0]);
    if (attributes.get("id") !== expectedId) continue;
    const tagName = opening[1];
    const tagPattern = new RegExp(
      `<\\/?${tagName}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`,
      "giu",
    );
    tagPattern.lastIndex = opening.index + opening[0].length;
    let depth = 1;
    let token;
    while ((token = tagPattern.exec(source))) {
      if (/^<\//u.test(token[0])) {
        depth -= 1;
        if (depth === 0) {
          return {
            opening: opening[0],
            inner: source.slice(opening.index + opening[0].length, token.index),
          };
        }
      } else if (!/\/\s*>$/u.test(token[0])) {
        depth += 1;
      }
    }
    return null;
  }
  return null;
}

function readJson(file, scope) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(scope, `cannot parse JSON: ${error.message}`);
    return null;
  }
}

function jpegDimensions(buffer) {
  if (
    buffer.length < 4
    || buffer[0] !== 0xff
    || buffer[1] !== 0xd8
    || buffer[2] !== 0xff
  ) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  return null;
}

function oneMeta(page, keyType, key, expected) {
  const values = metaValues(page.source, keyType, key);
  if (values.length !== 1) {
    fail(page.relative, `expected exactly one ${key}, found ${values.length}`);
    return;
  }
  if (values[0] !== expected) {
    fail(page.relative, `${key} must be "${expected}", found "${values[0]}"`);
  }
}

function listDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

const imagePath = path.join(root, "assets", "og-image.jpg");
if (!fs.existsSync(imagePath)) {
  fail("assets/og-image.jpg", "missing social image");
} else {
  const image = fs.readFileSync(imagePath);
  const dimensions = jpegDimensions(image);
  if (!dimensions) {
    fail("assets/og-image.jpg", "file is not a valid JPEG image");
  } else if (dimensions.width !== 1200 || dimensions.height !== 630) {
    fail(
      "assets/og-image.jpg",
      `expected 1200x630 pixels, found ${dimensions.width}x${dimensions.height}`,
    );
  }
}
if (fs.existsSync(path.join(root, "assets", "og-image.webp"))) {
  fail("assets/og-image.webp", "obsolete social image must be removed");
}

const htmlPaths = walkHtmlFiles();
if (!htmlPaths.length) fail("HTML", "no HTML files found");

const pages = htmlPaths.map((file) => {
  const relative = relativeFile(file);
  const source = fs.readFileSync(file, "utf8");
  const route = routeForFile(relative);
  const canonicalTags = extractTags(source, "link").filter((tag) => hasRel(tag, "canonical"));
  const robots = metaValues(source, "name", "robots").join(",").toLowerCase();
  const noindex = /(?:^|[,\s])noindex(?:$|[,\s])/u.test(robots);
  const canonicalRaw = canonicalTags.length === 1 ? attr(canonicalTags[0], "href") : null;
  const canonical = canonicalRaw
    ? parseSiteUrl(canonicalRaw, relative, "canonical")
    : null;
  const htmlTag = extractTags(source, "html")[0];
  const alternates = extractTags(source, "link")
    .filter((tag) => hasRel(tag, "alternate") && attr(tag, "hreflang"))
    .map((tag) => ({
      language: (attr(tag, "hreflang") || "").toLowerCase(),
      rawHref: attr(tag, "href") || "",
    }));
  const documents = jsonLdDocuments({ relative, source });
  return {
    file,
    relative,
    source,
    route,
    canonicalTags,
    canonical,
    canonicalRaw,
    noindex,
    indexable: relative !== "404.html" && !noindex,
    htmlLanguage: (htmlTag ? attr(htmlTag, "lang") : "")?.toLowerCase() || "",
    htmlDirection: (htmlTag ? attr(htmlTag, "dir") : "")?.toLowerCase() || "",
    body: extractTags(source, "body")[0],
    alternates,
    jsonLd: documents,
    nodes: jsonLdNodes(documents),
  };
});

const canonicalToPage = new Map();
for (const page of pages) {
  if (page.relative === "404.html") {
    if (!page.noindex) fail(page.relative, "404 page must be noindex");
  } else if (page.canonicalTags.length !== 1) {
    fail(page.relative, `expected exactly one canonical link, found ${page.canonicalTags.length}`);
  }

  if (page.canonicalTags.length > 1) {
    fail(page.relative, "duplicate canonical links are not allowed");
  }
  if (page.canonical) {
    const expected = `${siteOrigin}${page.route}`;
    if (page.canonical !== expected) {
      fail(page.relative, `canonical must self-map to "${expected}", found "${page.canonical}"`);
    }
    if (canonicalToPage.has(page.canonical)) {
      fail(
        page.relative,
        `canonical duplicates ${canonicalToPage.get(page.canonical).relative}: "${page.canonical}"`,
      );
    } else {
      canonicalToPage.set(page.canonical, page);
    }
  }

  if (/og-image\.webp/iu.test(page.source)) {
    fail(page.relative, "references obsolete assets/og-image.webp");
  }

  if (/googletagmanager\.com\/gtag\/js/iu.test(page.source)) {
    fail(page.relative, "loads Google Analytics before privacy consent");
  }
  const consentScripts = extractTags(page.source, "script").filter((tag) => {
    const source = normalizeSpace(attr(tag, "src"));
    if (!source) return false;
    try {
      return new URL(source, `${siteOrigin}${page.route}`).pathname === "/privacy-consent.js";
    } catch {
      return false;
    }
  });
  if (consentScripts.length !== 1) {
    fail(page.relative, `expected exactly one privacy-consent.js loader, found ${consentScripts.length}`);
  } else if (!/[?&]v=\d+/u.test(attr(consentScripts[0], "src") || "")) {
    fail(page.relative, "privacy-consent.js loader must be versioned");
  }

  const anchors = extractTags(page.source, "a");
  if (page.source.includes("site-footer")) {
    const hasPrivacyLink = anchors.some((anchor) => {
      const href = normalizeSpace(attr(anchor, "href"));
      if (!href) return false;
      try {
        const target = new URL(href, page.canonical || `${siteOrigin}${page.route}`);
        return target.origin === siteOrigin && target.pathname.replace(/\/+$/u, "") === "/privacy";
      } catch {
        return false;
      }
    });
    if (!hasPrivacyLink) fail(page.relative, "global footer is missing the /privacy link");
  }

  for (const anchor of anchors) {
    const href = normalizeSpace(attr(anchor, "href"));
    if (
      !href
      || href.startsWith("#")
      || /^(?:mailto|tel|javascript|data):/iu.test(href)
    ) continue;
    let target;
    try {
      target = new URL(href, page.canonical || `${siteOrigin}${page.route}`);
    } catch {
      continue;
    }
    if (
      target.origin === siteOrigin
      && /\.html(?:\/)?$/iu.test(decodeURIComponent(target.pathname))
    ) {
      fail(page.relative, `local anchor uses .html URL: "${href}"`);
    }
  }

  if (!page.indexable) continue;
  if (!page.canonical) fail(page.relative, "indexable page has no valid canonical");
  oneMeta(page, "property", "og:image", socialImageUrl);
  oneMeta(page, "property", "og:image:type", "image/jpeg");
  oneMeta(page, "property", "og:image:width", "1200");
  oneMeta(page, "property", "og:image:height", "630");
  oneMeta(page, "name", "twitter:image", socialImageUrl);
  oneMeta(page, "name", "twitter:card", "summary_large_image");
  if (page.canonical) oneMeta(page, "property", "og:url", page.canonical);
}

const sitemapPath = path.join(root, "sitemap.xml");
const sitemapUrls = [];
const sitemapAlternateMaps = new Map();
if (!fs.existsSync(sitemapPath)) {
  fail("sitemap.xml", "file is missing");
} else {
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  if (!/xmlns:xhtml=["']http:\/\/www\.w3\.org\/1999\/xhtml["']/u.test(sitemap)) {
    fail("sitemap.xml", "missing the xhtml namespace required for hreflang links");
  }
  for (const match of sitemap.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/giu)) {
    const raw = normalizeSpace(decodeHtml(match[1]));
    const normalized = parseSiteUrl(raw, "sitemap.xml", "<loc>");
    if (normalized) sitemapUrls.push(normalized);
  }
  for (const match of sitemap.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/giu)) {
    const block = match[1];
    const locMatches = [...block.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/giu)];
    if (locMatches.length !== 1) {
      fail("sitemap.xml", `each <url> needs exactly one <loc>; found ${locMatches.length}`);
      continue;
    }
    const loc = parseSiteUrl(
      normalizeSpace(decodeHtml(locMatches[0][1])),
      "sitemap.xml",
      "<url>/<loc>",
    );
    if (!loc) continue;
    const alternates = new Map();
    for (const link of extractTags(block, "xhtml:link")) {
      if (!hasRel(link, "alternate")) continue;
      const language = normalizeSpace(attr(link, "hreflang")).toLowerCase();
      if (!language) {
        fail("sitemap.xml", `${loc} has an alternate without hreflang`);
        continue;
      }
      if (alternates.has(language)) {
        fail("sitemap.xml", `${loc} duplicates hreflang="${language}"`);
        continue;
      }
      const target = parseSiteUrl(
        attr(link, "href") || "",
        "sitemap.xml",
        `${loc} hreflang="${language}"`,
      );
      if (target) alternates.set(language, target);
    }
    sitemapAlternateMaps.set(loc, alternates);
  }
  if (!sitemapUrls.length) fail("sitemap.xml", "contains no <loc> URLs");
}

const uniqueSitemapUrls = new Set(sitemapUrls);
if (!uniqueSitemapUrls.has(`${siteOrigin}/privacy`)) {
  fail("sitemap.xml", `must include ${siteOrigin}/privacy`);
}
if (uniqueSitemapUrls.size !== sitemapUrls.length) {
  const seen = new Set();
  const duplicates = new Set();
  for (const url of sitemapUrls) {
    if (seen.has(url)) duplicates.add(url);
    seen.add(url);
  }
  fail("sitemap.xml", `duplicate <loc> URLs: ${[...duplicates].join(", ")}`);
}

const indexableCanonicalSet = new Set(
  pages.filter((page) => page.indexable && page.canonical).map((page) => page.canonical),
);
const missingFromSitemap = listDifference(indexableCanonicalSet, uniqueSitemapUrls);
const extraInSitemap = listDifference(uniqueSitemapUrls, indexableCanonicalSet);
if (missingFromSitemap.length) {
  fail("sitemap.xml", `missing canonical URLs: ${missingFromSitemap.join(", ")}`);
}
if (extraInSitemap.length) {
  fail("sitemap.xml", `contains non-canonical URLs: ${extraInSitemap.join(", ")}`);
}

const catalogPath = path.join(root, "data", "catalog.json");
const catalog = readJson(catalogPath, "data/catalog.json");
const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
if (categories.length !== 56) {
  fail("data/catalog.json", `expected exactly 56 categories, found ${categories.length}`);
}

const categoryBySlug = new Map();
for (const category of categories) {
  if (!category?.slug || categoryBySlug.has(category.slug)) {
    fail("data/catalog.json", `missing or duplicate category slug "${category?.slug}"`);
  } else {
    categoryBySlug.set(category.slug, category);
  }
}

const sectionBySlug = new Map();
for (const section of catalog?.sections || []) {
  for (const slug of section?.members || []) {
    if (sectionBySlug.has(slug)) {
      fail("data/catalog.json", `category "${slug}" belongs to more than one section`);
    } else {
      sectionBySlug.set(slug, section);
    }
  }
}

const categoryBodyPages = pages.filter(
  (page) => page.body && attr(page.body, "data-page") === "category",
);
const expectedCategoryPageCount = categories.length * 2;
if (categoryBodyPages.length !== expectedCategoryPageCount) {
  fail(
    "category pages",
    `expected exactly ${expectedCategoryPageCount} localized data-page="category" pages, found ${categoryBodyPages.length}`,
  );
}

function questionPartId(part) {
  const identifier = typeof part?.identifier === "string"
    ? part.identifier
    : part?.identifier?.value;
  if (identifier) return String(identifier);
  if (typeof part?.cardId === "string") return part.cardId;
  if (typeof part?.["@id"] === "string") {
    const fragment = part["@id"].split("#").pop() || "";
    return decodeURIComponent(fragment).replace(/^(?:question|card)[-_:]/iu, "");
  }
  return "";
}

function acceptedAnswerText(part) {
  const answers = Array.isArray(part?.acceptedAnswer)
    ? part.acceptedAnswer
    : [part?.acceptedAnswer];
  const answer = answers.find((candidate) => candidate && typeof candidate === "object");
  return {
    answer,
    text: answer?.text,
  };
}

function breadcrumbItemUrl(item) {
  if (typeof item?.item === "string") return item.item;
  if (item?.item && typeof item.item === "object") return item.item["@id"] || item.item.url;
  return "";
}

for (const category of categories) {
  if (!category?.slug) continue;
  const dataPath = path.join(root, "data", `${category.slug}.json`);
  const cards = fs.existsSync(dataPath) ? readJson(dataPath, `data/${category.slug}.json`) : null;
  if (!Array.isArray(cards)) {
    fail(`data/${category.slug}.json`, "expected a card array");
    continue;
  }
  if (cards.length < 20) {
    fail(`data/${category.slug}.json`, `needs at least 20 cards, found ${cards.length}`);
    continue;
  }
  const expectedCards = cards.slice(0, 20);
  const expectedIds = expectedCards.map((card) => String(card?.id || ""));
  const variants = [
    { language: "en", direction: "ltr", relative: `${category.slug}.html` },
    { language: "ar", direction: "rtl", relative: `ar/topics/${category.slug}/index.html` },
  ];

  for (const variant of variants) {
    const { language, direction, relative: scope } = variant;
    const page = pages.find((candidate) => candidate.relative === scope);
    if (!page) {
      fail(scope, `localized ${language} category page is missing`);
      continue;
    }
    const body = page.body || { attributes: new Map() };
    if (attr(body, "data-page") !== "category") {
      fail(scope, 'body must declare data-page="category"');
    }
    if (attr(body, "data-category") !== category.slug) {
      fail(scope, `body data-category must be "${category.slug}"`);
    }
    if (attr(body, "data-route-lang") !== language) {
      fail(scope, `body data-route-lang must be "${language}"`);
    }
    if (page.htmlLanguage !== language) {
      fail(scope, `html lang must be "${language}", found "${page.htmlLanguage}"`);
    }
    if (page.htmlDirection !== direction) {
      fail(scope, `html dir must be "${direction}", found "${page.htmlDirection}"`);
    }

    const cardGrid = extractElementById(page.source, "cardGrid");
    if (!cardGrid) {
      fail(scope, "could not find a complete #cardGrid element");
      continue;
    }
    const visibleCards = extractTags(cardGrid.inner, "article")
      .filter((tag) => (attr(tag, "class") || "").split(/\s+/u).includes("riddle-card"));
    const visibleIds = visibleCards.map((tag) => attr(tag, "data-id") || "");
    if (visibleCards.length !== 20) {
      fail(scope, `#cardGrid must contain exactly 20 static riddle cards, found ${visibleCards.length}`);
    }
    for (const [index, cardTag] of visibleCards.entries()) {
      const classes = (attr(cardTag, "class") || "").split(/\s+/u);
      if (
        cardTag.attributes.has("hidden")
        || attr(cardTag, "aria-hidden") === "true"
        || classes.includes("hidden")
      ) {
        fail(scope, `static card ${index + 1} (${visibleIds[index] || "missing id"}) is hidden`);
      }
    }
    if (JSON.stringify(visibleIds) !== JSON.stringify(expectedIds)) {
      fail(
        scope,
        `static card order must equal the first 20 data IDs; expected [${expectedIds.join(", ")}], found [${visibleIds.join(", ")}]`,
      );
    }
    const decodedCardGrid = decodeHtml(cardGrid.inner);
    for (const [index, card] of expectedCards.entries()) {
      if (!decodedCardGrid.includes(String(card?.question?.[language] || ""))) {
        fail(scope, `static card ${index + 1} is missing question.${language}`);
      }
      if (!decodedCardGrid.includes(String(card?.answer?.[language] || ""))) {
        fail(scope, `static card ${index + 1} is missing answer.${language}`);
      }
    }

    const quizzes = page.nodes.filter((node) => hasType(node, "Quiz"));
    if (quizzes.length !== 1) {
      fail(scope, `expected exactly one Quiz JSON-LD node, found ${quizzes.length}`);
    } else {
      const quiz = quizzes[0];
      if (quiz.url !== page.canonical) {
        fail(scope, `Quiz URL must equal canonical "${page.canonical}", found "${quiz.url}"`);
      }
      if (quiz.inLanguage !== language) {
        fail(scope, `Quiz inLanguage must be "${language}", found "${quiz.inLanguage}"`);
      }
      if (!Array.isArray(quiz.hasPart) || quiz.hasPart.length !== 20) {
        fail(scope, `Quiz hasPart must contain exactly 20 questions, found ${quiz.hasPart?.length ?? 0}`);
      } else {
        const partIds = quiz.hasPart.map(questionPartId);
        if (JSON.stringify(partIds) !== JSON.stringify(expectedIds)) {
          fail(
            scope,
            `Quiz hasPart IDs must match visible cards in order; expected [${expectedIds.join(", ")}], found [${partIds.join(", ")}]`,
          );
        }
        for (const [index, part] of quiz.hasPart.entries()) {
          const card = expectedCards[index];
          if (!hasType(part, "Question")) {
            fail(scope, `Quiz hasPart ${index + 1} must have @type "Question"`);
          }
          const questionText = part?.text ?? part?.name;
          if (normalizeSpace(questionText) !== normalizeSpace(card?.question?.[language])) {
            fail(scope, `Quiz hasPart ${index + 1} text does not match question.${language}`);
          }
          const { answer, text } = acceptedAnswerText(part);
          if (!answer || !hasType(answer, "Answer")) {
            fail(scope, `Quiz hasPart ${index + 1} needs an acceptedAnswer of @type "Answer"`);
          }
          if (normalizeSpace(text) !== normalizeSpace(card?.answer?.[language])) {
            fail(scope, `Quiz hasPart ${index + 1} acceptedAnswer does not match answer.${language}`);
          }
        }
      }
    }

    const breadcrumbs = page.nodes.filter((node) => hasType(node, "BreadcrumbList"));
    if (breadcrumbs.length !== 1) {
      fail(scope, `expected exactly one BreadcrumbList JSON-LD node, found ${breadcrumbs.length}`);
    } else {
      const items = breadcrumbs[0].itemListElement;
      const section = sectionBySlug.get(category.slug);
      if (!section) {
        fail(scope, "category has no catalog section for its breadcrumb");
      } else if (!Array.isArray(items) || items.length !== 4) {
        fail(scope, `breadcrumb must contain exactly 4 levels, found ${items?.length ?? 0}`);
      } else {
        const expectedNames = language === "ar"
          ? ["الرئيسية", "مختبر العقل", section.title?.ar, category.title?.ar]
          : ["Home", "Mind Lab", section.title?.en, category.title?.en];
        for (const [index, item] of items.entries()) {
          if (!hasType(item, "ListItem")) {
            fail(scope, `breadcrumb level ${index + 1} must have @type "ListItem"`);
          }
          if (item.position !== index + 1) {
            fail(scope, `breadcrumb level ${index + 1} has incorrect position "${item.position}"`);
          }
          if (normalizeSpace(item.name) !== normalizeSpace(expectedNames[index])) {
            fail(
              scope,
              `breadcrumb level ${index + 1} must be "${expectedNames[index]}", found "${item.name}"`,
            );
          }
        }
        const itemUrls = items.map(breadcrumbItemUrl);
        if (itemUrls[0] !== `${siteOrigin}/`) {
          fail(scope, `breadcrumb Home item must be "${siteOrigin}/"`);
        }
        if (itemUrls[1] !== `${siteOrigin}/mind-lab`) {
          fail(scope, `breadcrumb Mind Lab item must be "${siteOrigin}/mind-lab"`);
        }
        const expectedSectionAnchor = `${siteOrigin}/mind-lab#section-${section.key}`;
        const sectionUrl = parseSiteUrl(
          itemUrls[2],
          scope,
          "section breadcrumb item",
          { allowHash: true },
        );
        if (sectionUrl !== expectedSectionAnchor) {
          fail(
            scope,
            `section breadcrumb must target "${expectedSectionAnchor}"`,
          );
        }
        if (itemUrls[3] !== page.canonical) {
          fail(scope, `breadcrumb category item must equal canonical "${page.canonical}"`);
        }
      }
    }
  }
}

for (const page of categoryBodyPages) {
  const slug = attr(page.body, "data-category");
  if (!categoryBySlug.has(slug)) {
    fail(page.relative, `data-category "${slug}" is not present in data/catalog.json`);
  }
}

function alternateMap(page) {
  const result = new Map();
  for (const alternate of page.alternates) {
    if (result.has(alternate.language)) {
      fail(page.relative, `duplicate hreflang="${alternate.language}"`);
      continue;
    }
    const target = parseSiteUrl(
      alternate.rawHref,
      page.relative,
      `hreflang="${alternate.language}"`,
    );
    if (target) result.set(alternate.language, target);
  }
  return result;
}

const alternateMaps = new Map(pages.map((page) => [page, alternateMap(page)]));

function assertLanguageCluster(scope, actual, expected, sourceLabel) {
  if (!actual) {
    fail(scope, `${sourceLabel} is missing`);
    return;
  }
  if (actual.size !== expected.size) {
    fail(scope, `${sourceLabel} must contain exactly ${expected.size} hreflang links, found ${actual.size}`);
  }
  for (const [language, target] of expected) {
    if (actual.get(language) !== target) {
      fail(
        scope,
        `${sourceLabel} hreflang="${language}" must target "${target}", found "${actual.get(language)}"`,
      );
    }
  }
  for (const language of actual.keys()) {
    if (!expected.has(language)) fail(scope, `${sourceLabel} has unexpected hreflang="${language}"`);
  }
}

const expectedCategoryLocalePages = new Map();
for (const category of categories) {
  if (!category?.slug) continue;
  const enCanonical = `${siteOrigin}/${category.slug}`;
  const arCanonical = `${siteOrigin}/ar/topics/${category.slug}/`;
  const cluster = new Map([
    ["en", enCanonical],
    ["ar", arCanonical],
    ["x-default", enCanonical],
  ]);
  expectedCategoryLocalePages.set(`${category.slug}.html`, {
    language: "en",
    canonical: enCanonical,
    cluster,
  });
  expectedCategoryLocalePages.set(`ar/topics/${category.slug}/index.html`, {
    language: "ar",
    canonical: arCanonical,
    cluster,
  });
}

for (const [relative, expected] of expectedCategoryLocalePages) {
  const page = pages.find((candidate) => candidate.relative === relative);
  if (!page) continue;
  if (page.canonical !== expected.canonical) {
    fail(relative, `canonical must be "${expected.canonical}", found "${page.canonical}"`);
  }
  assertLanguageCluster(relative, alternateMaps.get(page), expected.cluster, "HTML head");
  assertLanguageCluster(relative, sitemapAlternateMaps.get(page.canonical), expected.cluster, "sitemap entry");
  for (const language of ["en", "ar"]) {
    const targetPage = canonicalToPage.get(expected.cluster.get(language));
    if (!targetPage) {
      fail(relative, `hreflang="${language}" target has no canonical HTML page`);
      continue;
    }
    assertLanguageCluster(
      relative,
      alternateMaps.get(targetPage),
      expected.cluster,
      `${targetPage.relative} reciprocal HTML head`,
    );
  }
}

const expectedLocalePages = new Map();
for (const collection of SEO_COLLECTIONS) {
  const enSlug = collection?.slug?.en || collection?.slugs?.en;
  const arSlug = collection?.slug?.ar || collection?.slugs?.ar;
  if (!enSlug || !arSlug) {
    fail(`SEO collection "${collection?.key || "unknown"}"`, "needs exact English and Arabic slugs");
    continue;
  }
  const enCanonical = `${siteOrigin}/en/${enSlug}/`;
  const arCanonical = `${siteOrigin}/ar/${arSlug}/`;
  const cluster = new Map([
    ["en", enCanonical],
    ["ar", arCanonical],
    ["x-default", enCanonical],
  ]);
  expectedLocalePages.set(`en/${enSlug}/index.html`, {
    language: "en",
    canonical: enCanonical,
    cluster,
    collection,
  });
  expectedLocalePages.set(`ar/${arSlug}/index.html`, {
    language: "ar",
    canonical: arCanonical,
    cluster,
    collection,
  });
}

const localeCollectionPages = pages.filter(
  (page) => /^https:\/\/jakh\.net\/(?:en\/|ar\/(?!topics\/))/u.test(page.canonical || ""),
);
if (localeCollectionPages.length !== expectedLocalePages.size) {
  fail(
    "hreflang",
    `expected exactly ${expectedLocalePages.size} locale collection pages, found ${localeCollectionPages.length}`,
  );
}
for (const page of localeCollectionPages) {
  if (!expectedLocalePages.has(page.relative)) {
    fail(page.relative, "unexpected locale collection page not declared in SEO_COLLECTIONS");
  }
}

for (const [relative, expected] of expectedLocalePages) {
  const page = pages.find((candidate) => candidate.relative === relative);
  if (!page) {
    fail(relative, `missing locale collection for "${expected.collection.key}"`);
    continue;
  }
  if (page.canonical !== expected.canonical) {
    fail(relative, `canonical must be "${expected.canonical}", found "${page.canonical}"`);
  }
  if (page.htmlLanguage !== expected.language) {
    fail(relative, `html lang must be "${expected.language}", found "${page.htmlLanguage}"`);
  }
  const map = alternateMaps.get(page);
  assertLanguageCluster(relative, map, expected.cluster, "HTML head");
  assertLanguageCluster(relative, sitemapAlternateMaps.get(page.canonical), expected.cluster, "sitemap entry");
  for (const language of ["en", "ar"]) {
    const targetPage = canonicalToPage.get(expected.cluster.get(language));
    if (!targetPage) {
      fail(relative, `hreflang="${language}" target has no canonical HTML page`);
      continue;
    }
    const reciprocal = alternateMaps.get(targetPage);
    for (const [reciprocalLanguage, reciprocalTarget] of expected.cluster) {
      if (reciprocal.get(reciprocalLanguage) !== reciprocalTarget) {
        fail(
          relative,
          `${targetPage.relative} does not reciprocate hreflang="${reciprocalLanguage}" to "${reciprocalTarget}"`,
        );
      }
    }
  }
}

const localeCollectionSet = new Set(
  pages.filter((page) => expectedLocalePages.has(page.relative)),
);
const localizedClusterSet = new Set([
  ...localeCollectionSet,
  ...pages.filter((page) => expectedCategoryLocalePages.has(page.relative)),
]);
for (const page of pages) {
  const map = alternateMaps.get(page);
  if (!map.size) continue;
  if (!localizedClusterSet.has(page)) {
    const targets = [...map.values()];
    if (new Set(targets).size < targets.length) {
      fail(page.relative, "false hreflang annotations point multiple languages to the same URL");
    }
  }
}

const uniqueFailures = [...new Set(failures)].sort();
if (uniqueFailures.length) {
  console.error(
    `SEO validation failed with ${uniqueFailures.length} issue${uniqueFailures.length === 1 ? "" : "s"}:`,
  );
  for (const message of uniqueFailures) console.error(`- ${message}`);
  process.exitCode = 1;
} else {
  console.log(
    `SEO validation passed: ${pages.length} HTML pages, `
    + `${indexableCanonicalSet.size} canonical pages, `
    + `${categories.length} categories, and ${uniqueSitemapUrls.size} sitemap URLs.`,
  );
}
