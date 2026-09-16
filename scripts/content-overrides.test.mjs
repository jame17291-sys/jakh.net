import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPublishedContentOverrides, mergePublishedContentOverrides } from '../content-overrides.js';

const card = {
  id: 'math-sample',
  question: { en: 'What is 2 + 3?', ar: 'كم يساوي 2 + 3؟' },
  answer: { en: '5', ar: '5' },
  acceptedAnswers: { en: ['five'], ar: ['خمسة'] },
  quickFire: {
    answer: { en: '5', ar: '5' },
    distractors: { en: ['4', '6', '7'], ar: ['4', '6', '7'] },
    explanation: { en: 'Adding three to two gives five.', ar: 'بإضافة ثلاثة إلى اثنين نحصل على خمسة.' },
  },
};

test('no published override leaves authored choices unchanged', () => {
  const cards = [structuredClone(card)];
  assert.equal(mergePublishedContentOverrides(cards, []), cards);
  const [merged] = mergePublishedContentOverrides(cards, [{ id: 'unrelated' }]);
  assert.equal(merged, cards[0]);
});

test('identical bilingual question and answer overrides preserve authored choices', () => {
  const [merged] = mergePublishedContentOverrides([card], [{
    id: card.id, question: { ...card.question }, answer: { ...card.answer },
  }]);
  assert.deepEqual(merged.quickFire, card.quickFire);
  assert.deepEqual(merged.acceptedAnswers, card.acceptedAnswers);
});

test('changed question, answer or explanation invalidates the whole bilingual choice set', () => {
  for (const field of ['question', 'answer', 'explanation']) {
    for (const language of ['en', 'ar']) {
      const override = { id: card.id, [field]: { ...card[field], [language]: 'Changed' } };
      const [merged] = mergePublishedContentOverrides([card], [override]);
      assert.equal(merged.quickFire, undefined, `${field}.${language}`);
      assert.equal(merged[field][language], 'Changed');
      assert.ok(card.quickFire, 'source data must not be mutated');
      assert.deepEqual(merged.acceptedAnswers, field === 'explanation' ? card.acceptedAnswers : undefined);
    }
  }
});

test('new question or answer never keeps the old source accepted-answer aliases', () => {
  for (const language of ['en', 'ar']) {
    const [merged] = mergePublishedContentOverrides([card], [{
      id: card.id, answer: { ...card.answer, [language]: '6' },
    }]);
    assert.equal(merged.acceptedAnswers, undefined);
    assert.deepEqual(card.acceptedAnswers, { en: ['five'], ar: ['خمسة'] });
  }
});

test('an omitted explanation in a published snapshot clears stale source rationale, matching the Worker', () => {
  const source = { ...card, explanation: { en: 'Old reasoning', ar: 'تفسير سابق' } };
  const [merged] = mergePublishedContentOverrides([source], [{
    id: card.id, question: { ...card.question }, answer: { ...card.answer },
  }]);
  assert.equal(merged.explanation, undefined);
  assert.equal(merged.quickFire, undefined);
  assert.deepEqual(merged.acceptedAnswers, card.acceptedAnswers);
  assert.equal(source.explanation.en, 'Old reasoning');
});

test('a content API outage preserves source practice rather than blocking the page', async () => {
  const overrides = await loadPublishedContentOverrides(async () => { throw new Error('offline'); }, 'math');
  assert.deepEqual(overrides, []);
});

test('content API category is encoded and malformed result fails closed', async () => {
  let requested = '';
  const overrides = await loadPublishedContentOverrides(async (url) => {
    requested = url;
    return { overrides: {} };
  }, 'math&other=1');
  assert.equal(requested, '/content/questions?category=math%26other%3D1');
  assert.deepEqual(overrides, []);
});
