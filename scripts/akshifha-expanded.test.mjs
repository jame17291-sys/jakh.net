import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { CASES } from '../akshifha-cases.js';
import { AKSHIFHA_UI } from '../akshifha-copy.js';
import { PROGRESS_KEY } from '../akshifha.js';
import {
  MAX_PROGRESS_CASES, chooseDailyCase, resolveCase, evaluateAnswer,
  resultRank, buildChallengeUrl, buildShareText, sanitizeProgress,
  recordCompletion, selectNextCase, selectContinuationCase,
} from '../akshifha-engine.js';

const originalIds = [
  'the-first-van', 'one-table-please', 'the-wrong-invitation',
  'the-aquarium-shortcut', 'the-photo-caption',
];
const solved = { attempts: 1, hintsUsed: 0, revealed: false };
const assisted = { attempts: 2, hintsUsed: 1, revealed: false };
const revealed = { attempts: 0, hintsUsed: 0, revealed: true };
const originalProgress = {
  version: 1,
  cases: Object.fromEntries(originalIds.map((id, index) => [id, {
    completed: true, ...(index === 1 ? assisted : index === 2 ? revealed : solved),
  }])),
};
const empty = { version: 1, cases: {} };

function bilingual(value, label) {
  for (const language of ['en', 'ar']) {
    assert.equal(typeof value?.[language], 'string', `${label}.${language}`);
    assert.ok(value[language].trim().length > 0, `${label}.${language} is not empty`);
  }
  assert.match(value.ar, /[\u0600-\u06ff]/u, `${label} has Arabic content`);
}

test('casebook retains original identities and includes six complete bilingual mysteries', () => {
  assert.equal(CASES.length, 11);
  assert.deepEqual(CASES.slice(0, 5).map(item => item.id), originalIds);
  assert.equal(new Set(CASES.map(item => item.id)).size, CASES.length);
  assert.ok(MAX_PROGRESS_CASES >= CASES.length);
  for (const [index, item] of CASES.entries()) {
    assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.equal(item.number, index + 1);
    for (const field of ['title', 'intro', 'rule', 'difficulty', 'explanation']) {
      bilingual(item[field], `${item.id}.${field}`);
    }
    assert.ok(item.evidence.length >= 3);
    assert.ok(item.options.length >= 2);
    assert.equal(new Set(item.evidence.map(entry => entry.id)).size, item.evidence.length);
    assert.equal(new Set(item.options.map(entry => entry.id)).size, item.options.length);
    for (const evidence of item.evidence) {
      bilingual(evidence.label, `${item.id}.${evidence.id}.label`);
      bilingual(evidence.text, `${item.id}.${evidence.id}.text`);
    }
    for (const option of item.options) bilingual(option.text, `${item.id}.${option.id}`);
    assert.equal(item.hints.length, 2, 'The progress schema supports two hints');
    item.hints.forEach((hint, hintIndex) => bilingual(hint, `${item.id}.hint${hintIndex}`));
  }
});

for (const item of CASES) {
  test(`${item.id}: only its authored clue pair and conclusion are accepted, in either clue order`, () => {
    let accepted = 0;
    for (let first = 0; first < item.evidence.length; first += 1) {
      for (let second = first + 1; second < item.evidence.length; second += 1) {
        const pair = [item.evidence[first].id, item.evidence[second].id];
        for (const option of item.options) {
          const result = evaluateAnswer(item, pair, option.id);
          assert.equal(result.valid, true);
          assert.deepEqual(evaluateAnswer(item, [...pair].reverse(), option.id), result);
          if (result.correct) accepted += 1;
        }
      }
    }
    assert.equal(accepted, 1);
    assert.deepEqual(evaluateAnswer(item, item.solution.evidenceIds, item.solution.optionId), {
      valid: true, correct: true,
    });
    const [first, second] = item.solution.evidenceIds;
    for (const pair of [null, [], [first], [first, first], [first, second, first], ['missing', second]]) {
      assert.deepEqual(evaluateAnswer(item, pair, item.solution.optionId), { valid: false, correct: false });
    }
    assert.deepEqual(evaluateAnswer(item, [first, second], 'missing'), { valid: false, correct: false });
  });
}

test('legacy storage key and all five old results survive recording every new case', () => {
  assert.equal(PROGRESS_KEY, 'riddlearabia-akshifha-v1');
  assert.deepEqual(sanitizeProgress(JSON.stringify(originalProgress), CASES), originalProgress);
  let progress = originalProgress;
  for (const item of CASES.slice(5)) progress = recordCompletion(progress, item.id, solved, CASES);
  assert.equal(Object.keys(progress.cases).length, 11);
  for (const id of originalIds) assert.deepEqual(progress.cases[id], originalProgress.cases[id]);
  assert.deepEqual(sanitizeProgress(JSON.stringify(progress), CASES), progress);
  assert.equal(Object.keys(originalProgress.cases).length, 5, 'Previous progress is not mutated');
  assert.deepEqual(recordCompletion(progress, originalIds[0], assisted, CASES), progress);
  assert.deepEqual(recordCompletion(progress, originalIds[0], revealed, CASES), progress);
});

test('next case prefers unexplored content and returns an existing case only after completion', () => {
  assert.equal(selectNextCase(CASES, originalIds.at(-1), originalProgress)?.id, CASES[5].id);
  let progress = empty;
  const visited = [];
  let current = CASES[0];
  while (visited.length < CASES.length) {
    visited.push(current.id);
    progress = recordCompletion(progress, current.id, solved, CASES);
    current = selectNextCase(CASES, current.id, progress);
  }
  assert.equal(new Set(visited).size, 11);
  assert.equal(current.id, CASES[0].id);
  assert.equal(selectNextCase([], 'unknown', empty), null);
});

