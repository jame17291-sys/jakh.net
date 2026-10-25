import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {
  CONTENT_ADDITIONS_LEDGER, bankBeforeAdditions, beforeAdditionsChange, readContentAdditionsLedger, readTopicFile,
} from './content-additions-ledger.mjs';
import { DEFAULT_SUBTOPIC_LIMIT, SUBTOPIC_LIMITS, orderTopics, subtopicLimit } from './catalog-topics.mjs';
import { loadKidsContent } from './generate-kids-pages.mjs';

const read = relative => JSON.parse(fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'));
const hash = card => crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex');
const ledger = readContentAdditionsLedger();
const catalog = read('data/catalog.json');
const index = read('data/card-index.json');
const quarantine = read('docs/content-review/production-quarantine.json');
const held = new Set(quarantine.categories.map(category => category.slug));
const slugs = catalog.categories.map(category => category.slug);
const banks = new Map(slugs.map(slug => [slug, readTopicFile(slug)]));
const before = new Map(slugs.map(slug => [slug, bankBeforeAdditions(ledger, slug)]));
const get = (object, dotted) => dotted.split('.').reduce((value, key) => value?.[key], object);
const LEVELS = ['easy', 'medium', 'hard', 'very-advanced'];
const EDITABLE = /^(?:question\.(?:en|ar)|answer\.(?:en|ar)|difficulty|subcategory\.(?:en|ar)|acceptedAnswers)$/u;
const TOPICS = new Set(['ayam-tayebeen', 'kids-riddles']);
const NEW_SERIES = ['Detective Conan', 'Hunter × Hunter', 'Digimon Adventure', 'Sindbad'];
const counts = cards => ({
  total: cards.length,
  levels: Object.fromEntries(LEVELS.map(level => [level, cards.filter(card => card.difficulty === level).length])),
});
const entries = () => [...ledger.changes, ...ledger.added];
const arabicChecks = (card, label) => {
  const arabic = [card.question.ar, card.answer.ar].join(' ');
  assert.ok(!(/[0-9]/u.test(arabic) && /[٠-٩]/u.test(arabic)), `${label}: one digit system per Arabic card`);
  assert.match(card.question.ar, /؟$/u, `${label}: Arabic question mark at the end`);
  assert.doesNotMatch(card.question.ar, /\?/u, `${label}: no Latin question mark in Arabic`);
  assert.doesNotMatch(card.question.ar, /ال[ـ-]?[A-Za-z]/u, `${label}: no Arabic article attached to Latin text`);
  assert.doesNotMatch(`${card.question.ar} ${card.answer.ar}`, /["']/u, `${label}: «» instead of straight quotes`);
  assert.doesNotMatch(`${card.question.en} ${card.answer.en}`, /[؀-ۿ]/u, `${label}: English text has no Arabic script`);
};

test('the 2026-10-25 additions are recorded, pending review, and touch only Spacetoon Classics and Kids Riddles', () => {
  assert.equal(CONTENT_ADDITIONS_LEDGER, 'docs/content-review/content-additions-2026-10-25.json');
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.date, '2026-10-25');
  assert.match(ledger.baseCommit, /^[a-f0-9]{7,40}$/u);
  assert.match(ledger.reviewStatus, /pending editorial review/u);
  assert.match(ledger.reviewNote, /No human editor has reviewed these cards/u, 'the ledger does not claim a human review');
  assert.equal(ledger.counts.addedCards, ledger.added.length);
  assert.equal(ledger.counts.changedCards, ledger.changes.length);
  const ids = entries().map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'each card is changed or added at most once');
  for (const entry of entries()) {
    assert.ok(TOPICS.has(entry.category), `${entry.id}: only the two approved topics change`);
    assert.ok(!held.has(entry.category), `${entry.id}: held categories stay untouched`);
    assert.ok(entry.reason?.trim(), `${entry.id}: documented reason`);
    assert.ok(Array.isArray(entry.sources), `${entry.id}: sources listed`);
    for (const source of entry.sources) assert.equal(new URL(source).protocol, 'https:', `${entry.id}: source URL`);
  }
  for (const slug of slugs.filter(slug => !TOPICS.has(slug))) assert.deepEqual(banks.get(slug), before.get(slug), `${slug}: unchanged`);
});

test('every edit is exact and fully reversible from its recorded previous values', () => {
  for (const change of ledger.changes) {
    const card = banks.get(change.category).find(entry => entry.id === change.id);
    assert.ok(card, `${change.id}: card exists in ${change.category}`);
    assert.equal(hash(card), change.afterHash, `${change.id}: current card matches the ledger`);
    const previous = Object.entries(change.previous || {});
    assert.ok(previous.length > 0, `${change.id}: records what changed`);
    for (const [dotted, value] of previous) {
      assert.match(dotted, EDITABLE, `${change.id}: ${dotted} is an editable content field`);
      assert.notDeepEqual(get(card, dotted), value, `${change.id}: ${dotted} really changed`);
    }
    const restored = beforeAdditionsChange(card, change);
    assert.equal(hash(restored), change.beforeHash, `${change.id}: only the recorded fields changed`);
    assert.deepEqual(card.review, restored.review, `${change.id}: review status is not promoted`);
    if (previous.some(([dotted]) => /^(?:question|answer)/u.test(dotted))) arabicChecks(card, change.id);
  }
});

test('added cards are complete, recorded in full, and take fresh ids that follow their topic', () => {
  const earlier = new Set();
  const collect = value => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { if (key === 'id' && typeof item === 'string') earlier.add(item); collect(item); }
  };
  for (const file of fs.readdirSync(new URL('../docs/content-review/', import.meta.url))) {
    if (file.endsWith('.json') && !file.startsWith('content-additions') && !['learning-audit-ledger.json', 'work-queue.json'].includes(file)) {
      collect(read(`docs/content-review/${file}`));
    }
  }
  const allIds = slugs.flatMap(slug => banks.get(slug).map(card => card.id));
  assert.equal(new Set(allIds).size, allIds.length, 'card ids are unique across the whole bank, held topics included');
  const prompts = new Map();
  for (const entry of ledger.added) {
    const cards = banks.get(entry.category);
    const card = cards.find(item => item.id === entry.id);
    assert.ok(card, `${entry.id}: present in ${entry.category}`);
    assert.equal(cards[entry.position]?.id, entry.id, `${entry.id}: recorded position`);
    assert.equal(hash(card), entry.afterHash, `${entry.id}: current card matches the ledger`);
    assert.deepEqual(card, entry.card, `${entry.id}: recorded in full`);
    assert.equal(index[entry.id]?.[0], entry.category, `${entry.id}: indexed under its topic`);
    assert.ok(!earlier.has(entry.id), `${entry.id}: a fresh id never used by an earlier card`);
    assert.ok(!before.get(entry.category).some(item => item.id === entry.id), `${entry.id}: new to the topic`);
    const peers = before.get(entry.category).map(item => item.id.replace(/-\d+$/u, '-'));
    assert.ok(peers.includes(entry.id.replace(/-\d+$/u, '-')), `${entry.id}: follows the topic's id convention`);
    assert.deepEqual(card.review, { status: 'pending' }, `${entry.id}: pending review`);
    assert.ok(LEVELS.includes(card.difficulty), `${entry.id}: valid level`);
    for (const lang of ['en', 'ar']) {
      assert.ok(card.question[lang]?.trim() && card.answer[lang]?.trim() && card.subcategory[lang]?.trim(), `${entry.id}: bilingual ${lang}`);
    }
    arabicChecks(card, entry.id);
    if (entry.category === 'ayam-tayebeen') {
      assert.deepEqual(Object.keys(card), ['id', 'difficulty', 'subcategory', 'question', 'answer', 'review'], `${entry.id}: the topic's card schema`);
      assert.ok(entry.sources.length > 0, `${entry.id}: every new Spacetoon card cites an opened source`);
    }
    for (const lang of ['en', 'ar']) {
      const key = `${entry.category}/${lang}/${card.question[lang].normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '')}`;
      assert.ok(!prompts.has(key), `${entry.id}: repeats the prompt of ${prompts.get(key)}`);
      prompts.set(key, entry.id);
    }
  }
  for (const slug of TOPICS) {
    for (const lang of ['en', 'ar']) {
      const all = banks.get(slug).map(card => card.question[lang].normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, ''));
      assert.equal(new Set(all).size, all.length, `${slug}/${lang}: no exact repeated prompt`);
    }
  }
});

