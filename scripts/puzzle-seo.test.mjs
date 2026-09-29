import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PUZZLES } from '../puzzle-catalog.js';
import { PUZZLE_ROUTES, puzzlePath, puzzleRoute, puzzleURL } from '../puzzle-routes.js';
import { renderPuzzlePage } from './generate-puzzle-pages.mjs';
import { RIDDLE_ARABIA_GAME_CATALOG } from './riddlearabia-seo.mjs';

const ORIGIN = 'https://riddlearabia.com';
const languages = ['en', 'ar'];
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const filename = (route, lang) => lang === 'en' ? `${route.slug}.html` : `ar/games/${route.slug}/index.html`;
const decode = value => String(value).replace(/&(?:amp|lt|gt|quot|apos|#39);/gu, entity => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"})[entity]);
const plain = value => decode(String(value).replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim());
function attributes(tag) {
  const result = {};
  for (const match of tag.replace(/^<[^\s/>]+/u, '').matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu)) result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4] ?? '');
  return result;
}
function tags(source, name) { return [...source.matchAll(new RegExp(`<${name}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, 'giu'))].map(match => attributes(match[0])); }
function metadata(source, name, attribute = 'name') { return tags(source, 'meta').filter(tag => tag[attribute] === name).map(tag => tag.content); }
function links(source, rel) { return tags(source, 'link').filter(tag => tag.rel?.split(/\s/u).includes(rel)); }
function structured(source) {
  return [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)].filter(match => attributes(`<script ${match[1]}>`).type === 'application/ld+json').map(match => JSON.parse(match[2]));
}
function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...Object.values(value).flatMap(nodes)];
}

test('every existing puzzle retains one stable bilingual clean route and share URLs exclude private state', () => {
  assert.deepEqual(PUZZLE_ROUTES.map(p => p.id), PUZZLES.map(p => p.id), 'Routing must preserve every existing game identity and catalog order');
  const paths = new Set();
  for (const route of PUZZLE_ROUTES) for (const lang of languages) {
    const path = puzzlePath(route.id, lang);
    assert.equal(path, route.paths[lang]);
    assert.ok(!paths.has(path)); paths.add(path);
    assert.equal(new URL(path, ORIGIN).origin, ORIGIN);
    assert.equal(new URL(path, ORIGIN).search, '');
    assert.deepEqual(puzzleRoute(path), {...route, lang});
    const url = new URL(puzzleURL(route.id, lang, {date:'2026-09-30',difficulty:'hard',duelRoom:'ABCD2345',token:'PRIVATE-SEAT',answer:'SPOILER',game:route.id}, ORIGIN));
    assert.equal(url.pathname, path);
    assert.deepEqual([...url.searchParams.keys()].sort(), ['date','difficulty','duelRoom']);
    assert.equal(url.searchParams.get('date'), '2026-09-30');
  }
  for (const path of ['/play', '/ar/play/', '/ar/topics/sudoku/', '/not-a-game', 'https://evil.example/sudoku']) assert.equal(puzzleRoute(path), null, path);
  assert.throws(() => puzzlePath('unknown', 'en'));
  assert.throws(() => puzzlePath('sudoku', 'fr'));
});

test('all generated puzzle pages provide distinct initial HTML metadata and reciprocal language canonicals', async () => {
  const titles = new Set(), descriptions = new Set();
  for (const route of PUZZLE_ROUTES) for (const lang of languages) {
    const file = filename(route, lang), source = await read(file), canonical = `${ORIGIN}${route.paths[lang]}`;
    assert.equal(source, renderPuzzlePage(route.id, lang), `${file}: committed source must match its generator`);
    const html = tags(source, 'html')[0];
    assert.equal(html.lang, lang, file);
    assert.equal(html.dir || 'ltr', lang === 'ar' ? 'rtl' : 'ltr', file);
    assert.deepEqual(links(source, 'canonical').map(link => link.href), [canonical], file);
    const expected = {en:`${ORIGIN}${route.paths.en}`,ar:`${ORIGIN}${route.paths.ar}`,'x-default':`${ORIGIN}${route.paths.en}`};
    const alternates = links(source, 'alternate').filter(link => link.hreflang);
    assert.equal(alternates.length, 3, file);
    assert.deepEqual(Object.fromEntries(alternates.map(link => [link.hreflang,link.href])), expected, file);
    const title = [...source.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/giu)].map(match => plain(match[1]));
    const description = metadata(source, 'description');
    assert.equal(title.length, 1, file); assert.ok(title[0].trim(), file);
    assert.equal(description.length, 1, file); assert.ok(description[0].trim(), file);
    assert.ok(!titles.has(title[0]), `${file}: duplicate title`); titles.add(title[0]);
    assert.ok(!descriptions.has(description[0]), `${file}: duplicate description`); descriptions.add(description[0]);
    assert.deepEqual(metadata(source, 'og:url', 'property'), [canonical], file);
    assert.deepEqual(metadata(source, 'og:title', 'property'), title, file);
    assert.deepEqual(metadata(source, 'og:description', 'property'), description, file);
    const robots = metadata(source, 'robots').join(',');
    assert.match(robots, /(?:^|[\s,])index(?:$|[\s,])/u, file);
    assert.doesNotMatch(robots, /(?:^|[\s,])(?:noindex|none)(?:$|[\s,])/u, file);
    assert.equal(tags(source, 'body')[0]['data-puzzle-page'], route.id, `${file}: static route must identify the actual playable engine`);
    const headings = [...source.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/giu)].map(match => plain(match[1]));
    assert.equal(headings.length, 1, `${file}: one unambiguous initial page heading`);
    assert.ok(headings[0], file);
    assert.ok(tags(source, 'script').some(script => script.type === 'module' && script.src?.startsWith('/puzzle-room.js')), `${file}: page must load its actual game engine`);
    assert.doesNotMatch(source, /external human review|automated-plus-language-review|puzzle-editorial-review/iu, `${file}: private editorial provenance must remain private`);
  }
});

test('puzzle structured data describes the canonical playable page without invented ratings or private room data', async () => {
  for (const route of PUZZLE_ROUTES) for (const lang of languages) {
    const file = filename(route, lang), source = await read(file), canonical = `${ORIGIN}${route.paths[lang]}`;
    const documents = structured(source), graph = nodes(documents);
    assert.ok(documents.length, `${file}: JSON-LD must parse`);
    const page = graph.filter(node => node.url === canonical && node['@type']);
    assert.ok(page.length, `${file}: structured data must identify this exact page`);
    assert.ok(page.some(node => node.inLanguage === lang), `${file}: structured language must match visible content`);
    assert.ok(page.some(node => node.isAccessibleForFree === true), `${file}: current games are free`);
    assert.ok(page.every(node => typeof node.name === 'string' && node.name.trim()), `${file}: named page or game entities`);
    assert.ok(!graph.some(node => node.aggregateRating || node.review || node.ratingValue), `${file}: do not invent review/rating evidence`);
    assert.ok(!graph.some(node => Object.keys(node).some(key => /token|rack|solution|subscription/iu.test(key))), `${file}: no private game state in search metadata`);
    for (const node of graph) if (typeof node.url === 'string' && node.url.startsWith(ORIGIN)) assert.equal(new URL(node.url).search, '', `${file}: schema URLs must be stable clean routes`);
  }
});

test('new game sitemap entries stay canonical and do not accidentally index thin topic shells', async () => {
  const source = await read('sitemap.xml');
  const entries = [...source.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gu)];
  const urls = entries.map(entry => decode(entry[1].match(/<loc>(.*?)<\/loc>/u)?.[1] || ''));
  assert.equal(new Set(urls).size, urls.length);
  for (const route of PUZZLE_ROUTES) for (const lang of languages) {
    const canonical = `${ORIGIN}${route.paths[lang]}`;
    const entry = entries.find(item => item[1].includes(`<loc>${canonical}</loc>`));
    assert.ok(entry, `${canonical}: indexable game must be in sitemap`);
    assert.deepEqual(Object.fromEntries(tags(entry[1], 'xhtml:link').map(link => [link.hreflang,link.href])), {en:`${ORIGIN}${route.paths.en}`,ar:`${ORIGIN}${route.paths.ar}`,'x-default':`${ORIGIN}${route.paths.en}`});
  }
  for (const [file,path] of [['classic-riddles.html','/classic-riddles'],['ar/topics/classic-riddles/index.html','/ar/topics/classic-riddles/'],['geography.html','/geography'],['ar/topics/geography/index.html','/ar/topics/geography/']]) {
    assert.match(metadata(await read(file), 'robots').join(','), /\bnoindex\b/u, file);
    assert.ok(!urls.includes(`${ORIGIN}${path}`), file);
  }
});

test('every new game is discoverable through static directory anchors and the directory schema matches its games', async () => {
  for (const lang of languages) {
    const play = await read(lang === 'en' ? 'play.html' : 'ar/play/index.html');
    const brain = await read(lang === 'en' ? 'brain-games.html' : 'ar/alab-al-dimagh/index.html');
    const brainPath = lang === 'en' ? '/brain-games' : '/ar/alab-al-dimagh/';
    assert.ok(tags(play, 'a').some(anchor => anchor.href === brainPath), 'The curated Brain games page needs an inbound link from the Games directory');
    for (const [name,source] of [['Games',play],['Brain games',brain]]) {
      const paths = new Set(tags(source, 'a').map(anchor => anchor.href));
      for (const route of PUZZLE_ROUTES) assert.ok(paths.has(route.paths[lang]), `${lang}/${name}: ${route.id} must have a normal clean-route anchor before JavaScript`);
      const lists = nodes(structured(source)).filter(node => node['@type'] === 'ItemList');
      assert.equal(lists.length, 1, `${lang}/${name}`);
      const list = lists[0];
      assert.equal(list.numberOfItems, list.itemListElement.length, `${lang}/${name}: count agrees with serialized entries`);
      const urls = list.itemListElement.map(item => item.url || item.item?.url);
      const expected = [...PUZZLE_ROUTES.map(route => `${ORIGIN}${route.paths[lang]}`), ...RIDDLE_ARABIA_GAME_CATALOG.map(game => `${ORIGIN}${lang === 'en' ? `/${game.slug}` : `/ar/games/${game.slug}/`}`)];
      assert.deepEqual([...urls].sort(), expected.sort(), `${lang}/${name}: structured list must describe the actual current game portfolio`);
      assert.equal(new Set(urls).size, urls.length);
    }
  }
});

test('deployed clean game pages pin the game runtime and retain their canonical metadata', async () => {
  const manifest = JSON.parse(await read('site-worker/generated/site-manifest.json'));
  for (const route of PUZZLE_ROUTES) for (const lang of languages) {
    const file = filename(route, lang), deployed = await read(`site-worker/dist/${file}`);
    assert.ok(manifest.routes[route.paths[lang]], `${file}: served as a real route`);
    for (const asset of ['/puzzle-room.js','/puzzle-room.css']) {
      const target = manifest.fingerprints[asset];
      assert.ok(target && manifest.files[target], `${asset}: immutable runtime needs a release record`);
      assert.ok(deployed.includes(target), `${file}: pins ${asset}`);
    }
    assert.deepEqual(links(deployed, 'canonical').map(link => link.href), [`${ORIGIN}${route.paths[lang]}`]);
    const record = manifest.files[`/${file}`];
    assert.ok(record, file);
    assert.equal(createHash('sha256').update(deployed).digest('hex'), record.sha256, `${file}: published HTML matches manifest bytes`);
  }
  assert.ok(manifest.fingerprints['/puzzle-routes.js'], 'Shared route helper needs its own immutable fingerprint');
});
