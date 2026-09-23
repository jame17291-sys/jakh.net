# Mind Lab question-bank remediation

Completed locally on 23 September 2026. Not published to production.

## Result

- All 1,241 findings from the bilingual question-by-question audit have corresponding content fixes.
- 1,257 questions changed: the 1,241 flagged records plus 16 consistency corrections.
- All 3,275 public question IDs and all 51 topic counts are preserved. The remaining 2,018 records are unchanged.
- The five quarantined categories, containing 278 additional source records, remain quarantined and unchanged.

This is an editorial repair pass, not a claim that every fact has been independently source-certified or approved by a human subject expert. Existing review status is not promoted by these changes. Where a previously approved record changed, its approval was reset to pending.

## What changed

Broken bilingual wordplay was replaced with clues that work in both languages. Ambiguous questions now specify the assumptions needed for their answers. Uncertain, time-sensitive or misleading premises were either bounded and clarified or replaced with more stable questions. Off-topic entries were rewritten in their existing category, rather than moving their IDs.

Relationships now contains practical listening, boundary, repair and shared-decision tasks with explicit criteria. Its format mixes choices with classification, sequencing and short applied answers. These are not diagnoses or universal prescriptions for relationships.

Story Mysteries retains its game-master format. Rewritten stories have coherent fictional explanations; the category explicitly distinguishes an intended backstory from a uniquely proved deduction. Unsupported legal/medical conclusions and contradictory twists were removed or replaced.

Difficulty labels, subtopics, Arabic names and short-answer aliases were corrected. All 30 authored Quick Fire sets remain intact and aligned. The twelve-ball puzzle now has a complete three-weighing solution; the Truth/Lie/Random puzzle has a complete three-question procedure.

Question counts were not inflated. Smaller 30–40-question topics remain starter collections, not exhaustive coverage of their subjects. The original audit's expansion recommendations remain a separate editorial backlog.

## Implementation and verification

The machine-readable `mindlab-remediation-2026-09-23.json` records each ID, its original finding, resolution, changed fields, source links where supplied, and before/after hashes. Additional QA history is retained for questions revised in more than one pass.

The application script validates all targeted records before writing any category and refuses unknown concurrent edits. It is idempotent:

```sh
node scripts/apply-mindlab-remediation.mjs --check
```

Verification completed:

- 303 automated tests passed: 192 existing contracts, 6 remediation tests, 78 game tests and 27 static-site/build tests.
- All 24 heavy/light cases of the twelve-ball solution and all Truth/Lie/Random assignments were enumerated successfully.
- Strict duplicate audit: no exact duplicates and no unresolved semantic candidates. Twenty flagged pairs were individually distinguished by their actual learning task; the genuinely duplicated bridge question was replaced.
- Bilingual, static, SEO, source-integrity, featured-selection, production-hygiene and performance checks passed.
- Catalog, bilingual search indexes, server card index, localized pages and audit ledger were regenerated. The static build preserves the 51-topic/3,275-question public projection and quarantine restrictions.

Independent second-pass reviewers checked 100 substantive science edits, 53 culture edits and 25 world-topic edits, plus the main authored revisions and complex logic answers. The main reviewer also reread all 40 rewritten stories. These additional samples do not imply independent source verification of every remaining claim.

No browser/device smoke test, remote database write, production deployment, push or pull request was performed.

## Publishing

The local branch is `codex/mindlab-question-quality`. Use the existing guarded release workflow for deployment, including its required API/static compatibility and browser checks. The runtime can apply published content overrides over the static bank; those overrides must be checked during release so old overrides do not mask the corrections. Do not bulk-import the bank into a live database without reviewing that publication path.

The reusable patch and public data bundle are delivery artifacts, not proof of a live release. The untouched original checkout is separate from this working copy.
