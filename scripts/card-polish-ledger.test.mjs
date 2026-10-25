import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { CARD_POLISH_LEDGER, beforeCardPolish } from './card-polish-ledger.mjs';
import { CARD_AUDIT_LEDGER, cardBeforeAudit } from './card-audit-ledger.mjs';
import { bankBeforeMerge, readTopicMergeLedger } from './topic-merge-ledger.mjs';
import { contentKey, isPrepared } from '../tv-trivia-engine.js';

const read = filename => JSON.parse(fs.readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8'));
const hash = card => crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex');
const ledger = read(CARD_POLISH_LEDGER);
const audit = read(CARD_AUDIT_LEDGER);
const quarantine = read('docs/content-review/production-quarantine.json');
const get = (object, dotted) => dotted.split('.').reduce((value, key) => value?.[key], object);
// Topic files as they stood before the 2026-10-25 topic merges.
const merge = readTopicMergeLedger();
const retiredByMerge = new Set(merge.removed.map(entry => entry.id));
const quizSealed = card => (retiredByMerge.has(card.id) ? card.tvQuiz?.contentKey === contentKey(card) : isPrepared(card));
const EDITABLE = /^(?:question\.(?:en|ar)|answer\.ar|tvQuiz\.(?:explanation\.(?:en|ar)|distractors\.ar|contentKey))$/u;

test('the 2026-10-24 card polish is recorded, exact and fully reversible', () => {
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.date, '2026-10-24');
  assert.match(ledger.baseCommit, /^[a-f0-9]{7,40}$/u);
  assert.match(ledger.reviewStatus, /pending editorial review/u);
  assert.equal(ledger.counts.changedCards, ledger.changes.length);
  assert.equal(new Set(ledger.changes.map(change => change.id)).size, ledger.changes.length);
  const held = new Set(quarantine.categories.map(category => category.slug));
  assert.equal(held.size, 5);
  const banks = new Map();
  for (const change of ledger.changes) {
    assert.ok(!held.has(change.category), `${change.id}: held categories stay untouched`);
    if (!banks.has(change.category)) banks.set(change.category, new Map(bankBeforeMerge(merge, change.category).map(card => [card.id, card])));
    const published = banks.get(change.category).get(change.id);
    assert.ok(published || audit.removed.some(entry => entry.id === change.id), `${change.id}: card exists or its removal is recorded`);
    // A later 2026-10-25 audit edit is reversed from its own ledger first.
    const card = cardBeforeAudit(audit, change.id, published);
    assert.ok(change.reason?.trim(), `${change.id}: documented reason`);
    assert.equal(hash(card), change.afterHash, `${change.id}: current card matches the ledger`);
    const previous = Object.entries(change.previous || {});
    assert.ok(previous.length > 0, `${change.id}: records what changed`);
    for (const [dotted, value] of previous) {
      assert.match(dotted, EDITABLE, `${change.id}: ${dotted} is a wording field`);
      assert.notDeepEqual(get(card, dotted), value, `${change.id}: ${dotted} really changed`);
    }
    assert.equal(hash(beforeCardPolish(card, change)), change.beforeHash, `${change.id}: only the recorded fields changed`);
    assert.deepEqual(card.review, beforeCardPolish(card, change).review, `${change.id}: review status is not promoted`);
    if (card.tvQuiz) assert.ok(quizSealed(card), `${change.id}: TV quiz content key matches the new text`);
    const arabic = [card.question.ar, card.answer.ar, card.tvQuiz?.explanation?.ar, ...(card.tvQuiz?.distractors?.ar || [])].filter(Boolean).join(' ');
    assert.ok(!(/[0-9]/u.test(arabic) && /[٠-٩]/u.test(arabic)), `${change.id}: one digit system per Arabic card`);
    assert.doesNotMatch(card.question.ar, /\?/u, `${change.id}: Arabic question mark`);
    assert.doesNotMatch(card.question.ar, /ال[ـ-]?[A-Za-z]/u, `${change.id}: no Arabic article attached to Latin text`);
  }
});

test('polished questions no longer contain their own answers', () => {
  const banks = new Map();
  let checked = 0;
  for (const change of ledger.changes.filter(entry => /(?:contains|contained) its own answer|named the answer/u.test(entry.reason))) {
    if (!banks.has(change.category)) banks.set(change.category, new Map(bankBeforeMerge(merge, change.category).map(card => [card.id, card])));
    const card = banks.get(change.category).get(change.id);
    for (const lang of ['en', 'ar']) {
      const answer = card.answer[lang].replace(/^(?:an?|the)\s+/iu, '').replace(/[.。]$/u, '').trim().toLocaleLowerCase(lang);
      assert.ok(!card.question[lang].toLocaleLowerCase(lang).includes(answer), `${change.id}/${lang}: question names its answer`);
    }
    checked += 1;
  }
  assert.equal(checked, 4);
});
