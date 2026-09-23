import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATED_OUTPUTS, CATEGORY_SLUGS, assertAllowedChanges, assertSafePath,
  assertCatalogProjection, diffSnapshots, treeDigest, MAX_CHANGED_BYTES } from './autopilot-policy.mjs';
const change = (overrides = {}) => ({ path: 'ar/topics/science/index.html', change: 'modify', oldMode: '100644', newMode: '100644', bytes: 32, ...overrides });

test('the explicit reviewed allowlist covers generated outputs without directory wildcards', () => {
  assert.equal(new Set(GENERATED_OUTPUTS).size, GENERATED_OUTPUTS.length);
  assert.equal(CATEGORY_SLUGS.length, 56);
  for (const name of ['admin.html', 'admin.js', 'index.html', 'play.html', 'worker/src/index.ts', '.github/workflows/daily.yml', 'scripts/autopilot-policy.mjs', 'data/science.json', 'ar/admin/index.html', 'ar/topics/science/extra.html']) {
    assert.throws(() => assertAllowedChanges([change({ path: name })]), /Not an approved/);
  }
  assertAllowedChanges([change(), change({ path: 'data/search-index.en.json' }), change({ path: 'assets/science.svg' })]);
});
test('deletion, rename, symlinks and mode changes cannot enter a repair bundle', () => {
  for (const overrides of [{ change: 'delete', newMode: null }, { change: 'rename' }, { newMode: '120000' }, { newMode: '100755' }, { change: 'add', oldMode: null, newMode: '100755' }]) {
    assert.throws(() => assertAllowedChanges([change(overrides)]));
  }
  // Legacy executable HTML can retain its exact original mode.
  assertAllowedChanges([change({ oldMode: '100755', newMode: '100755' })]);
  assertAllowedChanges([change({ change: 'add', oldMode: null })]);
});
test('unsafe paths, repeated entries, invalid sizes and excessive bundles fail closed', () => {
  for (const name of ['../admin.html', '/ar/index.html', 'ar//index.html', 'ar/./index.html', 'ar/../index.html', 'ar\\index.html', '.git/config', '.GIT/config', 'ar/index.html\n']) assert.throws(() => assertSafePath(name));
  assert.throws(() => assertAllowedChanges([change(), change()]), /Duplicate/);
  for (const bytes of [-1, NaN, Infinity, 0.1, MAX_CHANGED_BYTES + 1]) assert.throws(() => assertAllowedChanges([change({ bytes })]));
});
test('catalog derivations may change while authored labels and category definitions cannot', () => {
  const before = { site: { name: 'Riddle Arabia', totalQuestions: 0 }, sections: [], categories: [{ slug: 'science', title: { en: 'Science', ar: 'علوم' }, count: 0 }] };
  const after = structuredClone(before);
  after.site.totalQuestions = 10;
  after.categories[0].count = 10;
  after.categories[0].topics = [{ en: 'Atoms', ar: 'ذرات', count: 10 }];
  assertCatalogProjection(before, after);
  after.categories[0].title.en = 'Changed source';
  assert.throws(() => assertCatalogProjection(before, after), /authored catalog/);
  after.categories[0].slug = 'admin';
  assert.throws(() => assertCatalogProjection(before, after), /reviewed policy/);
});
test('tree comparison includes added files, deletions, hashes and executable-bit changes', () => {
  const before = new Map([['a', { mode: '100644', sha256: 'a', bytes: 1 }], ['b', { mode: '100644', sha256: 'b', bytes: 1 }]]);
  const after = new Map([['a', { mode: '100755', sha256: 'a', bytes: 1 }], ['c', { mode: '100644', sha256: 'c', bytes: 1 }]]);
  assert.deepEqual(diffSnapshots(before, after).map(({ path, change }) => [path, change]), [['a', 'modify'], ['b', 'delete'], ['c', 'add']]);
  assert.notEqual(treeDigest(before), treeDigest(after));
  assert.equal(treeDigest(before), treeDigest(new Map([...before].reverse())));
});
