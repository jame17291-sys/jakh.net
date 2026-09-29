import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { RIDDLE_ARABIA_SEO_PAGES } from "./riddlearabia-seo.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAME_SLUGS = [
  "akshifha",
  "chess",
  "mastermind",
  "go",
  "reversi",
  "codenames",
  "catan",
  "backgammon",
  "set",
  "hanabi",
  "diplomacy",
];
const routes = [
  ["ar/index.html", "/", "/ar/"],
  ["ar/mind-lab/index.html", "/mind-lab", "/ar/mind-lab/"],
  ["ar/play/index.html", "/play", "/ar/play/"],
  ["ar/daily/index.html", "/daily", "/ar/daily/"],
  ["ar/privacy/index.html", "/privacy", "/ar/privacy/"],
  ...GAME_SLUGS.map((slug) => [`ar/games/${slug}/index.html`, `/${slug}`, `/ar/games/${slug}/`]),
];
const FRESH_SEO_ROUTES = [
  ["ar/collections/index.html", "/collections", "/ar/collections/"],
  ["ar/about/index.html", "/about", "/ar/about/"],
  ...RIDDLE_ARABIA_SEO_PAGES.map((page) => [
    `${page.paths.ar.slice(1)}index.html`,
    page.paths.en,
    page.paths.ar,
  ]),
];
const ENGLISH_COMMON_ARIA_LABELS = new Set([
  "Riddle Arabia home",
  "Quick actions",
  "Language controls",
  "Language",
  "Category sections",
  "Category filters",
  "Search topics and subtopics",
  "Privacy Centre sections",
  "Riddle Arabia information",
  "Riddle Arabia on Instagram",
  "Riddle Arabia on Facebook",
  "Close",
]);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function decodeHtml(value) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#39|#x[\da-f]+|#\d+);/giu, (entity) => {
    const named = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&#39;": "'" };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    return String.fromCodePoint(entity.toLowerCase().startsWith("&#x")
      ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10));
  });
}

function structuredNodes(html) {
  const nodes = [];
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      if (value["@type"]) nodes.push(value);
      Object.values(value).forEach(visit);
    }
  };
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    visit(JSON.parse(script[1]));
  }
  return nodes;
}

test("all ten Arabic classic-game schemas describe their own localized page", () => {
  for (const slug of GAME_SLUGS.filter((value) => value !== "akshifha")) {
    const file = `ar/games/${slug}/index.html`;
    const html = read(file);
    const games = structuredNodes(html).filter((node) => [node["@type"]].flat().includes("VideoGame"));
    assert.equal(games.length, 1, `${file}: one game schema`);
    const game = games[0];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/u)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)"/u)?.[1];
    assert.equal(canonical, `https://riddlearabia.com/ar/games/${slug}/`, `${file}: self canonical`);
    assert.equal(game.url, canonical, `${file}: schema must not point to the English game`);
    assert.equal(game.inLanguage, "ar", `${file}: Arabic schema language`);
    assert.match(game.name, /[\u0600-\u06ff]{2}/u, `${file}: localized game name`);
    assert.match(game.description, /[\u0600-\u06ff]{4}/u, `${file}: localized game description`);
    assert.equal(game.description, decodeHtml(description || ""), `${file}: schema matches the public description`);
    const englishGame = structuredNodes(read(`${slug}.html`)).find((node) => [node["@type"]].flat().includes("VideoGame"));
    assert.notEqual(game.name, englishGame?.name, `${file}: English name must not leak into Arabic schema`);
  }
});

for (const [lang, file] of [["en", "play.html"], ["ar", "ar/play/index.html"]]) {
  test(`${lang} Play runtime preserves the current static title and search/social descriptions`, () => {
    const html = read(file);
    const title = decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/u)?.[1] || "");
    const description = decodeHtml(html.match(/<meta name="description" content="([^"]+)"/u)?.[1] || "");
    assert.ok(title && description, `${file}: static metadata is present`);
    const metadata = new Map();
    for (const tag of html.matchAll(/<meta\b[^>]*>/giu)) {
      const kind = tag[0].match(/\b(name|property)="([^"]+)"/u);
      if (kind) metadata.set(`meta[${kind[1]}="${kind[2]}"]`, "Stale metadata before runtime");
    }
    const document = {
      title: "Stale title before runtime",
      querySelector(selector) {
        return metadata.has(selector) ? { setAttribute: (attribute, value) => {
          assert.equal(attribute, "content");
          metadata.set(selector, value);
        } } : null;
      },
    };
    const app = read("app.js");
    const start = app.indexOf("function updateDocumentTitle(");
    const end = app.indexOf("\n}", start);
    assert.ok(start >= 0 && end > start, "document metadata updater exists");
    vm.runInNewContext(`${app.slice(start, end + 2)}\nupdateDocumentTitle();`, {
      document, state: { page: "play", lang },
    }, { timeout: 1_000 });
    assert.equal(document.title, title, `${file}: runtime must not restore an obsolete title`);
    for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
      assert.equal(metadata.get(selector), title, `${file}: ${selector}`);
    }
    for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
      assert.equal(metadata.get(selector), description, `${file}: ${selector}`);
    }
  });
}

