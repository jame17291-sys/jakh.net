# Featured editorial reconciliation — 18 September 2026

This Riddle Arabia reconciliation keeps the current eight-card public
collections and their current descriptions. It does not certify any fact,
change any card's `pending` review status, or alter the safety quarantine.

- Sixteen Spacetoon questions already contain their series names in both
  languages; no newer wording was overwritten.
- Seven remaining clarity edits were applied: five classic riddles, one
  children’s riddle, and the snail explanation.
- The Riddle Arabia Spacetoon selection replaced held `ayt-007` with
  unheld `ayt-009`. The football collection is not part of the current Riddle
  Arabia SEO selection, so `football-024` to `football-108` required no
  selection change; the hold remains enforced for any future selection.
- `content-review-featured.mjs` validates the current featured selections,
  bilingual fields, declared topic coverage, duplicates, and editorial holds.
  It is structural only and never promotes a review status.

Run `npm run check:featured` and
`node --test scripts/content-review-featured.test.mjs` with the normal
release checks.