test('continue offers only uncompleted cases from a partial saved casebook', () => {
  assert.equal(selectContinuationCase(CASES, originalIds[0], empty), null);
  assert.equal(selectContinuationCase(CASES, originalIds[0], 'damaged-storage'), null);
  assert.equal(selectContinuationCase([], originalIds[0], originalProgress), null);
  for (const current of CASES) {
    const next = selectContinuationCase(CASES, current.id, originalProgress);
    assert.ok(next, 'Partial casebook offers continuation from any current case');
    assert.equal(originalProgress.cases[next.id], undefined, 'Completed cases are never offered');
  }
  assert.equal(selectContinuationCase(CASES, originalIds.at(-1), originalProgress).id, CASES[5].id);
  let progress = originalProgress;
  for (const item of CASES.slice(5)) progress = recordCompletion(progress, item.id, solved, CASES);
  assert.equal(selectContinuationCase(CASES, CASES[0].id, progress), null);
  const unknownOnly = { version: 1, cases: { unpublished: { completed: true, ...solved } } };
  assert.equal(selectContinuationCase(CASES, CASES[0].id, unknownOnly), null);
});

test('broken storage and unknown or fabricated completions cannot corrupt the casebook', () => {
  for (const input of [null, '', 'not-json', [], { version: 2, cases: {} }, { version: 1, cases: [] }]) {
    assert.deepEqual(sanitizeProgress(input, CASES), empty);
  }
  for (const result of [
    { ...solved, attempts: 0 }, { ...solved, attempts: -1 }, { ...solved, attempts: 1000 },
    { ...solved, hintsUsed: 3 }, { ...solved, revealed: 'false' }, { ...solved, correct: false },
  ]) {
    assert.equal(resultRank(result), 'in-progress');
    assert.deepEqual(recordCompletion(empty, originalIds[0], result, CASES), empty);
  }
  for (const id of ['unknown', '__proto__', 'constructor']) {
    assert.deepEqual(recordCompletion(empty, id, solved, CASES), empty);
  }
  assert.equal(resultRank(revealed), 'revealed');
  assert.equal(resultRank(assisted), 'assisted');
  assert.equal(resultRank(solved), 'solved');
});

test('every Arabic and English friend link keeps the same case after midnight', () => {
  for (const item of CASES) {
    for (const language of ['ar', 'en']) {
      const url = new URL(buildChallengeUrl({ language, caseId: item.id, day: '2026-09-17' }));
      assert.equal(url.origin, 'https://riddlearabia.com');
      assert.equal(url.pathname, language === 'ar' ? '/ar/games/akshifha/' : '/akshifha');
      for (const now of ['2026-09-17T23:59:59Z', '2026-09-18T00:00:01Z', '2027-01-01T00:00:00Z']) {
        const resolution = resolveCase(CASES, url.search, now);
        assert.equal(resolution.caseItem.id, item.id);
        assert.equal(resolution.mode, 'challenge');
        assert.equal(resolution.invalidLink, false);
      }
      const practice = resolveCase(CASES, `?case=${item.id}&mode=practice`);
      assert.equal(practice.caseItem.id, item.id);
      assert.equal(practice.mode, 'practice');
    }
  }
});

test('daily rotation covers every case and malformed links fall back to playable content', () => {
  const picks = Array.from({ length: CASES.length }, (_, offset) => (
    chooseDailyCase(CASES, new Date(Date.UTC(2026, 8, 17 + offset))).id
  ));
  assert.equal(new Set(picks).size, 11);
  assert.equal(chooseDailyCase(CASES, '2026-09-17T00:00:01Z').id, chooseDailyCase(CASES, '2026-09-17T23:59:59Z').id);
  for (const search of ['?case=unknown', '?case=the-first-van&case=the-first-van', '?day=2026-02-29', '?mode=ranked']) {
    const resolution = resolveCase(CASES, search, '2026-09-17');
    assert.equal(resolution.invalidLink, true);
    assert.ok(CASES.some(item => item.id === resolution.caseItem.id));
  }
});

test('sharing reveals no evidence, solution, preview host, or fabricated solved claim', () => {
  for (const language of ['ar', 'en']) {
    const message = buildShareText({ language, ...solved });
    assert.notEqual(buildShareText({ language, ...revealed }), message);
    assert.notEqual(buildShareText({ language, ...solved, correct: false }), message);
    for (const item of CASES) {
      assert.ok(!message.includes(item.title[language]));
      assert.ok(!message.includes(item.explanation[language]));
      assert.ok(!message.includes(item.solution.optionId));
    }
  }
  assert.equal(new URL(buildChallengeUrl({ origin: 'https://preview.example', caseId: originalIds[0] })).origin, 'https://riddlearabia.com');
  assert.equal(buildChallengeUrl({ caseId: '../private' }), null);
});

test('standalone HTML uses existing source assets and fully translated interface keys', () => {
  const html = readFileSync(new URL('../akshifha.html', import.meta.url), 'utf8');
  for (const [, key] of html.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/gu)) {
    assert.equal(typeof AKSHIFHA_UI.en[key], 'string', key);
    assert.equal(typeof AKSHIFHA_UI.ar[key], 'string', key);
  }
  for (const [, asset] of html.matchAll(/(?:href|src)="(\/(?:assets\/[^"?]+|[^/"?]+\.(?:js|css|webmanifest)))(?:\?[^" ]*)?"/gu)) {
    assert.ok(existsSync(new URL(`..${asset}`, import.meta.url)), `Asset exists: ${asset}`);
  }
  assert.match(html, /href="https:\/\/riddlearabia\.com\/akshifha"/u);
  assert.doesNotMatch(html, /cdn-cgi\/challenge-platform/u);
});
