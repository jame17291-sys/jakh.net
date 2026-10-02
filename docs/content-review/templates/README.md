# Starting a content evidence record

[`evidence-candidate.json`](evidence-candidate.json) shows the version 1 evidence
store's reviewer, card, bilingual claim, source, and reciprocal mapping fields.
It is an illustration for source discovery, not a review or an approval. The
review tools read only `docs/content-review/evidence.json`; they do not import
this directory. No candidate, placeholder, or successful structural check is
proof that a card is correct, evidence-complete, or ready to leave quarantine.

The live evidence store already exists. Preserve its human-authored records.
Do not copy this entire template over it, run the initialization script to
reset reviews, or bulk-mark cards as reviewed. Add or amend one real reviewer
and one real card record at a time through an editorial PR.

## 1. Choose a real packet and card

Use `work-queue.json` to choose a category/subcategory packet, then read the
original card in `data/<category>.json`. Replace
`REPLACE_WITH_EXISTING_CARD_ID` with that card's exact `id`. Unknown card IDs
are rejected by the structural check. There is no extra `cardId`,
`categorySlug`, or card-level `status` field inside an evidence record: its
object key identifies the card and its category comes from the corpus.

The current corpus contains 4,103 cards. The 278 cards in `survival` (40),
`law-middle-east` (48), `medical-questions` (100), `pharmacy` (50), and
`economics-and-finance` (40) remain subject to the production hold.
Regeneration does not authorize release from that hold.

## 2. Register actual reviewers

Replace `REPLACE_WITH_REAL_REVIEWER_ID` with a stable reviewer identifier and
`displayName` with the actual reviewer's name. Set `roles` to roles they really
perform. Supported approval checks use these role names:

| Role | Used for |
| --- | --- |
| `fact-checker` or `editor` | Dated stable/mutable assessment |
| `bilingual-reviewer` | English/Arabic equivalence approval |
| `editor` | Final editorial approval |
| `subject-matter-expert` | Qualified independent high-stakes sign-off |

The candidate template includes only `fact-checker` and an empty
`qualifications` array. It deliberately claims no verified expertise.
For a subject-matter expert, add qualifications only after verifying them.
Each qualification has exactly `domain`, `credential`, `verifiedBy`, and
`verifiedAt`. The domain is the applicable category slug, the credential
identifies the actual qualification, `verifiedBy` identifies who checked it,
and `verifiedAt` is that verification's real `YYYY-MM-DD` date. A high-stakes
sign-off must match both the recorded domain and credential.

Do not insert email addresses or unrelated personal details; the roster
contract permits only `displayName`, `roles`, and `qualifications`.

## 3. Map atomic bilingual claims to candidate sources

Replace both claim texts with the same exact factual proposition or riddle
mechanism in natural English and Modern Standard Arabic. Apply the
[`ARABIC-STYLE-GUIDE.md`](../ARABIC-STYLE-GUIDE.md) and split compound claims into
separate records. Each claim has a unique `id`, `text` containing only `en`
and `ar`, and `evidenceIds`.

Each source has a unique `id`, `type`, `status`, and `claimIds`.
Keep mappings reciprocal: if claim `claim-1` lists `source-1`, that source
must list `claim-1`. One topic-wide URL without an exact supporting locator
does not prove every claim in a packet.

Keep `status: candidate` during assessment. Replace the template's title,
publisher, and locator placeholders with actual source information. Add only
fields you can substantiate; omit unknown fields rather than using `null`,
empty strings, invented dates, or fake URLs. Candidate sources can remain
incomplete without pretending to satisfy closure.

The allowed source types are `web`, `dataset`, `canonical-work`, and `proof`.
For an accepted external source, record:

| Field | Required evidence |
| --- | --- |
| `title` | Exact source title |
| `publisher` | Responsible authority or publisher |
| `url` | Absolute HTTPS URL; a canonical work may instead use `bibliographicId` |
| `locator` | Object with an allowed `kind` and precise, nonempty `value` |
| `accessedAt` | Real date the source was examined, as `YYYY-MM-DD` |
| `versionDate` or `versionLabel` | Identifiable source edition/version |
| `claimIds` | Nonempty list of the exact claims this source supports |

Locator kinds are `article`, `chapter`, `entry`, `equation`, `figure`, `page`,
`paragraph`, `query`, `record`, `section`, `table`, `theorem`, and `timestamp`.
Only change `candidate` to `accepted` after a reviewer assesses the actual
source and exact claim-supporting locator. Schema validation cannot make
that factual judgment for them.

For reproducible proof, use `type: proof`. Accepted proof needs a regular
file under `docs/content-review/proof/`, its repository-relative
`artifactPath`, a lowercase SHA-256 `artifactSha256` matching the actual
bytes, a reproducible `method`, and reciprocal claim mappings. Traversal,
symlinks, directories, missing files, and mismatched digests fail validation.

## 4. Record assessments and signatures after the work

The template omits assessments and approvals because they have not happened.
An omitted approval means pending. Do not put `approved: false`, a pending
approval object, a placeholder signature, or a guessed date in the live
store: the schema permits only genuine completed approval objects.

Add `mutabilityAssessment` after an `editor` or `fact-checker` assesses the
claim. It contains `status` (`stable` or `mutable`), `reviewerId`, `reviewedAt`,
and a nonempty array of `reasons`. Mutable records additionally need
`validAsOf` and `reviewDueAt`; the due date cannot precede the valid-as-of
date. Review becomes incomplete when its due date passes.

For actual approvals, use these exact fields:

| Record | Fields |
| --- | --- |
| `bilingualApproval` | `status: approved`, rostered `reviewerId`, real `reviewedAt`, `englishArabicEquivalent: true` |
| `finalApproval` | `status: approved`, rostered `reviewerId`, real `reviewedAt` |
| `highStakesSignoff` | `status: approved`, qualified expert `reviewerId`, real `reviewedAt`, matching `domain` and `qualification`, `independenceAttested: true` |

An approval's reviewer must hold the corresponding role. Final approval must
not predate the evidence or earlier review inputs, and future dates do not
close review. The high-stakes signer must have the verified applicable
qualification and provide independent review; do not attest independence
without performing that review.

Only after substantive review, accepted claim evidence, required assessments,
bilingual review, and final approval are complete should an editor separately
change the original card's legacy `review.status` to `reviewed` and record its
dated source summary. The generator never performs that promotion.

## 5. Check the record without changing publication

From the repository root:

```sh
node scripts/content-review-report.mjs --check
node scripts/generate-content-review-work-queue.mjs --check
node scripts/generate-learning-audit-ledger.mjs --check
node scripts/generate-production-quarantine.mjs --check
```

The first command verifies the store's schema, real card IDs, mappings,
source details, qualifications, and dates. Passing it permits incomplete
candidate records; it does not certify completion. If an editorial PR adds
or changes evidence, regenerate the work queue and audit ledger intentionally
and review their diff before committing them. Do not edit the production
quarantine manifest by hand.

```sh
node scripts/content-review-report.mjs --complete
```

This strict read-only closure gate currently fails: 3/4,103 cards carry
legacy reviewed status, 0/4,103 are evidence-complete, and 0/278 high-stakes
cards are reviewed. It succeeds only after every card legitimately meets
the existing closure requirements. The scaffold changes neither those gates
nor the 278-card production hold. Release from the hold also requires the
intentional policy/generator change and full release gates described in the
[parent workflow](../README.md).
