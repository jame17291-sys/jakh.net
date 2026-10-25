import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {
  ARABIC_MSA_RESTORE_LEDGER, TYPOGRAPHY_STEPS, arabicTypography, bankBeforeMsaRestore, beforeMsaRestore, readArabicMsaRestoreLedger,
} from './arabic-msa-restore-ledger.mjs';
import { readCurrentBank } from './topic-merge-ledger.mjs';
import { contentKey, isPrepared } from '../tv-trivia-engine.js';

const read = relative => JSON.parse(fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'));
const hash = card => crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex');
const get = (object, dotted) => dotted.split('.').reduce((value, key) => value?.[key], object);
const ledger = readArabicMsaRestoreLedger();
const everyday = new Map(read('docs/content-review/arabic-everyday-2026-10-21.json').changes.map(change => [change.id, change]));
const catalog = read('data/catalog.json');
const held = new Set(read('docs/content-review/production-quarantine.json').categories.map(category => category.slug));
const publicTopics = catalog.categories.map(category => category.slug).filter(slug => !held.has(slug));
// Only Arabic wording (and the TV quiz key calculated over it) may change.
const EDITABLE = /^(?:question\.ar|answer\.ar|tvQuiz\.(?:distractors\.ar|explanation\.ar|contentKey)|quickFire\.(?:answer|distractors|explanation)\.ar|acceptedAnswers(?:\.ar)?)$/u;
const banks = new Map();
const bank = category => {
  if (!banks.has(category)) banks.set(category, new Map(readCurrentBank(category).map(card => [card.id, card])));
  return banks.get(category);
};

test('the 2026-10-25 return to Modern Standard Arabic is recorded, pending review, and touches only public topics', () => {
  assert.equal(ARABIC_MSA_RESTORE_LEDGER, 'docs/content-review/arabic-msa-restore-2026-10-25.json');
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.date, '2026-10-25');
  assert.match(ledger.baseCommit, /^[a-f0-9]{7,40}$/u);
  assert.match(ledger.reviewStatus, /pending editorial review/u);
  assert.equal(ledger.counts.changedCards, ledger.changes.length);
  const methods = { restored: 0, rewritten: 0, 'restored-and-rewritten': 0 };
  for (const change of ledger.changes) methods[change.method] += 1;
  assert.deepEqual(
    [methods.restored, methods.rewritten, methods['restored-and-rewritten']],
    [ledger.counts.restored, ledger.counts.rewritten, ledger.counts.restoredAndRewritten],
  );
  assert.equal(Object.keys(methods).length, 3, 'only the three recorded methods');
  assert.equal(new Set(ledger.changes.map(change => change.id)).size, ledger.changes.length, 'each card appears once');
  assert.equal(held.size, 5);
  for (const change of ledger.changes) {
    assert.ok(publicTopics.includes(change.category), `${change.id}: a public topic`);
    assert.ok(!held.has(change.category), `${change.id}: held topics stay untouched`);
    assert.ok(change.reason?.trim(), `${change.id}: documented reason`);
  }
  // Most cards simply got their earlier wording back.
  assert.ok(ledger.counts.restored > 3_000);
});

