import assert from 'node:assert/strict';
import test from 'node:test';
import { AR_COUNT, arabicCount, arabicPluralCategory } from '../arabic-count.js';

test('Arabic plural categories follow standard counting for every range', () => {
  const cases = [
    [0, 'zero'], [1, 'one'], [2, 'two'],
    [3, 'few'], [7, 'few'], [10, 'few'],
    [11, 'many'], [50, 'many'], [99, 'many'],
    [100, 'other'], [101, 'other'], [102, 'other'],
    [103, 'few'], [110, 'few'], [111, 'many'], [199, 'many'],
    [200, 'other'], [450, 'many'], [1000, 'other'], [1002, 'other'],
    [1005, 'few'], [1011, 'many'], [3825, 'many'], [4103, 'few'],
  ];
  for (const [count, category] of cases) assert.equal(arabicPluralCategory(count), category, String(count));
});

test('question counts read naturally in Modern Standard Arabic', () => {
  const q = count => arabicCount(count, AR_COUNT.question);
  assert.equal(q(0), '0 أسئلة');
  assert.equal(q(1), 'سؤال واحد');
  assert.equal(q(2), 'سؤالان');
  assert.equal(q(3), '3 أسئلة');
  assert.equal(q(10), '10 أسئلة');
  assert.equal(q(11), '11 سؤالًا');
  assert.equal(q(80), '80 سؤالًا');
  assert.equal(q(99), '99 سؤالًا');
  assert.equal(q(100), '100 سؤال');
  assert.equal(q(101), '101 سؤال');
  assert.equal(q(102), '102 سؤال');
  assert.equal(q(105), '105 أسئلة');
  assert.equal(q(450), '450 سؤالًا');
  assert.equal(q(1000), '1000 سؤال');
  assert.equal(q(2000), '2000 سؤال');
});

test('topic, section and card nouns agree with their numbers', () => {
  assert.equal(arabicCount(7, AR_COUNT.topic), '7 موضوعات');
  assert.equal(arabicCount(51, AR_COUNT.topic), '51 موضوعًا');
  assert.equal(arabicCount(2, AR_COUNT.topic), 'موضوعان');
  assert.equal(arabicCount(5, AR_COUNT.section), '5 أقسام');
  assert.equal(arabicCount(1, AR_COUNT.section), 'قسم واحد');
  assert.equal(arabicCount(20, AR_COUNT.card), '20 بطاقة');
  assert.equal(arabicCount(4, AR_COUNT.card), '4 بطاقات');
  assert.equal(arabicCount(30, AR_COUNT.result), '30 نتيجة');
  assert.equal(arabicCount(6, AR_COUNT.result), '6 نتائج');
});

test('callers can supply case-specific dual forms, zero phrases, agreeing adjectives and digit formatting', () => {
  const afterPreposition = { ...AR_COUNT.topic, two: 'موضوعين' };
  assert.equal(`في ${arabicCount(2, afterPreposition)}`, 'في موضوعين');
  assert.equal(arabicCount(0, { ...AR_COUNT.result, zero: 'لا توجد نتائج' }), 'لا توجد نتائج');
  const matching = { one: 'سؤال واحد مطابق', two: 'سؤالان مطابقان', few: 'أسئلة مطابقة', many: 'سؤالًا مطابقًا', other: 'سؤال مطابق' };
  assert.equal(arabicCount(100, matching), '100 سؤال مطابق');
  assert.equal(arabicCount(8, matching), '8 أسئلة مطابقة');
  assert.equal(arabicCount(25, matching), '25 سؤالًا مطابقًا');
  assert.equal(arabicCount(3825, AR_COUNT.question, { format: n => n.toLocaleString('en-US') }), '3,825 سؤالًا');
});

test('unexpected input never throws while rendering a label', () => {
  assert.equal(arabicCount(undefined, AR_COUNT.question), '0 أسئلة');
  assert.equal(arabicCount('12', AR_COUNT.question), '12 سؤالًا');
  assert.equal(arabicCount(-3, AR_COUNT.question), '3 أسئلة');
  assert.equal(arabicCount(4.7, AR_COUNT.question), '4 أسئلة');
});
