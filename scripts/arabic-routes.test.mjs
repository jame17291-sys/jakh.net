import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAME_SLUGS = [
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
  ["ar/collections/index.html", "/collections", "/ar/collections/"],
  ["ar/play/index.html", "/play", "/ar/play/"],
  ["ar/about/index.html", "/about", "/ar/about/"],
  ["ar/privacy/index.html", "/privacy", "/ar/privacy/"],
  ...GAME_SLUGS.map((slug) => [`ar/games/${slug}/index.html`, `/${slug}`, `/ar/games/${slug}/`]),
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

test("Arabic route generator is deterministic and current", () => {
  const result = spawnSync(process.execPath, ["scripts/generate-arabic-routes.mjs", "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /current \(16 pages\)/u);
});

test("all 16 physical Arabic routes have self canonicals and reciprocal alternates", () => {
  for (const [file, englishPath, arabicPath] of routes) {
    const html = read(file);
    const englishUrl = `https://jakh.net${englishPath}`;
    const arabicUrl = `https://jakh.net${arabicPath}`;
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
  }
});

test("Arabic hubs keep shared, game, and topic navigation on clean Arabic paths", () => {
  const home = read("ar/index.html");
  const play = read("ar/play/index.html");
  const mindLab = read("ar/mind-lab/index.html");
  for (const route of ["/ar/", "/ar/mind-lab/", "/ar/collections/", "/ar/play/", "/ar/about/", "/ar/privacy/"]) {
    assert.match(`${home}\n${play}\n${mindLab}`, new RegExp(`href="${escapeRegex(route)}`, "u"), route);
  }
  for (const slug of GAME_SLUGS) assert.match(play, new RegExp(`href="/ar/games/${slug}/"`, "u"), slug);
  const topicLinks = [...mindLab.matchAll(/class="category-card[^>]*href="(\/ar\/topics\/[^"/]+\/)"/gu)];
  assert.equal(topicLinks.length, 56);
  assert.equal(new Set(topicLinks.map((match) => match[1])).size, 56);
  assert.doesNotMatch(mindLab, /class="category-card[^>]*href="\/(?!ar\/topics\/)/u);
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
