import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as overrideModule from '../content-overrides.js';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const start = source.indexOf('async function loadBattleCategoryCards(');
assert.ok(start >= 0);
const loader = source.slice(start, source.indexOf('\n}', start) + 2);
const card = {
  id: 'math-001', question: { en: 'Question', ar: 'سؤال' }, answer: { en: '5', ar: '5' },
  quickFire: { answer: { en: '5', ar: '5' } },
};

function harness({ response = { overrides: [] }, raw = [card], error = null } = {}) {
  const requests = [];
  const context = vm.createContext({
    loadCatalog: async () => ({ categories: [{ slug: 'math' }] }),
    categoryIsQuarantined: slug => slug === 'blocked',
    fetchJson: async path => { requests.push(path); return raw; },
    loadContentOverridesModule: async () => overrideModule,
    apiFetch: async (path, options) => { requests.push({ path, options }); if (error) throw error; return response; },
  });
  vm.runInContext(loader, context);
  return { load: context.loadBattleCategoryCards, requests };
}

test('Battle checks published choices freshly and invalidates edited question choices', async () => {
  const h = harness({ response: { overrides: [{ id: card.id, question: { en: 'Changed', ar: 'تغير' } }] } });
  const [result] = await h.load('math');
  assert.equal(result.question.en, 'Changed');
  assert.equal(result.quickFire, undefined);
  assert.ok(card.quickFire, 'the source record remains unchanged');
  assert.equal(h.requests[0], '/data/math.json');
  assert.equal(h.requests[1].path, '/content/questions?category=math');
  assert.equal(h.requests[1].options.cache, 'no-store');
});

test('a failed availability check cannot fall back to optimistic static choices', async () => {
  const error = new Error('offline');
  await assert.rejects(harness({ error }).load('math'), error);
  for (const response of [null, {}, { overrides: {} }]) {
    await assert.rejects(harness({ response }).load('math'), /could not be checked/u);
  }
  await assert.rejects(harness({ raw: {} }).load('math'), /could not be checked/u);
});

test('unpublished and quarantined topic requests are rejected before fetching', async () => {
  for (const slug of ['blocked', '../math', 'math&other=1', 'unknown']) {
    const h = harness();
    await assert.rejects(h.load(slug), /unavailable/u);
    assert.deepEqual(h.requests, []);
  }
});