test('every change is exact, Arabic-only and fully reversible from its recorded previous values', () => {
  for (const change of ledger.changes) {
    const card = bank(change.category).get(change.id);
    assert.ok(card, `${change.id}: card exists in ${change.category}`);
    assert.equal(hash(card), change.afterHash, `${change.id}: current card matches the ledger`);
    const previous = Object.entries(change.previous || {});
    assert.ok(previous.length > 0, `${change.id}: records what changed`);
    for (const [dotted, value] of previous) {
      assert.match(dotted, EDITABLE, `${change.id}: ${dotted} is an Arabic content field`);
      assert.notDeepEqual(get(card, dotted), value, `${change.id}: ${dotted} really changed`);
    }
    const before = beforeMsaRestore(card, change);
    assert.equal(hash(before), change.beforeHash, `${change.id}: only the recorded fields changed`);
    assert.deepEqual(card.review, before.review, `${change.id}: review status is not promoted`);
    assert.deepEqual([card.question.en, card.answer.en, card.difficulty], [before.question.en, before.answer.en, before.difficulty], `${change.id}: English and level unchanged`);
    if (card.tvQuiz) {
      assert.ok(isPrepared(card), `${change.id}: TV quiz content key matches the new text`);
      assert.equal(card.tvQuiz.contentKey, contentKey(card));
    }
    assert.doesNotMatch(card.question.ar, /\?/u, `${change.id}: Arabic question mark`);
    const arabic = [card.question.ar, card.answer.ar, card.tvQuiz?.explanation?.ar, card.quickFire?.explanation?.ar,
      ...(card.tvQuiz?.distractors?.ar || [])].filter(Boolean).join(' ');
    assert.ok(!(/[0-9]/u.test(arabic) && /[٠-٩]/u.test(arabic)), `${change.id}: one digit system per Arabic card`);
  }
});

test('restored questions are exactly the Modern Standard Arabic wording recorded before the 2026-10-21 rewrite', () => {
  let restored = 0;
  for (const change of ledger.changes.filter(entry => entry.method !== 'rewritten')) {
    const card = bank(change.category).get(change.id);
    const earlier = everyday.get(change.id);
    assert.ok(earlier, `${change.id}: recorded in the 2026-10-21 ledger`);
    assert.equal(change.restoredFrom, 'docs/content-review/arabic-everyday-2026-10-21.json');
    const steps = change.typography || [];
    assert.ok(steps.every(step => TYPOGRAPHY_STEPS.includes(step)), `${change.id}: known typography steps`);
    assert.equal(card.question.ar, arabicTypography(earlier.previous.questionAr, steps), `${change.id}: earlier wording restored`);
    for (const step of steps) {
      assert.notEqual(arabicTypography(earlier.previous.questionAr, [step]), earlier.previous.questionAr, `${change.id}: ${step} was needed`);
    }
    assert.doesNotMatch(card.question.ar, /(?<![A-Za-z])'|'(?![A-Za-z])|"/u, `${change.id}: «» instead of straight quotes`);
    if (earlier.previous.tvQuizContentKey && change.method === 'restored' && !steps.length && hash(card) === earlier.beforeHash) {
      assert.equal(card.tvQuiz.contentKey, earlier.previous.tvQuizContentKey, `${change.id}: earlier TV quiz key restored`);
    }
    restored += 1;
  }
  assert.equal(restored, ledger.counts.restored + ledger.counts.restoredAndRewritten);
  for (const change of ledger.changes.filter(entry => entry.method === 'rewritten')) {
    assert.equal(change.restoredFrom, undefined, `${change.id}: rewritten by hand`);
    assert.equal(change.typography, undefined, `${change.id}: typography is recorded only for restored wording`);
  }
  assert.equal(arabicTypography("ما 'درزن الخباز' (Baker's Dozen)?"), "ما «درزن الخباز» (Baker's Dozen)؟");
  assert.equal(arabicTypography('مرايا ٩٨', ['digits']), 'مرايا 98');
});

test('reversing the ledger restores every public topic file exactly as it stood before', () => {
  for (const slug of publicTopics) {
    const current = readCurrentBank(slug);
    const before = bankBeforeMsaRestore(slug);
    assert.deepEqual(before.map(card => card.id), current.map(card => card.id), `${slug}: same cards in the same order`);
    const touched = new Set(ledger.changes.filter(change => change.category === slug).map(change => change.id));
    for (const [index, card] of current.entries()) {
      if (!touched.has(card.id)) assert.deepEqual(before[index], card, `${card.id}: untouched cards are unchanged`);
    }
  }
  for (const slug of held) assert.deepEqual(bankBeforeMsaRestore(slug), readCurrentBank(slug), `${slug}: held topic unchanged`);
});
