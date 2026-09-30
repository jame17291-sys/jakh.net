import { PUZZLE_ROUTES, puzzlePath } from '../puzzle-routes.js';
import { SHOWS } from '../tv-trivia-engine.js';
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { loadProductionQuarantine } from "./publication-quarantine.mjs";
import { PUZZLES, BONUS } from "../puzzle-catalog.js";
import { ILLUSTRATIONS, TOPIC_ILLUSTRATIONS, GAME_ILLUSTRATIONS, gameIllustrationId } from "../site-illustrations.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "catalog.json"), "utf8"));
const failures = [];
const quarantine = loadProductionQuarantine(root);
const publicTopics = catalog.categories.filter(({slug}) => !quarantine.categorySlugs.has(slug));
const assigned = [...Object.values(TOPIC_ILLUSTRATIONS), ...Object.values(GAME_ILLUSTRATIONS)];
if (new Set(assigned).size !== assigned.length) failures.push('Distinct topics and games must never share an illustration');
if (publicTopics.length !== 51 || publicTopics.some(({slug}) => !TOPIC_ILLUSTRATIONS[slug])) failures.push('All 51 public topics need exclusive artwork');
if (Object.keys(TOPIC_ILLUSTRATIONS).length !== publicTopics.length) failures.push('Artwork topic inventory must match the public catalog');
for (const game of [...PUZZLES, ...BONUS]) {
  if (!gameIllustrationId(game.id, game.variant)) failures.push(`${game.id}/${game.variant || 'standard'}: missing game artwork`);
}
const hashes = new Map();
for (const id of assigned) {
  const filename = path.join(root, `assets/illustrations/${id}-480.webp`);
  if (!fs.existsSync(filename)) continue;
  const hash = createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  if (hashes.has(hash)) failures.push(`${id}: duplicates the image for ${hashes.get(hash)}`);
  hashes.set(hash, id);
}

// Section and introduction artwork uses two local WebP sizes. Original PNGs
// and superseded drafts are intentionally excluded from the deployed site.
for (const id of ILLUSTRATIONS) {
  for (const width of [480, 960]) {
    const relative = `assets/illustrations/${id}-${width}.webp`;
    if (!fs.existsSync(path.join(root, relative))) failures.push(`${relative}: missing responsive image`);
  }
}

for (const category of catalog.categories || []) {
  const relative = `assets/${category.slug}.svg`;
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) {
    failures.push(`${relative}: missing unified category illustration`);
    continue;
  }
  const svg = fs.readFileSync(target, "utf8");
  if (!/data-jakh-category-art="v1"/u.test(svg)) failures.push(`${relative}: missing unified-art marker`);
  if (!/width="640" height="420" viewBox="0 0 640 420"/u.test(svg)) {
    failures.push(`${relative}: expected the standard 640x420 view box`);
  }
}

for (const obsolete of ["assets/backgrounds", "assets/backgrounds_new"]) {
  if (fs.existsSync(path.join(root, obsolete))) failures.push(`${obsolete}: obsolete media directory still exists`);
}