test('the ledger restores both topic files as the phase-2 pass left them', () => {
  let publicBefore = 0;
  let publicAfter = 0;
  for (const slug of slugs.filter(slug => !held.has(slug))) {
    publicBefore += before.get(slug).length;
    publicAfter += banks.get(slug).length;
  }
  assert.equal(publicBefore, 3_286, 'the public corpus the phase-2 pass produced');
  assert.equal(publicAfter, 3_360);
  assert.deepEqual(ledger.counts.publicCards, { before: publicBefore, after: publicAfter });
  assert.equal(publicBefore + ledger.added.length, publicAfter);
  const recorded = new Map(ledger.topics.map(topic => [topic.slug, topic]));
  assert.deepEqual([...recorded.keys()].sort(), [...TOPICS].sort());
  for (const [slug, topic] of recorded) {
    assert.deepEqual(topic.before, counts(before.get(slug)), `${slug}: recorded starting counts`);
    assert.deepEqual(topic.after, counts(banks.get(slug)), `${slug}: recorded final counts`);
  }
  const phase2 = read('docs/content-review/content-phase2-2026-10-25.json');
  for (const slug of TOPICS) {
    const after = phase2.topics.find(topic => topic.slug === slug).after;
    assert.deepEqual(counts(before.get(slug)), { total: after.total, levels: after.levels }, `${slug}: starts where phase 2 ended`);
  }
});

