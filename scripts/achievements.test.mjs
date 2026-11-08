import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACHIEVEMENTS, computeAchievements, normalizeContext, unlockDiff, title, description, currentLocalStreak,
  restoreShuffleStats, recordShuffleRound, recordShuffleShare, shuffleContext, SHUFFLE_STATS_KEY,
} from '../achievements.js';

const ids = list => list.map(a => a.id);

test('every trophy has a stable id, an icon, bilingual copy and a check', () => {
  assert.equal(new Set(ids(ACHIEVEMENTS)).size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) {
    assert.match(a.id, /^[a-z0-9-]+$/u);
    for (const key of ['icon', 'en', 'ar', 'descEn', 'descAr', 'group']) assert.ok(typeof a[key] === 'string' && a[key].trim(), `${a.id}.${key}`);
    assert.equal(typeof a.check, 'function');
    assert.equal(title(a, 'ar'), a.ar); assert.equal(title(a, 'en'), a.en);
    assert.equal(description(a, 'ar'), a.descAr); assert.equal(description(a, 'en'), a.descEn);
  }
  // The pre-existing trophies keep their ids so stored unlock lists stay valid.
  for (const id of ['first-solve', 'scholar', 'streak-7', 'category-master', 'completionist', 'speed-demon', 'bookworm', 'bilingual', 'night-owl', 'streak-30', 'hard-solver', 'sharer']) {
    assert.ok(ids(ACHIEVEMENTS).includes(id), id);
  }
  assert.equal(SHUFFLE_STATS_KEY, 'ra-shuffle-stats-v1');
});

test('an empty or malformed context earns nothing and never throws', () => {
  assert.deepEqual(computeAchievements(undefined), []);
  assert.deepEqual(computeAchievements({ correct: 'lots', streak: -3, flags: null, shuffle: 'x' }), []);
  assert.deepEqual(normalizeContext({ correct: 2.9, shuffle: { topics: '7' } }).shuffle, { rounds: 0, perfect: 0, expert: 0, topics: 0, shares: 0 });
  assert.equal(normalizeContext({ correct: 2.9 }).correct, 2);
});

test('trophies unlock at their thresholds, for guests and accounts alike', () => {
  const base = { correct: 1 };
  assert.deepEqual(ids(computeAchievements(base)), ['first-solve']);
  assert.ok(ids(computeAchievements({ correct: 100 })).includes('scholar'));
  assert.ok(ids(computeAchievements({ hardCorrect: 25 })).includes('hard-solver'));
  assert.deepEqual(ids(computeAchievements({ masteredCategories: 5 })).filter(id => id.includes('mast') || id.includes('compl')), ['category-master', 'completionist']);
  assert.deepEqual(ids(computeAchievements({ streak: 7 })), ['streak-3', 'streak-7']);
  assert.deepEqual(ids(computeAchievements({ streak: 30 })), ['streak-3', 'streak-7', 'streak-30']);
  assert.deepEqual(ids(computeAchievements({ flags: { usedArabic: true, nightOwl: true, speedDemon: true, shared: true }, favorites: 20 })).sort(),
    ['bilingual', 'bookworm', 'night-owl', 'sharer', 'speed-demon']);
  const shuffle = ids(computeAchievements({ shuffle: { rounds: 10, perfect: 1, expert: 1, topics: 30, shares: 1 } }));
  assert.deepEqual(shuffle.sort(), ['sharer', 'shuffle-expert', 'shuffle-explorer', 'shuffle-first', 'shuffle-perfect', 'shuffle-regular']);
  assert.deepEqual(ids(computeAchievements({ shuffle: { rounds: 1 } })), ['shuffle-first']);
});

test('unlockDiff announces each trophy once and keeps stored ids that lapse', () => {
  const earned = computeAchievements({ correct: 1, shuffle: { rounds: 1 } });
  const first = unlockDiff([], earned);
  assert.deepEqual(ids(first.fresh), ['first-solve', 'shuffle-first']);
  assert.deepEqual(first.next, ['first-solve', 'shuffle-first']);
  const again = unlockDiff(first.next, earned);
  assert.deepEqual(again.fresh, []);
  const lapsed = unlockDiff(['streak-3', 7, null], computeAchievements({ correct: 1 }));
  assert.deepEqual(ids(lapsed.fresh), ['first-solve']);
  assert.deepEqual(lapsed.next, ['streak-3', 'first-solve'], 'a lapsed streak trophy is not re-announced later');
});

test('the browser-only Shuffle streak counts toward the streak trophies', () => {
  const today = new Date(2026, 10, 9);
  assert.equal(currentLocalStreak({ v: 1, count: 3, last: '2026-11-09', best: 3 }, today), 3);
  assert.equal(currentLocalStreak({ v: 1, count: 3, last: '2026-11-08', best: 3 }, today), 3, 'yesterday still counts');
  assert.equal(currentLocalStreak({ v: 1, count: 3, last: '2026-11-07', best: 3 }, today), 0, 'a missed day lapses');
  assert.equal(currentLocalStreak({ v: 2, count: 3, last: '2026-11-09' }, today), 0);
  assert.equal(currentLocalStreak({ v: 1, count: 'three', last: '2026-11-09' }, today), 0);
  assert.equal(currentLocalStreak(null, today), 0);
});

test('Shuffle statistics accumulate rounds, perfect and expert rounds, distinct topics and shares', () => {
  const round = (level, results, slugs) => ({ level, items: results.map((result, i) => ({ slug: slugs[i], id: `${slugs[i]}-${i}`, result })) });
  let stats = recordShuffleRound(null, round('mixed', ['knew', 'missed', 'skipped'], ['math', 'science', 'history']));
  assert.deepEqual(stats, { v: 1, rounds: 1, perfect: 0, expert: 0, shares: 0, topics: ['math', 'science', 'history'] });
  stats = recordShuffleRound(stats, round('easy', ['knew', 'knew'], ['math', 'football']));
  assert.equal(stats.perfect, 1); assert.deepEqual(stats.topics, ['math', 'science', 'history', 'football']);
  stats = recordShuffleRound(stats, round('very-advanced', ['knew', 'knew', 'knew', 'knew', 'knew', 'knew', 'knew', 'missed', 'missed', 'skipped'], Array.from({ length: 10 }, (_, i) => `t${i}`)));
  assert.equal(stats.expert, 1, 'seven known at Expert counts');
  stats = recordShuffleRound(stats, round('very-advanced', ['knew', 'knew', 'knew', 'knew', 'knew', 'knew', 'missed', 'missed', 'missed', 'missed'], Array.from({ length: 10 }, (_, i) => `u${i}`)));
  assert.equal(stats.expert, 1, 'six known at Expert does not');
  assert.equal(stats.rounds, 4);
  assert.deepEqual(recordShuffleRound(stats, { level: 'easy', items: [] }), stats, 'an empty round changes nothing');
  stats = recordShuffleShare(stats);
  assert.equal(stats.shares, 1);
  assert.deepEqual(shuffleContext(stats), { rounds: 4, perfect: 1, expert: 1, topics: 24, shares: 1 });
  // Malformed storage is cleaned, bad slugs dropped and the topic list bounded.
  const restored = restoreShuffleStats({ v: 1, rounds: '9', topics: ['ok-slug', 'Bad Slug', 'ok-slug', 42, ...Array.from({ length: 300 }, (_, i) => `s${i}`)] });
  assert.equal(restored.rounds, 0);
  assert.equal(restored.topics.length, 200);
  assert.deepEqual(restored.topics.slice(0, 2), ['ok-slug', 's0']);
});
