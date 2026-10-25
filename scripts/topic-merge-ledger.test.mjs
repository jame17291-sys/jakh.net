import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {
  TOPIC_MERGE_LEDGER, bankBeforeMerge, beforeTopicMove, cardBeforeMerge, cardMoveHistory, readCurrentBank, readTopicMergeLedger,
} from './topic-merge-ledger.mjs';
import { RETIRED_TOPIC_REDIRECTS, RETIRED_TV_SHOWS, retiredTopicRouteTarget } from '../site-worker/src/topic-route-migrations.js';
import { SHOWS } from '../tv-trivia-engine.js';
import { TOPIC_ILLUSTRATIONS } from '../site-illustrations.js';

const read = relative => JSON.parse(fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'));
const exists = relative => fs.existsSync(new URL(`../${relative}`, import.meta.url));
const hash = card => crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex');
const ledger = readTopicMergeLedger();
const catalog = read('data/catalog.json');
const index = read('data/card-index.json');
const quarantine = read('docs/content-review/production-quarantine.json');
const held = new Set(quarantine.categories.map(category => category.slug));
const slugs = new Set(catalog.categories.map(category => category.slug));
const retired = new Map(ledger.retiredTopics.map(topic => [topic.slug, topic]));
const LEVELS = new Set(['easy', 'medium', 'hard', 'very-advanced']);

test('the 2026-10-25 topic merges are recorded, pending review, and leave held topics alone', () => {
  assert.equal(TOPIC_MERGE_LEDGER, 'docs/content-review/topic-merge-2026-10-25.json');
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.date, '2026-10-25');
  assert.match(ledger.baseCommit, /^[a-f0-9]{7,40}$/u);
  assert.match(ledger.reviewStatus, /pending editorial review/u);
  assert.equal(ledger.counts.movedCards, ledger.moved.length);
  assert.equal(ledger.counts.removedCards, ledger.removed.length);
  assert.equal(ledger.counts.retiredTopics, ledger.retiredTopics.length);
  assert.equal(ledger.counts.skippedAuditMoves, ledger.skippedAuditMoves.length);
  assert.deepEqual(
    [ledger.counts.movedByReason.auditMove + ledger.counts.movedByReason.topicMerge, ledger.counts.removedByReason.topicMergeRepeat + ledger.counts.removedByReason.retiredShow],
    [ledger.moved.length, ledger.removed.length],
  );
  assert.deepEqual([ledger.moved.length, ledger.removed.length], [110, 94]);
  const ids = [...ledger.moved, ...ledger.removed].map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'each card is moved or removed at most once');
  assert.equal(held.size, 5);
  for (const entry of [...ledger.moved, ...ledger.removed, ...ledger.skippedAuditMoves]) {
    for (const slug of [entry.from, entry.to, entry.category]) assert.ok(!slug || !held.has(slug), `${entry.id}: held topics stay untouched`);
    assert.ok(entry.reason?.trim(), `${entry.id}: documented reason`);
  }
  for (const slug of held) assert.ok(slugs.has(slug) && exists(`data/${slug}.json`), `${slug}: held topic stays in the source catalog`);
});

test('every moved card keeps its id and content, changes only topic and subtopic, and is exactly reversible', () => {
  for (const move of ledger.moved) {
    assert.ok(slugs.has(move.to), `${move.id}: target topic exists`);
    assert.notEqual(move.from, move.to, `${move.id}: a real move`);
    const target = readCurrentBank(move.to);
    const matches = target.filter(card => card.id === move.id);
    assert.equal(matches.length, 1, `${move.id}: present once in ${move.to}`);
    assert.ok(!readCurrentBank(move.from).some(card => card.id === move.id), `${move.id}: gone from ${move.from}`);
    assert.deepEqual(index[move.id]?.[0], move.to, `${move.id}: the card index places it in ${move.to}`);
    const [card] = matches;
    assert.equal(hash(card), move.afterHash, `${move.id}: current card matches the ledger`);
    assert.ok(Number.isInteger(move.position) && move.position >= 0, `${move.id}: original position`);
    assert.deepEqual(Object.keys(move.previous || {}).filter(key => key !== 'subcategory'), [], `${move.id}: only the subtopic may change`);
    const before = beforeTopicMove(card, move);
    assert.equal(hash(before), move.beforeHash, `${move.id}: only the recorded fields changed`);
    assert.deepEqual(before.subcategory, move.subcategory.before, `${move.id}: previous subtopic`);
    assert.deepEqual(card.subcategory, move.subcategory.after, `${move.id}: new subtopic`);
    assert.deepEqual(card.review, before.review, `${move.id}: review status is not promoted`);
    assert.ok(LEVELS.has(card.difficulty), `${move.id}: valid level`);
    // A new subtopic is one the target topic already uses; a merged topic may
    // keep its own subtopic name when the target has no equivalent.
    const original = bankBeforeMerge(ledger, move.to);
    const existing = original.some(other => other.subcategory.en === card.subcategory.en && other.subcategory.ar === card.subcategory.ar);
    const kept = JSON.stringify(move.subcategory.before) === JSON.stringify(move.subcategory.after);
    assert.ok(existing || (kept && retired.has(move.from)), `${move.id}: lands in an existing subtopic of ${move.to}`);
    if (move.audit) {
      assert.equal(move.audit.groupAction, 'move', `${move.id}: moved only where the audit said move`);
      assert.equal(move.audit.betterTopic, move.to, `${move.id}: moved where the audit placed it`);
    } else {
      assert.ok(retired.has(move.from), `${move.id}: a move without an audit verdict is a topic merge`);
    }
    assert.deepEqual(cardBeforeMerge(ledger, move.id, card), before);
  }
});

