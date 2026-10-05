import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const functions = ['function categoryAssetPath(', 'async function markCachedCategories('].map(declaration => {
  const start = app.indexOf(declaration);
  assert.ok(start >= 0, `missing ${declaration}`);
  const end = app.indexOf('\n}', start);
  assert.ok(end > start, `missing end of ${declaration}`);
  return app.slice(start, end + 2);
}).join('\n');

const origin = 'https://riddlearabia.com';
const graphA = 'a'.repeat(64);
const graphB = 'b'.repeat(64);
const currentAsset = '/data/chemistry.0123456789abcdef.json';
const priorAsset = '/data/chemistry.fedcba9876543210.json';
const cachePair = (graph, data, navigation) => ({
  [`jakh-data-sg-${graph}`]: data,
  [`jakh-navigation-sg-${graph}`]: navigation,
});

function harness({ entries, lang = 'en', categories = [{ slug: 'chemistry', assetPath: currentAsset }], hrefs = ['/chemistry'] }) {
  const cards = hrefs.map(href => ({
    children: [],
    getAttribute: name => name === 'href' ? href : null,
    querySelector(selector) {
      assert.equal(selector, '.offline-badge');
      return this.children.find(child => child.className === 'offline-badge') || null;
    },
    appendChild(child) { this.children.push(child); },
  }));
  const caches = {
    keys: async () => Object.keys(entries),
    open: async name => {
      assert.ok(Object.hasOwn(entries, name), `unexpected cache opened: ${name}`);
      return { keys: async () => entries[name].map(path => ({ url: new URL(path, origin).href })) };
    },
  };
  const state = { lang, catalog: { categories } };
  const context = vm.createContext({
    URL, caches, window: { caches }, location: { origin }, state,
    categoryIsQuarantined: slug => slug === 'blocked',
    document: {
      querySelectorAll: selector => {
        assert.equal(selector, '.category-card[href]');
        return cards;
      },
      createElement: tag => { assert.equal(tag, 'span'); return {}; },
    },
  });
  vm.runInContext(functions, context);
  return { mark: context.markCachedCategories, cards, state };
}

test('production source graph pairs advertise current English and Arabic category assets offline', async () => {
  for (const [lang, href, navigation, title] of [
    ['en', '/chemistry?mode=quick-fire', '/chemistry', 'Available offline'],
    ['ar', '/ar/topics/chemistry/?mode=battle', '/ar/topics/chemistry/', 'متاح بدون إنترنت'],
  ]) {
    const h = harness({ lang, hrefs: [href], entries: cachePair(graphA, [currentAsset], [navigation]) });
    await h.mark();
    assert.equal(h.cards[0].children.length, 1, `${lang} category is available with its immutable data and page`);
    assert.deepEqual(h.cards[0].children[0], { className: 'offline-badge', title, textContent: '⊙' });
  }
});

test('cached canonical or prior fingerprint payloads cannot advertise a newer catalog asset', async () => {
  for (const staleAsset of ['/data/chemistry.json', priorAsset]) {
    const entries = cachePair(graphA, [staleAsset], ['/chemistry']);
    const h = harness({ entries });
    await h.mark();
    assert.equal(h.cards[0].children.length, 0, `${staleAsset} does not contain the catalog's current questions`);
    entries[`jakh-data-sg-${graphA}`].push(currentAsset);
    await h.mark();
    assert.equal(h.cards[0].children.length, 1, 'the badge becomes available when the current payload is cached');
  }
  const legacy = harness({ entries: { 'jakh-data-v86': ['/data/chemistry.json'], 'jakh-navigation-v86': ['/chemistry'] } });
  await legacy.mark();
  assert.equal(legacy.cards[0].children.length, 0, 'an older canonical cache does not satisfy fingerprinted production metadata');
});

test('data and navigation from different source graphs cannot jointly grant an offline badge', async () => {
  const h = harness({ entries: {
    ...cachePair(graphA, [currentAsset], []),
    ...cachePair(graphB, [], ['/chemistry']),
  } });
  await h.mark();
  assert.equal(h.cards[0].children.length, 0, 'neither complete source graph contains both dependencies');
});

test('a cached payload alone or a cached page alone does not promise offline availability', async () => {
  for (const entries of [
    { [`jakh-data-sg-${graphA}`]: [currentAsset] },
    { [`jakh-navigation-sg-${graphA}`]: ['/chemistry'] },
    cachePair(graphA, [currentAsset], ['/math']),
    cachePair(graphA, [], ['/chemistry']),
  ]) {
    const h = harness({ entries });
    await h.mark();
    assert.equal(h.cards[0].children.length, 0);
  }
});

test('unbuilt catalog metadata remains compatible with paired legacy version caches and route forms', async () => {
  for (const [lang, href, navigation] of [
    ['en', '/chemistry.html?mode=battle', '/chemistry'],
    ['ar', '/ar/topics/chemistry/', '/ar/topics/chemistry/'],
  ]) {
    const h = harness({
      lang, hrefs: [href], categories: [{ slug: 'chemistry' }],
      entries: { 'jakh-data-v86': ['/data/chemistry.json'], 'jakh-navigation-v86': [navigation] },
    });
    await h.mark();
    assert.equal(h.cards[0].children.length, 1, `${lang} source page can use its canonical versioned cache`);
  }
});

test('repeated cache checks and multiple matching graph pairs add only one badge per category card', async () => {
  const h = harness({ hrefs: ['/chemistry', '/ar/topics/chemistry/'], entries: {
    ...cachePair(graphA, [currentAsset], ['/chemistry', '/ar/topics/chemistry/']),
    ...cachePair(graphB, [currentAsset], ['/chemistry', '/ar/topics/chemistry/']),
  } });
  await h.mark();
  await h.mark();
  assert.deepEqual(h.cards.map(card => card.children.length), [1, 1]);
});

test('cache entries cannot bypass catalog asset validation or supply an unknown category badge', async () => {
  for (const assetPath of ['/data/math.0123456789abcdef.json', `${origin}${currentAsset}`, '/data/chemistry.json']) {
    const h = harness({
      categories: [{ slug: 'chemistry', assetPath }],
      entries: cachePair(graphA, [assetPath], ['/chemistry']),
    });
    await h.mark();
    assert.equal(h.cards[0].children.length, 0, `${assetPath} is not a valid catalog-pinned chemistry payload`);
  }
  const unknown = harness({ hrefs: ['/math'], entries: cachePair(graphA, ['/data/math.json'], ['/math']) });
  await unknown.mark();
  assert.equal(unknown.cards[0].children.length, 0, 'a cache entry does not make a category public');
});
