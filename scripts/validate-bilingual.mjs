import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const games = [
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
const sitePages = {
  "collections.html": "collections",
  "about.html": "about",
  "404.html": "notFound",
};
const mojibake = /(?:Ã.|Â.|â€|â€™|ï¿½|\uFFFD)/u;

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function extractObject(source, marker, label) {
  const markerIndex = typeof marker === "string" ? source.indexOf(marker) : source.search(marker);
  if (markerIndex < 0) {
    fail(`${label}: could not find translation object marker`);
    return null;
  }
  const start = source.indexOf("{", markerIndex);
  if (start < 0) {
    fail(`${label}: translation object has no opening brace`);
    return null;
  }

  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const literal = source.slice(start, index + 1);
        try {
          return vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1_000 });
        } catch (error) {
          fail(`${label}: translation object cannot be evaluated: ${error.message}`);
          return null;
        }
      }
    }
  }
  fail(`${label}: translation object is not balanced`);
  return null;
}

function assertParity(label, translations) {
  if (!translations?.en || !translations?.ar) {
    fail(`${label}: both en and ar dictionaries are required`);
    return new Set();
  }
  const enKeys = Object.keys(translations.en).sort();
  const arKeys = Object.keys(translations.ar).sort();
  for (const key of enKeys) {
    if (!Object.hasOwn(translations.ar, key)) fail(`${label}: Arabic dictionary is missing "${key}"`);
  }
  for (const key of arKeys) {
    if (!Object.hasOwn(translations.en, key)) fail(`${label}: English dictionary is missing "${key}"`);
  }
  for (const lang of ["en", "ar"]) {
    for (const [key, value] of Object.entries(translations[lang])) {
      if (typeof value === "string" && !value.trim()) fail(`${label}: ${lang}.${key} is blank`);
      if (typeof value !== "string" && typeof value !== "function") {
        fail(`${label}: ${lang}.${key} must be a string or formatter function`);
      }
    }
  }
  return new Set(enKeys.filter((key) => Object.hasOwn(translations.ar, key)));
}

function attributeKeys(source) {
  return new Set(
    [...source.matchAll(/\bdata-i18n(?:-html|-aria-label|-title|-placeholder)=["']([^"']+)["']/giu)]
      .map((match) => match[1]),
  );
}

