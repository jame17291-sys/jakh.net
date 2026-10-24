// Restores cards as they stood before the 2026-10-25 card audit, so older
// content ledgers can keep verifying their whole-card fingerprints. Each change
// stores the previous value of every field it touched under a dotted path
// (for example "question.ar" or "tvQuiz.distractors.ar"); each removed card is
// stored in full with its original position in its topic file.
export const CARD_AUDIT_LEDGER = 'docs/content-review/card-audit-2026-10-25.json';

export function beforeCardAudit(card, change) {
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

// The card before the audit: the recorded full card if the audit removed it,
// otherwise the current card with any audit edit reversed. `current` may be
// undefined only for a removed card.
export function cardBeforeAudit(ledger, id, current) {
  const removed = ledger.removed.find(entry => entry.id === id);
  if (removed) return structuredClone(removed.card);
  const change = ledger.changes.find(entry => entry.id === id);
  if (!current) throw new Error(`${id}: card is missing but was not removed by the audit`);
  return change ? beforeCardAudit(current, change) : current;
}

// A topic file's card list as it stood before the audit (removed cards put back
// at their recorded positions; edits are not reversed here).
export function idsBeforeAudit(ledger, category, currentIds) {
  const ids = [...currentIds];
  const removed = ledger.removed
    .filter(entry => entry.category === category)
    .sort((left, right) => left.position - right.position);
  for (const entry of removed) ids.splice(entry.position, 0, entry.id);
  return ids;
}
