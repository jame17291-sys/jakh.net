import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { landingMarkup } from '../tv-trivia-markup.js';
import { SHOWS, isPrepared, eligibleCards, createRound, answerRound, nextQuestion, restoreRound, remainingSeconds, roundScore, bestKey } from '../tv-trivia-engine.js';
const cards = JSON.parse(fs.readFileSync(new URL('../data/tv-shows-trivia.json', import.meta.url)));
const now = Date.now();
const ids = round => round.questions.map(q => q.id);

test('every show can run ten unique, bilingual, premise-only questions', () => {
  assert.equal(cards.length, 800);
  assert.equal(new Set(cards.map(c => c.id)).size, 800);
  for (const show of SHOWS) {
    const pool = eligibleCards(cards, show.id);
    assert.ok(pool.length >= 20, show.id);
    assert.equal(eligibleCards(cards, show.id, show.seasons).length, 80, show.id);
    for (let seed = 1; seed <= 10; seed++) {
      const round = createRound(cards, { show: show.id }, [], () => seed / 11);
      assert.equal(new Set(ids(round)).size, 10);
      assert.ok(round.questions.every(q => pool.some(c => c.id === q.id)));
      assert.ok(round.questions.every(q => [...q.order].sort().join(',') === '0,1,2,3'));
      assert.equal(round.timed, false);
    }
  }
});
test('authored content is complete and never fabricates formal editorial signoff', () => {
  assert.equal(cards.filter(isPrepared).length, 800);
  assert.equal(eligibleCards(cards).length, 487);
  for (const c of cards.filter(isPrepared)) {
    assert.equal(c.review.status, 'pending');
    assert.ok(c.tvQuiz.explanation.en.length > 20);
    assert.ok(c.tvQuiz.explanation.ar.length > 20);
    assert.ok(['character', 'world', 'moment', 'quote', 'behind-scenes'].includes(c.tvQuiz.kind), c.id);
    for (const lang of ['en', 'ar']) assert.equal(new Set([c.answer[lang], ...c.tvQuiz.distractors[lang]]).size, 4);
  }
});

test('each show supports eight complete rounds without repeating any of its 80 questions', () => {
  for (const show of SHOWS) {
    const seen = [];
    for (let i = 0; i < 8; i++) {
      let r = createRound(cards, { show: show.id, season: show.seasons }, seen);
      assert.ok(ids(r).every(id => !seen.includes(id)), `${show.id} round ${i + 1}`);
      for (let j = 0; j < 10; j++) {
        r = answerRound(r, 0);
        assert.deepEqual(restoreRound(JSON.parse(JSON.stringify(r)), cards), r);
        r = nextQuestion(r);
      }
      assert.equal(r.finished, true);
      assert.equal(roundScore(r), 10);
      seen.push(...ids(r));
    }
    assert.equal(new Set(seen).size, 80, show.id);
    assert.equal(createRound(cards, { show: show.id, season: show.seasons }, seen).questions.length, 10);
  }
});

test('show rounds mix themes, increase difficulty, and retain unseen-question priority', () => {
  const levels = {easy: 0, medium: 1, hard: 2, 'very-advanced': 3};
  for (const show of SHOWS) {
    const pool = eligibleCards(cards, show.id, show.seasons);
    const round = createRound(cards, {show: show.id, season: show.seasons});
    const selected = round.questions.map(q => cards.find(c => c.id === q.id));
    assert.ok(new Set(selected.map(c => c.tvQuiz.kind)).size >= Math.min(3, new Set(pool.map(c => c.tvQuiz.kind)).size), show.id);
    assert.deepEqual(selected.map(c => levels[c.difficulty]), selected.map(c => levels[c.difficulty]).sort((a,b) => a-b));
    const lastFresh = pool.slice(0,3).map(c => c.id);
    const next = createRound(cards, {show: show.id, season: show.seasons}, pool.slice(3).map(c => c.id));
    assert.ok(lastFresh.every(id => ids(next).includes(id)), show.id);
  }
});

