import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSiteHandler } from '../src/site-edge.js';

const origin = 'https://riddlearabia.com';
const manifest = JSON.parse(await readFile(new URL('../generated/site-manifest.json', import.meta.url), 'utf8'));
const mtaStsPolicy = await readFile(new URL('../assets/mta-sts.txt', import.meta.url), 'utf8');
const paths = ['/how-well-do-you-know-me', '/ar/games/how-well-do-you-know-me/'];
// Test the real handler even before the candidate pages are added to the next
// manifest. The policy is query-specific and must not rely on personal HTML.
for (const pathname of paths) {
  const physical = pathname.endsWith('/') ? `${pathname}index.html` : `${pathname}.html`;
  manifest.routes[pathname] = physical;
  manifest.files[physical] = { ...manifest.files['/privacy.html'] };
  manifest.aliases[physical] = pathname;
}
const handler = createSiteHandler({ siteManifest: manifest, mtaStsPolicy });
const env = { ASSETS: { async fetch(request) {
  const pathname = new URL(request.url).pathname;
  assert.ok(manifest.files[pathname]);
  return new Response('Public game shell; no personal quiz payload.', { headers: { 'content-type': 'text/html; charset=utf-8' } });
} } };

test('shared quiz links are noindex, no-store and no-referrer for GET, HEAD and conditional responses', async () => {
  for (const pathname of paths) {
    const clean = await handler.fetch(new Request(origin + pathname), env);
    for (const query of ['quiz=ABCDEFGHIJKL', 'quiz=', 'quiz=invalid&utm_source=group']) for (const method of ['GET', 'HEAD']) {
      const url = `${origin}${pathname}?${query}`;
      for (const headers of [{}, { 'if-none-match': clean.headers.get('etag') }]) {
        const response = await handler.fetch(new Request(url, { method, headers }), env);
        assert.equal(response.status, headers['if-none-match'] ? 304 : 200, url);
        assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow', url);
        assert.equal(response.headers.get('cache-control'), 'no-store, no-transform', url);
        assert.equal(response.headers.get('referrer-policy'), 'no-referrer', url);
        if (method === 'HEAD' || response.status === 304) assert.equal(await response.text(), '');
      }
    }
  }
});

test('canonical redirects preserve the invitation while preventing cache and referrer leakage', async () => {
  for (const pathname of paths) {
    const physical = manifest.routes[pathname];
    const response = await handler.fetch(new Request(`http://www.riddlearabia.com${physical}?quiz=ABCDEFGHIJKL`), env);
    assert.equal(response.status, 301);
    assert.equal(response.headers.get('location'), `${origin}${pathname}?quiz=ABCDEFGHIJKL`);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  }
});

test('clean pages and campaign links stay indexable and unrelated query parameters keep existing policy', async () => {
  for (const pathname of paths) for (const query of ['', '?utm_source=group']) {
    const response = await handler.fetch(new Request(origin + pathname + query), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-robots-tag'), null);
    assert.match(response.headers.get('cache-control'), /must-revalidate/u);
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  }
  const unrelated = await handler.fetch(new Request(`${origin}/about?quiz=ABCDEFGHIJKL`), env);
  assert.equal(unrelated.headers.get('x-robots-tag'), null);
  assert.match(unrelated.headers.get('cache-control'), /must-revalidate/u);
});
