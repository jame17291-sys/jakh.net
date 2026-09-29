import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ARABIC_WORDS, ARABIC_SPELLING_RULES, normalizeArabicWord } from '../puzzle-arabic-words.js';
import { WORD_BANKS, HIVES, LETTER_SQUARES, LINK_SETS, TRAIL_SETS, WORD_KEYBOARD_ROWS, puzzleBankIndex, hashSeed, normalizeWord, validateHiveWord, validateSquareWord, restoreHiveState, restoreSquareState } from '../puzzle-words.js';

const checksum = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const editorial = JSON.parse(readFileSync(new URL('./puzzle-editorial-review.json', import.meta.url), 'utf8'));

test('Arabic house vocabulary is explicit, normalized-distinct MSA with supported spelling rules', () => {
  assert.ok(ARABIC_WORDS.length >= 1800);
  assert.ok(ARABIC_WORDS.every(w => typeof w === 'string' && /^[\u0621-\u064A]{2,16}$/u.test(w)), 'Display vocabulary contains Arabic spellings without spaces, marks or Latin letters');
  const accepted = new Set(ARABIC_WORDS.map(normalizeArabicWord));
  assert.equal(accepted.size, ARABIC_WORDS.length);
  assert.equal(normalizeArabicWord(' إِبْــرَة '), 'ابرة');
  assert.equal(normalizeArabicWord('ﻻ'), 'لا');
  assert.equal(normalizeArabicWord({}), '');
  for (const [a, b] of [['هدى', 'هدي'], ['مدرسة', 'مدرسه'], ['بئر', 'بير'], ['فؤاد', 'فواد'], ['شيء', 'شي']]) assert.notEqual(normalizeArabicWord(a), normalizeArabicWord(b));
  for (const w of ['سؤال', 'أسئلة', 'مسؤول', 'رئيس', 'قارئ', 'هادئ', 'لؤلؤة', 'طيور', 'أشجار', 'مستشفى', 'حديقة', 'قراءة', 'تقرأ', 'نقرأ', 'يقرأ', 'فاصولياء']) assert.ok(accepted.has(normalizeArabicWord(w)), w);
  for (const w of ['سوال', 'مدرسه', 'مدرسةنا', 'مدرسةكم', 'حلوىنا', 'أبناءنا']) assert.equal(accepted.has(normalizeArabicWord(w)), false, w);
  assert.equal(ARABIC_SPELLING_RULES.version, 2);
  assert.match(editorial.arabicVocabulary.editorial, /No external human review claimed/);
  assert.equal(Object.hasOwn(ARABIC_SPELLING_RULES, 'editorial'), false);
  assert.match(ARABIC_SPELLING_RULES.vocabulary, /No stemmer/);
});

test('expanded five-letter acceptance supports useful guesses without changing the 24 answer schedules', () => {
  assert.equal(WORD_BANKS.ar.words, ARABIC_WORDS);
  for (const lang of ['en', 'ar']) {
    assert.equal(WORD_BANKS[lang].answers.length, 24);
    const words = WORD_BANKS[lang].words.map(w => normalizeWord(w, lang)).filter(w => w.length === 5);
    assert.ok(words.length >= 400, `${lang}: ${words.length} usable five-letter guesses`);
    const keys = new Set(WORD_KEYBOARD_ROWS[lang].join(''));
    assert.equal(keys.size, WORD_KEYBOARD_ROWS[lang].join('').length);
    for (const word of words) for (const letter of word) assert.ok(keys.has(letter), `${lang} ${word}: keyboard must expose ${letter}`);
  }
  assert.ok(WORD_BANKS.en.words.includes('SPEED'));
  assert.equal(checksum(WORD_BANKS.en.answers), '267dc368511fb85458d8c270f80553c176dcbe76a99837ce48553fce47a2f936');
  assert.equal(checksum(WORD_BANKS.ar.answers), '5a9e34ffd5ad6d3ef8e19c97119e93d1cdb485930d6978f2b46ec9f5f013a7dd');
});

test('edition 2 uses all thirty boards once before repeating, while legacy contexts keep their schedule', () => {
  for (const lang of ['en', 'ar']) for (const bank of [HIVES[lang], LETTER_SQUARES[lang], LINK_SETS[lang], TRAIL_SETS[lang]]) {
    assert.equal(bank.length, 30);
    for (let start = 0; start < 30; start++) {
      const cycle = Array.from({ length: 30 }, (_, day) => bank[puzzleBankIndex({ puzzleIndex: start + day, seed: 'ignored' }, bank.length)].id);
      assert.equal(new Set(cycle).size, 30);
      assert.equal(puzzleBankIndex({ puzzleIndex: start }, bank.length), puzzleBankIndex({ puzzleIndex: start + 30 }, bank.length));
    }
    for (const puzzleIndex of [undefined, null, -1, 1.5, NaN, Infinity, '4']) assert.equal(puzzleBankIndex({ puzzleIndex, seed: 'legacy-day' }, bank.length), hashSeed('legacy-day') % bank.length);
  }
  assert.throws(() => puzzleBankIndex({}, 0), RangeError);
});

