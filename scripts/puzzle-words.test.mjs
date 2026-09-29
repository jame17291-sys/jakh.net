import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWord, evaluateGuess, validateHiveWord, hiveScore, checkGroup,
  buildTrail, validateTrailPath, validateSquareWord, shuffled,
  WORD_BANKS, HIVES, LINK_SETS, TRAIL_SETS, LETTER_SQUARES,
  restoreWordState, restoreHiveState, restoreLinksState, restoreTrailState, restoreSquareState, takeTrailHint,
} from '../puzzle-words.js';

test('both language libraries meet the authored release inventory', () => {
  for (const lang of ['en', 'ar']) {
    assert.ok(WORD_BANKS[lang].answers.length >= 24);
    assert.ok(HIVES[lang].length >= 3);
    assert.ok(LINK_SETS[lang].length >= 6);
    assert.ok(TRAIL_SETS[lang].length >= 2);
    assert.ok(LETTER_SQUARES[lang].length >= 2);
    assert.equal(new Set(HIVES[lang].map(p => [...p.letters].sort().join(''))).size, HIVES[lang].length);
    assert.equal(new Set(LINK_SETS[lang].map(p => p.flatMap(g => g.words).sort().join('|'))).size, LINK_SETS[lang].length);
    assert.equal(new Set(TRAIL_SETS[lang].map(p => p.span)).size, TRAIL_SETS[lang].length);
    assert.equal(new Set(LETTER_SQUARES[lang].map(p => p.sides.flat().sort().join(''))).size, LETTER_SQUARES[lang].length);
  }
});

test('Arabic matching removes marks and unifies alef, preserving distinct ta and ya letters', () => {
  assert.equal(normalizeWord('  أَزْهَــار  ', 'ar'), 'ازهار');
  assert.equal(normalizeWord('إآٱ', 'ar'), 'ااا');
  assert.equal(normalizeWord('هدى هدية', 'ar'), 'هدى هدية');
  assert.equal(normalizeWord('  apple '), 'APPLE');
});

test('word feedback allocates exact matches before repeated misplaced letters', () => {
  assert.deepEqual(evaluateGuess('ALLEY', 'APPLE'), ['correct', 'present', 'absent', 'present', 'absent']);
  assert.deepEqual(evaluateGuess('EAGLE', 'APPLE'), ['absent', 'present', 'absent', 'correct', 'correct']);
  assert.deepEqual(evaluateGuess('SHEEP', 'SPEED'), ['correct', 'absent', 'correct', 'correct', 'present']);
  assert.deepEqual(evaluateGuess('أزهار', 'أنهار', 'ar'), ['correct', 'absent', 'correct', 'correct', 'correct']);
  assert.throws(() => evaluateGuess('FOUR', 'THREE'), /length/);
});

test('no guessed letter can earn more matches than appear in the answer', () => {
  const samples = ['LEVEL', 'ALLEY', 'EAGLE', 'APPLE', 'ARRAY', 'ERROR', 'SHEEP', 'SPEED'];
  for (const answer of samples) for (const guess of samples) {
    const result = evaluateGuess(guess, answer);
    for (const letter of new Set(guess)) assert.ok(guess.split('').filter((x, i) => x === letter && result[i] !== 'absent').length <= answer.split('').filter(x => x === letter).length);
  }
});

test('every daily-word answer is an accepted five-letter word in its language bank', () => {
  for (const lang of ['en', 'ar']) {
    const bank = WORD_BANKS[lang], accepted = new Set(bank.words.map(w => normalizeWord(w, lang)));
    assert.equal(new Set(bank.answers).size, bank.answers.length);
    for (const word of bank.answers) {
      const normalized = normalizeWord(word, lang);
      assert.equal([...normalized].length, 5, word);
      assert.ok(accepted.has(normalized), word);
      assert.deepEqual(evaluateGuess(word, word, lang), Array(5).fill('correct'));
    }
  }
});

