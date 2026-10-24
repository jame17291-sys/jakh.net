// Restores the values recorded before the 2026-10-24 card polish pass, so older
// content ledgers can keep verifying their whole-card fingerprints. Each change
// stores the previous value of every field it touched under a dotted path
// (for example "question.ar" or "tvQuiz.distractors.ar").
export const CARD_POLISH_LEDGER = 'docs/content-review/card-polish-2026-10-24.json';

export function beforeCardPolish(card, change) {
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
