# Riddle Arabia learning programme state

**Programme branch:** `codex/riddlearabia-learning-program`  
**Baseline protected-main commit:** `47cfb8d81b714c7a81f3827689c0b26c82bf0df6`  
**Baseline reconciled:** 2026-09-18

This is the durable execution record for the adult social, university, and
children's learning programme. It is deliberately separate from the public
runtime: a card appearing in the legacy projection is not an assertion that it
is factually approved for a learning experience.

## Reconciled inventory

| Inventory | Count | Evidence |
|---|---:|---|
| Source cards | 3,553 | `audit-question-bank --strict` |
| Categories | 56 | `data/catalog.json` |
| Review packets | 382 | generated `work-queue.json` |
| Legacy review-status `reviewed` | 4 | content-review report |
| Evidence-complete cards | 0 | content-review report |
| High-stakes source cards | 278 | five safety-sensitive categories |
| High-stakes evidence-complete cards | 0 | content-review report |
| Current legacy runtime projection | 3,275 | generated production quarantine |
| Current runtime-quarantined cards | 278 | generated production quarantine |

The complete machine-readable, per-card starting ledger is
[`learning-audit-ledger.json`](content-review/learning-audit-ledger.json). It
records a content hash, classification, audience/prerequisite/objective and
defect states, evidence, review-language/formats/reviewer/date fields,
uncertainty, disposition, and the difference between current runtime visibility
and programme publication eligibility. It is generated from the source corpus
and the stricter evidence store; it does not manufacture approvals.

## Execution status

| Workstream | Status | Next executable action |
|---|---|---|
| Per-card substantive bilingual review | Not started | Complete claim-level source/proof mapping and qualified review packet by packet. |
| Publication eligibility | Blocked by review evidence | Keep all programme placements held until a card is evidence-complete. |
| Adult social collections | Not yet implemented | Design only from eligible, age-appropriate cards after review. |
| University pathways | Not yet implemented | Map three-plus-unit pathways from eligible material, with diagnostics and retrieval. |
| Young Explorers 6–8, 9–11, 12–14 | Blocked by content and child-safety validation | Obtain safeguarding, age suitability, and educator validation before publication. |
| Learning/review scheduling | Not yet implemented | Define only after units and eligible content exist. |
| Private challenges/rematches/co-operation | Not yet implemented | Threat-model exposure/fairness and preserve current account controls. |
| Consent-gated measurement | Akshifha-only baseline exists | Extend only with approved event taxonomy; no retention or learning-gain claims. |
| Human evaluation | Not started | Recruit only after bilingual, parental/guardian, and educator consent materials are approved. |

## Non-negotiable publication boundary

For this programme, a card is eligible only after its ledger has claim-mapped
accepted evidence, dated bilingual-equivalence approval, final editorial
approval, and—when high-stakes—an independently qualified subject-matter
sign-off. Existing legacy visibility is recorded for migration planning only.
No automated test, source heuristic, or AI pass changes that status.

## Batch 0 results

- Regenerated the stale 382-packet work queue from the current source corpus.
- Added the deterministic complete per-card programme ledger generator and its
  initial 3,553-record output.
- Ran `node scripts/content-review-report.mjs --check`,
  `node scripts/generate-content-review-work-queue.mjs --check`, and
  `node scripts/audit-question-bank.mjs --strict` successfully.
- Inspected the protected API/static workflow requirements. The prior
  Riddle Arabia release remains separately waiting for GitHub production
  approval; see the deployment blocker below.

## External dependencies and truthful limits

The programme cannot claim factual verification, Arabic equivalence, age
suitability, parental consent, educator validation, learning effectiveness, or
retention until the corresponding qualified people and research are real and
recorded. These dependencies block those claims and the release decisions that
depend on them, not the integrity tooling and other safe implementation work.

## Deployment status for the already-merged Akshifha release

Commit `47cfb8d81b714c7a81f3827689c0b26c82bf0df6` is on protected `main`.
Its API compatibility release completed successfully. The static release
([run 35324786965](https://github.com/jame17291-sys/jakh.net/actions/runs/35324786965))
passed source, browser, accessibility, artifact, rollback-target, and same-commit
API gates, then failed during Worker-route deployment. Cloudflare accepted the
upload but returned authentication error `10000` for the production zone's
`workers/routes` endpoint. The workflow executed its rollback/receipt path;
this is not a live deployment.

The owner must replace the protected `production` environment secret
`CLOUDFLARE_STATIC_SITE_API_TOKEN` with a token scoped to the configured
Cloudflare account and production zones, including **Account → Workers Scripts:
Edit** and **Zone → Workers Routes: Edit**. After that secret is corrected,
rerun the failed static release from the same protected-main commit.
`domain_cutover` remains `false`.
