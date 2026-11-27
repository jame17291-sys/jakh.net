import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { LATER_CONTENT_ADDITIONS_LEDGERS, readCurrentTopicFile, readTopicFile } from './content-additions-ledger.mjs';
import { RIDDLE_ARABIA_SEO_PAGES } from './riddlearabia-seo.mjs';

// The 2026-11-27 riddle additions: 38 new Classic Riddles cards so that the two
// main riddle collections can grow from 30 to 50 cards. They only append cards;
// the 2026-10-25 additions ledger takes them out again to keep verifying.
const LEDGER = 'docs/content-review/content-additions-2026-11-27.json';
const CATEGORY = 'classic-riddles';
const read = relative => JSON.parse(fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'));
const hash = card => crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex');
const normalise = text => text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
const LEVELS = ['easy', 'medium', 'hard', 'very-advanced'];
const counts = cards => ({
  total: cards.length,
  levels: Object.fromEntries(LEVELS.map(level => [level, cards.filter(card => card.difficulty === level).length])),
});

const ledger = read(LEDGER);
const catalog = read('data/catalog.json');
const index = read('data/card-index.json');
const held = new Set(read('docs/content-review/production-quarantine.json').categories.map(category => category.slug));
const slugs = catalog.categories.map(category => category.slug);
const current = readCurrentTopicFile(CATEGORY);
const before = readTopicFile(CATEGORY);
const addedIds = new Set(ledger.added.map(entry => entry.id));

const arabicChecks = (card, label) => {
  const arabic = [card.question.ar, card.answer.ar].join(' ');
  assert.ok(!(/[0-9]/u.test(arabic) && /[٠-٩]/u.test(arabic)), `${label}: one digit system per Arabic card`);
  assert.match(card.question.ar, /؟$/u, `${label}: Arabic question mark at the end`);
  assert.doesNotMatch(arabic, /\?/u, `${label}: no Latin question mark in Arabic`);
  assert.doesNotMatch(arabic, /ال[ـ-]?[A-Za-z]/u, `${label}: no Arabic article attached to Latin text`);
  assert.doesNotMatch(arabic, /["']/u, `${label}: «» instead of straight quotes`);
  assert.doesNotMatch(`${card.question.en} ${card.answer.en}`, /[؀-ۿ]/u, `${label}: English text has no Arabic script`);
  assert.match(card.question.en, /[?]$/u, `${label}: English question mark at the end`);
};

test('the 2026-11-27 riddle additions are recorded, pending review, and only append Classic Riddles cards', () => {
  assert.ok(LATER_CONTENT_ADDITIONS_LEDGERS.includes(LEDGER), 'earlier ledgers take these cards out again');
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.date, '2026-11-27');
  assert.match(ledger.baseCommit, /^[a-f0-9]{7,40}$/u);
  assert.match(ledger.reviewStatus, /pending editorial review/u);
  assert.match(ledger.reviewNote, /No human editor or native-speaker reviewer has checked these cards/u, 'the ledger does not claim a human review');
  assert.deepEqual(ledger.changes, [], 'no existing card changes');
  assert.equal(ledger.counts.addedCards, 38);
  assert.equal(ledger.added.length, ledger.counts.addedCards);
  assert.equal(ledger.counts.changedCards, 0);
  assert.equal(addedIds.size, ledger.added.length, 'each card is added once');
  for (const entry of ledger.added) {
    assert.equal(entry.category, CATEGORY, `${entry.id}: only Classic Riddles grows`);
    assert.ok(entry.reason?.trim(), `${entry.id}: documented reason`);
    assert.ok(Array.isArray(entry.sources), `${entry.id}: sources listed`);
  }
  assert.deepEqual(current.slice(0, before.length), before, 'the existing cards keep their order and content');
  assert.deepEqual(current.slice(before.length).map(card => card.id), ledger.added.map(entry => entry.id), 'the new cards are appended in ledger order');
  for (const slug of slugs.filter(slug => slug !== CATEGORY)) {
    assert.deepEqual(readCurrentTopicFile(slug), readTopicFile(slug), `${slug}: unchanged`);
  }
});

test('added cards are complete, recorded in full, and take fresh ids that follow their topic', () => {
  const highest = Math.max(...before.map(card => Number(card.id.split('-').pop())));
  const subtopics = new Set(before.map(card => JSON.stringify(card.subcategory)));
  for (const entry of ledger.added) {
    const card = current.find(item => item.id === entry.id);
    assert.ok(card, `${entry.id}: present in ${CATEGORY}`);
    assert.equal(current[entry.position]?.id, entry.id, `${entry.id}: recorded position`);
    assert.equal(hash(card), entry.afterHash, `${entry.id}: current card matches the ledger`);
    assert.deepEqual(card, entry.card, `${entry.id}: recorded in full`);
    assert.equal(index[entry.id]?.[0], CATEGORY, `${entry.id}: indexed under its topic`);
    assert.match(entry.id, /^classic-riddles-\d{3}$/u, `${entry.id}: the topic's id convention`);
    assert.ok(Number(entry.id.split('-').pop()) > highest, `${entry.id}: a fresh id after the topic's existing ones`);
    assert.deepEqual(Object.keys(card), ['id', 'difficulty', 'subcategory', 'question', 'answer', 'review'], `${entry.id}: the topic's card schema`);
    assert.deepEqual(card.review, { status: 'pending' }, `${entry.id}: pending review`);
    assert.ok(LEVELS.includes(card.difficulty), `${entry.id}: valid level`);
    assert.ok(subtopics.has(JSON.stringify(card.subcategory)), `${entry.id}: an existing subtopic`);
    for (const lang of ['en', 'ar']) {
      assert.ok(card.question[lang]?.trim() && card.answer[lang]?.trim(), `${entry.id}: bilingual ${lang}`);
    }
    arabicChecks(card, entry.id);
  }
  const allIds = slugs.flatMap(slug => readCurrentTopicFile(slug).map(card => card.id));
  assert.equal(new Set(allIds).size, allIds.length, 'card ids are unique across the whole bank');
});

test('no new riddle repeats a prompt from the riddle, logic, math, kids-riddle or story-mystery banks', () => {
  const others = new Map();
  for (const slug of ['classic-riddles', 'logic-puzzles', 'math', 'kids-riddles', 'story-mysteries']) {
    for (const card of readCurrentTopicFile(slug).filter(item => !addedIds.has(item.id))) {
      for (const lang of ['en', 'ar']) others.set(`${lang}/${normalise(card.question[lang])}`, card.id);
    }
  }
  const seen = new Map();
  for (const entry of ledger.added) {
    for (const lang of ['en', 'ar']) {
      const key = `${lang}/${normalise(entry.card.question[lang])}`;
      assert.ok(!others.has(key), `${entry.id}: repeats the prompt of ${others.get(key)}`);
      assert.ok(!seen.has(key), `${entry.id}: repeats the prompt of ${seen.get(key)}`);
      seen.set(key, entry.id);
    }
  }
});

test('card totals, the topic size and its catalog description follow the additions', () => {
  let publicCards = 0;
  let sourceCards = 0;
  for (const slug of slugs) {
    const size = readCurrentTopicFile(slug).length;
    sourceCards += size;
    if (!held.has(slug)) publicCards += size;
  }
  assert.deepEqual(ledger.counts.publicCards, { before: 3_360, after: 3_398 });
  assert.deepEqual(ledger.counts.sourceCards, { before: 3_638, after: 3_676 });
  assert.equal(publicCards, ledger.counts.publicCards.after);
  assert.equal(sourceCards, ledger.counts.sourceCards.after);
  assert.deepEqual(ledger.topics, [{ slug: CATEGORY, before: counts(before), after: counts(current) }]);
  assert.equal(current.length, 108);
  const meta = catalog.categories.find(category => category.slug === CATEGORY);
  assert.equal(meta.count, 108);
  const [change] = ledger.descriptionChanges;
  assert.equal(change.slug, CATEGORY);
  assert.deepEqual(meta.description, change.description, 'the recorded description is live');
  assert.match(change.previous.ar, / 70 سؤالًا /u);
  assert.match(meta.description.ar, / 108 أسئلة /u, 'the Arabic description states the new size');
});

test('every new card is featured exactly once, on the collection the ledger names', () => {
  const featuredOn = new Map();
  for (const page of RIDDLE_ARABIA_SEO_PAGES) {
    for (const [, id] of page.cards || []) {
      if (addedIds.has(id)) featuredOn.set(id, [...(featuredOn.get(id) || []), page.key]);
    }
  }
  for (const entry of ledger.added) {
    assert.deepEqual(featuredOn.get(entry.id), [entry.featuredOn], `${entry.id}: featured on ${entry.featuredOn} only`);
  }
  const size = key => RIDDLE_ARABIA_SEO_PAGES.find(page => page.key === key).cards.length;
  assert.equal(size('riddles'), 50);
  assert.equal(size('hard-riddles'), 50);
  assert.equal(size('math-riddles'), 60);
});
