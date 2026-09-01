import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteOrigin = "https://jakh.net";
const pageSize = 20;
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalog.json"), "utf8"));
const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function meta(source, attribute, value) {
  const pattern = new RegExp(`<meta\\s+${attribute}="${escapeRegex(value)}"\\s+content="([^"]*)"`, "iu");
  return source.match(pattern)?.[1] || "";
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
  return source.match(/<title>([\s\S]*?)<\/title>/iu)?.[1].replace(/\s+/gu, " ").trim() || "";
}

function description(source) {
  return meta(source, "name", "description");
}

function articleIds(source, expectedClass) {
  return [...source.matchAll(/<article\b[^>]*>/giu)]
    .filter((match) => (match[0].match(/\bclass="([^"]*)"/iu)?.[1] || "").split(/\s+/u).includes(expectedClass))
    .map((match) => match[0].match(/\bdata-id="([^"]+)"/iu)?.[1] || "");
}

function quiz(source) {
  for (const match of source.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/giu)) {
    const document = JSON.parse(match[1]);
    const nodes = Array.isArray(document?.["@graph"]) ? document["@graph"] : [document];
    const value = nodes.find((node) => node?.["@type"] === "Quiz");
    if (value) return value;
  }
  return null;
}

function topicRelative(slug, lang, pageNumber) {
  if (pageNumber === 1) return lang === "ar" ? `ar/topics/${slug}/index.html` : `${slug}.html`;
  return lang === "ar"
    ? `ar/topics/${slug}/page/${pageNumber}/index.html`
    : `${slug}/page/${pageNumber}/index.html`;
}

function topicUrl(slug, lang, pageNumber) {
  if (pageNumber === 1) {
    return lang === "ar" ? `${siteOrigin}/ar/topics/${slug}/` : `${siteOrigin}/${slug}`;
  }
  return lang === "ar"
    ? `${siteOrigin}/ar/topics/${slug}/page/${pageNumber}/`
    : `${siteOrigin}/${slug}/page/${pageNumber}/`;
}

function sitemapBlock(url) {
  return [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/gu)]
    .map((match) => match[1])
    .find((block) => block.includes(`<loc>${url}</loc>`)) || "";
}

test("every bilingual topic card appears exactly once across crawlable source pages", () => {
  const pageTitles = { en: new Set(), ar: new Set() };
  const pageDescriptions = { en: new Set(), ar: new Set() };
  let expectedTotal = 0;

  for (const category of catalog.categories) {
    const cards = JSON.parse(read(`data/${category.slug}.json`));
    const expectedIds = cards.map((card) => card.id);
    const totalPages = Math.ceil(cards.length / pageSize);
    expectedTotal += cards.length;

    for (const lang of ["en", "ar"]) {
      const seen = [];
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        const relative = topicRelative(category.slug, lang, pageNumber);
        const source = read(relative);
        const canonical = topicUrl(category.slug, lang, pageNumber);
        const alternateLang = lang === "ar" ? "en" : "ar";
        const sliceCards = cards.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
        const slice = sliceCards.map((card) => card.id);
        const ids = articleIds(source, pageNumber === 1 ? "riddle-card" : "seo-qa-card");

        assert.deepEqual(ids, slice, `${relative} card slice`);
        assert.equal(new Set(ids).size, ids.length, `${relative} duplicate card ID`);
        assert.equal(link(source, "canonical"), canonical, `${relative} canonical`);
        assert.equal(link(source, "alternate", "en"), topicUrl(category.slug, "en", pageNumber));
        assert.equal(link(source, "alternate", "ar"), topicUrl(category.slug, "ar", pageNumber));
        assert.equal(link(source, "alternate", "x-default"), topicUrl(category.slug, "en", pageNumber));
        assert.equal(link(source, "alternate", alternateLang), topicUrl(category.slug, alternateLang, pageNumber));
        assert.equal(link(source, "prev"), pageNumber > 1 ? topicUrl(category.slug, lang, pageNumber - 1) : "");
        assert.equal(link(source, "next"), pageNumber < totalPages ? topicUrl(category.slug, lang, pageNumber + 1) : "");
        assert.ok(!source.includes("/page/1/"), `${relative} must not link a synthetic page 1 route`);

        const pageQuiz = quiz(source);
        assert.ok(pageQuiz, `${relative} Quiz JSON-LD`);
        assert.equal(pageQuiz.url, canonical);
        assert.deepEqual(
          pageQuiz.hasPart.map((part) => decodeURIComponent(part["@id"].split("#").pop())),
          slice,
          `${relative} Quiz slice`,
        );
        for (const id of ids) {
          const articleStart = source.indexOf(`<article class="${pageNumber === 1 ? "riddle-card" : "seo-qa-card"}" id="${id}"`);
          assert.notEqual(articleStart, -1, `${relative} ${id} has a stable HTML id`);
        }
        const hasPublicReviewInfo = sliceCards.some((card) => (
          card.review?.status === "reviewed"
          || card.review?.safetySensitive === true
          || card.review?.priority === "high"
        ));
        if (hasPublicReviewInfo) {
          assert.match(source, /class="card-review card-review--(?:pending|reviewed)/u, `${relative} review provenance`);
        }
        assert.doesNotMatch(source, /Editorial fact review pending|المراجعة التحريرية للحقائق معلّقة/u, `${relative} hides internal review workflow`);
        assert.ok(!/\bhref="[^"]*\?lang=/iu.test(source), `${relative} must use physical locale routes`);
        if (pageNumber > 1) {
          assert.ok(!source.includes("/app.js"), `${relative} must remain static-only`);
          assert.ok(!source.includes('data-page="category"'), `${relative} must not invoke category runtime`);
        } else if (totalPages > 1) {
          assert.ok(source.includes(topicUrl(category.slug, lang, 2)), `${relative} links page 2`);
        }

        const pageTitle = title(source);
        const pageDescription = description(source);
        assert.ok(pageTitle && !pageTitles[lang].has(pageTitle), `${relative} needs a unique title`);
        assert.ok(pageDescription && !pageDescriptions[lang].has(pageDescription), `${relative} needs a unique description`);
        pageTitles[lang].add(pageTitle);
        pageDescriptions[lang].add(pageDescription);

        const block = sitemapBlock(canonical);
        assert.ok(block, `${canonical} is missing from sitemap`);
        for (const targetLang of ["en", "ar"]) {
          assert.ok(
            block.includes(`hreflang="${targetLang}" href="${topicUrl(category.slug, targetLang, pageNumber)}"`),
            `${canonical} sitemap ${targetLang} alternate`,
          );
        }
        seen.push(...ids);
      }
      assert.deepEqual(seen, expectedIds, `${category.slug}/${lang} complete ordered coverage`);
    }
  }
  assert.equal(expectedTotal, 3_553);
});