test('every hive bank has valid distinct answers, a valid pangram and consistent scoring', () => {
  for (const lang of ['en', 'ar']) for (const puzzle of HIVES[lang]) {
    assert.equal(new Set(puzzle.letters).size, 7);
    assert.equal(new Set(puzzle.words.map(w => normalizeWord(w, lang))).size, puzzle.words.length);
    for (const word of puzzle.words) assert.equal(validateHiveWord(word, puzzle, [], lang), null, word);
    assert.equal(validateHiveWord(puzzle.pangram, puzzle, [], lang), null);
    assert.ok(puzzle.letters.every(l => puzzle.pangram.includes(l)));
    assert.equal(hiveScore(puzzle.pangram, puzzle, lang), puzzle.pangram.length + 7);
    assert.equal(validateHiveWord(puzzle.words[0], puzzle, [puzzle.words[0]], lang), 'duplicate');
  }
  const puzzle = HIVES.en[0];
  assert.equal(validateHiveWord('AT', puzzle), 'short');
  assert.equal(validateHiveWord('TERN', puzzle), 'center');
  assert.equal(validateHiveWord('ZANY', puzzle), 'letters');
  assert.equal(validateHiveWord('AAAA', puzzle), 'dictionary');
  assert.equal(hiveScore('AREA', puzzle), 1);
  assert.equal(validateHiveWord('بَحْر', HIVES.ar[0], [], 'ar'), null);
});

test('group puzzles have unique tokens and reject duplicate or near-matching selections', () => {
  for (const lang of ['en', 'ar']) for (const groups of LINK_SETS[lang]) for (const size of [3, 4]) {
    const configured = groups.slice(0, size).map(g => ({ ...g, words: g.words.slice(0, size) }));
    assert.equal(new Set(configured.flatMap(g => g.words)).size, size * size);
    configured.forEach((g, i) => assert.equal(checkGroup([...g.words].reverse(), configured).index, i));
    const almost = [...configured[0].words.slice(0, size - 1), configured[1].words[0]];
    assert.deepEqual(checkGroup(almost, configured), { index: -1, oneAway: true });
    assert.equal(checkGroup(Array(size).fill(configured[0].words[0]), configured).index, -1);
  }
});

function hasPath(board, word) {
  const search = (cell, at, used) => {
    if (board.letters[cell] !== word[at] || used.has(cell)) return false;
    if (at === word.length - 1) return true;
    const nextUsed = new Set(used).add(cell);
    for (let other = 0; other < board.letters.length; other++) {
      if (Math.abs(Math.floor(cell / 6) - Math.floor(other / 6)) <= 1 && Math.abs(cell % 6 - other % 6) <= 1 && search(other, at + 1, nextUsed)) return true;
    }
    return false;
  };
  return board.letters.some((_, i) => search(i, 0, new Set()));
}

test('every trail arrangement has 48 covered cells, legal answer paths and a spanning answer', () => {
  for (const lang of ['en', 'ar']) for (const source of TRAIL_SETS[lang]) for (let seed = 0; seed < 12; seed++) {
    const board = buildTrail(source, seed, lang), used = [];
    assert.equal(board.letters.length, 48);
    for (const answer of board.answers) {
      assert.ok(validateTrailPath(answer.cells, board, used), `${lang} ${answer.word}`);
      assert.equal(answer.cells.map(i => board.letters[i]).join(''), answer.word);
      if (answer.span) {
        const columns = answer.cells.map(i => i % board.cols), rows = answer.cells.map(i => Math.floor(i / board.cols));
        assert.ok((columns.includes(0) && columns.includes(5)) || (rows.includes(0) && rows.includes(7)));
      }
      used.push(...answer.cells);
    }
    assert.equal(new Set(used).size, 48);
    for (const word of board.extras) {
      assert.ok(word.length >= 3);
      assert.ok(hasPath(board, word), `Declared bonus word is traceable: ${lang} ${word}`);
      assert.ok(!board.answers.some(a => a.word === word), 'Bonus list must not leak complete theme answers');
    }
    const available = board.extras.filter(w => !board.answers.some(a => a.word === w) && hasPath(board, w));
    assert.ok(available.length >= 3, `At least one hint must be earnable: ${lang} ${available}`);
  }
});

test('trail paths cannot jump, reuse or consume an already solved cell', () => {
  const board = buildTrail(TRAIL_SETS.en[0]);
  assert.equal(validateTrailPath([0, 7, 14], board), true);
  assert.equal(validateTrailPath([0, 2], board), false);
  assert.equal(validateTrailPath([5, 6], board), false);
  assert.equal(validateTrailPath([0, 1, 0], board), false);
  assert.equal(validateTrailPath([0, 1], board, [1]), false);
  assert.equal(validateTrailPath([-1, 0], board), false);
  assert.equal(validateTrailPath([], board), false);
});

