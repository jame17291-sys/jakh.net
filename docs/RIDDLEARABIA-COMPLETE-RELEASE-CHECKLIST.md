# Riddle Arabia complete-release checklist

This is the resumable requirement-to-evidence record for the programme requested
on 21 September 2026. It deliberately distinguishes deployed behaviour, source
inventory, automated checks, automated editorial analysis, and work that needs
real qualified people. A passing schema check or generated field is never
recorded here as a substantive editorial approval.

## Verified baseline

- **Repository:** `jame17291-sys/jakh.net`; protected remote `main` at
  `62922c2cfbebdd67c121a4d57164e028c1579d0d` when this programme branch was
  created.
- **Production check:** 21 September 2026, `https://riddlearabia.com/` returned
  HTTP 200 with `x-jakh-site-version`
  `918ede5bac83d9ea196c885773ee9ab1adc3ade986cdbd3db1d43dd19351ff62`.
- **API check:** `https://api.riddlearabia.com/api/health` returned HTTP 200,
  schema 9, 3,275 public questions in 51 categories, and 278 quarantined
  questions in five safety-sensitive categories. These are production facts,
  not approval counts.
- **Source inventory:** `data/catalog.json`,
  `scripts/audit-question-bank.mjs --strict`, and the generated audit ledger
  reconcile to 3,553 source cards in 56 categories. The source corpus has four
  legacy `reviewed` fields but zero evidence-complete programme cards;
  `docs/content-review/learning-audit-ledger.json` records the per-card state.

## Requirement status

| Requirement | Status at baseline | Evidence / implementation location | Next evidence needed |
|---|---|---|---|
| Whole-bank inventory and stable audit ledger | Implemented as a starting inventory, not a review | `scripts/generate-learning-audit-ledger.mjs`, `docs/content-review/learning-audit-ledger.json`, `scripts/audit-question-bank.mjs` | Reconcile on every content revision and attach item-specific findings. |
| Substantive bilingual review of all 3,553 cards | Not complete | `docs/content-review/evidence.json` is intentionally empty; work queue has 382 packets | Claim-level sources/proofs; bilingual, editorial, and high-stakes reviewer provenance; second review of revisions. |
| Publication eligibility on legacy, API, offline and shared routes | Partially implemented for the five safety-held categories; programme eligibility is recorded but not yet a complete new delivery mechanism | `scripts/publication-quarantine.mjs`, `worker/src/content-safety.ts`, `sw.js`, generated ledger | Central versioned eligibility for each new programme item and integration tests for all publication surfaces. |
| Three audience starts | Not implemented | Production homepage has Akshifha and discovery starts only | Implement Challenge Friends, University Essentials, and Young Explorers in both languages with non-decorative routes. |
| Six adult social collections | Not implemented | No programme collection data or routes | Publish only bounded, reviewed/self-contained activities with session and replay design. |
| Twelve university units | Not implemented | No learning unit engine/content | Implement three units for each of the four pathways with objectives, practice, application, retrieval and completion. |
| Nine children’s units | Not implemented | No band-specific learning unit engine/content | Implement age-specific content and gate every route, including no unsuitable fallback. Child/educator validation remains pending. |
| Attempt → explanation → application → later retrieval | Not implemented outside the existing Akshifha study state | `akshifha-study.js` is separate and case-focused | Add versioned guest progress, due dates, controlled-time tests, and safe account merge where supported. |
| Social invitations, rematches, co-operation, untimed play | Partial: server-authoritative Battle rooms exist | `battle-mode.js`, `worker/src/battle-room.ts`, tests | Verify two-browser flow; add missing co-operative, untimed, reconnect/rematch behaviour without presenting private links as identity. |
| Child safety and age eligibility | Partial: high-stakes quarantine and privacy controls exist | quarantine tooling, `privacy-consent.js` | Programme age policy applied to browsing, search, direct links, cached sessions and empty pools. No claims of legal compliance. |
| Consent-gated measurement | Partial: Akshifha playtest measurement exists | `akshifha.js`, `docs/AKSHIFHA-PLAYTEST.md` | Extend an opt-in event taxonomy that separates quality, enjoyment and learning; no fabricated participant/retention results. |
| User-testing protocol | Partial: Akshifha-only protocol | `docs/AKSHIFHA-PLAYTEST.md` | Bilingual adult, student, 6–8, 9–11, and 12–14 scenarios, materials and real-consent record. |
| Build, accessibility, browser and release proof | Existing release gates, rerun required after changes | `.github/workflows/api-deploy.yml`, `.github/workflows/static-site.yml` | Commit-specific automated results, production workflow receipts and live verification. |

## Resumption rules

1. Treat a content fingerprint change as reopening that card’s programme
   eligibility. Do not preserve an approval merely because the ID is stable.
2. Do not move a legacy source card into a new learning or child experience
   until the ledger says `programmeEligibility: eligible` for its current
   fingerprint. A legacy runtime projection is descriptive only.
3. New self-contained activities must have an explicit authoring provenance,
   language review state, solution/proof, age band and version. They cannot be
   presented as reviewed by a human unless a real reviewer is recorded.
4. Before production, link the generated programme manifest, tested commit,
   merged pull request, release receipt and live build identity in this file.

## Known external validation blockers

Qualified bilingual editorial review, specialist review for high-stakes source
material, and participant/parent-or-guardian/educator consent cannot be
performed or invented by this repository. They block the associated approval
and outcome claims, not the engineering, transparent audit tooling, or safe
self-contained learning mechanics.
