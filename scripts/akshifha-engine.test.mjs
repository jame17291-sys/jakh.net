import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PUBLIC_ORIGIN, MAX_PROGRESS_CASES, buildChallengeUrl, buildShareText,
  chooseDailyCase, evaluateAnswer, isValidDay, recordCompletion, resolveCase,
  resultRank, sanitizeProgress, selectNextCase, utcDay,
} from '../akshifha-engine.js';

const cases = Array.from({ length: 11 }, (_, index) => ({
  id: `case-${index + 1}`,
  title: { ar: 'عنوان لا يُشارك', en: 'A title that must not be shared' },
  evidence: [{ id: 'receipt' }, { id: 'clock' }, { id: 'note' }],
  options: [{ id: 'contradiction' }, { id: 'unknown' }],
  solution: { evidenceIds: ['receipt', 'clock'], optionId: 'contradiction' },
  explanation: { en: 'Secret spoiler text' },
}));
const date = new Date('2026-09-16T12:00:00Z');
const solved = { attempts: 2, hintsUsed: 0, revealed: false };

test('UTC date validation rejects overflow, ambiguous formats, and impossible leap days', () => {
  for (const valid of ['2026-09-16', '2024-02-29', '2000-02-29', '0000-01-01']) assert.equal(isValidDay(valid), true, valid);
  for (const invalid of [null, undefined, 20260916, '', '2026-2-3', '2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-09-16T00:00:00Z', '2026-09-16 ', '../2026-09-16']) {
    assert.equal(isValidDay(invalid), false, String(invalid));
  }
  assert.equal(utcDay(new Date('2026-09-16T01:00:00+03:00')), '2026-09-15');
  assert.equal(utcDay(new Date('2026-09-15T23:00:00-03:00')), '2026-09-16');
});

test('daily rotation is deterministic, UTC-based, and openly repeats the finite casebook', () => {
  const first = chooseDailyCase(cases, date);
  assert.equal(first, chooseDailyCase(cases, new Date('2026-09-16T23:59:59.999Z')));
  assert.equal(first, chooseDailyCase(cases, new Date('2026-09-16T00:00:00.000Z')));
  assert.notEqual(first, chooseDailyCase(cases, new Date('2026-09-17T00:00:00.000Z')));
  assert.equal(first, chooseDailyCase(cases, new Date('2026-09-27T12:00:00.000Z')));
  const cycle = Array.from({ length: 11 }, (_, day) => chooseDailyCase(cases, new Date(Date.UTC(2026, 8, 16 + day))).id);
  assert.equal(new Set(cycle).size, 11);
  for (let offset = -100; offset <= 100; offset += 1) {
    assert.ok(cases.includes(chooseDailyCase(cases, new Date(offset * 86_400_000))));
  }
  assert.equal(chooseDailyCase([], date), null);
  assert.equal(chooseDailyCase(null, date), null);
  assert.equal(chooseDailyCase([cases[0], cases[0]], date), cases[0]);
});

test('default routes resolve the same daily puzzle regardless of client timezone representation', () => {
  const expected = resolveCase(cases, '', date);
  assert.deepEqual(expected, {
    caseItem: chooseDailyCase(cases, date), mode: 'daily', day: '2026-09-16', invalidLink: false,
  });
  assert.deepEqual(resolveCase(cases, '', new Date('2026-09-16T15:00:00+03:00')), expected);
  assert.equal(resolveCase(cases, '?mode=practice', date).mode, 'practice');
  assert.equal(resolveCase(cases, '?day=2026-09-15', date).caseItem, chooseDailyCase(cases, new Date('2026-09-15T12:00:00Z')));
});

test('a challenge pins an exact case across dates and never accepts query scoring data', () => {
  const query = '?case=case-3&day=2026-09-01&score=99999&correct=true&hintsUsed=0&answer=contradiction';
  const selection = resolveCase(cases, query, date);
  assert.deepEqual(selection, { caseItem: cases[2], mode: 'challenge', day: '2026-09-01', invalidLink: false });
  assert.equal(resolveCase(cases, query, new Date('2026-10-01')).caseItem, cases[2]);
  const practice = resolveCase(cases, '?case=case-3&mode=practice', date);
  assert.equal(practice.mode, 'practice');
  assert.equal(practice.caseItem, cases[2]);
  assert.equal(resolveCase(cases, new URLSearchParams('case=case-3'), date).caseItem, cases[2]);
});

