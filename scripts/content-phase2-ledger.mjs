// Reverses the 2026-10-25 phase-2 content pass so older content ledgers can
// keep verifying their whole-card fingerprints and topic-file positions.
//
// Each changed card stores the previous value of every field it touched under
// a dotted path (for example "question.ar" or "tvQuiz.distractors.ar") and
// lists fields the pass added; each removed card is stored in full with its
// original position; each added card was appended to its topic file.
import fs from 'node:fs';

export const CONTENT_PHASE2_LEDGER = 'docs/content-review/content-phase2-2026-10-25.json';

const repositoryFile = relative => new URL(`../${relative}`, import.meta.url);

export function readContentPhase2Ledger() {
  return JSON.parse(fs.readFileSync(repositoryFile(CONTENT_PHASE2_LEDGER), 'utf8'));
}

// The current card list of a topic, or an empty list for a retired topic.
export function readCurrentTopicFile(category) {
  const file = repositoryFile(`data/${category}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
}

export function beforePhase2Change(card, change) {
  const restored = structuredClone(card);
  const locate = (dotted, requireField) => {
    const keys = dotted.split('.');
    const last = keys.pop();
    const parent = keys.reduce((node, key) => node?.[key], restored);
    if (!parent || typeof parent !== 'object' || (requireField && !Object.hasOwn(parent, last))) {
      throw new Error(`${change.id}: ${dotted} is not a field of the card`);
    }
    return [parent, last];
  };
  for (const dotted of change.addedFields || []) {
    const [parent, last] = locate(dotted, true);
    delete parent[last];
  }
  for (const [dotted, value] of Object.entries(change.previous || {})) {
    const [parent, last] = locate(dotted, true);
    parent[last] = structuredClone(value);
  }
  return restored;
}

// A topic file's cards exactly as they stood before the pass: added cards are
// taken out, edits are reversed, and removed cards are put back at their
// recorded positions. `readBank` defaults to the repository's data files.
export function bankBeforePhase2(ledger, category, readBank = readCurrentTopicFile) {
  const added = new Set(ledger.added.filter(entry => entry.category === category).map(entry => entry.id));
  const changes = new Map(ledger.changes.filter(entry => entry.category === category).map(entry => [entry.id, entry]));
  const cards = readBank(category)
    .filter(card => !added.has(card.id))
    .map(card => (changes.has(card.id) ? beforePhase2Change(card, changes.get(card.id)) : card));
  const removed = ledger.removed
    .filter(entry => entry.category === category)
    .sort((left, right) => left.position - right.position);
  for (const entry of removed) cards.splice(entry.position, 0, structuredClone(entry.card));
  return cards;
}

// The card as it stood before the pass, or undefined for a card the pass added.
export function cardBeforePhase2(ledger, id, current) {
  const removed = ledger.removed.find(entry => entry.id === id);
  if (removed) return structuredClone(removed.card);
  if (ledger.added.some(entry => entry.id === id)) return undefined;
  const change = ledger.changes.find(entry => entry.id === id);
  if (!current) throw new Error(`${id}: card is missing but was not removed by the phase-2 pass`);
  return change ? beforePhase2Change(current, change) : current;
}

// Topic files exactly as the 2026-10-25 topic merges left them, for the older
// ledgers that chain through the merge ledger.
const afterMerge = new Map();
export function readTopicFileBeforePhase2(category) {
  if (!afterMerge.has(category)) afterMerge.set(category, bankBeforePhase2(readContentPhase2Ledger(), category));
  return structuredClone(afterMerge.get(category));
}

// Ids of cards the pass removed.
export function removedByPhase2() {
  return new Set(readContentPhase2Ledger().removed.map(entry => entry.id));
}
