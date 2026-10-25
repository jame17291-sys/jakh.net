import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { normalizeScorableAnswer } from './content-review-lib.mjs';
import { readContentPhase2Ledger } from './content-phase2-ledger.mjs';

const categoryIds = {
  'classic-riddles': [2, 3, 4, 5, 7, 11, 18, 19, 23, 32],
  math: [1, 2, 3, 6, 7, 8, 9, 12, 18, 20, 117, 118, 119, 121, 122, 123, 125, 126, 127, 129],
  chemistry: [1, 2, 3, 4, 7, 8, 31, 32, 34, 42, 11, 13, 14, 15, 17, 18, 20, 46, 52, 58],
  'logic-puzzles': [1, 2, 3, 6, 8, 13, 16, 17, 20, 27],
};
const cards = new Map();
// Card ids are opaque: a topic file may hold cards whose id names another topic
// after a topic merge, so membership comes from the file, never the id prefix.
const topicCards = new Map();
for (const category of [...Object.keys(categoryIds), 'story-mysteries']) {
  const source = JSON.parse(readFileSync(new URL(`../data/${category}.json`, import.meta.url)));
  topicCards.set(category, source);
  for (const card of source) cards.set(card.id, card);
}
const cardId = (category, number) => `${category}-${String(number).padStart(3, '0')}`;
const numbers = (text) => (text.match(/-?\d+(?:\.\d+)?/gu) || []).map(Number);
const allOptions = (card, language) => [card.quickFire.answer[language], ...card.quickFire.distractors[language]];

test('catalog discovery counts match only actual eligible authored question sets', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  for (const name of ['quickFireChoiceKey', 'quickFireCorrectKeys', 'preparedQuickFire']) {
    const start = app.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    vm.runInContext(app.slice(start, app.indexOf('\n}', start) + 2), context);
  }
  const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url)));
  let total = 0;
  for (const category of catalog.categories) {
    const source = JSON.parse(readFileSync(new URL(`../data/${category.slug}.json`, import.meta.url)));
    const authored = source.filter(card => card.quickFire !== undefined);
    assert.equal(category.quickFireQuestionCount, authored.length, category.slug);
    for (const card of authored) assert.ok(context.preparedQuickFire(card), `${category.slug}/${card.id}`);
    total += authored.length;
  }
  assert.equal(total, 60);
});

test('sixty seeded cards have complete aligned bilingual authored choices, not reviewer approvals', () => {
  let total = 0;
  for (const [category, ids] of Object.entries(categoryIds)) {
    assert.equal(ids.length, category === 'math' || category === 'chemistry' ? 20 : 10);
    const authored = topicCards.get(category).filter(card => card.quickFire);
    assert.deepEqual(authored.map(card => card.id).sort(), ids.map(id => cardId(category, id)).sort());
    for (const number of ids) {
      const card = cards.get(cardId(category, number));
      assert.deepEqual(card.review, { status: 'pending' }, card.id);
      assert.deepEqual(Object.keys(card.quickFire).sort(), ['answer', 'distractors', 'explanation']);
      for (const language of ['en', 'ar']) {
        assert.ok(card.question[language].trim(), `${card.id}: question/${language}`);
        assert.ok(card.quickFire.explanation[language].trim(), `${card.id}: explanation/${language}`);
        assert.equal(card.quickFire.distractors[language].length, 3);
        const options = allOptions(card, language);
        for (const option of options) {
          assert.ok(typeof option === 'string' && option.trim());
          assert.ok(option.length <= 120, `${card.id}: option too long`);
          assert.ok(option.trim().split(/\s+/u).length <= 20, `${card.id}: option too wordy`);
        }
        const keys = options.map(normalizeScorableAnswer);
        assert.equal(new Set(keys).size, 4, `${card.id}: ambiguous options/${language}`);
        const accepted = new Set([card.answer[language], ...(card.acceptedAnswers?.[language] || [])].map(normalizeScorableAnswer));
        assert.ok(accepted.has(keys[0]), `${card.id}: authored answer changes meaning/${language}`);
        assert.ok(keys.slice(1).every(key => !accepted.has(key)), `${card.id}: distractor is an accepted answer/${language}`);
      }
      total += 1;
    }
  }
  assert.equal(total, 60);
});