test('malformed and ambiguous deep links fall back safely and are reported', () => {
  for (const query of ['?case=missing', '?case=', '?case=case-1&case=case-2', '?day=2026-02-29', '?day=2026-09-15&day=2026-09-16', '?mode=hacked', '?mode=practice&mode=daily', '?case=%3Cscript%3E', null, {}]) {
    const result = resolveCase(cases, query, date);
    assert.equal(result.invalidLink, true, String(query));
    assert.equal(result.caseItem, chooseDailyCase(cases, date), String(query));
  }
  const pinned = resolveCase(cases, '?case=case-2&day=bad', date);
  assert.equal(pinned.caseItem, cases[1]);
  assert.equal(pinned.day, '2026-09-16');
  assert.equal(pinned.invalidLink, true);
  assert.equal(resolveCase([], '', date).caseItem, null);
});

test('answer checking requires the exact known pair and conclusion in either order', () => {
  assert.deepEqual(evaluateAnswer(cases[0], ['receipt', 'clock'], 'contradiction'), { valid: true, correct: true });
  assert.deepEqual(evaluateAnswer(cases[0], ['clock', 'receipt'], 'contradiction'), { valid: true, correct: true });
  assert.deepEqual(evaluateAnswer(cases[0], ['receipt', 'note'], 'contradiction'), { valid: true, correct: false });
  assert.deepEqual(evaluateAnswer(cases[0], ['receipt', 'clock'], 'unknown'), { valid: true, correct: false });
});

test('duplicate, missing, foreign, malformed, or extra choices are invalid, not attempts', () => {
  for (const evidence of [null, 'receipt', [], ['receipt'], ['receipt', 'receipt'], ['receipt', 'clock', 'note'], ['receipt', 'foreign'], ['receipt', 7]]) {
    assert.deepEqual(evaluateAnswer(cases[0], evidence, 'contradiction'), { valid: false, correct: false });
  }
  for (const option of [null, undefined, {}, 'foreign']) {
    assert.deepEqual(evaluateAnswer(cases[0], ['receipt', 'clock'], option), { valid: false, correct: false });
  }
  for (const item of [null, {}, { ...cases[0], solution: { evidenceIds: ['receipt', 'receipt'], optionId: 'contradiction' } }, { ...cases[0], solution: { evidenceIds: ['receipt', 'foreign'], optionId: 'contradiction' } }]) {
    assert.deepEqual(evaluateAnswer(item, ['receipt', 'clock'], 'contradiction'), { valid: false, correct: false });
  }
});

test('personal result labels distinguish revealed explanations from assisted and independent solves', () => {
  assert.equal(resultRank(solved), 'solved');
  assert.equal(resultRank({ ...solved, hintsUsed: 1 }), 'assisted');
  assert.equal(resultRank({ attempts: 0, hintsUsed: 0, revealed: true }), 'revealed');
  for (const result of [{}, { ...solved, attempts: 0 }, { ...solved, attempts: -1 }, { ...solved, hintsUsed: 3 }, { ...solved, hintsUsed: '0' }, { ...solved, correct: false }, { ...solved, attempts: Infinity }]) {
    assert.equal(resultRank(result), 'in-progress');
  }
});

test('share links use only the public domain, known paths, case ID, and a valid optional day', () => {
  for (const origin of [undefined, PUBLIC_ORIGIN, 'http://127.0.0.1:49886', 'https://riddlearabia.com.evil.example', 'https://riddlearabia.com@evil.example', 'javascript:alert(1)', 'https://riddlearabia.com/private']) {
    const url = new URL(buildChallengeUrl({ origin, language: 'ar', caseId: 'case-1', day: '2026-09-16', score: 99999, answer: 'receipt' }));
    assert.equal(url.origin, PUBLIC_ORIGIN);
    assert.equal(url.pathname, '/ar/games/akshifha/');
    assert.deepEqual([...url.searchParams], [['case', 'case-1'], ['day', '2026-09-16']]);
    assert.equal(url.hash, '');
  }
  assert.equal(new URL(buildChallengeUrl({ language: 'en', caseId: 'case-2', day: 'invalid' })).pathname, '/akshifha');
  assert.equal(new URL(buildChallengeUrl({ language: 'en', caseId: 'case-2', day: 'invalid' })).searchParams.has('day'), false);
  for (const caseId of [undefined, '', '../case-1', 'case-1&answer=foo', '__proto__', '<script>']) {
    assert.equal(buildChallengeUrl({ caseId }), null);
  }
});