test('Spacetoon Classics holds 14 series, with the four new ones first in the catalog and the topic file', () => {
  const cards = banks.get('ayam-tayebeen');
  const series = [...new Set(cards.map(card => card.subcategory.en))];
  assert.equal(series.length, 14);
  assert.equal(subtopicLimit('ayam-tayebeen'), 14, 'the owner approved exactly 14 series');
  assert.deepEqual(SUBTOPIC_LIMITS, { 'ayam-tayebeen': 14 }, 'no other topic is exempt');
  assert.equal(DEFAULT_SUBTOPIC_LIMIT, 10);
  for (const slug of slugs.filter(slug => slug !== 'ayam-tayebeen')) {
    assert.ok(new Set(banks.get(slug).map(card => card.subcategory.en)).size <= 10, `${slug}: at most 10 subtopics`);
  }
  assert.deepEqual(series.slice(0, 4), NEW_SERIES, 'the topic file starts with the four new series, in order');
  for (const name of NEW_SERIES) {
    const own = cards.filter(card => card.subcategory.en === name);
    assert.equal(own.length, 16, `${name}: 16 cards`);
    for (const level of LEVELS) assert.ok(own.some(card => card.difficulty === level), `${name}: has ${level} cards`);
    assert.ok(own.every(card => ledger.added.some(entry => entry.id === card.id)), `${name}: every card is recorded as added`);
  }
  const meta = catalog.categories.find(category => category.slug === 'ayam-tayebeen');
  assert.deepEqual(meta.pinnedTopics, NEW_SERIES);
  assert.deepEqual(ledger.pinnedTopics['ayam-tayebeen'], NEW_SERIES);
  assert.deepEqual(meta.topics.slice(0, 4).map(topic => topic.en), NEW_SERIES, 'the subtopic list shows the new series first');
  assert.deepEqual(meta.topics, orderTopics(meta.topics, meta.pinnedTopics));
  for (const lang of ['en', 'ar']) assert.match(meta.description[lang], /14/u, `${lang}: the description names 14 series`);
  // The page draws its chips with the same order.
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /state\.categoryData\.pinnedTopics/u, 'app.js orders subtopic chips by pinnedTopics');
  for (const page of ['ayam-tayebeen.html', 'ar/topics/ayam-tayebeen/index.html']) {
    const html = fs.readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    const chips = [...html.matchAll(/data-subcategory="([^"]+)"/gu)].map(match => match[1]);
    assert.deepEqual(chips.slice(1, 5), NEW_SERIES.map(name => name.replace('&', '&amp;')), `${page}: prerendered chips start with the new series`);
  }
  const swap = ledger.swaps.find(item => item.requested.en === 'Heidi');
  assert.equal(swap?.replacement.en, 'Sindbad', 'the Heidi swap is recorded');
  assert.ok(swap.reason.trim() && swap.sources.length >= 2);
});

test('Kids Riddles reach 40 with an AI review record that does not claim a human review', () => {
  const cards = banks.get('kids-riddles');
  assert.deepEqual(counts(cards), { total: 40, levels: { easy: 14, medium: 13, hard: 13, 'very-advanced': 0 } });
  assert.ok(cards.some(card => card.subcategory.en === 'Animals & Nature' && card.subcategory.ar === 'الحيوانات والطبيعة'));
  const content = loadKidsContent();
  assert.deepEqual(content.legacy.map(card => card.id), cards.map(card => card.id), 'every kids riddle has its explanation');
  const review = read('docs/content-review/kids-release-review.json');
  assert.equal(review.coverage.preservedRiddles, 40);
  const revision = review.revisions?.find(item => item.reviewedOn === '2026-10-25');
  assert.ok(revision, 'the 2026-10-25 revision is recorded');
  assert.match(revision.reviewMethod, /AI review by Claude/u);
  assert.match(revision.reviewMethod, /not a human editorial review/u);
  assert.match(revision.requestedBy, /owner/u);
  assert.ok(review.notes.includes(revision.note) && review.notes.includes(ledger.kidsReview.note));
  assert.match(fs.readFileSync(new URL(`../${revision.note}`, import.meta.url), 'utf8'), /This is not a human editorial review/u);
});

test('catalog descriptions follow the new counts and list the new subtopics', () => {
  for (const change of ledger.descriptionChanges) {
    const category = catalog.categories.find(entry => entry.slug === change.slug);
    assert.deepEqual(category.description, change.description, `${change.slug}: recorded description is live`);
    assert.notDeepEqual(change.previous, change.description, `${change.slug}: a real change`);
    for (const lang of ['en', 'ar']) {
      const stated = change.description[lang].match(/^(\d+) /u)?.[1] || change.description[lang].match(/ (\d+) (?:bilingual|سؤالًا)/u)?.[1];
      assert.equal(Number(stated), category.count, `${change.slug}/${lang}: stated count`);
    }
  }
  for (const subtopic of ledger.newSubtopics) {
    const category = catalog.categories.find(entry => entry.slug === subtopic.category);
    assert.ok(category.topics.some(topic => topic.en === subtopic.subcategory.en && topic.ar === subtopic.subcategory.ar), `${subtopic.category}: lists ${subtopic.subcategory.en}`);
  }
  for (const item of ledger.unverified) {
    assert.ok(item.note?.trim());
    for (const id of item.ids) assert.ok(ledger.added.some(entry => entry.id === id) || ledger.changes.some(entry => entry.id === id), `${id}: unverified note names a recorded card`);
  }
});
