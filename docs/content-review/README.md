# Content evidence and review closure

This directory is the editorial workbench for the 3,553-card corpus. It is intentionally separate from the public card JSON. Adding candidate evidence does not change a card from `pending` to `reviewed`, and the generator never promotes a status.

## Files

- `evidence.json` is the human-maintained evidence and approval record. It starts empty because the existing four legacy reviews do not yet have claim-level evidence, precise locators, rostered approvals, and the other proof required by the closure gate.
- `work-queue.json` is generated. It divides the corpus into exactly 382 category/subcategory discovery packets and shows each card's current blockers.
- `production-quarantine.json` is the generated, exact production-publication hold. It currently names 278 card IDs in five complete safety-sensitive categories. The static build validates this file against the editorial sources and emits a 51-category/3,275-card public projection; it does not delete or rewrite the 3,553-card editorial corpus.
- `proof/` is the declared root for reproducible proof artifacts referenced by accepted `proof` evidence. Store the repository-relative artifact path, SHA-256 digest, and reproduction method in `evidence.json`. The validator rejects traversal, symbolic links, directories, missing/unreadable artifacts, and digests that do not match the file's actual bytes.

Regenerate or verify the queue with:

```sh
node scripts/generate-content-review-work-queue.mjs
node scripts/generate-content-review-work-queue.mjs --check
node scripts/generate-production-quarantine.mjs --check
```

Do not edit the quarantine manifest by hand. Removing a card or category from
the production hold requires the qualified evidence and independent review
described below, followed by an intentional generator/policy change and the
full release gates. Until then, public HTML, data, search, card-index, API, edge,
and offline surfaces must all treat the manifest as authoritative.

This is a runtime-publication boundary for `jakh.net`, `api.jakh.net`, and their
generated deployment artifacts; it is not a claim that the source corpus is
globally private or retracted. This repository is currently public, so the full
corpus remains exposed through the GitHub repository, raw-content URLs, commit
history, and any existing forks, caches, or copies. A runtime release cannot
recall those copies. Reducing that separate exposure requires an owner-approved
GitHub history and repository-governance response with its own preservation and
rollback plan.

## Evidence workflow

1. Work one packet at a time for source discovery. A topic-level authority may accelerate discovery within that packet, but reuse is not automatic.
2. Decompose every card into atomic bilingual claims. Map every claim to accepted evidence, and map the evidence back to the claim.
3. For each accepted external source, record the authority, HTTPS URL (or a canonical-work identifier), precise page/section/record locator, access date, and source version date or label. A bare homepage or topic-level URL is not sufficient.
4. Use `candidate` while a source is being assessed. Change it to `accepted` only when the exact locator supports the exact claim. Candidate evidence never satisfies completion.
5. For calculations, puzzles, or other reproducible facts, an accepted proof artifact may be appropriate. It needs a path below the declared `docs/content-review/proof/` root, the SHA-256 digest of its actual bytes, a method, and reciprocal claim mappings. Keep proof artifacts as regular files; symlinks are deliberately rejected.
6. Record a stable/mutable assessment. Mutable claims need `validAsOf` and `reviewDueAt`; they reopen automatically after the due date.
7. Obtain bilingual-equivalence approval and final editorial approval from declared reviewers. Every high-stakes card also requires independent sign-off from a subject-matter expert whose verified qualification matches the card's domain.
8. Only after the evidence record is complete should the public card's legacy `review.status` be deliberately changed to `reviewed` with its dated source summary. The tools do not do this automatically.

## Gates

The routine structural check remains usable while editorial work is in progress:

```sh
node scripts/content-review-report.mjs --check
```

The closure gate is deliberately strict and currently fails. It succeeds only with exactly 3,553/3,553 reviewed and evidence-complete cards, including 278/278 high-stakes cards, with zero pending, invalid, stale, or overdue records:

```sh
node scripts/content-review-report.mjs --complete
```

Do not add the strict gate to a deployment workflow until the editorial queue is genuinely complete.