test("reviewed cards expose their dated reviewer and safe source links on the correct page", () => {
  for (const category of catalog.categories) {
    const cards = JSON.parse(read(`data/${category.slug}.json`));
    for (const [index, card] of cards.entries()) {
      if (card.review?.status !== "reviewed") continue;
      const pageNumber = Math.floor(index / pageSize) + 1;
      for (const lang of ["en", "ar"]) {
        const relative = topicRelative(category.slug, lang, pageNumber);
        const source = read(relative);
        assert.ok(source.includes(card.review.reviewedAt), `${relative} ${card.id} review date`);
        assert.ok(source.includes(card.review.reviewer), `${relative} ${card.id} reviewer`);
        for (const evidence of card.review.sources) {
          const parsed = new URL(evidence.url);
          assert.equal(parsed.protocol, "https:", `${card.id} source protocol`);
          assert.ok(source.includes(evidence.url.replaceAll("&", "&amp;")), `${relative} ${card.id} source URL`);
        }
      }
    }
  }
});

test("shared physical English and Arabic routes are reciprocal sitemap clusters", () => {
  const pairs = [
    ["/", "/ar/"],
    ["/mind-lab", "/ar/mind-lab/"],
    ["/collections", "/ar/collections/"],
    ["/play", "/ar/play/"],
    ["/about", "/ar/about/"],
    ["/privacy", "/ar/privacy/"],
    ...["chess", "mastermind", "go", "reversi", "codenames", "catan", "backgammon", "set", "hanabi", "diplomacy"]
      .map((slug) => [`/${slug}`, `/ar/games/${slug}/`]),
  ];
  for (const [enRoute, arRoute] of pairs) {
    const en = `${siteOrigin}${enRoute}`;
    const ar = `${siteOrigin}${arRoute}`;
    for (const canonical of [en, ar]) {
      const block = sitemapBlock(canonical);
      assert.ok(block, `${canonical} missing from sitemap`);
      assert.ok(block.includes(`hreflang="en" href="${en}"`));
      assert.ok(block.includes(`hreflang="ar" href="${ar}"`));
      assert.ok(block.includes(`hreflang="x-default" href="${en}"`));
    }
  }
});

test("category and collection social metadata references real raster dimensions", () => {
  const files = [
    ...catalog.categories.flatMap((category) => [
      `${category.slug}.html`,
      `ar/topics/${category.slug}/index.html`,
    ]),
    ...fs.readdirSync(path.join(root, "en"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `en/${entry.name}/index.html`),
    ...fs.readdirSync(path.join(root, "ar"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !["topics", "games", "mind-lab", "collections", "play", "about", "privacy"].includes(entry.name))
      .map((entry) => `ar/${entry.name}/index.html`),
  ];
  for (const relative of files) {
    const source = read(relative);
    const imageUrl = meta(source, "property", "og:image");
    const imageType = meta(source, "property", "og:image:type");
    const width = Number(meta(source, "property", "og:image:width"));
    const height = Number(meta(source, "property", "og:image:height"));
    assert.ok(imageUrl.startsWith(`${siteOrigin}/assets/`), `${relative} local social image`);
    assert.ok(["image/jpeg", "image/png", "image/webp"].includes(imageType), `${relative} raster MIME`);
    assert.ok(width >= 300, `${relative} social image width`);
    assert.ok(height >= 157, `${relative} social image height`);
    assert.ok(width / height <= 2.1, `${relative} social image aspect ratio`);
    assert.ok(fs.existsSync(path.join(root, new URL(imageUrl).pathname)), `${relative} social image exists`);
  }
});