test('removed cards are recorded in full at their original positions and gone from the public data', () => {
  for (const entry of ledger.removed) {
    assert.equal(entry.card.id, entry.id, `${entry.id}: full card recorded`);
    assert.equal(hash(entry.card), entry.beforeHash, `${entry.id}: recorded card matches its fingerprint`);
    assert.ok(Number.isInteger(entry.position) && entry.position >= 0, `${entry.id}: original position`);
    assert.ok(!Object.hasOwn(index, entry.id), `${entry.id}: absent from the card index`);
    assert.ok(!readCurrentBank(entry.category).some(card => card.id === entry.id), `${entry.id}: removed from ${entry.category}`);
    if (entry.category === 'tv-shows-trivia') {
      assert.equal(entry.card.subcategory.en, 'The Wire', `${entry.id}: only the retired show leaves the TV bank`);
    } else {
      assert.equal(entry.category, 'physical-and-life-sciences', `${entry.id}: repeats removed only from the merged-away topic`);
      assert.equal(entry.audit?.groupAction, 'remove', `${entry.id}: removed only where the audit said remove`);
    }
  }
});

test('the ledger restores every pre-merge topic file and the 3,798-card public corpus', () => {
  const before = new Set([...slugs, ...retired.keys()]);
  assert.equal(before.size, 56);
  let publicCards = 0;
  for (const slug of before) {
    const cards = bankBeforeMerge(ledger, slug);
    const touched = ledger.moved.some(move => move.from === slug || move.to === slug) || ledger.removed.some(entry => entry.category === slug);
    if (!touched) assert.deepEqual(cards, readCurrentBank(slug), `${slug}: untouched topics are unchanged`);
    for (const entry of [...ledger.moved.filter(move => move.from === slug), ...ledger.removed.filter(item => item.category === slug)]) {
      assert.equal(cards[entry.position]?.id, entry.id, `${entry.id}: restores to its recorded position in ${slug}`);
    }
    if (!held.has(slug)) publicCards += cards.length;
  }
  assert.equal(publicCards, 3_798);
  assert.equal(publicCards - ledger.removed.length, 3_704);
});

