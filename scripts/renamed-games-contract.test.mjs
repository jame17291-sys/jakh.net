import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { trackedDeployableFiles } from "./build-static-site.mjs";
import { RENAMED_GAME_ROUTES } from "../site-worker/src/seo-route-migrations.js";
import { PUZZLES, BONUS } from "../puzzle-catalog.js";
import { PUZZLE_ROUTES } from "../puzzle-routes.js";

// Seven games were renamed on 2026-10-25 so that no public name copies another
// company's trademark or a New York Times product name. This contract keeps
// the former names out of everything the static build can publish.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const RENAMED_GAMES = Object.freeze([
  { old: "/catan", slug: "island-traders", en: "Island Traders", ar: "جزيرة التجّار" },
  { old: "/codenames", slug: "spy-words", en: "Spy Words", ar: "كلمات السر" },
  { old: "/hanabi", slug: "fireworks", en: "Fireworks", ar: "ألعاب نارية" },
  { old: "/set", slug: "triple-match", en: "Triple Match", ar: "ثلاثيات" },
  { old: "/mastermind", slug: "code-breaker", en: "Code Breaker", ar: "كاسر الشيفرة" },
  { old: "/diplomacy", slug: "alliances", en: "Alliances", ar: "تحالفات" },
]);

// Case-sensitive on purpose: internal identifiers such as `data-game="catan"`,
// `CatanEngine`, `#catan-board` or the `links` puzzle ID keep saved progress
// and are not public names. Arabic names must not be part of a longer word
// (for example "يوكاتان", Yucatán, in a geology question).
const FORMER_NAME_PATTERNS = Object.freeze([
  ["Catan", /\b(?:Catan|CATAN)\b/u],
  ["Codenames", /\b(?:Codenames|CODENAMES|Code Names)\b/u],
  ["Hanabi", /\b(?:Hanabi|HANABI)\b/u],
  ["Mastermind", /\b(?:Mastermind|MASTERMIND|Master Mind)\b/u],
  ["SET", /\bSET\b/u],
  ["Diplomacy", /\b(?:Diplomacy|DIPLOMACY)\b/u],
  ["Connections", /\b(?:Connections|CONNECTIONS)\b/u],
  ["The Mini / The Midi / The Crossword", /\b[Tt]he (?:Mini|Midi)\b|\bThe Crossword\b|\bMidi\b/u],
  ["Arabic Catan", /(?<![ء-ي])كاتان/u],
  ["Arabic Codenames", /كودنيمز|كود نيمز/u],
  ["Arabic Hanabi", /هانابي/u],
  ["Arabic Mastermind", /ماستر ?مايند/u],
  ["Arabic SET", /سِت(?![ء-ي])/u],
  ["Arabic Diplomacy Lite", /دبلوماسية لايت/u],
  ["Arabic Mini Connections", /روابط مصغّرة/u],
]);

// Ordinary uses of a former name's word that are not a game name. Keep this
// list small and specific; each entry is removed before matching.
const ORDINARY_USES = Object.freeze([
  // A history subcategory, not the board game.
  /Wars, Treaties (?:&|&amp;|\\u0026) Diplomacy/gu,
]);

// Question banks and word lists are editorial content, not game names; their
// uppercase dictionary words (for example SET in a Letter Square word list)
// are excluded. Every page, script, style and manifest is still scanned.
const CONTENT_BANKS = /^(?:data\/|puzzle-(?:arabic-words|hive-data|square-data|word-data|group-data)\.js$)/u;
const TEXT_EXTENSIONS = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".xml", ".txt", ".svg"]);

