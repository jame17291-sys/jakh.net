// Reverses the 2026-10-25 topic merges so older content ledgers can keep
// verifying their whole-card fingerprints and topic-file positions.
//
// Each moved card records its source topic, its original position in that
// topic file and the previous value of every field the move changed (only
// `subcategory`); each removed card is stored in full with its original
// position. Moved cards were appended to their new topic files.
import fs from 'node:fs';

export const TOPIC_MERGE_LEDGER = 'docs/content-review/topic-merge-2026-10-25.json';

const repositoryFile = relative => new URL(`../${relative}`, import.meta.url);

export function readTopicMergeLedger() {
  return JSON.parse(fs.readFileSync(repositoryFile(TOPIC_MERGE_LEDGER), 'utf8'));
}

// The current card list of a topic, or an empty list for a retired topic.
export function readCurrentBank(category) {
  const file = repositoryFile(`data/${category}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
}

export function beforeTopicMove(card, move) {
  const restored = structuredClone(card);
  for (const [dotted, value] of Object.entries(move.previous || {})) {
    const keys = dotted.split('.');
    const last = keys.pop();
    const parent = keys.reduce((node, key) => node?.[key], restored);
    if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, last)) {
      throw new Error(`${move.id}: ${dotted} is not a field of the card`);
    }
    parent[last] = structuredClone(value);
  }
  return restored;
}

// A topic file's cards exactly as they stood before the merge: cards moved in
// are taken out, and cards moved or removed out are put back, unmoved, at their
// recorded positions. `readBank` defaults to the repository's data files.
export function bankBeforeMerge(ledger, category, readBank = readCurrentBank) {
  const incoming = new Set(ledger.moved.filter(move => move.to === category).map(move => move.id));
  const cards = readBank(category).filter(card => !incoming.has(card.id));
  const targets = new Map();
  const outgoing = [
    ...ledger.moved.filter(move => move.from === category).map(move => {
      if (!targets.has(move.to)) targets.set(move.to, readBank(move.to));
      const current = targets.get(move.to).find(card => card.id === move.id);
      if (!current) throw new Error(`${move.id}: missing from ${move.to}`);
      return { position: move.position, card: beforeTopicMove(current, move) };
    }),
    ...ledger.removed.filter(entry => entry.category === category)
      .map(entry => ({ position: entry.position, card: structuredClone(entry.card) })),
  ].sort((left, right) => left.position - right.position);
  for (const { position, card } of outgoing) cards.splice(position, 0, card);
  return cards;
}

// The card as it stood before the merge, wherever it lives now, or undefined
// when the merge neither moved nor removed it and `current` is undefined.
export function cardBeforeMerge(ledger, id, current) {
  const removed = ledger.removed.find(entry => entry.id === id);
  if (removed) return structuredClone(removed.card);
  const move = ledger.moved.find(entry => entry.id === id);
  if (!move) return current;
  const card = current || readCurrentBank(move.to).find(entry => entry.id === id);
  if (!card) throw new Error(`${id}: missing from ${move.to}`);
  return beforeTopicMove(card, move);
}

// The compact move history (worker/src/card-moves.json): each moved card's
// former topics and current topic, and each retired topic's successor. Saved
// progress, favourites and Content Studio rows keep the topic recorded when
// they were written, so the API uses this to recognise them after a move; the
// static edge uses it to send a shared card link to the card's current topic.
export function cardMoveHistory(ledger) {
  const formerCategories = {};
  const currentCategories = {};
  for (const move of [...ledger.moved].sort((left, right) => left.id.localeCompare(right.id))) {
    formerCategories[move.id] = [...new Set([...(formerCategories[move.id] || []), move.from])];
    currentCategories[move.id] = move.to;
  }
  const retiredCategories = Object.fromEntries(
    [...ledger.retiredTopics].sort((left, right) => left.slug.localeCompare(right.slug))
      .map(topic => [topic.slug, topic.successor]),
  );
  return { retiredCategories, formerCategories, currentCategories };
}