test('the expansion preserves original identifiers and records every new or changed question', () => {
  const expansion = JSON.parse(fs.readFileSync(new URL('../docs/content-review/tv-trivia-expansion-2026-09-30.json', import.meta.url)));
  const previous = JSON.parse(fs.readFileSync(new URL('../docs/content-review/tv-trivia-2026-09-30.json', import.meta.url)));
  const original = JSON.parse(fs.readFileSync(new URL('../docs/content-review/mindlab-remediation-2026-09-23.json', import.meta.url)));
  const followup = JSON.parse(fs.readFileSync(new URL('../docs/content-review/tv-trivia-followup-2026-09-30.json', import.meta.url)));
  const digest = c => crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex');
  const latestHash = entry => {
    const next = followup.changes.find(c => c.id === entry.id);
    if (next) {
      assert.equal(next.beforeHash, entry.afterHash, `${entry.id}: follow-up preserves expansion history`);
      assert.ok(next.reason?.trim());
    }
    return next?.afterHash || entry.afterHash;
  };
  assert.deepEqual(cards.slice(0,250).map(c => c.id), Array.from({length:250}, (_,i) => `tv-shows-trivia-${String(i+1).padStart(3,'0')}`));
  assert.equal(expansion.additions.length, 550);
  for (const change of expansion.changes) {
    const predecessor = previous.changes.find(c => c.id === change.id) || original.changes.find(c => c.id === change.id);
    if (predecessor) assert.equal(change.beforeHash, predecessor.afterHash);
    else assert.match(change.beforeHash, /^[a-f0-9]{64}$/u);
    assert.equal(latestHash(change), digest(cards.find(c => c.id === change.id)));
  }
  for (const added of expansion.additions) assert.equal(latestHash(added), digest(cards.find(c => c.id === added.id)));
  for (const change of followup.changes) assert.ok([...expansion.changes, ...expansion.additions].some(c => c.id === change.id));
  for (const show of SHOWS) for (const lang of ['en','ar']) {
    const prompts = cards.filter(c => c.subcategory.en === show.key).map(c => c.question[lang].normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, ''));
    assert.equal(new Set(prompts).size, 80, `${show.id}/${lang}`);
  }
});