test('authored arithmetic answers and numerical distractors satisfy exactly one intended result', () => {
  const expected = new Map([
    ['math-001', (1.10 - 1.00) / 2],
    ['math-003', 7 * 5],
    ['math-006', 360 / 4],
    // A googol is 10^100: a 1 followed by 100 zeros.
    ['math-007', String(10n ** 100n).length - 1],
    ['math-008', 60 * 60],
    // The first palindromic year after 2002.
    ['math-012', Array.from({ length: 200 }, (_, i) => 2003 + i).find(year => String(year) === [...String(year)].reverse().join(''))],
    // A fair coin has no memory.
    ['math-018', 1 / 2],
    // Eighth from the front and eighth from the back.
    ['math-020', 8 + 8 - 1],
    ['logic-puzzles-001', 48 - 1],
    ['logic-puzzles-003', 2],
    ['logic-puzzles-013', 70 - (6 - 3)],
  ]);
  for (const [id, result] of expected) {
    const card = cards.get(id);
    for (const language of ['en', 'ar']) {
      const options = allOptions(card, language);
      const arabicNumberWords = {
        'لتر واحد': 1,
        'المركز الأول': 1,
        'المركز الثاني': 2,
        'المركز الثالث': 3,
        'المركز الرابع': 4,
      };
      const fraction = text => text.match(/^\s*(-?\d+)\s*\/\s*(\d+)\s*$/u);
      const value = text => arabicNumberWords[text]
        ?? (fraction(text) ? Number(fraction(text)[1]) / Number(fraction(text)[2]) : numbers(text.replace(/(\d),(\d{3})/gu, '$1$2'))[0]);
      assert.ok(Math.abs(value(options[0]) - result) < 1e-9, `${id}: correct/${language}`);
      assert.ok(options.slice(1).every(option => Math.abs(value(option) - result) > 1e-9), `${id}: distractors/${language}`);
    }
  }
  // Dividing by a half doubles: 30 ÷ ½ + 10 = 70; halving instead gives the trap answer 25.
  const half = cards.get('math-002');
  assert.equal(30 / (1 / 2) + 10, 70);
  assert.equal(half.quickFire.answer.en, '70');
  assert.deepEqual(half.quickFire.distractors.en, ['25', '40', '50']);
  assert.ok(half.quickFire.distractors.en.includes(String(30 * (1 / 2) + 10)));
  assert.ok(half.quickFire.distractors.en.every(option => Number(option) !== 30 / (1 / 2) + 10));
  // Mislabelled boxes: only a pick from the box labelled 'Mixed' fixes every label.
  const labels = ['Apples', 'Oranges', 'Mixed'];
  const arrangements = [];
  for (const a of labels) for (const b of labels) for (const c of labels) {
    const contents = [a, b, c];
    if (new Set(contents).size === 3 && contents.every((content, index) => content !== labels[index])) arrangements.push(contents);
  }
  const fruits = content => (content === 'Mixed' ? ['Apples', 'Oranges'] : [content]);
  const solves = pick => arrangements.every(contents => fruits(contents[pick]).every(fruit => (
    arrangements.filter(other => fruits(other[pick]).includes(fruit)).length === 1
  )));
  assert.deepEqual(labels.map((_, pick) => solves(pick)), [false, false, true]);
  const boxes = cards.get('logic-puzzles-020');
  assert.deepEqual(allOptions(boxes, 'en').map(option => option === "The box labelled 'Mixed'"), [true, false, false, false]);
});