function shippedTextFiles() {
  return trackedDeployableFiles(root)
    .filter((file) => TEXT_EXTENSIONS.has(path.extname(file)))
    .filter((file) => !CONTENT_BANKS.test(file))
    .filter((file) => fs.existsSync(path.join(root, file)));
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("no shipped page, script or manifest uses a former game name", () => {
  const files = shippedTextFiles();
  assert.ok(files.length > 1_000, `expected the full deployable inventory, found ${files.length} files`);
  assert.ok(files.includes("index.html") && files.includes("sitemap.xml") && files.includes("app.js"));
  const leaks = [];
  for (const file of files) {
    let source = read(file);
    for (const ordinary of ORDINARY_USES) source = source.replace(ordinary, "");
    for (const [label, pattern] of FORMER_NAME_PATTERNS) {
      const match = source.match(pattern);
      if (match) {
        const start = Math.max(0, match.index - 40);
        leaks.push(`${file}: ${label}: …${source.slice(start, match.index + match[0].length + 40).replace(/\s+/gu, " ")}…`);
      }
    }
  }
  assert.deepEqual(leaks, []);
});

test("no shipped file links to a former game address", () => {
  const formerAddresses = RENAMED_GAME_ROUTES.flatMap(({ from }) => [from.en, from.ar.replace(/\/$/u, "")]);
  const pattern = new RegExp(
    `(?:href=["']|riddlearabia\\.com|["'\`])(?:${formerAddresses.map((value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|")})(?:\\.html|/(?:index\\.html)?)?(?=["'?#\`])`,
    "u",
  );
  const leaks = shippedTextFiles().filter((file) => pattern.test(read(file)));
  assert.deepEqual(leaks, []);
});

test("renamed game pages exist only at their new bilingual addresses", () => {
  assert.equal(RENAMED_GAME_ROUTES.length, 7);
  for (const game of RENAMED_GAMES) {
    const route = RENAMED_GAME_ROUTES.find(({ from }) => from.en === game.old);
    assert.ok(route, `${game.old} has a redirect`);
    assert.deepEqual(route.to, { en: `/${game.slug}`, ar: `/ar/games/${game.slug}/` });
    assert.equal(fs.existsSync(path.join(root, `${game.old.slice(1)}.html`)), false, `${game.old}.html was removed`);
    assert.equal(fs.existsSync(path.join(root, `ar/games${game.old}`)), false, `Arabic ${game.old} was removed`);

    const english = read(`${game.slug}.html`);
    assert.match(english, new RegExp(`<title>${game.en} Online — Free Browser Game \\| Riddle Arabia</title>`, "u"));
    assert.match(english, new RegExp(`<link rel="canonical" href="https://riddlearabia\\.com/${game.slug}"`, "u"));
    assert.match(english, new RegExp(`<h1\\b[^>]*>[^<]*${game.en}</h1>`, "u"));
    assert.match(english, new RegExp(`"name": "${game.en}"`, "u"), `${game.slug}: structured data name`);

    const arabic = read(`ar/games/${game.slug}/index.html`);
    assert.match(arabic, new RegExp(`<title>${game.ar} أونلاين — لعبة متصفح مجانية \\| ريدل أرابيا</title>`, "u"));
    assert.match(arabic, new RegExp(`<link rel="canonical" href="https://riddlearabia\\.com/ar/games/${game.slug}/"`, "u"));
    assert.match(arabic, new RegExp(`<h1\\b[^>]*>[^<]*${game.ar}</h1>`, "u"));
  }
});

test("renamed games keep their internal IDs so saved progress and translations still load", () => {
  for (const [slug, id] of [
    ["island-traders", "catan"], ["spy-words", "codenames"], ["fireworks", "hanabi"],
    ["triple-match", "set"], ["code-breaker", "mastermind"], ["alliances", "diplomacy"],
  ]) {
    const source = read(`${slug}.html`);
    assert.match(source, new RegExp(`JakhGameI18n\\.register\\(\\s*'${id}'`, "u"), `${slug}: translation registration ID`);
    assert.match(read(`ar/games/${slug}/index.html`), new RegExp(`JakhGameI18n\\.register\\(\\s*'${id}'`, "u"));
  }
  const groups = PUZZLE_ROUTES.find(({ id }) => id === "links");
  assert.deepEqual(groups.paths, { en: "/four-groups", ar: "/ar/games/four-groups/" });
  assert.equal(fs.existsSync(path.join(root, "connections.html")), false);
  assert.equal(fs.existsSync(path.join(root, "ar/games/connections")), false);
});

test("puzzle names use the approved generic names in both languages", () => {
  const title = (id) => PUZZLES.find((puzzle) => puzzle.id === id).title;
  assert.deepEqual(title("links"), ["Four Groups", "أربع مجموعات"]);
  assert.deepEqual(title("mini"), ["Quick Crossword", "الكلمات المتقاطعة السريعة"]);
  assert.deepEqual(title("midi"), ["Medium Crossword", "الكلمات المتقاطعة المتوسطة"]);
  assert.deepEqual(title("crossword"), ["Big Crossword", "الكلمات المتقاطعة الكبيرة"]);
  assert.deepEqual(BONUS.find((item) => item.id === "links").title, ["Three Groups", "ثلاث مجموعات"]);
  for (const [file, name] of [
    ["four-groups.html", "Four Groups"], ["mini-crossword.html", "Quick Crossword"],
    ["midi-crossword.html", "Medium Crossword"], ["crossword.html", "Big Crossword"],
    ["ar/games/four-groups/index.html", "أربع مجموعات"], ["ar/games/mini-crossword/index.html", "الكلمات المتقاطعة السريعة"],
  ]) {
    assert.match(read(file), new RegExp(`<h1 id="puzzle-title" tabindex="-1">${name}</h1>`, "u"), file);
  }
});