test('the first edition-2 Hive and Square board identities and order are pinned for dated links', () => {
  for (const [name, data] of [['hive', HIVES], ['square', LETTER_SQUARES]]) for (const lang of ['en', 'ar']) {
    const bank = data[lang];
    assert.deepEqual(bank.map(p => p.id), Array.from({ length: 30 }, (_, i) => `${name}-${lang}-${String(i + 1).padStart(3, '0')}`));
    for (const p of bank) {
      const review = editorial.puzzles[p.id];
      assert.equal(review.method, 'automated-plus-language-review');
      assert.match(review.scope, /no external human review claimed/i);
      assert.ok(review.rationale.length > 60);
      assert.ok(review.checks.length >= 4);
    }
  }
  for (const lang of ['en', 'ar']) {
    assert.equal(checksum(HIVES[lang].map(({ id, center, letters, pangram, words }) => ({ id, center, letters, pangram, words }))), { en: 'eb9117d2a8f287670ae74a48d5ac53ecd480a2d2daf6a6e1d4bb0449f66354f4', ar: '1a7fdc154b00eaad2f308d59b1c4ad1ab0dc1c8c4ecccbf786d14320fa39bb7f' }[lang]);
    assert.equal(checksum(LETTER_SQUARES[lang].map(({ id, sides, solution, words }) => ({ id, sides, solution, words }))), { en: '9dbd2129bebb48de44102d4c35a7bfe8983edbb82c9d49d2fa6404629c470739', ar: 'c82666404eecd883d836bd2a7df0a6edcfc41238789902d237356c7e90c47946' }[lang]);
  }
});

test('private provenance covers every stable board without entering browser payloads or changing content', () => {
  const banks = { HIVES, LETTER_SQUARES, LINK_SETS, TRAIL_SETS };
  const ids = Object.values(banks).flatMap(bank => Object.values(bank).flat().map(p => p.id));
  assert.deepEqual(Object.keys(editorial.puzzles).sort(), [...ids].sort());
  for (const bank of Object.values(banks)) for (const puzzles of Object.values(bank)) for (const puzzle of puzzles) {
    assert.equal(Object.hasOwn(puzzle, 'review'), false, puzzle.id);
    assert.equal(Object.hasOwn(puzzle, 'rationale'), false, puzzle.id);
  }
  for (const file of ['puzzle-arabic-words.js', 'puzzle-hive-data.js', 'puzzle-square-data.js', 'puzzle-group-data.js']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /puzzle-editorial-review|editorial\s+review|external\s+human\s+review|automated-plus-language-review|rationale/iu, file);
  }
  const payload = Object.fromEntries(Object.entries(banks).map(([name, bank]) => [name, Object.fromEntries(Object.entries(bank).map(([lang, puzzles]) => [lang, puzzles.map(p => Array.isArray(p) ? { id: p.id, groups: p.map(g => structuredClone(g)) } : p)]))]));
  assert.equal(checksum(payload), '8dba4aa8a12ebef1d577b36a781e772c873a89d440cd2d05b519f0a559bc347d', 'All 240 puzzle payloads and their dated ordering survive the metadata separation unchanged');
});

test('each authored Hive has a distinct alphabet, substantive answer bank and playable saved completion', () => {
  for (const lang of ['en', 'ar']) {
    assert.equal(new Set(HIVES[lang].map(p => [...p.letters].sort().join(''))).size, 30, 'Rotations do not count as new content');
    for (const p of HIVES[lang]) {
      assert.ok(p.words.length >= 12, p.id);
      assert.equal(new Set(p.pangram).size, 7, p.id);
      assert.equal(validateHiveWord(p.pangram, p, [], lang), null, p.id);
      const complete = restoreHiveState({ found: p.words }, p, lang);
      assert.equal(complete.completed, true, p.id);
      assert.deepEqual(restoreHiveState(complete, p, lang), complete, p.id);
    }
  }
});

test('every Square has genuinely new letters, verified transitions and full coverage before saved completion', () => {
  for (const lang of ['en', 'ar']) {
    assert.equal(new Set(LETTER_SQUARES[lang].map(p => p.sides.flat().sort().join(''))).size, 30, 'Rearranging one alphabet does not count as new content');
    for (const p of LETTER_SQUARES[lang]) {
      const normalized = p.solution.map(w => normalizeWord(w, lang));
      assert.equal(new Set(normalized).size, normalized.length, p.id);
      for (let i = 0; i < normalized.length; i++) {
        assert.equal(validateSquareWord(normalized[i], p, normalized[i - 1], lang), null, `${p.id} ${normalized[i]}`);
        assert.equal(restoreSquareState({ chain: p.solution.slice(0, i) }, p, lang).completed, false, `${p.id} solution should not continue past completion`);
      }
      assert.equal(new Set(normalized.join('')).size, 12, p.id);
      const complete = restoreSquareState({ chain: p.solution }, p, lang);
      assert.equal(complete.completed, true, p.id);
      assert.deepEqual(complete.chain, normalized, p.id);
      assert.deepEqual(restoreSquareState(complete, p, lang), complete, p.id);
    }
  }
});