test('coordinate reflection and constraint puzzles have only one valid authored option', () => {
  const checks = [
    ['math-009', values => values.length === 2 && values[0] === 3 && values[1] === 2],
    ['logic-puzzles-016', ([value]) => {
      const tens = Math.floor(value / 10), ones = value % 10;
      return tens + ones === 11 && ones * 10 + tens - value === 27;
    }],
    ['logic-puzzles-017', ([value]) => {
      const [first, middle, last] = String(value).split('').map(Number);
      return first === 2 * last && middle === last + 1 && first + middle + last === 13;
    }],
    ['logic-puzzles-027', values => values.length === 3 && values.reduce((a, b) => a + b, 0) === values.reduce((a, b) => a * b, 1)],
  ];
  for (const [id, predicate] of checks) {
    for (const language of ['en', 'ar']) {
      const results = allOptions(cards.get(id), language).map(option => predicate(numbers(option)));
      assert.deepEqual(results, [true, false, false, false], `${id}/${language}`);
    }
  }
  const familySolutions = [];
  for (let girls = 1; girls <= 20; girls += 1) {
    for (let boys = 1; boys <= 20; boys += 1) {
      if (boys === girls - 1 && 2 * (boys - 1) === girls) familySolutions.push([girls, boys]);
    }
  }
  assert.deepEqual(familySolutions, [[4, 3]]);
  for (const language of ['en', 'ar']) {
    assert.deepEqual(allOptions(cards.get('logic-puzzles-002'), language).map(option => numbers(option)[0] === 7), [true, false, false, false]);
  }
  // Three pills, one every half hour: the first is taken at once, so they last (3 - 1) × 30 minutes.
  const pills = cards.get('logic-puzzles-006');
  const minutes = option => [...option.matchAll(/(\d+)\s*(hours?|minutes?)/gu)]
    .reduce((total, [, amount, unit]) => total + Number(amount) * (unit.startsWith('hour') ? 60 : 1), 0);
  assert.deepEqual(allOptions(pills, 'en').map(option => minutes(option) === (3 - 1) * 30), [true, false, false, false]);
  // Your maternal uncle's sister is your mother or your maternal aunt; the riddle rules out the aunt.
  const uncle = cards.get('classic-riddles-018');
  assert.deepEqual(allOptions(uncle, 'en').map(option => option === 'Your mother'), [true, false, false, false]);
  assert.deepEqual(allOptions(uncle, 'ar').map(option => option === 'أمك'), [true, false, false, false]);
  assert.ok(!allOptions(uncle, 'en').some(option => /aunt/iu.test(option)) && !allOptions(uncle, 'ar').some(option => /خالت/u.test(option)));
});

test('repaired bilingual puzzles no longer rely on T/tea or unexplained bicycles and retain pending status', () => {
  const teapot = cards.get('classic-riddles-005');
  assert.deepEqual(teapot.answer, { en: 'A teapot', ar: 'إبريق الشاي' });
  assert.doesNotMatch(teapot.question.en, /begins with T|has T in it/u);
  assert.doesNotMatch(teapot.question.ar, /\bT\b/u);
  // story-mysteries-003 was removed in the 2026-10-25 phase-2 pass; its repaired
  // text is checked as that ledger recorded it.
  const story = cards.get('story-mysteries-003')
    || readContentPhase2Ledger().removed.find(entry => entry.id === 'story-mysteries-003')?.card;
  assert.equal(story.mode, 'story');
  assert.equal(story.quickFire, undefined);
  assert.deepEqual(story.review, { status: 'pending' });
  assert.doesNotMatch(JSON.stringify(story), /bicycles|دراجة|found dead|وُجد رجل ميت/u);
  assert.match(story.question.en, /52 different rank-and-suit combinations/u);
  assert.match(story.question.en, /53 cards/u);
  assert.match(story.answer.en, /duplicate/u);
  assert.match(story.explanation.en, /not who added it or whether anyone cheated deliberately/u);
});
