import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {
  CONTENT_PHASE2_LEDGER, bankBeforePhase2, beforePhase2Change, cardBeforePhase2, readContentPhase2Ledger, readCurrentTopicFile,
} from './content-phase2-ledger.mjs';
import { readTopicMergeLedger } from './topic-merge-ledger.mjs';
import { SHOWS, contentKey, isPrepared } from '../tv-trivia-engine.js';

const read = relative => JSON.parse(fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'));
const hash = card => crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex');
const ledger = readContentPhase2Ledger();
const catalog = read('data/catalog.json');
const index = read('data/card-index.json');
const quarantine = read('docs/content-review/production-quarantine.json');
const held = new Set(quarantine.categories.map(category => category.slug));
const slugs = catalog.categories.map(category => category.slug);
const get = (object, dotted) => dotted.split('.').reduce((value, key) => value?.[key], object);
const EDITABLE = /^(?:question\.(?:en|ar)|answer\.(?:en|ar)|difficulty|subcategory(?:\.(?:en|ar))?|acceptedAnswers|quickFire(?:\.(?:answer|distractors|explanation)\.(?:en|ar))?|tvQuiz\.(?:distractors\.(?:en|ar)|explanation\.(?:en|ar)|spoilerSeason|kind|contentKey))$/u;
const LEVELS = ['easy', 'medium', 'hard', 'very-advanced'];
const banks = new Map(slugs.map(slug => [slug, readCurrentTopicFile(slug)]));
const before = new Map(slugs.map(slug => [slug, bankBeforePhase2(ledger, slug)]));
const counts = cards => ({
  total: cards.length,
  levels: Object.fromEntries(LEVELS.map(level => [level, cards.filter(card => card.difficulty === level).length])),
  quickFire: cards.filter(card => card.quickFire).length,
});
const entries = () => [...ledger.changes, ...ledger.removed, ...ledger.added];
const arabicChecks = (card, label) => {
  const arabic = [card.question.ar, card.answer.ar, card.tvQuiz?.explanation?.ar, card.quickFire?.explanation?.ar,
    ...(card.tvQuiz?.distractors?.ar || [])].filter(Boolean).join(' ');
  assert.ok(!(/[0-9]/u.test(arabic) && /[٠-٩]/u.test(arabic)), `${label}: one digit system per Arabic card`);
  assert.doesNotMatch(card.question.ar, /\?/u, `${label}: Arabic question mark`);
  assert.doesNotMatch(card.question.ar, /ال[ـ-]?[A-Za-z]/u, `${label}: no Arabic article attached to Latin text`);
  assert.doesNotMatch(`${card.question.en} ${card.answer.en}`, /[؀-ۿ]/u, `${label}: English text has no Arabic script`);
};

test('the 2026-10-25 phase-2 content pass is recorded, pending review, and touches only public topics', () => {
  assert.equal(CONTENT_PHASE2_LEDGER, 'docs/content-review/content-phase2-2026-10-25.json');
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.date, '2026-10-25');
  assert.match(ledger.baseCommit, /^[a-f0-9]{7,40}$/u);
  assert.match(ledger.reviewStatus, /pending editorial review/u);
  assert.equal(ledger.counts.changedCards, ledger.changes.length);
  assert.equal(ledger.counts.removedCards, ledger.removed.length);
  assert.equal(ledger.counts.addedCards, ledger.added.length);
  assert.equal(ledger.counts.skippedOperations, ledger.skipped.length);
  const ids = entries().map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'each card is changed, removed or added at most once');
  assert.equal(held.size, 5);
  for (const entry of entries()) {
    assert.ok(!held.has(entry.category), `${entry.id}: held categories stay untouched`);
    assert.ok(entry.reason?.trim(), `${entry.id}: documented reason`);
    assert.ok(Array.isArray(entry.operations) && entry.operations.length, `${entry.id}: change-set operations recorded`);
    assert.deepEqual(entry.changeSets, [...new Set(entry.operations.map(op => op.changeSet))], `${entry.id}: change sets match operations`);
    for (const source of entry.sources || []) assert.equal(new URL(source).protocol, 'https:', `${entry.id}: source URL`);
  }
  for (const entry of ledger.skipped) {
    assert.ok(entry.changeSet && entry.op && entry.reason?.trim(), 'skipped operations say which and why');
  }
  for (const slug of held) assert.deepEqual(banks.get(slug), before.get(slug), `${slug}: held topic unchanged`);
});

