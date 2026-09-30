import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSiteHandler } from '../src/site-edge.js';

const origin = 'https://riddlearabia.com';
const manifest = JSON.parse(await readFile(new URL('../generated/site-manifest.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(await readFile(new URL('../../data/kids/catalog.json', import.meta.url), 'utf8'));
const mtaStsPolicy = await readFile(new URL('../assets/mta-sts.txt', import.meta.url), 'utf8');
const handler = createSiteHandler({ siteManifest: manifest, mtaStsPolicy });
const env = { ASSETS: { async fetch(request) {
  const pathname = new URL(request.url).pathname;
  assert.ok(manifest.files[pathname], `Only a declared asset can be fetched: ${pathname}`);
  return new Response(pathname, { headers: { 'content-type': 'text/html; charset=utf-8' } });
} } };
const queries = ['search=paper', 'age=3-4', 'area=language', 'minutes=10', 'materialGroup=none', 'format=game', 'reading=adult', 'adult=together', 'screenFree=1', 'noPrinter=1'];
const paths = ['en', 'ar'].flatMap(lang => {
  const base = lang === 'ar' ? '/ar/topics/kids-riddles/' : '/kids-riddles';
  const nested = base.replace(/\/$/u, '');
  return [base, `${nested}/activities/`, `${nested}/ages/3-4/`, `${nested}/areas/language/`, `${nested}/activities/${catalog.activities[0].id}/`];
});

test('every kids discovery filter is noindex and no-store for GET, HEAD and matching conditional requests in both languages', async () => {
  for (const pathname of paths) {
    const clean = await handler.fetch(new Request(origin + pathname), env);
    assert.equal(clean.status, 200, pathname);
    for (const query of queries) for (const method of ['GET', 'HEAD']) {
      const url = `${origin}${pathname}?${query}`;
      const response = await handler.fetch(new Request(url, { method }), env);
      assert.equal(response.status, 200, `${method} ${url}`);
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow', url);
      assert.equal(response.headers.get('cache-control'), 'no-store, no-transform', url);
      if (method === 'HEAD') assert.equal(await response.text(), '');
      const conditional = await handler.fetch(new Request(url, { method, headers: { 'if-none-match': clean.headers.get('etag') } }), env);
      assert.equal(conditional.status, 304, url);
      assert.equal(conditional.headers.get('x-robots-tag'), 'noindex, follow', url);
      assert.equal(conditional.headers.get('cache-control'), 'no-store, no-transform', url);
    }
  }
});

test('clean and tracking-only kids pages remain indexable and retain revalidation including 304', async () => {
  for (const pathname of paths) for (const query of ['', '?utm_source=family&utm_campaign=weekend']) {
    const url = origin + pathname + query;
    const response = await handler.fetch(new Request(url), env);
    assert.equal(response.status, 200, url);
    assert.equal(response.headers.get('x-robots-tag'), null, url);
    assert.match(response.headers.get('cache-control'), /must-revalidate/u, url);
    const conditional = await handler.fetch(new Request(url, { headers: { 'if-none-match': response.headers.get('etag') } }), env);
    assert.equal(conditional.status, 304, url);
    assert.equal(conditional.headers.get('x-robots-tag'), null, url);
    assert.match(conditional.headers.get('cache-control'), /must-revalidate/u, url);
  }
});

test('kids filter policy does not change unrelated routes and survives canonical alias redirects', async () => {
  for (const pathname of ['/about', '/ar/about/', '/family-riddles']) {
    const response = await handler.fetch(new Request(`${origin}${pathname}?age=3-4&search=paper`), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-robots-tag'), null);
    assert.match(response.headers.get('cache-control'), /must-revalidate/u);
  }
  for (const pathname of ['/kids-riddles.html', '/ar/topics/kids-riddles/index.html']) {
    const response = await handler.fetch(new Request(`${origin}${pathname}?age=3-4&utm_source=family`), env);
    assert.equal(response.status, 301);
    const location = response.headers.get('location');
    assert.equal(new URL(location).search, '?age=3-4&utm_source=family');
    const final = await handler.fetch(new Request(location), env);
    assert.equal(final.status, 200);
    assert.equal(final.headers.get('x-robots-tag'), 'noindex, follow');
    assert.equal(final.headers.get('cache-control'), 'no-store, no-transform');
  }
});