test('English and Arabic show cards display the actual total bank size', () => {
  const counts = Object.fromEntries(SHOWS.map(s => [s.key, eligibleCards(cards, s.id, s.seasons).length]));
  for (const lang of ['en','ar']) {
    const markup = landingMarkup(lang, true, counts);
    assert.equal((markup.match(/tv-bank-count\">80 /g) || []).length, 10);
  }
});
test('unknown spoiler metadata and modified published content fail closed in quiz and practice pools', () => {
  const c = structuredClone(cards.find(isPrepared));
  const unknown = structuredClone(c); delete unknown.tvQuiz.spoilerSeason;
  const changed = structuredClone(c); changed.question.en += ' A new plot reveal.';
  const changedAnswer = structuredClone(c); changedAnswer.answer.ar = 'إجابة بديلة';
  const changedChoices = structuredClone(c); changedChoices.tvQuiz.distractors.en[0] = 'A future reveal';
  const changedExplanation = structuredClone(c); changedExplanation.tvQuiz.explanation.ar += ' حرق';
  const changedSeason = structuredClone(c); changedSeason.tvQuiz.spoilerSeason = 2;
  const duplicate = structuredClone(c); duplicate.tvQuiz.distractors.ar[0] = duplicate.answer.ar;
  assert.deepEqual(eligibleCards([unknown, changed, changedAnswer, changedChoices, changedExplanation, changedSeason, duplicate]), []);
  assert.equal(isPrepared(c), true);
});
test('season limits cover entire cards and mixed rounds remain spoiler-safe', () => {
  for (const show of SHOWS) for (let season = 0; season <= show.seasons; season++) {
    assert.ok(eligibleCards(cards, show.id, season).every(c => c.tvQuiz.spoilerSeason <= season));
  }
  assert.ok(eligibleCards(cards, 'all', 99).every(c => c.tvQuiz.spoilerSeason === 0));
  const murder = cards.find(c => c.id === 'tv-shows-trivia-016');
  assert.ok(!eligibleCards(cards, 'breaking-bad', 3).includes(murder));
  assert.ok(eligibleCards(cards, 'breaking-bad', 4).includes(murder));
});
test('mixed rounds include all ten shows and replay prefers unseen questions', () => {
  const first = createRound(cards);
  assert.equal(new Set(first.questions.map(q => cards.find(c => c.id === q.id).subcategory.en)).size, 10);
  const second = createRound(cards, {}, ids(first));
  assert.equal(ids(second).filter(id => ids(first).includes(id)).length, 0);
});
test('one point per correct answer; duplicate clicks and premature Next cannot change score', () => {
  let r = createRound(cards);
  assert.equal(nextQuestion(r), r);
  r = answerRound(r, 0);
  assert.equal(roundScore(r), 1);
  assert.equal(answerRound(r, 2), r);
  r = nextQuestion(r);
  assert.equal(r.index, 1);
  r = answerRound(r, 2);
  assert.equal(roundScore(r), 1);
  for (let i = 2; i < 10; i++) { r = nextQuestion(r); r = answerRound(r, null); }
  assert.equal(r.finished, false);
  r = nextQuestion(r);
  assert.equal(r.finished, true);
  assert.equal(roundScore(r), 1);
  assert.equal(answerRound(r, 0), r);
});
test('timer uses an absolute deadline, expires without auto-advancing and starts anew only on Next', () => {
  let r = createRound(cards, { timed: true }, [], Math.random, now);
  assert.equal(remainingSeconds(r, now + 3000), 17);
  r = answerRound(r, 0, now + 21000);
  assert.equal(r.answers[0].timedOut, true);
  assert.equal(r.answers[0].correct, false);
  assert.equal(r.index, 0);
  assert.equal(r.deadline, null);
  r = nextQuestion(r, now + 99000);
  assert.equal(remainingSeconds(r, now + 99000), 20);
});
test('refresh preserves question IDs, shuffled choices, score, season and timer deadline', () => {
  let r = createRound(cards, { show: 'breaking-bad', season: 4, timed: true });
  r = nextQuestion(answerRound(r, 0));
  assert.deepEqual(restoreRound(JSON.parse(JSON.stringify(r)), cards), r);
  const changed = structuredClone(cards); changed.find(c => c.id === r.questions[0].id).answer.en = 'Changed';
  assert.equal(restoreRound(r, changed), null);
  assert.equal(restoreRound({ ...r, index: 10 }, cards), null);
  assert.equal(restoreRound({ ...r, questions: Array(10).fill(r.questions[0]) }, cards), null);
  assert.equal(restoreRound({ ...r, answers: [] }, cards), null);
  assert.equal(restoreRound({ ...r, show: 'unknown' }, cards), null);
});
test('personal bests keep timed, relaxed and spoiler settings separate', () => {
  const base = createRound(cards, { show: 'friends' });
  assert.notEqual(bestKey(base), bestKey({ ...base, timed: true }));
  assert.notEqual(bestKey(base), bestKey({ ...base, season: 4 }));
});

test('malformed saved questions, choices and season values fail closed without throwing', () => {
  const r = createRound(cards, { show: 'friends' });
  for (const bad of [null, {}, 'invalid']) assert.equal(restoreRound({ ...r, questions: [bad, ...r.questions.slice(1)] }, cards), null);
  const stringOrder = structuredClone(r); stringOrder.questions[0].order = ['0', '1', '2', '3'];
  assert.equal(restoreRound(stringOrder, cards), null);
  assert.equal(restoreRound({ ...r, season: 11 }, cards), null);
  assert.equal(restoreRound({ ...r, answers: [{choice: 0, timedOut: true}] }, cards), null);
});
