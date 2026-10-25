import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { CARD_AUDIT_LEDGER, beforeCardAudit, idsBeforeAudit } from './card-audit-ledger.mjs';
import { CARD_POLISH_LEDGER } from './card-polish-ledger.mjs';
import { bankBeforeMerge, readTopicMergeLedger } from './topic-merge-ledger.mjs';
import { contentKey, isPrepared } from '../tv-trivia-engine.js';

const read = filename => JSON.parse(fs.readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8'));
const hash = card => crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex');
const ledger = read(CARD_AUDIT_LEDGER);
const polish = read(CARD_POLISH_LEDGER);
const quarantine = read('docs/content-review/production-quarantine.json');
const held = new Set(quarantine.categories.map(category => category.slug));
const get = (object, dotted) => dotted.split('.').reduce((value, key) => value?.[key], object);
const EDITABLE = /^(?:question\.(?:en|ar)|answer\.(?:en|ar)|difficulty|subcategory|acceptedAnswers|quickFire\.(?:answer|distractors|explanation)\.(?:en|ar)|tvQuiz\.(?:distractors\.(?:en|ar)|explanation\.(?:en|ar)|spoilerSeason|kind|contentKey))$/u;
const LEVELS = new Set(['easy', 'medium', 'hard', 'very-advanced']);
// The 2026-10-25 topic merges moved or removed some of these cards later; the
// merge ledger restores each topic file exactly as this audit left it.
const merge = readTopicMergeLedger();
const retiredByMerge = new Set(merge.removed.map(entry => entry.id));
const banks = new Map();
const bank = category => {
  if (!banks.has(category)) banks.set(category, bankBeforeMerge(merge, category));
  return banks.get(category);
};
// A card of a show later dropped from the TV game keeps a content key sealed
// to its recorded text; it no longer needs to be playable.
const quizSealed = card => (retiredByMerge.has(card.id) ? card.tvQuiz?.contentKey === contentKey(card) : isPrepared(card));

test('the 2026-10-25 card audit is recorded, pending review, and touches only public topics', () => {
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.date, '2026-10-25');
  assert.match(ledger.baseCommit, /^[a-f0-9]{7,40}$/u);
  assert.match(ledger.reviewStatus, /pending editorial review/u);
  assert.equal(ledger.counts.changedCards, ledger.changes.length);
  assert.equal(ledger.counts.removedCards, ledger.removed.length);
  assert.equal(ledger.counts.skippedCards, ledger.skipped.length);
  const ids = [...ledger.changes, ...ledger.removed, ...ledger.skipped].map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'each card appears once');
  assert.equal(held.size, 5);
  for (const entry of [...ledger.changes, ...ledger.removed, ...ledger.skipped]) {
    assert.ok(!held.has(entry.category), `${entry.id}: held categories stay untouched`);
    assert.ok(entry.reason?.trim(), `${entry.id}: documented reason`);
    assert.ok(entry.audit?.groupAction && Array.isArray(entry.audit.why) && entry.audit.why.length, `${entry.id}: audit finding recorded`);
    for (const source of entry.sources || []) assert.equal(new URL(source).protocol, 'https:', `${entry.id}: source URL`);
  }
});