function literalRuntimeKeys(source) {
  return new Set(
    [...source.matchAll(/\b(?:JakhGameI18n|I)\.t\(\s*["']([^"']+)["']/gu)]
      .map((match) => match[1]),
  );
}

function registeredGameTranslations(source, game, label) {
  const registration = new RegExp(`JakhGameI18n\\.register\\(\\s*["']${game}["']\\s*,`, "u");
  const scripts = source.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/giu);
  for (const match of scripts) {
    const attributes = match[1] || "";
    if (/type=["']application\/ld\+json["']/iu.test(attributes)) continue;
    const code = match[2] || "";
    if (!registration.test(code)) continue;
    let captured = null;
    const sandbox = {
      JakhGameI18n: {
        register(id, translations) {
          if (id === game) captured = translations;
        },
      },
    };
    try {
      vm.runInNewContext(code, sandbox, { timeout: 1_000 });
    } catch (error) {
      if (!captured) fail(`${label}: registration script cannot be evaluated: ${error.message}`);
    }
    if (captured) return captured;
  }
  fail(`${label}: could not evaluate JakhGameI18n.register("${game}", ...)`);
  return null;
}

function assertKnownKeys(label, usedKeys, availableKeys) {
  for (const key of usedKeys) {
    if (!availableKeys.has(key)) fail(`${label}: unknown bilingual key "${key}"`);
  }
}

const appSource = read("app.js");
const appUi = extractObject(appSource, "const UI =", "app.js UI");
const appKeys = assertParity("app.js UI", appUi);
for (const selector of [
  'meta[name="description"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:description"]',
  'meta[property="og:image:alt"]',
  'meta[name="twitter:image:alt"]',
]) {
  if (!appSource.includes(selector)) fail(`app.js: language changes do not update ${selector}`);
}
if (!/querySelectorAll\(["']button\[data-close-modal=["']auth["']\]["']\)/u.test(appSource)) {
  fail("app.js: the account-dialog close button is not localized");
}
const catalog = JSON.parse(read("data/catalog.json"));
const appPages = [
  "index.html",
  "mind-lab.html",
  "play.html",
  ...(catalog.categories || []).map((category) => `${category.slug}.html`),
];

for (const file of appPages) {
  const source = read(file);
  if (!/<select[^>]+id=["']langSelect["']/iu.test(source)) fail(`${file}: missing visible language selector`);
  if (!/<script[^>]+src=["'][^"']*app\.js(?:\?[^"']*)?["']/iu.test(source)) fail(`${file}: missing app.js`);
  assertKnownKeys(file, attributeKeys(source), appKeys);
}

const siteRuntime = read("site-i18n.js");
for (const [label, runtime] of [["site-i18n.js", siteRuntime], ["game-i18n.js", read("game-i18n.js")]]) {
  if (!runtime.includes("searchParams.get('lang')") || !runtime.includes("searchParams.delete('lang')")) {
    fail(`${label}: explicit ?lang requests are not consumed`);
  }
  if (!runtime.includes("history.replaceState")) {
    fail(`${label}: consumed language requests do not preserve the remaining URL`);
  }
}
const siteCommon = extractObject(siteRuntime, "const COMMON =", "site-i18n.js COMMON");
const sitePageTranslations = extractObject(siteRuntime, "const PAGES =", "site-i18n.js PAGES");
const siteCommonKeys = assertParity("site-i18n.js COMMON", siteCommon);

for (const [file, page] of Object.entries(sitePages)) {
  const source = read(file);
  const pageTranslations = sitePageTranslations?.[page];
  const pageKeys = assertParity(`site-i18n.js ${page}`, pageTranslations);
  const available = new Set([...siteCommonKeys, ...pageKeys]);
  if (!source.includes(`data-i18n-page="${page}"`)) fail(`${file}: missing data-i18n-page="${page}"`);
  if (!/<select[^>]+id=["']langSelect["']/iu.test(source)) fail(`${file}: missing visible language selector`);
  if (!/<script[^>]+src=["'][^"']*site-i18n\.js(?:\?[^"']*)?["']/iu.test(source)) fail(`${file}: missing site-i18n.js`);
  assertKnownKeys(file, attributeKeys(source), available);
}

const gameRuntime = read("game-i18n.js");
const gameCommon = extractObject(gameRuntime, "var COMMON =", "game-i18n.js COMMON");
const gameCommonKeys = assertParity("game-i18n.js COMMON", gameCommon);

for (const game of games) {
  const file = `${game}.html`;
  const source = read(file);
  const translations = registeredGameTranslations(source, game, `${file} translations`);
  const pageKeys = assertParity(`${file} translations`, translations);
  const available = new Set([...gameCommonKeys, ...pageKeys]);
  if (!source.includes(`data-game="${game}"`)) fail(`${file}: missing data-game="${game}"`);
  if (!/<select[^>]+id=["']langSelect["']/iu.test(source)) fail(`${file}: missing visible language selector`);
  if (!/<script[^>]+src=["'][^"']*game-i18n\.js(?:\?[^"']*)?["']/iu.test(source)) fail(`${file}: missing game-i18n.js`);
  if (!/\b[A-Za-z_$][\w$]*\.onChange\(/u.test(source)) {
    fail(`${file}: language changes do not rerender live game state`);
  }
  if (game === "chess" && (!/\.tabIndex\s*=/u.test(source) || !/addEventListener\(["']keydown["']/u.test(source))) {
    fail(`${file}: chess squares are not keyboard operable`);
  }
  if (game === "go" && (!/<canvas[^>]+tabindex=["']0["']/iu.test(source) || !/addEventListener\(["']keydown["']/u.test(source))) {
    fail(`${file}: Go board is not keyboard operable`);
  }
  if (game === "catan" && (!/cell\.tabIndex\s*=/u.test(source) || !/cell\.addEventListener\(["']keydown["']/u.test(source))) {
    fail(`${file}: Catan hexes are not keyboard operable`);
  }
  if (game === "set" && !/<div[^>]+class=["'][^"']*\bset-grid\b[^"']*["'][^>]+dir=["']ltr["']/iu.test(source)) {
    fail(`${file}: SET physical card grid must remain left-to-right`);
  }
  assertKnownKeys(file, new Set([...attributeKeys(source), ...literalRuntimeKeys(source)]), available);
}

const localizedPages = { en: [], ar: [] };
for (const lang of ["en", "ar"]) {
  const langRoot = path.join(root, lang);
  for (const entry of fs.readdirSync(langRoot, { withFileTypes: true })) {
    const relative = `${lang}/${entry.name}/index.html`;
    if (entry.isDirectory() && fs.existsSync(path.join(root, relative))) localizedPages[lang].push(relative);
  }
  localizedPages[lang].sort();
}
if (localizedPages.en.length !== localizedPages.ar.length || localizedPages.en.length !== 6) {
  fail(`localized collections: expected 6 English and 6 Arabic pages, found ${localizedPages.en.length} and ${localizedPages.ar.length}`);
}
for (const [lang, files] of Object.entries(localizedPages)) {
  for (const file of files) {
    const source = read(file);
    const dir = lang === "ar" ? "rtl" : "ltr";
    const other = lang === "ar" ? "en" : "ar";
    if (!new RegExp(`<html[^>]+lang=["']${lang}["'][^>]+dir=["']${dir}["']`, "iu").test(source)) {
      fail(`${file}: expected lang="${lang}" and dir="${dir}"`);
    }
    if (!new RegExp(`hreflang=["']${other}["']`, "iu").test(source)) fail(`${file}: missing reciprocal ${other} hreflang`);
    if (!new RegExp(`lang=["']${other}["'][^>]+dir=["']${other === "ar" ? "rtl" : "ltr"}["']`, "iu").test(source)) {
      fail(`${file}: language switch must declare ${other} direction`);
    }
    if (lang === "ar" && !/(?:\?lang=ar|&amp;lang=ar)/u.test(source)) {
      fail(`${file}: Arabic internal app links do not preserve the locale`);
    }
  }
}

let cardCount = 0;
for (const category of catalog.categories || []) {
  const cards = JSON.parse(read(`data/${category.slug}.json`));
  for (const card of cards) {
    cardCount += 1;
    for (const field of ["question", "answer", "subcategory"]) {
      for (const lang of ["en", "ar"]) {
        const value = card?.[field]?.[lang];
        if (typeof value !== "string" || !value.trim()) {
          fail(`data/${category.slug}.json ${card?.id || "unknown"}: missing ${field}.${lang}`);
        } else if (mojibake.test(value)) {
          fail(`data/${category.slug}.json ${card?.id || "unknown"}: mojibake in ${field}.${lang}`);
        }
      }
    }
  }
}
if (cardCount !== 3_553) fail(`question bank: expected 3,553 cards, found ${cardCount}`);

if (failures.length) {
  console.error(`Bilingual validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Bilingual validation passed: ${appPages.length} app pages, ${Object.keys(sitePages).length} static pages, `
  + `${games.length} games, ${localizedPages.en.length + localizedPages.ar.length} localized collections, and ${cardCount} cards.`,
);
