# Free-first content pass

Status: AI-assisted editorial draft, 2026-09-16. This is not a human-reviewed or
evidence-complete collection. All touched cards keep `review.status: pending`.
No reviewer identity, approval, accepted external evidence, or release from the
production quarantine was added or inferred.

## Scope

Thirty existing cards now have deliberately authored bilingual Quick Fire options:

| Category | Card suffixes (three digits) | Count |
| --- | --- | ---: |
| `classic-riddles` | 002, 003, 004, 005, 007, 011, 018, 019, 023, 032 | 10 |
| `math` | 001, 002, 003, 006, 007, 008, 009, 012, 018, 020 | 10 |
| `logic-puzzles` | 001, 002, 003, 006, 008, 013, 016, 017, 020, 027 | 10 |

Each `quickFire` object contains a concise bilingual `answer`, exactly three
authored bilingual `distractors`, and a bilingual `explanation`. Numeric choices
use consistent units. Every wrong choice is intended to fail a stated clue, not
merely differ from another card's answer. Where a canonical answer includes a
paragraph of explanation, a genuinely equivalent concise answer was added to
`acceptedAnswers`; the existing canonical answer was not shortened or replaced.

The tests check shape, normalized answer alignment, distinct options, unchanged
pending status, and reproducible numerical/logic calculations. These checks are
not a claim that a native-speaking editor approved the language or difficulty.

## Explicit repairs and choice clarification

- `classic-riddles-005`: keeps the teapot answer and everyday-object category,
  but replaces the English-only T/tea pun with physical-use clues that work in
  both languages. This deliberately changes the riddle mechanism; translating
  the English letter T literally did not give an Arabic reader a fair clue.
- `story-mysteries-003`: retains the 53-cards/52-identities anomaly but explicitly
  states the deck rules, excludes jokers, and asks what the duplicate proves.
  The unexplained Bicycle-brand pun and unsupported death/cheating conclusion
  were removed. The answer proves a duplicate exists, not who added it or why.
  This is a transparent adaptation of the broken story, not a claim that the
  original wording was valid or that a killing can be deduced. It remains a
  browse/reveal story, not one of the thirty short timed questions.
- `logic-puzzles-027`: specifies consecutive positive integers, excluding
  alternative answers such as three zeros that the former open wording allowed.
- `classic-riddles-023`: uses time instead of stillness as a distractor; Arabic
  “السكون” can overlap with silence and is not a reliably wrong answer.

IDs, categories, difficulty labels, and total corpus size are unchanged. Existing
saved progress may still refer to the repaired card IDs. If prior performance is
used for a future serious ranking system, content versioning should separate
results from before and after material wording changes.

## Validation and editorial limits

Run `node --test scripts/quick-fire-content.test.mjs` for content checks, then the
frontend/server authored-choice tests and complete site release checks. Regenerate
search, SEO, and editorial work-queue outputs after source edits. Do not edit
generated outputs by hand or mark this file as accepted evidence for every card.

The arithmetic checks reproduce the bat-and-ball equation, distance/time, map
scale, right angle, even power, coordinate reflection, square root, average,
change, fixed age gap, digit constraints, ratio, and consecutive-number puzzles.
They also test that the supplied numerical distractors fail those constraints.
Word/object clues still require a native Arabic read-aloud and ambiguity review.

Next editorial gate: select and review a flagship set of 100–150 questions using
the existing evidence and independent approval workflow. Before promoting a card,
a named bilingual reviewer must check clue fairness, all wrong choices, accepted
answer variants, natural Arabic, explanation quality, accessibility/read-aloud,
and realistic difficulty. Add exact supporting sources or reproducible proof
artifacts and required approvals through `evidence.json` as the existing policy
requires. This draft does not satisfy that gate and does not certify the other
3,523 cards.

Other topics remain available for free browsing. They must not silently regain
random multiple-choice options merely to enlarge the timed-game inventory.
Published question/answer changes must invalidate stale source-authored options
until the changed card has a matching authored option set.
