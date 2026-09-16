import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { normalizeScorableAnswer } from './content-review-lib.mjs';

const categoryIds = {
  'classic-riddles': [2, 3, 4, 5, 7, 11, 18, 19, 23, 32],
  math: [1, 2, 3, 6, 7, 8, 9, 12, 18, 20],
  'logic-puzzles': [1, 2, 3, 6, 8, 13, 16, 17, 20, 27],
};
const cards = new Map();
for (const category of [...Object.keys(categoryIds), 'story-mysteries']) {
  const source = JSON.parse(readFileSync(new URL(`../data/${category}.json`, import.meta.url)));
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
  assert.equal(total, 30);
});

test('Battle discovery does not silently substitute an unprepared requested topic', () => {
  const source = readFileSync(new URL('../battle-mode.js', import.meta.url), 'utf8');
  const start = source.indexOf('function renderBattleSetup(');
  const render = source.slice(start, source.indexOf('\n}', start) + 2);
  const context = vm.createContext({
    state: { lang: 'en', catalog: { categories: [
      { slug: 'science', title: { en: 'Science' }, quickFireQuestionCount: 0 },
      { slug: 'math', title: { en: 'Math' }, quickFireQuestionCount: 10 },
    ] } },
    battleState: { pendingSlug: 'science', tab: 'create' },
    escapeHtml: String,
    document: { getElementById: () => null },
  });
  vm.runInContext(render, context);
  const body = {};
  context.renderBattleSetup(body);
  assert.doesNotMatch(body.innerHTML, /option value="science"/u);
  assert.match(body.innerHTML, /option value="" disabled selected/u);
  assert.match(body.innerHTML, /option value="math"/u);
  context.battleState.pendingSlug = 'math';
  context.renderBattleSetup(body);
  assert.match(body.innerHTML, /option value="math" selected/u);
});

test('thirty seeded cards have complete aligned bilingual authored choices, not reviewer approvals', () => {
  let total = 0;
  for (const [category, ids] of Object.entries(categoryIds)) {
    assert.equal(ids.length, 10);
    const authored = [...cards.values()].filter(card => card.id.startsWith(`${category}-`) && card.quickFire);
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
  assert.equal(total, 30);
});

test('authored arithmetic answers and numerical distractors satisfy exactly one intended result', () => {
  const expected = new Map([
    ['math-001', (1.10 - 1.00) / 2],
    ['math-003', 7 * 5],
    ['math-006', 360 / 4],
    ['math-007', (-1) ** 4],
    ['math-008', 9],
    ['math-012', Math.sqrt(144)],
    ['math-018', (10 + 20 + 60) / 3],
    ['math-020', 20 - 3 * 4],
    ['logic-puzzles-001', 48 - 1],
    ['logic-puzzles-003', 2],
    ['logic-puzzles-013', 70 - (6 - 3)],
    ['logic-puzzles-020', 12 / (3 + 1)],
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
      const value = text => arabicNumberWords[text] ?? numbers(text)[0];
      assert.ok(Math.abs(value(options[0]) - result) < 1e-9, `${id}: correct/${language}`);
      assert.ok(options.slice(1).every(option => Math.abs(value(option) - result) > 1e-9), `${id}: distractors/${language}`);
    }
  }
  const speed = cards.get('math-002');
  assert.equal(60 / 60, 1);
  assert.equal(speed.quickFire.answer.en, '1 hour');
  assert.deepEqual(speed.quickFire.distractors.en, ['30 minutes', '2 hours', '60 hours']);
  assert.ok([0.5, 2, 60].every(hours => hours !== 60 / 60));
});

test('coordinate reflection and constraint puzzles have only one valid authored option', () => {
  const checks = [
    ['math-009', values => values.length === 2 && values[0] === 3 && values[1] === 2],
    ['classic-riddles-018', values => values.length === 3 && values[1] === values[0] + 1 && values[2] === values[1] + 1 && values.reduce((a, b) => a + b, 0) === 72],
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
  const order = cards.get('logic-puzzles-006');
  for (const [index, option] of allOptions(order, 'en').entries()) {
    const positions = option.toLowerCase().split(',').map(value => value.trim());
    assert.equal(positions.indexOf('red') < positions.indexOf('green') && positions.indexOf('green') < positions.indexOf('blue'), index === 0);
  }
});

test('repaired bilingual puzzles no longer rely on T/tea or unexplained bicycles and retain pending status', () => {
  const teapot = cards.get('classic-riddles-005');
  assert.deepEqual(teapot.answer, { en: 'A teapot', ar: 'إبريق الشاي' });
  assert.doesNotMatch(teapot.question.en, /begins with T|has T in it/u);
  assert.doesNotMatch(teapot.question.ar, /\bT\b/u);
  const story = cards.get('story-mysteries-003');
  assert.equal(story.mode, 'story');
  assert.equal(story.quickFire, undefined);
  assert.deepEqual(story.review, { status: 'pending' });
  assert.doesNotMatch(JSON.stringify(story), /bicycles|دراجة|found dead|وُجد رجل ميت/u);
  assert.match(story.question.en, /52 different rank-and-suit combinations/u);
  assert.match(story.question.en, /53 cards/u);
  assert.match(story.answer.en, /duplicate/u);
  assert.match(story.explanation.en, /not who added it or whether anyone cheated deliberately/u);
});
