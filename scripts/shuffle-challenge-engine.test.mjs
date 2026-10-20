import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ROUND_SIZE, normalizeLevel, planRound, replacementId, restoreRound, reveal, answerCard,
  replaceCurrent, isFinished, roundScore, rememberSeen, updateBest,
} from '../shuffle-challenge-engine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(root, 'data/card-index.json'), 'utf8'));
const HELD = new Set(['survival', 'law-middle-east', 'medical-questions', 'pharmacy', 'economics-and-finance']);
const publicTopics = catalog.categories.map(category => category.slug).filter(slug => !HELD.has(slug));

function seeded(seed = 7) {
  let value = seed;
  return () => { value = (value * 1103515245 + 12345) % 2147483648; return value / 2147483648; };
}

test('the shuffle draws from all 51 public topics and never from held ones', () => {
  assert.equal(publicTopics.length, 51);
  const visited = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const round = planRound({ index, topics: publicTopics, level: 'mixed', random: seeded(seed) });
    for (const item of round.items) {
      assert.ok(!HELD.has(item.slug), item.slug);
      assert.equal(index[item.id][0], item.slug);
      visited.add(item.slug);
    }
  }
  assert.equal(visited.size, 51);
});

test('every level deals ten cards from ten different topics at that level', () => {
  for (const level of ['mixed', 'easy', 'medium', 'hard', 'very-advanced']) {
    const round = planRound({ index, topics: publicTopics, level, random: seeded(3) });
    assert.equal(round.level, level);
    assert.equal(round.items.length, ROUND_SIZE);
    assert.equal(new Set(round.items.map(item => item.slug)).size, ROUND_SIZE);
    if (level !== 'mixed') for (const item of round.items) assert.equal(index[item.id][1], level);
  }
  assert.equal(normalizeLevel('impossible'), 'mixed');
});

test('recently seen cards are avoided while a topic has unseen ones', () => {
  const tiny = { 'a-1': ['alpha', 'easy'], 'a-2': ['alpha', 'easy'] };
  for (let seed = 1; seed < 20; seed++) {
    assert.equal(planRound({ index: tiny, topics: ['alpha'], level: 'easy', seen: ['a-1'], random: seeded(seed) }).items[0].id, 'a-2');
  }
  assert.ok(['a-1', 'a-2'].includes(planRound({ index: tiny, topics: ['alpha'], level: 'easy', seen: ['a-1', 'a-2'] }).items[0].id));
  assert.deepEqual(rememberSeen(['x', 'y'], ['y', 'z'], 2), ['y', 'z']);
});

test('a round progresses through reveal and answers to a scored finish', () => {
  let round = planRound({ index, topics: publicTopics, level: 'easy', random: seeded(11) });
  assert.equal(round.revealed, false);
  round = reveal(round);
  assert.equal(round.revealed, true);
  round = answerCard(round, 'knew');
  assert.equal(round.position, 1);
  assert.equal(round.revealed, false);
  round = answerCard(round, 'missed');
  round = answerCard(round, 'bogus');
  assert.equal(round.position, 2);
  while (!isFinished(round)) round = answerCard(round, 'skipped');
  assert.deepEqual(roundScore(round), { knew: 1, missed: 1, skipped: 8, total: 10 });
  assert.equal(answerCard(round, 'knew'), round);
  assert.deepEqual(updateBest({ easy: 3 }, 'easy', 1), { easy: 3 });
  assert.deepEqual(updateBest({ easy: 3 }, 'easy', 7), { easy: 7 });
  assert.deepEqual(updateBest(null, 'hard', 99), { hard: ROUND_SIZE });
});

test('restored rounds drop held or malformed cards and resume at the first open card', () => {
  const stored = {
    v: 1, level: 'medium', position: 0, revealed: true,
    items: [
      { slug: 'geography', id: 'geography-001', result: 'knew' },
      { slug: 'survival', id: 'survival-1', result: null },
      { slug: '../etc', id: 'x', result: null },
      { slug: 'history', id: 'history-001', result: 'oops' },
    ],
  };
  const held = record => HELD.has(record.categorySlug);
  const round = restoreRound(stored, held);
  assert.deepEqual(round.items.map(item => item.slug), ['geography', 'history']);
  assert.equal(round.position, 1);
  assert.equal(round.revealed, true);
  assert.equal(round.items[1].result, null);
  assert.equal(restoreRound({ v: 2, items: [] }), null);
  assert.equal(restoreRound({ v: 1, items: [{ slug: 'survival', id: 'survival-1' }] }, held), null);
});

test('a withdrawn card is replaced from the same topic at the same level', () => {
  const cards = [{ id: 'q-1', difficulty: 'easy' }, { id: 'q-2', difficulty: 'hard' }, { id: 'q-3', difficulty: 'easy' }];
  assert.equal(replacementId(cards, { level: 'easy', exclude: ['q-1'] }), 'q-3');
  assert.equal(replacementId(cards, { level: 'medium' }), null);
  let round = { v: 1, level: 'easy', items: [{ slug: 'quiz', id: 'q-1', result: null }], position: 0, revealed: false };
  round = replaceCurrent(round, 'q-3');
  assert.equal(round.items[0].id, 'q-3');
});