test('every audit edit is exact and fully reversible from its recorded previous values', () => {
  for (const change of ledger.changes) {
    const cards = bank(change.category);
    const card = cards.find(entry => entry.id === change.id);
    assert.ok(card, `${change.id}: card exists`);
    assert.equal(hash(card), change.afterHash, `${change.id}: current card matches the ledger`);
    const previous = Object.entries(change.previous || {});
    assert.ok(previous.length > 0, `${change.id}: records what changed`);
    for (const [dotted, value] of previous) {
      assert.match(dotted, EDITABLE, `${change.id}: ${dotted} is an editable content field`);
      assert.notDeepEqual(get(card, dotted), value, `${change.id}: ${dotted} really changed`);
    }
    const before = beforeCardAudit(card, change);
    assert.equal(hash(before), change.beforeHash, `${change.id}: only the recorded fields changed`);
    assert.deepEqual(card.review, before.review, `${change.id}: review status is not promoted`);
    assert.ok(LEVELS.has(card.difficulty), `${change.id}: valid level`);
    if (change.previous.subcategory) {
      assert.ok(
        cards.some(other => other.id !== card.id && other.subcategory.en === card.subcategory.en && other.subcategory.ar === card.subcategory.ar),
        `${change.id}: moves only to an existing subtopic of the same topic`,
      );
    }
    if (card.tvQuiz) assert.ok(quizSealed(card), `${change.id}: TV quiz content key matches the new text`);
    const earlier = polish.changes.find(entry => entry.id === change.id);
    if (earlier) assert.equal(change.beforeHash, earlier.afterHash, `${change.id}: continues the 2026-10-24 polish history`);
    const arabic = [card.question.ar, card.answer.ar, card.tvQuiz?.explanation?.ar, card.quickFire?.explanation?.ar,
      ...(card.tvQuiz?.distractors?.ar || [])].filter(Boolean).join(' ');
    assert.ok(!(/[0-9]/u.test(arabic) && /[٠-٩]/u.test(arabic)), `${change.id}: one digit system per Arabic card`);
    assert.doesNotMatch(card.question.ar, /\?/u, `${change.id}: Arabic question mark`);
    assert.doesNotMatch(card.question.ar, /ال[ـ-]?[A-Za-z]/u, `${change.id}: no Arabic article attached to Latin text`);
    assert.doesNotMatch(`${card.question.en} ${card.answer.en}`, /[؀-ۿ]/u, `${change.id}: English text has no Arabic script`);
  }
});

test('removed cards are recorded in full, at their original positions, and gone from the public data', () => {
  const byCategory = new Map();
  for (const entry of ledger.removed) {
    assert.equal(entry.card.id, entry.id, `${entry.id}: full card recorded`);
    assert.equal(hash(entry.card), entry.beforeHash, `${entry.id}: recorded card matches its fingerprint`);
    assert.ok(Number.isInteger(entry.position) && entry.position >= 0, `${entry.id}: original position`);
    assert.ok(!bank(entry.category).some(card => card.id === entry.id), `${entry.id}: removed from ${entry.category}`);
    assert.equal(entry.audit.groupAction, 'remove', `${entry.id}: removed only where the audit said remove`);
    byCategory.set(entry.category, (byCategory.get(entry.category) || 0) + 1);
  }
  for (const [category, count] of byCategory) {
    const current = bank(category).map(card => card.id);
    const restored = idsBeforeAudit(ledger, category, current);
    assert.equal(restored.length, current.length + count, `${category}: positions restore the original length`);
    for (const entry of ledger.removed.filter(item => item.category === category)) {
      assert.equal(restored[entry.position], entry.id, `${entry.id}: restores to its recorded position`);
    }
  }
  const index = read('data/card-index.json');
  for (const entry of ledger.removed) assert.ok(!Object.hasOwn(index, entry.id), `${entry.id}: absent from the card index`);
});

test('TV cards marked for removal were replaced on the same id, keeping each show bank whole at the time', () => {
  const tv = bank('tv-shows-trivia');
  assert.ok(!ledger.removed.some(entry => entry.category === 'tv-shows-trivia'));
  const replaced = ledger.changes.filter(change => change.category === 'tv-shows-trivia' && change.audit.groupAction === 'remove');
  assert.ok(replaced.length > 0);
  for (const change of replaced) {
    const card = tv.find(entry => entry.id === change.id);
    for (const field of ['question.en', 'question.ar', 'answer.en', 'answer.ar', 'tvQuiz.distractors.en', 'tvQuiz.explanation.en']) {
      assert.ok(Object.hasOwn(change.previous, field), `${change.id}: ${field} replaced`);
    }
    assert.ok(quizSealed(card), `${change.id}: replacement is a prepared quiz card`);
  }
});

test('skipped audit findings leave their cards unchanged', () => {
  for (const entry of ledger.skipped) {
    assert.ok(bank(entry.category).some(card => card.id === entry.id), `${entry.id}: card kept`);
    assert.ok(!ledger.changes.some(change => change.id === entry.id), `${entry.id}: not edited`);
  }
});