test('every edit is exact and fully reversible from its recorded previous values', () => {
  for (const change of ledger.changes) {
    const card = banks.get(change.category).find(entry => entry.id === change.id);
    assert.ok(card, `${change.id}: card exists in ${change.category}`);
    assert.equal(hash(card), change.afterHash, `${change.id}: current card matches the ledger`);
    const previous = Object.entries(change.previous || {});
    assert.ok(previous.length + (change.addedFields || []).length > 0, `${change.id}: records what changed`);
    for (const [dotted, value] of previous) {
      assert.match(dotted, EDITABLE, `${change.id}: ${dotted} is an editable content field`);
      assert.notDeepEqual(get(card, dotted), value, `${change.id}: ${dotted} really changed`);
    }
    for (const dotted of change.addedFields || []) {
      assert.match(dotted, EDITABLE, `${change.id}: added ${dotted} is an editable content field`);
      assert.notEqual(get(card, dotted), undefined, `${change.id}: ${dotted} was added`);
    }
    const restored = beforePhase2Change(card, change);
    assert.equal(hash(restored), change.beforeHash, `${change.id}: only the recorded fields changed`);
    assert.deepEqual(cardBeforePhase2(ledger, change.id, card), restored);
    assert.deepEqual(card.review, restored.review, `${change.id}: review status is not promoted`);
    assert.ok(LEVELS.includes(card.difficulty), `${change.id}: valid level`);
    if (card.tvQuiz) assert.ok(isPrepared(card), `${change.id}: TV quiz content key matches the new text`);
    else assert.equal(card.tvQuiz, undefined);
    if (Object.keys(change.previous || {}).some(dotted => /^(?:question|answer)/u.test(dotted))) arabicChecks(card, change.id);
  }
});

test('removed cards are recorded in full at their original positions and gone from the public data', () => {
  for (const entry of ledger.removed) {
    assert.equal(entry.card.id, entry.id, `${entry.id}: full card recorded`);
    assert.equal(hash(entry.card), entry.beforeHash, `${entry.id}: recorded card matches its fingerprint`);
    assert.ok(Number.isInteger(entry.position) && entry.position >= 0, `${entry.id}: original position`);
    assert.equal(before.get(entry.category)[entry.position]?.id, entry.id, `${entry.id}: restores to its recorded position`);
    for (const slug of slugs) assert.ok(!banks.get(slug).some(card => card.id === entry.id), `${entry.id}: gone from ${slug}`);
    assert.ok(!Object.hasOwn(index, entry.id), `${entry.id}: absent from the card index`);
  }
});

test('added cards are complete, recorded in full, and take fresh ids that follow their topic', () => {
  const earlier = new Set();
  const collect = value => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { if (key === 'id' && typeof item === 'string') earlier.add(item); collect(item); }
  };
  for (const file of fs.readdirSync(new URL('../docs/content-review/', import.meta.url))) {
    if (file.endsWith('.json') && !file.startsWith('content-phase2') && !['learning-audit-ledger.json', 'work-queue.json'].includes(file)) {
      collect(read(`docs/content-review/${file}`));
    }
  }
  const allIds = slugs.flatMap(slug => banks.get(slug).map(card => card.id));
  assert.equal(new Set(allIds).size, allIds.length, 'card ids are unique across the whole bank, held topics included');
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
    if (entry.category === 'tv-shows-trivia') assert.ok(isPrepared(card) && card.tvQuiz.contentKey === contentKey(card), `${entry.id}: prepared TV card`);
    for (const source of entry.sources) assert.equal(new URL(source).protocol, 'https:', `${entry.id}: source URL`);
  }
});

test('the ledger restores every topic file as the topic merges left it', () => {
  const merge = readTopicMergeLedger();
  let publicBefore = 0;
  let publicAfter = 0;
  for (const slug of slugs) {
    const touched = entries().some(entry => entry.category === slug);
    if (!touched) assert.deepEqual(before.get(slug), banks.get(slug), `${slug}: untouched topics are unchanged`);
    if (!held.has(slug)) {
      publicBefore += before.get(slug).length;
      publicAfter += banks.get(slug).length;
    }
  }
  assert.equal(publicBefore, 3_704, 'the public corpus the topic merges produced');
  assert.deepEqual(ledger.counts.publicCards, { before: 3_704, after: publicAfter });
  assert.equal(publicAfter, 3_286);
  assert.equal(publicBefore - ledger.removed.length + ledger.added.length, publicAfter);
  // Moved cards that this pass removed still restore to the topic the merge put them in.
  for (const move of merge.moved.filter(item => ledger.removed.some(entry => entry.id === item.id))) {
    assert.equal(ledger.removed.find(entry => entry.id === move.id).category, move.to, `${move.id}: removed from its merged topic`);
  }
});