test('retired topics leave the catalog, data, pages and art, and redirect to their successors', () => {
  assert.deepEqual(
    RETIRED_TOPIC_REDIRECTS.map(({ slug, successor }) => [slug, successor]),
    ledger.retiredTopics.map(topic => [topic.slug, topic.successor]),
  );
  assert.deepEqual(cardMoveHistory(ledger).retiredCategories, Object.fromEntries(
    [...ledger.retiredTopics].sort((left, right) => left.slug.localeCompare(right.slug)).map(topic => [topic.slug, topic.successor]),
  ));
  for (const topic of ledger.retiredTopics) {
    assert.equal(topic.catalogEntry.slug, topic.slug, `${topic.slug}: full catalog entry recorded`);
    assert.ok(!slugs.has(topic.slug), `${topic.slug}: retired from the catalog`);
    assert.ok(!catalog.sections.some(section => section.members.includes(topic.slug)), `${topic.slug}: retired from its section`);
    assert.ok(!catalog.categories.some(category => category.related.includes(topic.slug)), `${topic.slug}: no longer a related topic`);
    assert.ok(slugs.has(topic.successor), `${topic.slug}: successor exists`);
    for (const relative of [`data/${topic.slug}.json`, `${topic.slug}.html`, `ar/topics/${topic.slug}/index.html`, `assets/${topic.slug}.svg`]) {
      assert.equal(exists(relative), false, `${relative}: retired file removed`);
    }
    assert.ok(!Object.hasOwn(TOPIC_ILLUSTRATIONS, topic.slug), `${topic.slug}: no topic artwork`);
    assert.ok(!Object.values(index).some(([slug]) => slug === topic.slug), `${topic.slug}: no card is indexed under it`);
    assert.equal(retiredTopicRouteTarget(topic.routes.en.replace(/\/$/u, '')), topic.redirects.en);
    assert.equal(retiredTopicRouteTarget(topic.routes.ar.replace(/\/$/u, '')), topic.redirects.ar);
    // Moved card ids may still name the retired topic; routes to it may not.
    for (const relative of ['data/search-index.en.json', 'data/search-index.ar.json']) {
      assert.ok(!read(relative).categories.includes(topic.slug), `${relative}: no longer lists ${topic.slug}`);
    }
    const route = new RegExp(`(?:href|loc)=?["'>]?(?:https://riddlearabia\\.com)?/(?:ar/topics/)?${topic.slug}(?:[/?#"'<]|$)`, 'u');
    for (const relative of ['sitemap.xml', 'mind-lab.html', 'ar/mind-lab/index.html', 'collections.html', 'ar/collections/index.html', 'index.html', 'ar/index.html']) {
      assert.doesNotMatch(fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'), route, `${relative}: no longer links ${topic.slug}`);
    }
  }
  const infrastructure = catalog.categories.find(category => category.slug === 'infrastructure-systems');
  const retitle = ledger.retitledTopics.find(topic => topic.slug === 'infrastructure-systems');
  assert.deepEqual(infrastructure.title, { en: 'Civil Engineering & Infrastructure', ar: 'الهندسة المدنية والبنية التحتية' });
  assert.deepEqual(retitle.title, infrastructure.title);
  for (const change of ledger.descriptionChanges) {
    const category = catalog.categories.find(entry => entry.slug === change.slug);
    for (const [lang, text] of Object.entries(change.description)) assert.equal(category.description[lang], text, `${change.slug}/${lang}`);
  }
  assert.doesNotMatch(catalog.categories.find(category => category.slug === 'space-and-astrology').description.en, /zodiac|astrolog/iu);
});

test('The Wire is retired from the TV game with a redirect to the TV topic page', () => {
  assert.deepEqual(ledger.retiredShows.map(show => show.id), ['the-wire']);
  assert.deepEqual(RETIRED_TV_SHOWS.map(show => [show.id, show.key]), ledger.retiredShows.map(show => [show.id, show.key]));
  for (const show of ledger.retiredShows) {
    assert.ok(!SHOWS.some(entry => entry.id === show.id || entry.key === show.key), `${show.id}: not offered by the TV game`);
    assert.deepEqual(show.redirects, { en: '/tv-shows-trivia', ar: '/ar/topics/tv-shows-trivia/' });
  }
  const tv = catalog.categories.find(category => category.slug === 'tv-shows-trivia');
  assert.ok(!tv.topics.some(topic => topic.en === 'The Wire'));
  assert.deepEqual(tv.topics.map(topic => topic.en).sort(), SHOWS.map(show => show.key).sort());
});

test('card ids are opaque: moved cards keep ids that name their former topic', () => {
  const prefixed = ledger.moved.filter(move => move.id.startsWith(`${move.from}-`));
  assert.ok(prefixed.length > 0);
  for (const move of prefixed) {
    assert.equal(index[move.id][0], move.to);
    assert.ok(!move.id.startsWith(`${move.to}-`), `${move.id}: the id prefix differs from its topic`);
  }
  const history = read('worker/src/card-moves.json');
  assert.deepEqual(history, cardMoveHistory(ledger));
  for (const move of ledger.moved) assert.deepEqual(history.formerCategories[move.id], [move.from]);
});

test('merged topics hold no exact repeated prompt', () => {
  for (const slug of new Set(ledger.moved.map(move => move.to))) {
    for (const lang of ['en', 'ar']) {
      const prompts = readCurrentBank(slug).map(card => card.question[lang].normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, ''));
      assert.equal(new Set(prompts).size, prompts.length, `${slug}/${lang}`);
    }
  }
});