const generatedFiles = [
  "mind-lab.html",
  "ar/mind-lab/index.html",
  ...(catalog.categories || []).flatMap(({ slug }) => [
    `${slug}.html`,
    `ar/topics/${slug}/index.html`,
  ]),
];
for (const relative of generatedFiles) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) {
    failures.push(`${relative}: missing generated topic or directory page`);
    continue;
  }
  const html = fs.readFileSync(target, "utf8");
  if (/assets\/backgrounds(?:_new)?\//u.test(html)) failures.push(`${relative}: references obsolete category media`);
  for (const category of catalog.categories || []) {
    if (html.includes(`/assets/${category.slug}.svg`)) {
      failures.push(`${relative}: unnecessarily loads ${category.slug} artwork on a compact question route`);
    }
  }
  if (relative === "mind-lab.html" || relative === "ar/mind-lab/index.html") {
    const directory = html.match(/<!-- SEO:DIRECTORY:START -->([\s\S]*?)<!-- SEO:DIRECTORY:END -->/u)?.[1] || "";
    if (!directory) failures.push(`${relative}: missing no-script topic directory`);
    const sectionImages = [...directory.matchAll(/<img\b[^>]*class="ra-art ra-art-section"[^>]*>/gu)].map(([tag]) => tag);
    if (sectionImages.length !== catalog.sections.length || sectionImages.some((tag) => (
      !tag.includes('class="ra-art ra-art-section"') || !tag.includes('loading="lazy"')
      || !tag.includes('width="960" height="640"') || !tag.includes('alt=""')
      || !tag.includes('srcset=') || !tag.includes('sizes=')
    ))) {
      failures.push(`${relative}: expected one responsive decorative image per section`);
    }
    const cards = [...directory.matchAll(/<a class="category-card compact-topic-card" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)];
    if (cards.length !== (catalog.categories || []).length || new Set(cards.map(([, href]) => href)).size !== cards.length) {
      failures.push(`${relative}: expected one compact no-script link per source topic`);
    }
    for (const category of catalog.categories || []) {
      const expected = relative.startsWith("ar/") ? `/ar/topics/${category.slug}/` : `/${category.slug}`;
      const card = cards.find(([, href]) => href === expected);
      if (!card) failures.push(`${relative}: missing compact topic link ${expected}`);
      const id = TOPIC_ILLUSTRATIONS[category.slug];
      if (id) {
        const images = [...(card?.[2] || '').matchAll(/<img\b[^>]*>/gu)].map(([tag]) => tag);
        if (images.length !== 1 || !images[0].includes(`data-illustration="${id}"`) || !images[0].includes('loading="lazy"') || !images[0].includes('srcset=') || !images[0].includes('alt=""')) {
          failures.push(`${relative}: ${category.slug} needs its own responsive lazy-loaded illustration`);
        }
      }
    }
    continue;
  }

  // Topic pages prioritize the question grid. The category binding loads its
  // question data; the compact introduction accent is generated statically.
  const category = (catalog.categories || []).find(({ slug }) => (
    relative === `${slug}.html` || relative === `ar/topics/${slug}/index.html`
  ));
  if (category) {
    const id = TOPIC_ILLUSTRATIONS[category.slug];
    if (id && !html.includes(`data-illustration="${id}"`)) failures.push(`${relative}: topic introduction artwork does not match its directory card`);
    if (!new RegExp(`<body\\b[^>]*\\bdata-category="${category.slug}"`, "u").test(html)) {
      failures.push(`${relative}: missing category binding for question data`);
    }
    if (/<img\b[^>]*\bid="categoryImage"/u.test(html)) {
      failures.push(`${relative}: obsolete dynamic category illustration mount`);
    }
    if (category.slug === 'tv-shows-trivia') {
      if (!html.includes('id="tvTrivia"') || !html.includes('class="tv-show-grid"')) failures.push(`${relative}: missing quiz and show discovery mounts`);
      for (const show of SHOWS) {
        for (const width of [360, 600]) {
          const asset = `assets/tv/${show.id}-${width}.webp`;
          if (!html.includes(`/${asset}`) || !fs.existsSync(path.join(root, asset))) failures.push(`${relative}: missing responsive show image ${asset}`);
        }
      }
      const art = [...html.matchAll(/<img\b[^>]*src="\/assets\/tv\/[^>]*>/gu)].map(([tag]) => tag);
      if (art.length !== SHOWS.length || art.some(tag => !tag.includes('srcset=') || !tag.includes('sizes=') || !tag.includes('width="600" height="400"'))) failures.push(`${relative}: show artwork needs responsive sizes and stable dimensions`);
    } else if (!/<div\b[^>]*\bid="cardGrid"/u.test(html)) {
      failures.push(`${relative}: missing question grid`);
    }
    if (!/<script\b[^>]*\bsrc="\/app\.js\?v=/u.test(html)) {
      failures.push(`${relative}: missing application runtime for question practice`);
    }
  }
}

for (const relative of ['play.html', 'ar/play/index.html']) {
  const html = fs.readFileSync(path.join(root, relative), 'utf8');
  for (const game of PUZZLES) {
    const card = [...html.matchAll(/<a class="puzzle-card"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)].find(([, href]) => href === puzzlePath(game.id, relative.startsWith('ar/') ? 'ar' : 'en'));
    const art = gameIllustrationId(game.id);
    if (!card || !card[2].includes(`data-illustration="${art}"`)) failures.push(`${relative}: missing ${game.id} illustration`);
  }
  for (const id of ['akshifha', 'chess', 'backgammon', 'quick-fire', 'game-battle-room']) {
    if (!html.includes(`/assets/illustrations/${id}-480.webp`)) failures.push(`${relative}: missing ${id} illustration`);
  }
}

for (const route of PUZZLE_ROUTES) for (const lang of ['en', 'ar']) {
  const relative = lang === 'en' ? `${route.slug}.html` : `ar/games/${route.slug}/index.html`;
  const html = fs.readFileSync(path.join(root, relative), 'utf8');
  const editorial = html.match(/<section[^>]*data-puzzle-editorial[^>]*>([\s\S]*?)<\/section>/u)?.[1] || '';
  if (!editorial.includes(`data-illustration="${gameIllustrationId(route.id)}"`)) failures.push(`${relative}: missing its own game introduction artwork`);
}

if (failures.length) {
  console.error(`Unified category image validation failed with ${failures.length} issue(s):`);
  for (const issue of failures) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Images valid: ${ILLUSTRATIONS.length} responsive illustrations, ${(catalog.categories || []).length} canonical SVG assets; ${generatedFiles.length} directory/topic pages with exclusive topic/game artwork and no legacy media.`);
