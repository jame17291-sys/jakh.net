// Reverses the 2026-10-25 Spacetoon and kids-riddles additions so the older
// content ledgers keep verifying their whole-card fingerprints and topic-file
// positions.
//
// The owner added Detective Conan and three more series to Spacetoon Classics
// (shown first in the topic, so their cards lead its topic file) and ten kids
// riddles (appended to their topic file). Each changed card stores the previous
// value of every field it touched under a dotted path ("question.ar",
// "difficulty"); each added card is recorded in full with its position.
import fs from 'node:fs';

export const CONTENT_ADDITIONS_LEDGER = 'docs/content-review/content-additions-2026-10-25.json';

const repositoryFile = relative => new URL(`../${relative}`, import.meta.url);

let cachedLedger;
export function readContentAdditionsLedger() {
  cachedLedger ||= JSON.parse(fs.readFileSync(repositoryFile(CONTENT_ADDITIONS_LEDGER), 'utf8'));
  return cachedLedger;
}

// The current card list of a topic, or an empty list for a retired topic.
export function readTopicFile(category) {
  const file = repositoryFile(`data/${category}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
}

export function beforeAdditionsChange(card, change) {
  const restored = structuredClone(card);
  for (const [dotted, value] of Object.entries(change.previous || {})) {
    const keys = dotted.split('.');
    const last = keys.pop();
    const parent = keys.reduce((node, key) => node?.[key], restored);
    if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, last)) {
      throw new Error(`${change.id}: ${dotted} is not a field of the card`);
    }
    parent[last] = structuredClone(value);
  }
  return restored;
}

// A topic file's cards exactly as they stood before the additions: added cards
// are taken out and edits are reversed. `readBank` defaults to the data files.
export function bankBeforeAdditions(ledger, category, readBank = readTopicFile) {
  const added = new Set(ledger.added.filter(entry => entry.category === category).map(entry => entry.id));
  const changes = new Map(ledger.changes.filter(entry => entry.category === category).map(entry => [entry.id, entry]));
  return readBank(category)
    .filter(card => !added.has(card.id))
    .map(card => (changes.has(card.id) ? beforeAdditionsChange(card, changes.get(card.id)) : card));
}

// Topic files as the 2026-10-25 phase-2 content pass left them, for the older
// ledgers that chain through the phase-2 ledger.
const afterPhase2 = new Map();
export function readTopicFileBeforeAdditions(category) {
  if (!afterPhase2.has(category)) afterPhase2.set(category, bankBeforeAdditions(readContentAdditionsLedger(), category));
  return structuredClone(afterPhase2.get(category));
}

// A topic's catalog description before the additions, or the current one when
// the additions did not change it.
export function descriptionBeforeAdditions(slug, current) {
  const change = readContentAdditionsLedger().descriptionChanges.find(entry => entry.slug === slug);
  return change ? structuredClone(change.previous) : current;
}
