# Riddle Arabia learning programme state

**Programme branch:** `codex/riddlearabia-complete-program`  
**Baseline protected-main commit:** `62922c2cfbebdd67c121a4d57164e028c1579d0d`  
**Baseline reconciled:** 2026-09-21

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
| Adult social collections | Implemented as six authored bilingual challenge collections; not live multi-user rooms | Add server-authoritative invitations, co-operation, reconnect and rematch evidence before social-product claims. |
| University pathways | Implemented as 12 authored bilingual units; automated-authored only | Qualified bilingual editorial review remains required before human-reviewed claims. |
| Young Explorers 6–8, 9–11, 12–14 | Implemented as nine authored bilingual units; child/educator validation pending | Obtain safeguarding, age suitability, and educator validation before publication claims. |
| Learning/review scheduling | Implemented for guest-device progress | Add supported account merge/sync before account-level progress claims. |
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

## Programme branch implementation checkpoint

- Added `/learning` and `/ar/learn/` with three entry points: Challenge Friends,
  University Essentials, and Young Explorers.
- Added six adult Challenge Friends collections, 12 university units, and nine
  children units. These are self-contained authored activities and do not depend
  on the unreviewed 3,553-card legacy source bank.
- Added guest-device progress, honest correct/assisted outcomes, application
  before later retrieval, and a real elapsed-time due date before retrieval.
- Added contract and browser coverage for the learning journeys. Production
  deployment still requires fresh release evidence after the remaining blockers
  are intentionally accepted or completed.

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