test("Arabic route generator is deterministic and current", () => {
  const result = spawnSync(process.execPath, ["scripts/generate-arabic-routes.mjs", "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /current \(16 pages\)/u);
});

test("all 16 generator-managed Arabic routes have self canonicals and reciprocal alternates", () => {
  for (const [file, englishPath, arabicPath] of routes) {
    const html = read(file);
    const englishUrl = `https://riddlearabia.com${englishPath}`;
    const arabicUrl = `https://riddlearabia.com${arabicPath}`;
    assert.match(html, /<html\b[^>]*\blang="ar"[^>]*\bdir="rtl"/iu, file);
    assert.match(html, /<body\b[^>]*\bdata-route-lang="ar"/iu, file);
    assert.equal((html.match(new RegExp(`<link rel="canonical" href="${escapeRegex(arabicUrl)}"`, "gu")) || []).length, 1, file);
    assert.equal((html.match(new RegExp(`hreflang="en" href="${escapeRegex(englishUrl)}"`, "gu")) || []).length, 1, file);
    assert.equal((html.match(new RegExp(`hreflang="ar" href="${escapeRegex(arabicUrl)}"`, "gu")) || []).length, 1, file);
    assert.equal((html.match(new RegExp(`hreflang="x-default" href="${escapeRegex(englishUrl)}"`, "gu")) || []).length, 1, file);
    assert.match(html.match(/<title>([\s\S]*?)<\/title>/iu)?.[1] || "", /[\u0600-\u06ff]/u, `${file}: Arabic title`);
    assert.match(html.match(/<meta name="description" content="([^"]+)"/iu)?.[1] || "", /[\u0600-\u06ff]{4}/u, `${file}: Arabic description`);
    const bodyArabicCharacters = (html.match(/<body\b[\s\S]*?<\/body>/iu)?.[0] || "").match(/[\u0600-\u06ff]/gu) || [];
    assert.ok(bodyArabicCharacters.length >= 10, `${file}: Arabic body copy`);
    assert.doesNotMatch(html, /(?:href|src|srcset)="(?:assets\/|styles\.css|app\.js|game-i18n\.js|manifest\.webmanifest)/iu, `${file}: root-relative resources`);
    assert.doesNotMatch(html, /href="[^"]*[?&]lang=(?:ar|en)(?:[&#"])/iu, `${file}: retired language query`);
    assert.doesNotMatch(html, /\/\s+(?:aria-|data-|class=|id=|placeholder=|title=)/iu, `${file}: malformed self-closing tag`);
    const header = html.match(/<header\b[^>]*\bclass="[^"]*\bsite-header\b[^"]*"[^>]*>[\s\S]*?<\/header>/iu)?.[0] || "";
    for (const destination of ["/ar/", "/ar/mind-lab/", "/ar/play/", "/ar/daily/"]) {
      assert.match(header, new RegExp(`href="${escapeRegex(destination)}"`, "u"), `${file}: shared Arabic destination ${destination}`);
    }
    assert.match(header, new RegExp(`class="language-route-link" href="${escapeRegex(englishPath)}"`, "u"), `${file}: language link returns to the equivalent English page`);
    assert.match(header, /<a\b[^>]*data-site-profile[^>]*href="\/ar\/mind-lab\/\?profile=1"/u, `${file}: Arabic Profile fallback`);
    assert.match(html, /<script defer src="\/site-navigation\.js"><\/script>/u, `${file}: shared navigation runtime`);
  }
});

test("freshly authored Arabic SEO routes retain their own reciprocal route contracts", () => {
  for (const [file, englishPath, arabicPath] of FRESH_SEO_ROUTES) {
    const html = read(file);
    const englishUrl = `https://riddlearabia.com${englishPath}`;
    const arabicUrl = `https://riddlearabia.com${arabicPath}`;
    assert.match(html, /<html\b[^>]*\blang="ar"[^>]*\bdir="rtl"/iu, file);
    assert.equal((html.match(new RegExp(`<link rel="canonical" href="${escapeRegex(arabicUrl)}"`, "gu")) || []).length, 1, file);
    assert.equal((html.match(new RegExp(`hreflang="en" href="${escapeRegex(englishUrl)}"`, "gu")) || []).length, 1, file);
    assert.equal((html.match(new RegExp(`hreflang="ar" href="${escapeRegex(arabicUrl)}"`, "gu")) || []).length, 1, file);
    assert.match(html.match(/<title>([\s\S]*?)<\/title>/iu)?.[1] || "", /[\u0600-\u06ff]/u, `${file}: Arabic title`);
    assert.match(html, /\/assets\/riddlearabia-logo\.webp/u, `${file}: supplied logo`);
    assert.doesNotMatch(html, /\bJAKH(?:\s+Riddles)?\b|(?:https?:\/\/)?(?:www\.)?jakh\.net/iu, `${file}: retired public identity`);
  }
});

test("Arabic hubs keep shared, game, and topic navigation on clean Arabic paths", () => {
  const home = read("ar/index.html");
  const play = read("ar/play/index.html");
  const mindLab = read("ar/mind-lab/index.html");
  for (const route of ["/ar/", "/ar/mind-lab/", "/ar/collections/", "/ar/play/", "/ar/about/", "/ar/privacy/"]) {
    assert.match(`${home}\n${play}\n${mindLab}`, new RegExp(`href="${escapeRegex(route)}`, "u"), route);
  }
  for (const slug of ["akshifha", "chess", "backgammon"]) {
    assert.match(play, new RegExp(`href="/ar/games/${slug}/(?:\\?[^\"]*)?"`, "u"), slug);
  }
  for (const slug of GAME_SLUGS.filter((slug) => !["akshifha", "chess", "backgammon"].includes(slug))) {
    assert.doesNotMatch(play, new RegExp(`href="/ar/games/${slug}/"`, "u"), `${slug}: preserved but no longer promoted`);
  }
  const topicLinks = [...mindLab.matchAll(/class="category-card[^>]*href="(\/ar\/topics\/[^"/]+\/)"/gu)];
  assert.equal(topicLinks.length, 56);
  assert.equal(new Set(topicLinks.map((match) => match[1])).size, 56);
  assert.doesNotMatch(mindLab, /class="category-card[^>]*href="\/(?!ar\/topics\/)/u);
});

test("no-script Arabic routes localize common accessible names", () => {
  for (const [file] of routes) {
    const html = read(file);
    const ariaLabels = [...html.matchAll(/\baria-label=(?:"([^"]*)"|'([^']*)')/giu)]
      .map((match) => match[1] || match[2]);
    const leaked = ariaLabels.filter((label) => ENGLISH_COMMON_ARIA_LABELS.has(label));
    assert.deepEqual(leaked, [], `${file}: English common aria-labels leaked into Arabic output`);
    const skipLink = html.match(/<a\b[^>]*\bclass="[^"]*\bskip-link\b[^"]*"[^>]*>([\s\S]*?)<\/a>/iu)?.[1] || "";
    assert.match(skipLink, /[\u0600-\u06ff]/u, `${file}: static skip link is localized`);
  }

  for (const file of ["index.html", "mind-lab.html", "play.html", "daily.html", "privacy.html"]) {
    const source = read(file);
    assert.match(source, /class="brand"[^>]*aria-label="Riddle Arabia home"/u, `${file}: named brand link`);
    assert.match(source, /class="primary-navigation"[^>]*aria-label="Primary navigation"/u, `${file}: named primary navigation`);
  }
});

test("runtime language controls route physically and discard only the retired lang parameter", () => {
  const app = read("app.js");
  const site = read("site-i18n.js");
  const game = read("game-i18n.js");
  const privacy = read("privacy-page.js");
  for (const [file, source] of [["app.js", app], ["site-i18n.js", site], ["game-i18n.js", game]]) {
    assert.match(source, /\/ar\/games\/.*slug/u, `${file}: game route mapping`);
    assert.match(source, /searchParams\.delete\(['"]lang['"]\)/u, `${file}: retired parameter removal`);
    assert.match(source, /location\.(?:assign|replace)\(/u, `${file}: physical navigation`);
  }
  assert.match(app, /routeLang \|\| explicitLang \|\| storedLang/u);
  assert.match(site, /return route\?\.lang \|\| null/u);
  assert.match(game, /return route \? route\.lang : null/u);
  assert.match(privacy, /const routeLanguage = privacyRouteLanguage\(\)/u);
  assert.match(privacy, /PRIVACY_ROUTES\[state\.lang\]/u);
  assert.doesNotMatch(privacy, /searchParams\.set\(['"]lang['"]/u);
});
