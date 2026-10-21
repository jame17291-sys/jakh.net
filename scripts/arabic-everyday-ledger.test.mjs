import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { beforeArabicRewrite } from './arabic-everyday-ledger.mjs';

const read = filename => JSON.parse(fs.readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8'));
const hash = card => crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex');
const ledger = read('docs/content-review/arabic-everyday-2026-10-21.json');

test('the everyday-Arabic rewrite changes only Arabic question wording and is fully reversible', () => {
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.counts.changedQuestions, ledger.changes.length);
  assert.equal(new Set(ledger.changes.map(change => change.id)).size, ledger.changes.length);
  const banks = new Map();
  for (const change of ledger.changes) {
    if (!banks.has(change.category)) banks.set(change.category, new Map(read(`data/${change.category}.json`).map(card => [card.id, card])));
    const card = banks.get(change.category).get(change.id);
    assert.ok(card, `${change.id}: card exists`);
    assert.equal(hash(card), change.afterHash, `${change.id}: current card matches the ledger`);
    assert.equal(hash(beforeArabicRewrite(card, change)), change.beforeHash, `${change.id}: only Arabic wording changed`);
    assert.notEqual(card.question.ar, change.previous.questionAr, `${change.id}: a real wording change`);
    assert.match(card.question.ar, /^[^?]*$/u, `${change.id}: Arabic text uses the Arabic question mark`);
    assert.ok(change.reason?.trim(), `${change.id}: documented reason`);
  }
});
