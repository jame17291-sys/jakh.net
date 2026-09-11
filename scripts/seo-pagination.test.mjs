import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  RETIRED_LEGACY_SEO_DIRECTORIES,
  RIDDLE_ARABIA_GAME_CATALOG,
  RIDDLE_ARABIA_SEO_PAGES,
} from "./riddlearabia-seo.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteOrigin = "https://riddlearabia.com";
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalog.json"), "utf8"));
const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function meta(source, attribute, value) {
  const tags = [...source.matchAll(/<meta\b[^>]*>/giu)].map((match) => match[0]);
  const tag = tags.find((candidate) => new RegExp(`\\b${attribute}="${escapeRegex(value)}"`, "iu").test(candidate));
  return decodeHtml(tag?.match(/\bcontent="([^"]*)"/iu)?.[1] || "");
}

function link(source, rel, hreflang = "") {
  const tags = [...source.matchAll(/<link\b[^>]*>/giu)].map((match) => match[0]);
  const tag = tags.find((candidate) => {
    const relation = candidate.match(/\brel="([^"]*)"/iu)?.[1]?.split(/\s+/u) || [];
    const language = candidate.match(/\bhreflang="([^"]*)"/iu)?.[1] || "";
    return relation.includes(rel) && language === hreflang;
  });
  return tag?.match(/\bhref="([^"]*)"/iu)?.[1] || "";
}

function title(source) {
  return decodeHtml(source.match(/<title>([\s\S]*?)<\/title>/iu)?.[1] || "").replace(/\s+/gu, " ").trim();
}

function relativeFor(page, lang) {
  return lang === "en"
    ? `${page.paths.en.slice(1)}.html`
    : `${page.paths.ar.slice(1)}index.html`;
}

function canonicalFor(page, lang) {
  return `${siteOrigin}${page.paths[lang]}`;
}

function jsonLdNodes(source) {
  const nodes = [];
  for (const match of source.matchAll(/<script\b[^>]*\btype="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/giu)) {
    const document = JSON.parse(match[1]);
    const visit = (value) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== "object") return;
      if (value["@type"]) nodes.push(value);
      for (const child of Object.values(value)) visit(child);
    };
    visit(document);
  }
  return nodes;
}

function hasType(node, expected) {
  const types = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];
  return types.includes(expected);
}

function sourceCard(slug, id) {
  const cards = JSON.parse(read(`data/${slug}.json`));
  const card = cards.find((candidate) => candidate.id === id);
  assert.ok(card, `${slug}/${id} must remain in the source question bank`);
  return card;
}

function sitemapEntries() {
  return [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/gu)].map((match) => {
    const block = match[1];
    return {
      block,
      loc: block.match(/<loc>([^<]+)<\/loc>/u)?.[1] || "",
    };
  });
}

