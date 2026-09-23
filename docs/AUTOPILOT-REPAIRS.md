# Deterministic Autopilot repairs

Version 1 regenerates approved derived files using the generators already reviewed on the trusted main commit. It does not use an AI model or a paid API. It does not rewrite questions, answers, authored layouts, JavaScript, tests, workflows, API code or credentials. A finding outside this scope is reported for review, not repaired automatically.

## Command contract

Run the entrypoint from the **trusted base checkout**, never from an unverified candidate:

```sh
node /trusted/scripts/autopilot-repairs.mjs check --repo /candidate --base FULL_BASE_SHA --report /tmp/autopilot-check.json
node /trusted/scripts/autopilot-repairs.mjs repair --repo /candidate --base FULL_BASE_SHA --report /tmp/autopilot-repair.json
node /trusted/scripts/autopilot-repairs.mjs verify --repo /candidate --base FULL_BASE_SHA --report /tmp/autopilot-verify.json
```

`--base` must be a complete 40-character SHA that the orchestrator has independently established as trusted main. Check and repair require a clean checkout whose HEAD is exactly this SHA. They include untracked files when checking cleanliness. Report files must be outside the repository so that telemetry cannot enter a release commit.

`check` generates in a disposable directory and leaves the checkout untouched. It returns `clean` or `repairable`. `repair` applies the complete verified bundle and returns `clean` or `repaired`. `verify` independently reproduces the base generators and returns `clean` or `verified` only when the complete candidate tree is an exact match.

Before staging, verify the working tree. After committing, use `verify --candidate FULL_CANDIDATE_SHA`. Committed candidates must descend from the base. Working-tree verification refuses staged differences because a staged index can contain different bytes from the files being inspected.

All successful states exit 0. A generator error, dirty checkout, prohibited edit, unexpected output, non-determinism or mismatch produces `status: "blocked"` and exits 1. Unknown, incomplete or duplicate flags also fail. Every mode prints one JSON report; `--report` additionally writes the same report to the named file. The report includes `schemaVersion`, `policyVersion`, `mode`, `status`, `baseSha`, `candidateSha`, `changedFiles`, `bundleSha256`, `beforeTreeSha256`, `afterTreeSha256`, bounded `generators` summaries, and `blockedReasons`. Changed files contain path, operation, old/new modes, before/after SHA-256 and resulting byte size, not their contents.

## Reviewed repair scope

The policy enumerates exact outputs for the current 56 categories, eight bilingual SEO experience pairs, shared Arabic routes, category illustrations, sitemap, search shards and catalog projection. There are no directory-wide wildcards. New categories or output types require a human-reviewed policy update.

Generators run in this order:

1. `sync-catalog.mjs`
2. `generate-riddlearabia-seo.mjs`
3. `generate-arabic-routes.mjs`
4. `generate-search-index.mjs`
5. `generate-category-art.mjs`

The public `generate-seo-pages.mjs` wrapper also rewrites headers in authored source pages, so this repair engine deliberately calls the dedicated SEO generator directly. The catalog contains both source labels and derived metadata; its authored portion is separately checked for equality, in addition to exact regeneration from the trusted base.

One repair bundle may contain multiple dependent outputs. The entire bundle must reproduce exactly, remain within 250 files and 12 MiB of changed output, and reach an unchanged second generation pass. File removals, renames, symlinks, submodules and mode changes are forbidden. Existing executable HTML retains its existing mode; new outputs must be non-executable regular files.

## Trust boundaries

The orchestrator must pin the verifier and policy to the trusted base, independently establish that base is protected main, enforce the daily release limit, run all required validation, and control publication. This module has no GitHub or deployment capability and creates no commits. A passing report is evidence for the release gate, not permission to skip it.

Candidate scripts are never executed. Base and candidate Git trees are extracted separately and checked against every committed blob, including modes. `export-ignore` and `export-subst` cannot conceal changes. Git replacement objects, external diff/text conversion and filesystem-monitor hooks are disabled for inspection. Approved generator processes receive a minimal environment without inherited access tokens or Node startup options. They are trusted code, not an operating-system sandbox.

Repair checks cleanliness again immediately before writing. Writes occur only after policy and reproducibility checks; a write failure restores the prior files. No intermediate output is published. The orchestrator should discard its ephemeral checkout on any failure.

## Tests

```sh
node --test scripts/autopilot-policy.test.mjs scripts/autopilot-repairs.test.mjs
```

Tests cover read-only diagnosis, restoration of missing output, exact committed/worktree verification, source and workflow injection, arbitrary Arabic paths, tampered generated output, staged discrepancies, deletions, symlinks, mode changes, dirty checkout refusal, candidate-code execution prevention, non-deterministic generators, Git archive hiding, CLI validation, and a real-repository stale Arabic page/search-index repair.
