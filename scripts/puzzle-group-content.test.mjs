import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { LINK_SETS, TRAIL_SETS } from '../puzzle-group-data.js';
import { buildTrail, validateTrailPath, checkGroup, normalizeWord, restoreTrailState, takeTrailHint } from '../puzzle-words.js';

const languages = ['en', 'ar'];
const groupKey = group => [...group.words].sort().join('|');
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const editorial = JSON.parse(readFileSync(new URL('./puzzle-editorial-review.json', import.meta.url), 'utf8'));

// This finds a legal path independently of the generator's authored answer path.
function bonusPath(board, word) {
  function visit(cell, offset, path) {
    if (path.includes(cell) || board.letters[cell] !== word[offset]) return null;
    const next = [...path, cell];
    if (offset === word.length - 1) return next;
    for (let row = Math.max(0, Math.floor(cell / board.cols) - 1); row <= Math.min(board.rows - 1, Math.floor(cell / board.cols) + 1); row++) {
      for (let col = Math.max(0, cell % board.cols - 1); col <= Math.min(board.cols - 1, cell % board.cols + 1); col++) {
        const result = visit(row * board.cols + col, offset + 1, next);
        if (result) return result;
      }
    }
    return null;
  }
  for (let cell = 0; cell < board.letters.length; cell++) {
    const path = visit(cell, 0, []);
    if (path) return path;
  }
  return null;
}

test('each language has thirty stable, distinct puzzles in both group banks with explicit review provenance', () => {
  const ids = new Set();
  for (const lang of languages) for (const [type, bank] of Object.entries({ links: LINK_SETS[lang], trails: TRAIL_SETS[lang] })) {
    assert.ok(bank.length >= 30, `${lang} ${type}`);
    bank.forEach((p, index) => {
      assert.equal(p.id, `${type}-${lang}-${String(index + 1).padStart(3, '0')}`);
      assert.ok(!ids.has(p.id)); ids.add(p.id);
      const review = editorial.puzzles[p.id];
      assert.equal(review.method, 'automated-plus-language-review');
      assert.equal(review.reviewer, 'coding-agent');
      assert.equal(review.externalHumanReview, false);
      assert.ok(review.rationale.length > 35, `${p.id}: include a readable editorial rationale`);
    });
    const signatures = bank.map(p => type === 'links' ? p.flatMap(g => g.words).sort().join('|') : p.words.map(w => normalizeWord(w, lang)).sort().join('|'));
    assert.equal(new Set(signatures).size, bank.length, 'rotation or reordering cannot inflate the inventory');
  }
});

test('new Connections sets introduce new groups rather than recombining the original groups', () => {
  for (const lang of languages) {
    const seen = new Set(LINK_SETS[lang].slice(0, 6).flatMap(p => p.map(groupKey)));
    for (const p of LINK_SETS[lang].slice(6)) {
      const fresh = p.filter(g => !seen.has(groupKey(g)));
      assert.ok(fresh.length >= 3, `${p.id}: at least three groups must be newly authored`);
      p.forEach(g => seen.add(groupKey(g)));
    }
  }
});

test('Connections has distinct normalized tokens, exact valid groups and rejected cross-group guesses in both variants', () => {
  for (const lang of languages) for (const puzzle of LINK_SETS[lang]) {
    assert.equal(puzzle.length, 4);
    assert.equal(new Set(puzzle.map(g => g.title)).size, 4);
    assert.equal(new Set(puzzle.flatMap(g => g.words).map(w => normalizeWord(w, lang))).size, 16, puzzle.id);
    for (const group of puzzle) {
      assert.equal(group.words.length, 4);
      for (const word of group.words) assert.match(word, lang === 'ar' ? /^[\u0621-\u064A\u066E-\u06D3\s]+$/u : /^[A-Za-z\s-]+$/u);
    }
    for (const size of [3, 4]) {
      const groups = puzzle.slice(0, size).map(g => ({ ...g, words: g.words.slice(0, size) }));
      groups.forEach((group, index) => assert.equal(checkGroup([...group.words].reverse(), groups).index, index));
      for (let i = 0; i < size; i++) {
        const almost = [...groups[i].words.slice(0, size - 1), groups[(i + 1) % size].words[0]];
        assert.deepEqual(checkGroup(almost, groups), { index: -1, oneAway: true });
      }
      assert.equal(checkGroup(Array(size).fill(groups[0].words[0]), groups).index, -1);
    }
  }
});

