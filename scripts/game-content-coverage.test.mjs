import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { normalizeScorableAnswer } from './content-review-lib.mjs';

const chemistry = JSON.parse(readFileSync(new URL('../data/chemistry.json', import.meta.url)));
const math = JSON.parse(readFileSync(new URL('../data/math.json', import.meta.url)));
const chemistryIds = [1, 2, 3, 4, 7, 8, 11, 13, 14, 15, 17, 18, 20, 31, 32, 34, 42, 46, 52, 58];
const mathMediumIds = [117, 118, 119, 121, 122, 123, 125, 126, 127, 129];
const cardId = (category, number) => `${category}-${String(number).padStart(3, '0')}`;
const getCard = (cards, category, number) => {
  const card = cards.find(item => item.id === cardId(category, number));
  assert.ok(card, `${category}/${number}`);
  return card;
};
const options = (card, language) => [card.quickFire.answer[language], ...card.quickFire.distractors[language]];

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const client = vm.createContext({});
for (const name of ['quickFireChoiceKey', 'quickFireCorrectKeys', 'preparedQuickFire']) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  vm.runInContext(app.slice(start, app.indexOf('\n}', start) + 2), client);
}

test('Chemistry and Math each offer ten prepared Easy and ten Medium questions', () => {
  for (const [category, cards] of [['chemistry', chemistry], ['math', math]]) {
    const prepared = cards.filter(card => client.preparedQuickFire(card));
    const counts = Object.fromEntries(['easy', 'medium', 'hard', 'very-advanced'].map(difficulty => [
      difficulty, prepared.filter(card => card.difficulty === difficulty).length,
    ]));
    assert.deepEqual(counts, { easy: 10, medium: 10, hard: 0, 'very-advanced': 0 }, category);
    assert.ok(prepared.length >= 5, `${category}: Battle minimum`);
    for (const difficulty of ['easy', 'medium']) {
      assert.ok(prepared.filter(card => card.difficulty === difficulty).length >= 10, `${category}/${difficulty}: ten-round game`);
    }
  }
  assert.deepEqual(
    chemistry.filter(card => card.quickFire).map(card => card.id).sort(),
    chemistryIds.map(number => cardId('chemistry', number)).sort(),
  );
  assert.deepEqual(
    math.filter(card => card.quickFire && card.difficulty === 'medium').map(card => card.id).sort(),
    mathMediumIds.map(number => cardId('math', number)).sort(),
  );
});

test('new choices preserve canonical bilingual answers or explicit aliases without declaring review approval', () => {
  const newCards = [
    ...chemistryIds.map(number => getCard(chemistry, 'chemistry', number)),
    ...mathMediumIds.map(number => getCard(math, 'math', number)),
  ];
  for (const card of newCards) {
    assert.deepEqual(card.review, { status: 'pending' }, card.id);
    assert.deepEqual(Object.keys(card.quickFire).sort(), ['answer', 'distractors', 'explanation']);
    assert.ok(client.preparedQuickFire(card), `${card.id}: rejected by production client`);
    const acceptedKeys = new Set(['en', 'ar'].flatMap(language => [
      card.answer[language], ...(card.acceptedAnswers?.[language] || []),
    ]).map(normalizeScorableAnswer));
    for (const language of ['en', 'ar']) {
      const choiceKeys = options(card, language).map(normalizeScorableAnswer);
      assert.equal(choiceKeys.length, 4);
      assert.equal(new Set(choiceKeys).size, 4, `${card.id}/${language}: duplicate options`);
      assert.ok(acceptedKeys.has(choiceKeys[0]), `${card.id}/${language}: changed answer meaning`);
      assert.ok(choiceKeys.slice(1).every(key => !acceptedKeys.has(key)), `${card.id}/${language}: accepted distractor`);
      assert.ok(card.quickFire.explanation[language].trim(), `${card.id}/${language}: missing explanation`);
    }
  }
  for (const number of chemistryIds) {
    const card = getCard(chemistry, 'chemistry', number);
    assert.deepEqual(card.quickFire.answer, card.answer, `${card.id}: no canonical abbreviation is needed`);
  }
  for (const [number, alias] of [[118, '1/6'], [119, '24'], [123, '19%']]) {
    const card = getCard(math, 'math', number);
    for (const language of ['en', 'ar']) {
      assert.ok(card.acceptedAnswers[language].includes(alias), `${card.id}/${language}: concise answer alias`);
    }
  }
});

test('chemical formulas and element symbols have one factual answer in either language', () => {
  const formulaAtoms = formula => Object.fromEntries(
    [...formula.normalize('NFKC').matchAll(/([A-Z][a-z]?)(\d*)/gu)].map(([, symbol, count]) => [symbol, Number(count || 1)]),
  );
  const water = getCard(chemistry, 'chemistry', 1);
  for (const language of ['en', 'ar']) {
    assert.deepEqual(options(water, language).map(option => {
      const atoms = formulaAtoms(option);
      return atoms.H === 2 && atoms.O === 1 && Object.keys(atoms).length === 2;
    }), [true, false, false, false], `water/${language}`);
  }
  // Royal Society of Chemistry periodic-table records: Au=79, Fe=26, Ag=47.
  const atomicNumbers = { Au: 79, Ag: 47, Fe: 26, Cu: 29, He: 2, Al: 13, Sn: 50 };
  for (const [number, expectedAtomicNumber] of [[7, 79], [31, 26], [32, 47]]) {
    const card = getCard(chemistry, 'chemistry', number);
    for (const language of ['en', 'ar']) {
      assert.deepEqual(options(card, language).map(symbol => atomicNumbers[symbol] === expectedAtomicNumber),
        [true, false, false, false], `${card.id}/${language}`);
    }
  }
  const lightest = getCard(chemistry, 'chemistry', 34);
  const atomicMasses = new Map([
    ['hydrogen', 1.008], ['الهيدروجين', 1.008],
    ['helium', 4.0026], ['الهيليوم', 4.0026],
    ['oxygen', 15.999], ['الأكسجين', 15.999],
    ['nitrogen', 14.007], ['النيتروجين', 14.007],
  ].map(([name, mass]) => [normalizeScorableAnswer(name), mass]));
  for (const language of ['en', 'ar']) {
    const masses = options(lightest, language).map(name => atomicMasses.get(normalizeScorableAnswer(name)));
    assert.ok(masses.every(Number.isFinite));
    assert.equal(masses[0], Math.min(...masses), `lightest element/${language}`);
    assert.equal(new Set(masses).size, 4);
  }
});

