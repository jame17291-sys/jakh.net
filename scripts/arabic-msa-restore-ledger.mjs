// Reverses the 2026-10-25 return to Modern Standard Arabic, so older content
// ledgers can keep verifying their whole-card fingerprints.
//
// On 2026-10-25 the owner reversed the 2026-10-21 everyday-Arabic experiment.
// Cards whose wording was unchanged since then got their earlier Modern
// Standard Arabic text back from docs/content-review/arabic-everyday-2026-10-21.json;
// the rest were rewritten by hand. Each change stores the previous value of
// every field it touched under a dotted path (for example "question.ar" or
// "tvQuiz.contentKey"). Card order, ids and every other field are unchanged.
import fs from 'node:fs';
import { readTopicFileBeforePhase2 } from './content-phase2-ledger.mjs';

export const ARABIC_MSA_RESTORE_LEDGER = 'docs/content-review/arabic-msa-restore-2026-10-25.json';

const repositoryFile = relative => new URL(`../${relative}`, import.meta.url);

let cachedLedger;
export function readArabicMsaRestoreLedger() {
  cachedLedger ||= JSON.parse(fs.readFileSync(repositoryFile(ARABIC_MSA_RESTORE_LEDGER), 'utf8'));
  return cachedLedger;
}

export function beforeMsaRestore(card, change) {
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

// A topic file's cards exactly as they stood before the Modern Standard Arabic
// restore (same cards, same order). Pass it as the `readBank` argument of
// bankBeforeMerge() to walk further back through the older ledgers. The later
// 2026-10-25 phase-2 content pass is reversed first, from its own ledger.
export function bankBeforeMsaRestore(category, ledger = readArabicMsaRestoreLedger()) {
  const changes = new Map(ledger.changes.filter(change => change.category === category).map(change => [change.id, change]));
  return readTopicFileBeforePhase2(category).map(card => (changes.has(card.id) ? beforeMsaRestore(card, changes.get(card.id)) : card));
}

// Typography applied to a restored question so it follows the current style
// guide: Arabic question mark, «» instead of straight quotes (an apostrophe
// inside a Latin word such as I'll or n'est is kept), and Western digits when
// the rest of the card already uses them. Each restored change lists the steps
// it needed under `typography`.
export const TYPOGRAPHY_STEPS = ['question-mark', 'quotes', 'digits'];

export function arabicTypography(text, steps = TYPOGRAPHY_STEPS) {
  let value = text;
  if (steps.includes('question-mark')) value = value.replace(/\?/gu, '؟');
  if (steps.includes('quotes')) {
    const APOSTROPHE = '\u0000';
    value = value.replace(/(?<=[A-Za-z])'(?=[A-Za-z])/gu, APOSTROPHE)
      .replace(/'([^'\n]+?)'/gu, '«$1»')
      .replace(/"([^"\n]+?)"/gu, '«$1»')
      .replaceAll(APOSTROPHE, '\'');
  }
  if (steps.includes('digits')) value = value.replace(/[٠-٩]/gu, digit => String(digit.charCodeAt(0) - 0x0660));
  return value;
}