test('letter-square authored solutions obey sides, chaining and cover all twelve letters', () => {
  for (const lang of ['en', 'ar']) for (const puzzle of LETTER_SQUARES[lang]) {
    assert.equal(puzzle.sides.length, 4);
    puzzle.sides.forEach(side => assert.equal(side.length, 3));
    assert.equal(new Set(puzzle.sides.flat()).size, 12);
    assert.equal(new Set(puzzle.words).size, puzzle.words.length);
    for (const word of puzzle.words) assert.equal(validateSquareWord(word, puzzle, '', lang), null, word);
    puzzle.solution.forEach((word, i) => assert.equal(validateSquareWord(word, puzzle, puzzle.solution[i - 1], lang), null));
    assert.equal(new Set(puzzle.solution.join('')).size, 12);
  }
  const puzzle = LETTER_SQUARES.en[0];
  assert.equal(validateSquareWord('TO', puzzle), 'short');
  assert.equal(validateSquareWord('LIGHT', puzzle, 'TONE'), 'chain');
  assert.equal(validateSquareWord('WATER', puzzle), 'letters');
  assert.equal(validateSquareWord('TAIL', puzzle), 'side');
  assert.equal(validateSquareWord('TRTR', puzzle), 'dictionary');
});

test('seeded arrangement is stable, preserves all values and does not mutate content', () => {
  const input = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.deepEqual(shuffled(input, 'puzzle-1'), shuffled(input, 'puzzle-1'));
  assert.deepEqual([...shuffled(input, 'puzzle-2')].sort(), input);
  assert.deepEqual(input, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.notDeepEqual(shuffled(input, 'puzzle-1'), shuffled(input, 'puzzle-2'));
});

test('malformed saves cannot crash games or manufacture a completed puzzle', () => {
  const corrupt = [null, false, 3, 'complete', [], { completed: true }, { toString: null, found: [null, { toString: 1 }], current: {}, shuffled: { valueOf: null }, chain: [null], guesses: [null], hintsUsed: 'infinity' }];
  for (const lang of ['en', 'ar']) for (const value of corrupt) {
    assert.equal(restoreWordState(value, WORD_BANKS[lang].answers[0], WORD_BANKS[lang].words, 6, lang).completed, false);
    assert.equal(restoreHiveState(value, HIVES[lang][0], lang).completed, false);
    assert.equal(restoreLinksState(value, LINK_SETS[lang][0]).completed, false);
    assert.equal(restoreTrailState(value, buildTrail(TRAIL_SETS[lang][0], 1, lang), lang).completed, false);
    assert.equal(restoreSquareState(value, LETTER_SQUARES[lang][0], lang).completed, false);
  }
});

test('word reload stops at the winning move, normalizes valid guesses and clears ended drafts', () => {
  const bank = WORD_BANKS.en.words;
  const win = restoreWordState({ guesses: ['apple', 'TRAIL', 'HOUSE'], current: 'BAD' }, 'TRAIL', bank);
  assert.deepEqual(win, { guesses: ['APPLE', 'TRAIL'], current: '', completed: true, finished: true });
  assert.equal(restoreWordState({ current: '  A1p🙂pLE ' }, 'TRAIL', bank).current, 'APPLE');
  assert.deepEqual(restoreWordState({ guesses: ['APPLE', null, 'TRAIL'] }, 'TRAIL', bank).guesses, ['APPLE']);
  const lose = restoreWordState({ guesses: Array(6).fill('APPLE'), current: 'TRAIL' }, 'TRAIL', bank);
  assert.equal(lose.finished, true); assert.equal(lose.completed, false); assert.equal(lose.current, '');
  assert.equal(restoreWordState({ guesses: Array(6).fill('APPLE') }, 'TRAIL', bank, 5).guesses.length, 5);
});

test('hive reload rejects repeats and unknown words, bounds input and survives complete reload/reset', () => {
  for (const lang of ['en', 'ar']) for (const puzzle of HIVES[lang]) {
    const partial = restoreHiveState({ found: [puzzle.words[0], puzzle.words[0], null, { toString: 0 }, 'WRONG'], current: puzzle.center.repeat(100), shuffled: 2.5 }, puzzle, lang);
    assert.deepEqual(partial.found, [normalizeWord(puzzle.words[0], lang)]); assert.equal(partial.current.length, 28); assert.equal(partial.shuffled, 0);
    const complete = restoreHiveState({ found: puzzle.words, current: puzzle.center }, puzzle, lang);
    assert.equal(complete.completed, true); assert.equal(complete.current, '');
    assert.deepEqual(restoreHiveState(complete, puzzle, lang), complete);
    assert.equal(restoreHiveState(null, puzzle, lang).found.length, 0);
  }
});

test('links reload ignores malformed and repeated failed groups and preserves unfinished selection', () => {
  for (const lang of ['en', 'ar']) for (const source of LINK_SETS[lang]) for (const size of [3, 4]) {
    const groups = source.slice(0, size).map(g => ({ ...g, words: g.words.slice(0, size) }));
    const wrong = [...groups[0].words.slice(0, size - 1), groups[1].words[0]];
    const state = restoreLinksState({ solved: [1, 1, 99, null], mistakes: ['a', wrong.join('|'), [...wrong].reverse().join('|'), groups[0].words.join('|'), Array(size).fill(wrong[0]).join('|')], selected: [groups[0].words[0], groups[1].words[0], 'unknown'], order: -2, completed: true }, groups);
    assert.deepEqual(state.solved, [1]); assert.equal(state.mistakes.length, 1); assert.equal(state.finished, false); assert.equal(state.completed, false);
    assert.deepEqual(state.selected, [groups[0].words[0]]); assert.equal(state.order, 0);
    assert.deepEqual(restoreLinksState(state, groups), state);
    assert.equal(restoreLinksState({ solved: groups.map((_, i) => i) }, groups).completed, true);
  }
});

test('trails reload preserves only legal unconsumed paths and completion is derived from all answers', () => {
  for (const lang of ['en', 'ar']) for (const source of TRAIL_SETS[lang]) {
    const board = buildTrail(source, 7, lang), path = board.answers[0].cells.slice(0, 3);
    const partial = restoreTrailState({ path, completed: true }, board, lang);
    assert.deepEqual(partial.path, path); assert.equal(partial.completed, false);
    assert.deepEqual(restoreTrailState(partial, board, lang), partial);
    assert.deepEqual(restoreTrailState({ found: [board.answers[0].word], path }, board, lang).path, []);
    assert.deepEqual(restoreTrailState({ path: [path[0], path[0]] }, board, lang).path, []);
    assert.deepEqual(restoreTrailState({ path: [0, 47] }, board, lang).path, []);
    const complete = restoreTrailState({ found: board.answers.map(a => a.word), path, hint: board.answers[0].word }, board, lang);
    assert.equal(complete.completed, true); assert.deepEqual(complete.path, []); assert.equal(complete.hint, null);
    assert.equal(restoreTrailState(null, board, lang).found.length, 0);
  }
});

test('an active trail hint cannot consume another earned hint, including after reload', () => {
  const board = buildTrail(TRAIL_SETS.en[0], 1), ready = { extra: board.extras.slice(0, 6), found: [], hintsUsed: 0 };
  const first = takeTrailHint(ready, board); assert.equal(first.hintsUsed, 1); assert.ok(first.hint);
  assert.deepEqual(takeTrailHint(first, board), first);
  assert.deepEqual(takeTrailHint(restoreTrailState(first, board), board), first);
  const second = takeTrailHint({ ...first, found: [first.hint] }, board);
  assert.equal(second.hintsUsed, 2); assert.notEqual(second.hint, first.hint);
  const corrupt = restoreTrailState({ extra: board.extras.slice(0, 3), hintsUsed: 9.5, hint: board.answers[1].word }, board);
  assert.equal(corrupt.hintsUsed, 0); assert.equal(corrupt.hint, null);
  assert.equal(takeTrailHint({ extra: board.extras.slice(0, 2) }, board).hint, null);
});

test('square reload truncates broken chains and post-completion moves, retaining playable progress', () => {
  for (const lang of ['en', 'ar']) for (const puzzle of LETTER_SQUARES[lang]) {
    const partial = restoreSquareState({ chain: [puzzle.solution[0], {}, ...puzzle.solution.slice(1)], current: puzzle.sides[0][0].repeat(100) }, puzzle, lang);
    assert.deepEqual(partial.chain, [puzzle.solution[0]]); assert.equal(partial.current.length, 28);
    const complete = restoreSquareState({ chain: [...puzzle.solution, 'WRONG'], current: 'BAD' }, puzzle, lang);
    assert.equal(complete.completed, true); assert.equal(complete.current, ''); assert.deepEqual(complete.chain, puzzle.solution);
    assert.deepEqual(restoreSquareState(complete, puzzle, lang), complete);
    assert.equal(restoreSquareState(null, puzzle, lang).completed, false);
  }
});