test('bilingual chemistry concepts retain their precise scientific definitions', () => {
  // IUPAC atomic number A00499, isotopes I03331, covalent bond C01384, sublimation S06069.
  const expectedConcepts = new Map([
    [2, ['The Periodic Table', 'الجدول الدوري للعناصر']],
    [3, ['Sodium and Chlorine', 'الصوديوم والكلور']],
    [4, ['The Nucleus', 'النواة']],
    [8, ['Positive', 'موجبة']],
    [11, ['The number of protons', 'عدد البروتونات']],
    [13, ['Valence electrons', 'إلكترونات التكافؤ']],
    [14, ['Isotopes', 'النظائر']],
    [15, ['Endothermic', 'التفاعل الماص للحرارة']],
    [17, ['Covalent Bond', 'الرابطة التساهمية']],
    [18, ['Sublimation', 'التسامي']],
    [20, ['A catalyst', 'المحفز (الكاتاليست)']],
    [42, ['Carbon', 'الكربون']],
    [46, ['A bond formed by the electrostatic attraction between oppositely charged ions', 'رابطة تتكوّن بالتجاذب الكهروستاتيكي بين أيونات مشحونة بشحنات متعاكسة']],
    [58, ['Dmitri Mendeleev.', 'ديمتري مندليف.']],
  ]);
  for (const [number, answers] of expectedConcepts) {
    const card = getCard(chemistry, 'chemistry', number);
    for (const [index, language] of ['en', 'ar'].entries()) {
      const expected = normalizeScorableAnswer(answers[index]);
      assert.deepEqual(options(card, language).map(option => normalizeScorableAnswer(option) === expected),
        [true, false, false, false], `${card.id}/${language}`);
    }
  }
  const dBlock = getCard(chemistry, 'chemistry', 52);
  assert.match(dBlock.question.en, /d-block rows/u);
  assert.doesNotMatch(dBlock.question.en, /all.*transition metal/iu);
  for (const language of ['en', 'ar']) {
    const periods = options(dBlock, language).map(option => (option.match(/\d+/gu) || []).map(Number));
    assert.deepEqual(periods.map(sequence => sequence.length === 4
      && sequence.every((period, index) => period === index + 4)), [true, false, false, false], `d-block/${language}`);
  }
});

const numericalValue = text => {
  const normalized = text.normalize('NFKC').replace(/−/gu, '-');
  const fraction = /^(-?\d+)\s*\/\s*(\d+)$/u.exec(normalized);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const number = /^(-?\d+(?:\.\d+)?)(?:%|°)?$/u.exec(normalized);
  assert.ok(number, `Expected a concise numerical option: ${text}`);
  return Number(number[1]);
};

test('each authored Math Medium option set has exactly one independently computed answer', () => {
  let sumSeven = 0;
  for (let first = 1; first <= 6; first += 1) {
    for (let second = 1; second <= 6; second += 1) {
      if (first + second === 7) sumSeven += 1;
    }
  }
  const permutations = values => values.length === 0 ? [[]]
    : values.flatMap((value, index) => permutations(values.filter((_, candidate) => candidate !== index)).map(rest => [value, ...rest]));
  const sorted = [2, 3, 5, 7, 9].toSorted((a, b) => a - b);
  let lowestCommonMultiple = 1;
  while (lowestCommonMultiple % 4 || lowestCommonMultiple % 6) lowestCommonMultiple += 1;
  const linear = x => 3 * x + 5;
  const expected = new Map([
    [117, linear(1) - linear(0)],
    [118, sumSeven / (6 * 6)],
    [119, permutations(['A', 'B', 'C', 'D']).length],
    [122, sorted[Math.floor(sorted.length / 2)]],
    [123, (1 - (1 - 0.10) * (1 - 0.10)) * 100],
    [125, 3 / (10 - 1)],
    [126, lowestCommonMultiple],
    [127, 30 - 30 * 0.60],
    [129, (4 - 2) * 180],
  ]);
  for (const [number, result] of expected) {
    const card = getCard(math, 'math', number);
    for (const language of ['en', 'ar']) {
      assert.deepEqual(options(card, language).map(option => Math.abs(numericalValue(option) - result) < 1e-10),
        [true, false, false, false], `${card.id}/${language}`);
    }
  }
  const quadratic = getCard(math, 'math', 121);
  for (const language of ['en', 'ar']) {
    assert.deepEqual(options(quadratic, language).map(option => {
      const roots = (option.replace(/−/gu, '-').match(/-?\d+/gu) || []).map(Number);
      return roots.length === 2 && new Set(roots).size === 2 && roots.every(x => x * x - 5 * x + 6 === 0);
    }), [true, false, false, false], `${quadratic.id}/${language}`);
  }
});