test("the public SEO surface is eight original bilingual Riddle Arabia experiences", () => {
  assert.equal(RIDDLE_ARABIA_SEO_PAGES.length, 8, "the experience architecture must stay compact and intentional");
  const titles = { en: new Set(), ar: new Set() };

  for (const experience of RIDDLE_ARABIA_SEO_PAGES) {
    for (const lang of ["en", "ar"]) {
      const other = lang === "en" ? "ar" : "en";
      const relative = relativeFor(experience, lang);
      const source = read(relative);
      const canonical = canonicalFor(experience, lang);

      assert.equal(title(source), experience.titles[lang], `${relative}: original editorial title`);
      assert.equal(meta(source, "name", "description"), experience.descriptions[lang], `${relative}: original editorial description`);
      assert.equal(link(source, "canonical"), canonical, `${relative}: self canonical`);
      assert.equal(link(source, "alternate", "en"), canonicalFor(experience, "en"), `${relative}: English alternate`);
      assert.equal(link(source, "alternate", "ar"), canonicalFor(experience, "ar"), `${relative}: Arabic alternate`);
      assert.equal(link(source, "alternate", "x-default"), canonicalFor(experience, "en"), `${relative}: default alternate`);
      assert.match(source, new RegExp(`<html\\b[^>]*\\blang="${lang}"`, "iu"), `${relative}: page language`);
      if (lang === "ar") assert.match(source, /<html\b[^>]*\bdir="rtl"/iu, `${relative}: Arabic direction`);
      assert.match(source, new RegExp(`data-seo-experience="${escapeRegex(experience.key)}"`, "u"), `${relative}: explicit experience marker`);
      assert.match(source, /\/assets\/riddlearabia-logo\.webp/u, `${relative}: supplied logo`);
      assert.equal(meta(source, "property", "og:url"), canonical, `${relative}: social canonical`);
      assert.equal(meta(source, "property", "og:image"), `${siteOrigin}/assets/riddlearabia-og-image.png`, `${relative}: social image`);
      assert.equal(meta(source, "name", "twitter:card"), "summary_large_image", `${relative}: social card`);
      assert.doesNotMatch(source, /\bJAKH(?:\s+Riddles)?\b|(?:https?:\/\/)?(?:www\.)?jakh\.net/iu, `${relative}: retired public identity`);
      assert.doesNotMatch(source, /\/page\/|[?&]lang=(?:en|ar)(?:[&#"]|$)/iu, `${relative}: no legacy pagination or locale query`);
      assert.ok(!titles[lang].has(title(source)), `${relative}: title must be unique in ${lang}`);
      titles[lang].add(title(source));

      const nodes = jsonLdNodes(source);
      if (experience.kind === "games") {
        const collection = nodes.find((node) => hasType(node, "CollectionPage"));
        const games = nodes.find((node) => hasType(node, "ItemList"));
        assert.equal(collection?.url, canonical, `${relative}: self-canonical games collection`);
        assert.equal(games?.numberOfItems, RIDDLE_ARABIA_GAME_CATALOG.length, `${relative}: complete game list`);
        for (const game of RIDDLE_ARABIA_GAME_CATALOG) {
          const href = lang === "ar" ? `/ar/games/${game.slug}/` : `/${game.slug}`;
          assert.match(source, new RegExp(`href="${escapeRegex(href)}"`, "u"), `${relative}: links ${game.slug}`);
        }
        continue;
      }

      const expectedCards = experience.cards.map(([slug, id]) => sourceCard(slug, id));
      const expectedIds = expectedCards.map((card) => card.id);
      const cardIds = [...source.matchAll(/<article\b[^>]*\bclass="seo-qa-card"[^>]*\bdata-card-id="([^"]+)"/giu)]
        .map((match) => match[1]);
      assert.deepEqual(cardIds, expectedIds, `${relative}: original curated card order`);
      assert.equal(new Set(cardIds).size, cardIds.length, `${relative}: no duplicate curated card`);

      const quiz = nodes.find((node) => hasType(node, "Quiz"));
      assert.ok(quiz, `${relative}: Quiz structured data`);
      assert.equal(quiz.url, canonical, `${relative}: Quiz canonical URL`);
      assert.equal(quiz.inLanguage, lang, `${relative}: Quiz language`);
      assert.deepEqual(
        quiz.hasPart.map((part) => decodeURIComponent(String(part["@id"]).split("#").at(-1))),
        expectedIds,
        `${relative}: structured data follows the curated source selection`,
      );
      for (const card of expectedCards) {
        assert.ok(source.includes(escapeHtml(card.question[lang])), `${relative}: visible question ${card.id}`);
        assert.ok(source.includes(escapeHtml(card.answer[lang])), `${relative}: visible answer ${card.id}`);
      }
      assert.deepEqual(
        quiz.educationalAlignment
          .filter((item) => item.alignmentType === "educationalSubject")
          .map((item) => item.targetName),
        experience.subjects[lang],
        `${relative}: editorial subject framing`,
      );
      assert.equal(other === "ar" || other === "en", true);
    }
  }
});

test("collections and about are newly authored hubs, not inherited bulk SEO pages", () => {
  const hubs = [
    ["collections.html", "ar/collections/index.html", "/collections", "/ar/collections/", "CollectionPage"],
    ["about.html", "ar/about/index.html", "/about", "/ar/about/", "AboutPage"],
  ];
  for (const [enRelative, arRelative, enPath, arPath, structuredType] of hubs) {
    for (const [relative, lang, ownPath, otherPath] of [[enRelative, "en", enPath, arPath], [arRelative, "ar", arPath, enPath]]) {
      const source = read(relative);
      assert.equal(link(source, "canonical"), `${siteOrigin}${ownPath}`, `${relative}: self canonical`);
      assert.equal(link(source, "alternate", "en"), `${siteOrigin}${enPath}`, `${relative}: English alternate`);
      assert.equal(link(source, "alternate", "ar"), `${siteOrigin}${arPath}`, `${relative}: Arabic alternate`);
      assert.match(source, new RegExp(`<html\\b[^>]*\\blang="${lang}"`, "iu"), `${relative}: language`);
      assert.match(source, /\/assets\/riddlearabia-logo\.webp/u, `${relative}: supplied logo`);
      assert.doesNotMatch(source, /\bJAKH(?:\s+Riddles)?\b|(?:https?:\/\/)?(?:www\.)?jakh\.net/iu, `${relative}: retired identity`);
      assert.ok(jsonLdNodes(source).some((node) => hasType(node, structuredType)), `${relative}: ${structuredType} structured data`);
      assert.equal(otherPath.length > 0, true);
    }
  }

  for (const lang of ["en", "ar"]) {
    const relative = lang === "en" ? "collections.html" : "ar/collections/index.html";
    const source = read(relative);
    const expectedHrefs = RIDDLE_ARABIA_SEO_PAGES.map((page) => page.paths[lang]);
    assert.equal((source.match(/class="seo-hub-card"/gu) || []).length, RIDDLE_ARABIA_SEO_PAGES.length, `${relative}: one purposeful card per experience`);
    for (const href of expectedHrefs) assert.match(source, new RegExp(`href="${escapeRegex(href)}"`, "u"), `${relative}: links ${href}`);
  }
});

test("all topic routes remain functional noindex application shells without static SEO pagination", () => {
  assert.equal(catalog.categories.length, 56, "source categories stay available to the app");
  for (const category of catalog.categories) {
    for (const [lang, relative, canonical, alternate] of [
      ["en", `${category.slug}.html`, `${siteOrigin}/${category.slug}`, `${siteOrigin}/ar/topics/${category.slug}/`],
      ["ar", `ar/topics/${category.slug}/index.html`, `${siteOrigin}/ar/topics/${category.slug}/`, `${siteOrigin}/${category.slug}`],
    ]) {
      const source = read(relative);
      assert.equal(link(source, "canonical"), canonical, `${relative}: self canonical`);
      assert.equal(link(source, "alternate", "en"), `${siteOrigin}/${category.slug}`, `${relative}: English alternate`);
      assert.equal(link(source, "alternate", "ar"), `${siteOrigin}/ar/topics/${category.slug}/`, `${relative}: Arabic alternate`);
      assert.match(meta(source, "name", "robots"), /\bnoindex\b/iu, `${relative}: excluded from the search sitemap`);
      assert.match(source, new RegExp(`<body\\b[^>]*data-page="category"[^>]*data-category="${escapeRegex(category.slug)}"`, "u"), `${relative}: app category binding`);
      assert.match(source, /<img\b[^>]*\bid="categoryImage"/u, `${relative}: dynamic category illustration mount`);
      assert.match(source, /<script src="\/app\.js\?v=/u, `${relative}: application runtime`);
      assert.doesNotMatch(source, /<article\b[^>]*(?:riddle-card|seo-qa-card)/iu, `${relative}: no static SEO card copy`);
      assert.doesNotMatch(source, /<link\b[^>]*\brel="(?:prev|next)"|\/page\//iu, `${relative}: no pagination graph`);
      assert.match(source, new RegExp(`<html\\b[^>]*\\blang="${lang}"`, "iu"), `${relative}: language`);
      assert.equal(alternate.length > 0, true);
    }
    assert.equal(fs.existsSync(path.join(root, category.slug, "page")), false, `${category.slug}: English pagination deleted`);
    assert.equal(fs.existsSync(path.join(root, "ar", "topics", category.slug, "page")), false, `${category.slug}: Arabic pagination deleted`);
  }
});

test("the sitemap is exactly the compact indexable architecture", () => {
  const pairs = [
    ["/", "/ar/"],
    ["/mind-lab", "/ar/mind-lab/"],
    ["/collections", "/ar/collections/"],
    ["/play", "/ar/play/"],
    ["/about", "/ar/about/"],
    ["/privacy", "/ar/privacy/"],
    ...RIDDLE_ARABIA_SEO_PAGES.map((page) => [page.paths.en, page.paths.ar]),
    ...RIDDLE_ARABIA_GAME_CATALOG.map((game) => [`/${game.slug}`, `/ar/games/${game.slug}/`]),
  ];
  const entries = sitemapEntries();
  const urls = entries.map((entry) => entry.loc);
  const expectedUrls = pairs.flatMap(([enPath, arPath]) => [`${siteOrigin}${enPath}`, `${siteOrigin}${arPath}`]);
  assert.deepEqual(urls.sort(), [...expectedUrls].sort(), "only indexable, purposeful routes belong in the sitemap");
  assert.equal(new Set(urls).size, urls.length, "sitemap must not duplicate a route");
  for (const [enPath, arPath] of pairs) {
    const en = `${siteOrigin}${enPath}`;
    const ar = `${siteOrigin}${arPath}`;
    for (const canonical of [en, ar]) {
      const entry = entries.find((candidate) => candidate.loc === canonical);
      assert.ok(entry, `${canonical}: sitemap entry`);
      assert.match(entry.block, new RegExp(`hreflang="en" href="${escapeRegex(en)}"`, "u"), `${canonical}: English alternate`);
      assert.match(entry.block, new RegExp(`hreflang="ar" href="${escapeRegex(ar)}"`, "u"), `${canonical}: Arabic alternate`);
      assert.match(entry.block, new RegExp(`hreflang="x-default" href="${escapeRegex(en)}"`, "u"), `${canonical}: default alternate`);
    }
  }
  assert.equal(urls.some((url) => /\/ar\/topics\/|\/(?:science|logic-puzzles|kids-riddles)(?:\/|$)/u.test(new URL(url).pathname)), false, "functional category shells are intentionally noindex");
});

test("retired SEO directories and every paginated artifact are absent from the public source", () => {
  for (const relative of RETIRED_LEGACY_SEO_DIRECTORIES) {
    assert.equal(fs.existsSync(path.join(root, relative)), false, `${relative}: retired legacy directory`);
  }
  const htmlFiles = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if ([".git", "node_modules", "site-worker", "worker", "dist"].includes(entry.name)) continue;
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile() && entry.name.endsWith(".html")) htmlFiles.push(path.relative(root, filename).split(path.sep).join("/"));
    }
  };
  visit(root);
  assert.equal(htmlFiles.some((relative) => /(?:^|\/)page\/\d+\/index\.html$/u.test(relative)), false, "no public pagination artifact may return");
});