test('shared copy reveals neither puzzle title, clues, solution, nor a fake solved claim after reveal', () => {
  for (const language of ['en', 'ar']) {
    const text = buildShareText({ language, caseItem: cases[0], ...solved });
    for (const spoiler of ['receipt', 'clock', 'contradiction', cases[0].title.en, cases[0].title.ar, cases[0].explanation.en]) assert.ok(!text.includes(spoiler));
  }
  assert.match(buildShareText({ language: 'en', ...solved }), /2 attempts, using 0 hints/u);
  assert.doesNotMatch(buildShareText({ language: 'en', ...solved, revealed: true }), /I solved/u);
  assert.match(buildShareText({ language: 'en', ...solved, revealed: true }), /read the explanation/u);
  assert.doesNotMatch(buildShareText({ language: 'en', attempts: '999999 points', hintsUsed: 0, revealed: false }), /999999/u);
  for (const flag of [{ correct: false }, { valid: false }]) {
    assert.doesNotMatch(buildShareText({ language: 'en', ...solved, ...flag }), /I solved/u);
    assert.doesNotMatch(buildShareText({ language: 'ar', ...solved, ...flag }), /حللت القضية/u);
  }
});

test('progress sanitation drops corrupt or oversized storage and untrusted scoring fields', () => {
  for (const input of [undefined, null, '', '{bad', 'x'.repeat(40_000), [], { version: 99, cases: {} }, { version: 1, cases: [] }]) {
    assert.deepEqual(sanitizeProgress(input, cases), { version: 1, cases: {} });
  }
  const input = {
    version: 1, score: 999999, streak: 200, rank: 1,
    cases: {
      'case-1': { completed: true, ...solved, score: 999999, rank: 1, answer: 'contradiction' },
      'case-2': { completed: true, ...solved, attempts: -1 },
      foreign: { completed: true, ...solved },
      'case-3': { completed: 'true', ...solved },
    },
  };
  assert.deepEqual(sanitizeProgress(JSON.stringify(input), cases), {
    version: 1, cases: { 'case-1': { completed: true, ...solved } },
  });
  assert.deepEqual(sanitizeProgress({ get version() { throw new Error('malformed'); } }), { version: 1, cases: {} });
  const polluted = '{"version":1,"cases":{"__proto__":{"completed":true,"attempts":1,"hintsUsed":0,"revealed":false},"constructor":{"completed":true,"attempts":1,"hintsUsed":0,"revealed":false}}}';
  assert.deepEqual(sanitizeProgress(polluted), { version: 1, cases: {} });
  assert.equal({}.completed, undefined);
});

test('completion records are immutable, bounded, idempotent, and retain the better personal replay', () => {
  const previous = { version: 1, cases: {} };
  const first = recordCompletion(previous, 'case-1', solved, cases);
  assert.deepEqual(previous, { version: 1, cases: {} });
  assert.deepEqual(recordCompletion(first, 'case-1', solved, cases), first);
  assert.deepEqual(recordCompletion(first, 'case-1', { ...solved, attempts: 9, hintsUsed: 2 }, cases), first);
  assert.deepEqual(recordCompletion(first, 'case-1', { ...solved, attempts: 0, revealed: true }, cases), first);
  const better = recordCompletion(first, 'case-1', { ...solved, attempts: 1 }, cases);
  assert.equal(better.cases['case-1'].attempts, 1);
  assert.equal(Object.keys(better.cases).length, 1);
  assert.equal(first.cases['case-1'].attempts, 2);
  assert.deepEqual(recordCompletion(first, 'foreign', solved, cases), first);
  assert.deepEqual(recordCompletion(first, 'case-2', { ...solved, correct: false }, cases), first);
  let bounded;
  for (let index = 0; index < 50; index += 1) bounded = recordCompletion(bounded, `extra-${index}`, solved);
  assert.equal(Object.keys(bounded.cases).length, MAX_PROGRESS_CASES);
  assert.equal(Object.keys(sanitizeProgress(bounded).cases).length, MAX_PROGRESS_CASES);
});

test('solving after a reveal records the better result but never claims a verified score', () => {
  const revealed = recordCompletion(null, 'case-1', { attempts: 0, hintsUsed: 0, revealed: true });
  const replay = recordCompletion(revealed, 'case-1', { attempts: 2, hintsUsed: 1, revealed: false, score: 5000 });
  assert.deepEqual(replay.cases['case-1'], { completed: true, attempts: 2, hintsUsed: 1, revealed: false });
  assert.equal(resultRank(replay.cases['case-1']), 'assisted');
});

test('practice selection prefers uncompleted cases, wraps safely, and permits honest replays', () => {
  assert.equal(selectNextCase(cases, 'case-1'), cases[1]);
  assert.equal(selectNextCase(cases, 'case-11'), cases[0]);
  assert.equal(selectNextCase(cases, 'missing'), cases[0]);
  const progress = recordCompletion(null, 'case-2', solved, cases);
  assert.equal(selectNextCase(cases, 'case-1', progress), cases[2]);
  let all = progress;
  for (const item of cases) all = recordCompletion(all, item.id, solved, cases);
  assert.equal(selectNextCase(cases, 'case-1', all), cases[1]);
  assert.equal(selectNextCase([], 'case-1', all), null);
});