test('topic sizes, levels and Quick Fire sets are recorded and Quick Fire never shrinks', () => {
  const recorded = new Map(ledger.topics.map(topic => [topic.slug, topic]));
  assert.deepEqual([...recorded.keys()].sort(), slugs.filter(slug => !held.has(slug)).sort());
  for (const [slug, topic] of recorded) {
    const { quickFire: _ignored, ...beforeCounts } = counts(before.get(slug));
    assert.deepEqual({ total: topic.before.total, levels: topic.before.levels }, beforeCounts, `${slug}: recorded starting counts`);
    assert.deepEqual(topic.after, counts(banks.get(slug)), `${slug}: recorded final counts`);
    assert.ok(topic.after.quickFire >= topic.before.quickFire, `${slug}: Quick Fire set kept`);
    if (typeof topic.target === 'number') {
      assert.equal(Boolean(topic.belowTarget), topic.after.total < topic.target, `${slug}: target shortfall is flagged`);
      if (!topic.belowTarget) {
        assert.equal(topic.after.total, topic.target, `${slug}: reaches its agreed size`);
        for (const level of LEVELS) {
          if (!(slug === 'kids-riddles' && level === 'very-advanced')) assert.ok(topic.after.levels[level] >= 10, `${slug}: at least 10 ${level} cards`);
        }
      }
    }
  }
  const math = banks.get('math');
  assert.ok(math.filter(card => card.quickFire && card.difficulty === 'easy').length >= 10, 'math keeps ten easy Quick Fire cards');
  assert.ok(!banks.get('kids-riddles').some(card => card.difficulty === 'very-advanced'), 'kids riddles stop at hard');
});

test('every TV show keeps 30 to 40 prepared cards with at least 20 spoiler-free and 4 very-advanced', () => {
  const tv = banks.get('tv-shows-trivia');
  const recorded = ledger.topics.find(topic => topic.slug === 'tv-shows-trivia');
  for (const show of SHOWS) {
    const cards = tv.filter(card => card.subcategory.en === show.key);
    assert.ok(cards.length >= 30 && cards.length <= 40, `${show.id}: ${cards.length} cards`);
    assert.ok(cards.every(isPrepared), `${show.id}: every card is prepared`);
    assert.ok(cards.filter(card => card.tvQuiz.spoilerSeason === 0).length >= 20, `${show.id}: spoiler-free floor`);
    assert.ok(cards.filter(card => card.difficulty === 'very-advanced').length >= 4, `${show.id}: very-advanced cards`);
    const row = recorded.shows.find(item => item.show === show.key);
    assert.equal(row.after.total, cards.length, `${show.id}: recorded size`);
    assert.equal(row.after.spoilerFree, cards.filter(card => card.tvQuiz.spoilerSeason === 0).length, `${show.id}: recorded spoiler-free size`);
  }
});

test('catalog descriptions follow the new counts and drop stale subtopic names', () => {
  for (const change of ledger.descriptionChanges) {
    const category = catalog.categories.find(entry => entry.slug === change.slug);
    assert.deepEqual(category.description, change.description, `${change.slug}: recorded description is live`);
    assert.notDeepEqual(change.previous, change.description, `${change.slug}: a real change`);
    for (const lang of ['en', 'ar']) {
      const stated = change.description[lang].match(/^(\d+) /u)?.[1] || change.description[lang].match(/» (\d+) /u)?.[1];
      if (stated) assert.equal(Number(stated), category.count, `${change.slug}/${lang}: stated count`);
    }
  }
  const trueCrime = catalog.categories.find(entry => entry.slug === 'true-crime');
  assert.doesNotMatch(JSON.stringify(trueCrime), /Serial Killers|Cults & Mass Crimes|القتلة المتسلسلون/u);
  for (const subtopic of ledger.newSubtopics) {
    const category = catalog.categories.find(entry => entry.slug === subtopic.category);
    assert.ok(category.topics.some(topic => topic.en === subtopic.subcategory.en && topic.ar === subtopic.subcategory.ar), `${subtopic.category}: lists ${subtopic.subcategory.en}`);
  }
});