test('all Trails themes are distinct and use complete words totaling exactly forty-eight normalized letters', () => {
  for (const lang of languages) {
    const bank = TRAIL_SETS[lang];
    assert.equal(new Set(bank.map(p => p.theme)).size, bank.length);
    assert.equal(new Set(bank.map(p => normalizeWord(p.span, lang))).size, bank.length);
    for (const p of bank) {
      const answers = p.words.map(w => normalizeWord(w, lang));
      assert.equal(answers.join('').length, 48, p.id);
      assert.equal(new Set(answers).size, answers.length, p.id);
      assert.equal(answers.filter(w => w === normalizeWord(p.span, lang)).length, 1);
      assert.ok(answers.length >= 6 && answers.every(w => w.length >= 2));
      assert.ok(editorial.puzzles[p.id].rationale.includes(lang === 'ar' ? 'موضوع' : 'theme'));
    }
  }
});

test('all Trails paths cover the board exactly, span opposite edges and earn a hint at every seeded orientation', () => {
  for (const lang of languages) for (const p of TRAIL_SETS[lang]) for (let seed = 0; seed < 12; seed++) {
    const board = buildTrail(p, seed, lang), consumed = [];
    for (const answer of board.answers) {
      assert.ok(validateTrailPath(answer.cells, board, consumed), `${p.id}, seed ${seed}`);
      assert.equal(answer.cells.map(i => board.letters[i]).join(''), answer.word);
      if (answer.span) {
        const columns = answer.cells.map(i => i % board.cols), rows = answer.cells.map(i => Math.floor(i / board.cols));
        assert.ok((columns.includes(0) && columns.includes(board.cols - 1)) || (rows.includes(0) && rows.includes(board.rows - 1)), p.id);
      }
      consumed.push(...answer.cells);
    }
    assert.equal(consumed.length, 48); assert.equal(new Set(consumed).size, 48);
    assert.ok(board.extras.length >= 3);
    assert.equal(new Set(board.extras).size, board.extras.length);
    for (const extra of board.extras) {
      assert.ok(extra.length >= 3, `${p.id}: ${extra}`);
      assert.ok(!board.answers.some(a => a.word === extra), `${p.id}: ${extra} is a theme answer`);
      const path = bonusPath(board, extra);
      assert.ok(path && validateTrailPath(path, board), `${p.id}: ${extra} must be traceable`);
    }
    const ready = restoreTrailState({ extra: board.extras.slice(0, 3) }, board, lang);
    const hint = takeTrailHint(ready, board, lang);
    assert.equal(hint.hintsUsed, 1); assert.ok(board.answers.some(a => a.word === hint.hint));
    assert.equal(takeTrailHint(hint, board, lang).hintsUsed, 1, 'an active hint cannot charge twice');
    assert.equal(restoreTrailState({ found: board.answers.map(a => a.word) }, board, lang).completed, true);
  }
});

test('expansion preserves the original six Connections and two Trails in their existing order', () => {
  // Content snapshots protect existing daily IDs and saved games during expansion.
  const expected = {
    en: { links: '18cc90f979a74f197959cd23e00ca7488554d279ab457d70d4ab919b2488dcfe', trails: 'bf39b6fc82c442b1070c21806d171962f59323cd8ac306a4847eaaf0f1b17010' },
    ar: { links: '3995e674d6958b1cb9dcc53fb53822e51740179b5140ab951bc8df5bd245f5fe', trails: '32568187234e9461defcdef6e25981d2ecf42d70ed27d6ec7f770cb26e078948' },
  };
  for (const lang of languages) {
    assert.equal(fingerprint(LINK_SETS[lang].slice(0, 6)), expected[lang].links);
    const original = TRAIL_SETS[lang].slice(0, 2).map(({id, review, ...p}) => p);
    assert.equal(fingerprint(original), expected[lang].trails);
  }
});
