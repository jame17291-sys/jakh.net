# Production deployment readiness and safety checklist

Use this runbook for releases of **jame17291-sys/jakh.net** to
**https://riddlearabia.com** and **https://api.riddlearabia.com**.
It covers release preparation, API compatibility, conditional D1 migration,
the static site, and monitoring and recovery.

This document does not authorize a deployment, migration, rollback, or restore.
The workflow-dispatch examples are for a separately approved future release.
Creating or reviewing these documentation PRs requires no manual workflow run.

Commands assume the repository root, Node.js 24, an authenticated GitHub CLI,
and the permissions appropriate to the operation.
Never place credentials, authenticator codes, recovery codes, database exports,
or encryption keys in a PR, issue, terminal transcript, or release summary.

## Release contracts and current baseline

The workflows and their validators are the authoritative release contracts.
Recheck them at the selected commit before following this checklist.
An older receipt proves its recorded run; it does not establish current health.

| Component | Contract | Required evidence |
| --- | --- | --- |
| Source | Protected `main`, current tip, reviewed changes | Full commit SHA and required checks |
| API | `api-deploy.yml`, `release_phase` | Active Worker, health, D1 state, exact source annotation |
| Static site | `static-site.yml`, exact confirmation | Build manifest, active version, smoke and runtime proof |
| Static/API continuity | `static-api-release-gate.mjs` | Matching source SHA before and after site deployment |
| Editorial governance | `content-review-report.mjs --check` | Valid records, honest progress, quarantine unchanged |
| D1 recovery | `d1-backup.mjs`, recovery runbook | Tested encrypted export, authorization, bookmarks |
| Daily maintenance | `site-autopilot.yml` | Run-bound `daily-report.json`, explicit publishing mode |

At the source baseline used to write this checklist:

`ba2334d04c8c338bbe6a3c73070a163de08403b2` (recompute for later releases).

- The API is `jakh-api` version **1.5.0**.
- Its target schema is **10**; declared compatible schemas are **8, 9, 10**.
- The static production gate currently requires final API schema **10**.
- Registration, account recovery, account deletion, content studio, and admin MFA
  must all be ready for the final API/static release.
- The source corpus contains **4,103 cards**, including **278 quarantined cards**.
- The public question projection contains **3,825 cards**.
- Editorial progress is **3/4,103 reviewed**, **0/4,103 evidence-complete**, and
  **0/278 high-stakes reviewed**, with no evidence-validation errors.

These numbers describe this commit, not permanent targets.
Recompute editorial and publication state for every candidate.
A passing structural check does not mean the content has completed review.
Do not lift the safety quarantine or claim complete editorial verification.

The canonical static host is `riddlearabia.com`.
`www.riddlearabia.com`, `jakh.net`, and `www.jakh.net` normalize to it.
The legacy API host `api.jakh.net` remains a compatible API endpoint on the
same Worker; it is not a static-host redirect.
Normal releases keep `domain_cutover=false`.
DNS and hostname cutovers require their own reviewed procedure.

## Phase 0: Verify existing authorization and protection

This is a verification step, not an instruction to replace branch rules.
Protection already exists; confirm it still enforces the intended policy.

### 0.1 Record the candidate and operator

Record the change reference, release owner, reviewing operator, UTC window,
full source SHA, intended scope, and the rollback operator.
State whether the change is code-only or includes new D1 migrations.
Leave automatic-maintenance reservation inputs empty for a manual release.

Read the candidate and current protected-main identity:

```sh
git status --porcelain
git rev-parse HEAD
gh api repos/jame17291-sys/jakh.net/branches/main \
  --jq '{name, protected, sha: .commit.sha}'
```

The checkout must be clean and its SHA must be the approved current `main` tip
before a production workflow is dispatched.
Do not deploy a feature branch or pass an arbitrary historical SHA.
The workflows repeat this check and reject a stale dispatched commit.

### 0.2 Confirm required checks and approvals

```sh
gh api repos/jame17291-sys/jakh.net/branches/main/protection \
  --jq '{required_status_checks, required_pull_request_reviews,
         enforce_admins, allow_force_pushes, allow_deletions}'
gh api repos/jame17291-sys/jakh.net/environments/production \
  --jq '{name, protection_rules, deployment_branch_policy}'
```

Verify the applicable required checks, including `validate` and
`Browser regression`, passed on the reviewed PR head.
Confirm required reviews and protected-branch restrictions remain in force.
The manual `production` environment must require an approving reviewer.
Inspect actual PR approvals for the exact reviewed head separately.
The safety helper checks the pull-request policy configuration object; its
presence is not evidence that any particular PR has received approval.
An HTTP 403 means the caller cannot inspect the setting; obtain evidence from
an authorized owner instead of interpreting it as protection being absent.

### 0.3 Confirm the single deployment owner

API and static production releases use their protected GitHub workflows.
Cloudflare Workers Builds for `jakh-api` must remain validation-only:

- Repository root: `/worker`.
- Production branch: `main`.
- Build command: `npm run check`.
- Deploy command: `npx wrangler deploy --dry-run`.

The static Worker must not have a competing repository deployment pipeline.
If another pipeline creates a Worker version or removes source annotations,
stop and resolve ownership before relying on any earlier compatibility proof.
Do not bypass the exact-source gate to accommodate a competing deployment.

### Phase 0 exit criteria

- [ ] Candidate, scope, operator, UTC window, and change reference recorded.
- [ ] Existing branch protection and required checks verified.
- [ ] Production environment reviewer and protected-branch policy verified.
- [ ] No competing deployment or database operation is active.
- [ ] Release authorization covers the actual code and any schema change.

## Phase 1: Validate the complete candidate locally and in CI

### 1.1 Install the locked tooling

Use Node.js 24 and lockfile installations for all three packages.
Installation and audits may require registry access.
Do not substitute unpinned global Wrangler tooling.

```sh
node --version
npm ci --no-audit --no-fund
npm ci --prefix worker --no-audit --no-fund
npm ci --prefix site-worker --no-audit --no-fund
```

Keep local secret files out of Git and out of the static public projection.
Use test-only secrets where a local test requires them.
Never copy production values into test fixtures.

### 1.2 Run the proposed deployment safety validator

The following helper is supplied by the separate
`feature/deployment-validation-scripts` PR.
Merge that reviewed dependency before using this command on `main`.
Until it is available, use the existing workflow validators directly.

```sh
node scripts/deployment-safety-check.mjs
```

Require successful completion of every mandatory check and exit status zero.
A missing dependency, audit failure, failed child command, or invalid contract
is an unresolved gate; do not convert it into a successful release claim.
This helper validates its documented scope and does not deploy or migrate.
It does not replace protected CI, live checks, or release approval.
The ten check IDs correspond to these concrete scopes:

| Check ID | Inspection scope |
| --- | --- |
| `branch_protection` | Strict required status checks, PR policy, force/deletion restrictions, resolved conversations |
| `protected_main_source` | Clean checkout on `main` matching the current protected tip |
| `api_schema_compatibility` | Source supports API-reported schema and the live health contract |
| `wrangler_lock_alignment` | Both Worker manifests and lockfiles pin the same exact Wrangler version |
| `dependency_security` | All three package audits pass the high-severity threshold |
| `api_typecheck` | API TypeScript check passes without emitting files |
| `release_policy_tests` | Receipt, static/API continuity, and bounded maintenance tests pass |
| `content_governance` | Editorial records and quarantine validate; incomplete review remains disclosed |
| `artifact_contracts` | Artifact confidentiality and version-bound runtime-proof contracts pass |
| `worker_configuration` | Expected JSONC names, domains, metadata, D1 binding, and static asset configuration |

The full online check needs authenticated `gh` and pinned installed dependencies.
Tests may create local build artifacts; a green result is preflight inspection,
not database mutation authorization or completed editorial review.

### 1.3 Validate editorial governance and generated projections

```sh
node scripts/content-review-report.mjs --check
node scripts/generate-production-quarantine.mjs --check
node scripts/generate-learning-audit-ledger.mjs --check
node scripts/audit-question-bank.mjs --strict
npm run check:featured
```

Read both validation errors and progress totals.
Pending or candidate evidence is not an accepted source or a final approval.
The **278-card safety quarantine stays active** until the separately reviewed
editorial and publication contracts authorize a change.
The strict `--complete` editorial gate must remain fail-closed.
Do not claim it passed or enable it as a release gate before all required
reviews, evidence, bilingual approvals, and independent expertise are complete.

### 1.4 Check source, tests, and release artifacts

```sh
node scripts/api-release-receipt.mjs validate-source
npm --prefix worker run check
npm --prefix worker run test:coverage
npm --prefix worker run test:integration
npm run test:autopilot
npm run test:contracts
npm run test:site
npm run check:performance
npm --prefix site-worker run check
```

`site-worker`'s `check` builds, tests, and performs a deployment **dry run**.
A dry run is bundle validation, not evidence that a Worker is live.
The static builder uses Git-tracked allow-listed public files.
Untracked local files are not deployable merely because they exist.
Confirm that the manifest inventories the final bytes of the intended commit.

Inspect the automatic PR checks in GitHub.
Run applicable browser and accessibility checks for visible or interactive
changes, including mobile, English, Arabic, keyboard use, and authenticated
admin flows with isolated test data.
Do not exercise account deletion, recovery, or credentials on real users.

### 1.5 Inspect audit failures without weakening the threshold

```sh
npm audit --audit-level=high
npm audit --prefix site-worker --audit-level=high
npm --prefix worker run audit:security
```

Fix relevant findings through a reviewed dependency change.
Do not disable audits or widen accepted vulnerability thresholds to release.
If an external service is unavailable, record the failure and retry the
verification when available; unverified results are not passes.

### Phase 1 exit criteria

- [ ] Locked Node.js 24 tooling installed; candidate checkout remains clean.
- [ ] Mandatory safety checks and audits passed.
- [ ] API type checking, coverage, integration, and release-source checks passed.
- [ ] Static, contract, maintenance, performance, and applicable browser checks passed.
- [ ] Editorial progress and quarantine recorded without claiming completion.
- [ ] Required protected-branch CI passed for the reviewed candidate.

## Phase 2: Deploy and prove the API compatibility Worker

This phase changes Worker code but contains **no D1 migration command**.
It proves the target code against the current remote database schema.
It is a production deployment and still requires release authorization.

### 2.1 Select the actual workflow inputs

Use [Deploy API](https://github.com/jame17291-sys/jakh.net/actions/workflows/api-deploy.yml).
Select branch `main`, `release_phase=compatibility`, and `domain_cutover=false`.
Leave `autopilot_run_id` and `autopilot_day` empty for a manual release.
There is no `stage` input and no `source_commit` override.

For an approved future release, the equivalent CLI command is:

```sh
gh workflow run api-deploy.yml \
  --repo jame17291-sys/jakh.net \
  --ref main \
  -f release_phase=compatibility \
  -f domain_cutover=false
```

Record the resulting run ID and attempt explicitly.
Do not assume the newest run belongs to this operator or source SHA.
Wait for the actual run conclusion and protected environment approval.
Elapsed time alone does not establish completion.

### 2.2 Inspect the health contract

This read-only probe is useful for diagnosis:

```sh
curl --fail --silent --show-error \
  https://api.riddlearabia.com/api/health
```

The real response uses `ok`, `service`, `version`, `workerVersionId`, `schema`,
`targetSchema`, `compatibleSchemas`, `features`, and `contentPublication`.
Schema values in the contract are strings.
Do not use an invented `status`, `currentSchema`, or `featuresReady` response.
Use `api-release-receipt.mjs` to compare health with captured remote D1 and
active Worker state rather than treating a 200 response as sufficient proof.

Verify the receipt establishes all of the following:

- HTTP 200, `ok=true`, and `service=jakh-api`.
- Exact target source version and active Worker identity.
- Reported schema equals the actual captured D1 schema.
- Current and target schemas appear in the declared compatibility range.
- Feature readiness reflects the actual current schema.
- D1 schema and pending-migration state did not change during compatibility.
- Deployment annotation binds the full source SHA, schema, and run ID.
- Runtime quarantine proof passed for the candidate and rollback target.

### 2.3 Retain and classify the exact receipt

The artifact is `api-compatibility-<run-id>-<run-attempt>`.
It contains `release-receipt.json` and allow-listed supporting state;
release receipts are retained for **90 days** by the current workflow.
Keep approved longer-term evidence outside expiring Actions storage if needed.

After the validation-scripts PR is merged, audit a specific completed run:

```sh
RUN_ID='REPLACE_WITH_NUMERIC_RUN_ID'
node scripts/deployment-receipt-monitor.mjs \
  --run-id "$RUN_ID" \
  --output /secure/release-evidence/api-compatibility-report.json \
  --verbose
```

Use a private, access-controlled evidence directory that already exists.
Read the parser's result and exit status, not only whether it wrote JSON.
Missing, malformed, stale, conflicting, or incorrectly bound evidence is
unresolved and must not become a verified deployment claim.
Preserve the original artifact and run metadata alongside the derived report.

### 2.4 Choose the next phase from the observed schema

If D1 is already at the target schema and migrations are complete,
`code-only-final-worker-verified` is the expected API result.
The compatibility phase is then the final code-only API release.
**Skip Phase 3** and continue to Phase 4.

If there is a reviewed target schema change, require
`compatibility-worker-verified` and its successful runtime proof.
Continue to Phase 3 only under approval for that actual migration.
Do not invent schema 11, add a migration, or run `migrate-final` for a
schema-10 code-only change; the workflow deliberately refuses that case.

### Phase 2 exit criteria

- [ ] Exact protected-main SHA, run ID, attempt, and approval recorded.
- [ ] Compatibility deploy and required production verification succeeded.
- [ ] D1 remained unchanged and Worker/health/source identities match.
- [ ] Run-bound compatibility receipt and runtime evidence retained.
- [ ] Code-only final release or conditional migration decision recorded.

## Phase 3: Apply D1 migrations only when genuinely required

**Skip this phase for a code-only release.**
A migration changes production data and can create a data-loss recovery window.
Worker rollback never reverses D1 migrations.
Database recovery requires a separate deliberate and approved operation.

### 3.1 Confirm the migration plan and exact compatibility source

Review the new SQL, schema transition, backfill behavior, compatibility range,
operational window, expected runtime behavior, and recovery impact.
Recheck that protected `main` has not changed since compatibility.
If it changed, produce new compatibility proof for the new source first.
Confirm one active compatibility Worker serves 100% of traffic and its
annotation binds this exact current source and target schema.

Read [the recovery runbook](../worker/RECOVERY.md) before authorizing migration.
Identify the backup custodian, retained encryption key, known-good recovery
point, isolated restore proof, and a named operator for incident response.
A Time Travel bookmark alone is not the required off-account backup proof.

### 3.2 Verify the workflow's gates before database mutation

The `migrate-final` workflow must complete this sequence:

1. Prove active compatibility health and exact source/schema annotation.
2. Prove that Worker is a healthy quarantine-safe rollback target.
3. Export the actual production database into a restricted temporary workspace.
4. Encrypt the export and authenticate/decrypt it for an ephemeral local restore.
5. Verify restored schema and table inventory and attest the backup receipt.
6. Remove plaintext export, local restore files, and the temporary workspace.
7. Upload the tested encrypted backup off the Cloudflare account.
8. Validate `migration-authorization.json` from the exact release and backup proofs.
9. Capture current and 24-hour Time Travel evidence.
10. Apply pending migrations only after all preceding requirements succeed.

The encrypted backup artifact is
`pre-migration-d1-backup-<run-id>-<run-attempt>` with **35-day retention**.
It contains ciphertext and `pre-migration-backup-receipt.json`.
Treat public Actions artifacts as public; plaintext database content must
never be included in a release receipt or artifact allowlist.
Backup existence alone does not prove authentication, restoration, or custody.

### 3.3 Dispatch the separate approved migration run

Use `api-deploy.yml` on current protected `main` with
`release_phase=migrate-final` and `domain_cutover=false`.
There is no invented `AUTHORIZE D1 MIGRATION` input.
Human approval is enforced through the protected production environment and
the documented release authorization, alongside the machine proof gates.

```sh
gh workflow run api-deploy.yml \
  --repo jame17291-sys/jakh.net \
  --ref main \
  -f release_phase=migrate-final \
  -f domain_cutover=false
```

After migration, the workflow first proves the same compatibility Worker on
the target schema and runs strict runtime quarantine monitoring.
Only then may it deploy and verify the final Worker.
Do not call `wrangler d1 migrations apply --remote` outside this protocol.

### 3.4 Verify the final result and recovery state

Retain `api-final-<run-id>-<run-attempt>` and its `release-receipt.json`.
Require `deployed-and-verified`, successful workflow outcomes, matching
active identity, target schema, completed migrations, and runtime proof.
Preserve backup authorization and bookmark receipts with the release record.
Do not infer the final schema from the workflow name or an example number.

If migration or verification fails, stop subsequent releases.
Read which operation completed and query actual D1/Worker state.
A failed run can leave schema changes applied; do not blindly rerun it.
API rollback is conditional on a proven exact Worker version and runtime safety.
No automatic D1 rollback is provided.
Use the recovery runbook and explicit owner approval for any database restore.

### Phase 3 exit criteria

- [ ] Reviewed schema change and separate migration authorization recorded.
- [ ] Current protected-main SHA matches active compatibility proof.
- [ ] Tested encrypted backup, off-account artifact, key custody, and bookmarks verified.
- [ ] Machine authorization completed before D1 mutation; no plaintext leaked.
- [ ] Target schema, complete migrations, final Worker, and runtime proof verified.
- [ ] Migration and recovery evidence retained, or incident escalation active.

## Phase 4: Release the exact static artifact after the matching API

The static release is **sequential**, not independent of the API release.
It requires the live final API to have the **exact same source SHA**.
The API is rechecked immediately before and after the static deployment.
If `main` advances, repeat the API release for that source before deploying it.

### 4.1 Confirm the final API gate and artifact

The current gate requires schema **10**, all final features including
`adminMfa=true`, matching publication state and quarantine digest, and exactly
one active API Worker serving 100% of traffic.
The deployment message must match:

```text
JAKH final <full-source-sha> schema 10 run <api-run-id>
```

A static workflow's API dry-run inventory proves a build artifact only.
It cannot replace the live matching API release.
Require a verified existing static baseline and a quarantine-safe exact
rollback Worker/build identity before the candidate deploys.
Normal release preflight must not be weakened for a first-domain cutover.

### 4.2 Use the real static workflow and exact confirmation

Use [Deploy static site to Cloudflare Workers](https://github.com/jame17291-sys/jakh.net/actions/workflows/static-site.yml).
Select branch `main`, keep `domain_cutover=false`, and enter exactly:

```text
DEPLOY riddlearabia.com FROM protected main
```

For an approved future release:

```sh
gh workflow run static-site.yml \
  --repo jame17291-sys/jakh.net \
  --ref main \
  -f confirmation='DEPLOY riddlearabia.com FROM protected main' \
  -f domain_cutover=false
```

Leave manual-maintenance reservation inputs empty.
Record this run's ID and attempt separately from the API run.
Do not use an imaginary `deploy-site.yml`, `rollback=true`, or arbitrary
`source_commit` input to deploy historical source.

### 4.3 Verify production behavior and continuity

The workflow must validate the built manifest, final-byte inventory, dry run,
baseline smoke, rollback-target proof, candidate smoke, and runtime proof.
Require the candidate deployment message to bind the source SHA, build ID,
and this static workflow run ID.
Both API gate receipts must be verified and API identity must remain unchanged.

Useful supplemental read-only probes are:

```sh
curl --fail --silent --show-error --head https://riddlearabia.com/
curl --silent --show-error --head https://www.riddlearabia.com/
curl --silent --show-error --head https://jakh.net/
curl --silent --show-error --head https://www.jakh.net/
curl --fail --silent --show-error https://api.riddlearabia.com/api/health
```

The canonical site should serve successfully with `X-JAKH-Site-Version`.
Normalization hosts should redirect to the canonical site, preserving paths
and queries according to the smoke contract; do not expect every host to be 200.
Require the served build ID and HTTP Worker version to match the active state.
Check HTML, stable assets, fingerprinted assets, service-worker behavior,
security headers, held routes/data, and missing-page responses through the
authoritative smoke and production monitor rather than HEAD requests alone.

Inspect changed public flows in English and Arabic on phone and desktop.
For Kids, verify learning navigation and the generated activity/toolkit checks.
For TV, verify the approved behavior and intentional index policy.
For admin changes, use isolated fixtures and the approved owner session;
never copy passwords or authenticator secrets into release evidence.

### 4.4 Retain the final static receipt

The artifact is `static-site-release-<run-id>-<run-attempt>` with **90-day retention**.
It includes `release-receipt.json`, the candidate manifest/inventory, smoke and
runtime evidence, and `api-gate-before-static.json`,
`api-gate-after-static.json`, and `api-identity-continuity.json` when produced.
Inspect recursively nested artifact paths rather than assuming a flat download.

Require `deployed-and-verified` plus successful proof outcomes.
`post-deploy-failure-rolled-back` describes recovery, not a successful new release.
An absent receipt can mean authorization or preflight failed before deployment;
do not manufacture a successful receipt to fill that gap.

### Phase 4 exit criteria

- [ ] Exact final API source matches the current approved static source.
- [ ] Static authorization, build, baseline, and rollback safety proof passed.
- [ ] Candidate deployment, served build identity, smoke, and runtime proof passed.
- [ ] API pre/post gates and identity continuity passed.
- [ ] Relevant mobile, bilingual, Kids, TV, and admin changes inspected.
- [ ] Original static artifact and run-bound report retained.

## Phase 5: Monitor honestly and recover deliberately

### 5.1 Understand daily maintenance and receipt monitoring

`Daily website maintenance` is scheduled at **03:23 UTC / 07:23 Dubai daily**.
It is not a twelve-hour receipt polling schedule.
At this checklist's source baseline, the producer uses the legacy artifact
`autopilot-<run-id>` and omits `runAttempt` from `daily-report.json`.
The proposed monitoring PR updates the producer to
`autopilot-<run-id>-<run-attempt>` and records `runAttempt` in the daily report.
That attempt-bound artifact contains `daily-report.json` and non-secret JSON
evidence, still retained for **one day**.
Run ID alone cannot identify a rerun's evidence.
The parser accepts the legacy artifact/report contract only for attempt **1**.
A legacy artifact or missing `runAttempt` for a rerun is unsupported and yields
`unknown`; never reuse the original attempt's successful receipt as rerun proof.
The identity-only run has a separate `autopilot-identity-<run-id>` artifact;
it is not a completed maintenance or deployment receipt.

The proposed `monitor-deployments.yml` is supplied by
`feature/deployment-monitoring-workflow` and depends on the validation scripts.
After both reviewed dependencies are merged to the default branch, it follows
completed `Daily website maintenance` runs through `workflow_run`.
It parses the exact triggering run and posts bounded status to
[issue #113](https://github.com/jame17291-sys/jakh.net/issues/113).
Its bounded parsed report is retained in
`deployment-report-<run-id>-<run-attempt>` for **30 days**.
Creating its PR does not install or run that workflow on production.

Monitor only trusted repository/main runs and the expected artifact.
Privileged follow-up code must come from trusted default-branch source;
artifact contents are untrusted data, never commands to execute.
Comments must exclude raw artifacts, arbitrary error text, account data,
database contents, and secrets.

Read `releaseMode` and `status` separately:

- `inspection_only` means automatic publishing is disabled or unavailable.
- `no_changes` means the inspection found no generated repair to publish.
- `needs_attention` means human review or a failed gate requires attention.
- `paused` and `paused_or_daily_limit` describe a pause/reservation outcome.
- `failed` is a failed maintenance cycle.
- `deployed` requires the linked release evidence to prove a deployment.

Inspection success is not proof of a new API or static release.
Even a successful receipt describes its recorded time; continue live monitoring.
Unavailable or expired evidence must be reported as unresolved, never verified.

### 5.2 Audit a specific receipt without running a release

After the validation-scripts PR is merged:

```sh
RUN_ID='REPLACE_WITH_NUMERIC_RUN_ID'
node scripts/deployment-receipt-monitor.mjs \
  --run-id "$RUN_ID" \
  --output /secure/release-evidence/receipt-report.json \
  --verbose
```

For an already downloaded artifact, use the parser's `--receipts-dir` and
`--run-metadata` options with metadata retained from that exact GitHub run.
For example, after preserving the trusted REST run response and artifact:

```sh
node scripts/deployment-receipt-monitor.mjs \
  --run-id "$RUN_ID" \
  --receipts-dir /secure/release-evidence/downloaded-artifact \
  --run-metadata /secure/release-evidence/github-run.json \
  --output /secure/release-evidence/receipt-report.json
```

Do not substitute a filename, arbitrary latest run, or another attempt's
metadata for repository, workflow, source, run, and attempt binding.
The derived monitor status and exit code have deliberately different meanings:

| Status | Exit | Interpretation |
| --- | --- | --- |
| `verified` | 0 | The supplied release evidence passed its supported validation. |
| `inspected` | 0 | Maintenance inspection completed; no live deployment is proven. |
| `deployment_reported` | 2 | Maintenance reported publishing; inspect linked release proof. |
| `paused` | 2 | The cycle paused; no new deployment is proven. |
| `needs_attention`, `failed`, `unknown` | 1 | Stop and resolve the finding or missing evidence. |

Exit zero alone must not authorize a deployment or declare a new version live.
Read the status, workflow identity, source binding, and validation scope.

### 5.3 Respond to a failed release

1. Stop new deployments and record incident time and observed symptoms.
2. Retain the exact run, logs, original receipts, source SHA, and active identities.
3. Determine whether failure happened before deploy, after Worker deploy, or after D1 mutation.
4. Check whether automatic rollback was eligible, attempted, and independently verified.
5. Run strict live health/runtime checks against the observed current state.
6. Escalate unresolved identity, quarantine, schema, or recovery failures to the owner.

The shared `jakh-production-release` concurrency group serializes API/static
release workflows, but still inspect other pipelines and manual operations.
Do not cancel a migrating job or begin a second operation without assessing
which database steps have already completed.

### 5.4 Understand conditional Worker rollback

Static rollback uses the captured exact prior Worker version and build ID.
API rollback uses the proven exact compatible version for the observed D1 state.
Both depend on runtime safety and quarantine proof.
A domain cutover or unsafe predecessor can cause automatic rollback to be withheld.
An attempted rollback without matching active state and health is not recovery.

Retain rollback proof and the final active identity.
A Worker rollback changes code only; it does not undo database writes or migrations.
Do not redeploy an unverified old checkout or a pre-quarantine artifact.
Manual rollback requires incident authorization and the exact approved version,
followed by strict health, quarantine, and authenticated flow verification.

### 5.5 Recover D1 through the dedicated runbook

Follow [worker/RECOVERY.md](../worker/RECOVERY.md) for deliberate recovery.
Record a known-good UTC point, target database UUID, data-loss window,
approved operator, encrypted backup receipt, and key custody.
Verify authentication/checksum and restore into an isolated non-production
database before deciding whether production import or Time Travel is appropriate.
Preserve current production state when safe and require explicit owner approval.

There is no automatic D1 rollback and no `d1 restore --backup-id` shortcut.
Do not guess a restore command or use the dedicated drill database proof as
authorization to restore production.
The recovery workflow deliberately confines restore drills to
`jakh-recovery-drill` and refuses the production database name/UUID.
Securely remove temporary plaintext after an approved recovery verification.

### Phase 5 exit criteria

- [ ] API and static live identities match the intended release or verified recovery state.
- [ ] Strict health/runtime monitoring and relevant authenticated smoke checks passed.
- [ ] Maintenance inspection status is distinguished from deployment proof.
- [ ] Original receipts and metadata retained before artifact expiry.
- [ ] Any incident, rollback, withheld recovery, or data-loss window documented.
- [ ] Named owner accepts the final observed state; no unresolved gate is marked passed.

## Troubleshooting without bypassing safeguards

| Symptom | Next action |
| --- | --- |
| Local safety command fails | Inspect the named failed command, fix the cause, rerun the gate. |
| GitHub protection API returns 403 | Obtain authorized settings evidence; do not infer unprotected main. |
| Dispatch SHA is stale | Review current main and repeat validation/API proof for the new commit. |
| Compatibility identity changed | Investigate competing deploys; recreate exact-source compatibility proof. |
| `migrate-final` refuses unchanged schema | Use the successful code-only compatibility release; skip migration. |
| Backup or authorization missing | Stop before mutation; repair backup custody/restore verification. |
| Migration run failed | Establish actual D1 state before retry; Worker rollback does not undo SQL. |
| Static/API source mismatch | Release the matching API from approved main before the static release. |
| Static bundle/config failure | Inspect `site-worker/wrangler.jsonc`, manifest, and allow-listed artifact. |
| Missing receipt/artifact | Inspect the exact run and retention; report unresolved evidence. |
| Monitor says inspection-only | Check publishing configuration; do not claim deployment occurred. |
| Rollback withheld | Inspect predecessor/quarantine proof and follow approved incident recovery. |
| HTTP 200 but wrong version | Compare served Worker/build and source annotation; stop the release claim. |

## Release record template

```text
Change reference:
Owner and approving reviewer:
UTC release window:
Reviewed protected-main SHA:
Code-only / reviewed schema transition:
Required CI check URLs and conclusions:
Editorial progress and quarantine digest:
API workflow run ID / attempt / result:
API active Worker version / schema / annotation:
Compatibility and runtime proof locations:
Migration skipped or authorized:
Encrypted backup / authorization / bookmark receipt locations:
Static workflow run ID / attempt / result:
Static active Worker version / build ID / annotation:
Static smoke / runtime / API continuity proof locations:
Maintenance mode and inspection result:
Rollback attempted / withheld / verified:
Final live health and authenticated smoke evidence:
Recovery data-loss window, if applicable:
Evidence retention location and expiry:
Unresolved findings and responsible owner:
Final owner acceptance:
```

## Related contracts and documentation

- [API deployment workflow](../.github/workflows/api-deploy.yml).
- [Static deployment workflow](../.github/workflows/static-site.yml).
- [Required API/browser validation](../.github/workflows/api-check.yml).
- [Daily maintenance workflow](../.github/workflows/site-autopilot.yml).
- [Recovery verification workflow](../.github/workflows/recovery-verification.yml).
- [API release receipt validator](../scripts/api-release-receipt.mjs).
- [Static release receipt validator](../scripts/site-release-receipt.mjs).
- [Static/API identity gate](../scripts/static-api-release-gate.mjs).
- [API ownership and compatibility](../worker/README.md).
- [Database recovery and credential custody](../worker/RECOVERY.md).
- [Static artifact and cutover safety](../site-worker/README.md).
- [Content review governance](./content-review/README.md).

If this checklist conflicts with a reviewed validator at the release commit,
stop and reconcile the documentation through review; never weaken the validator
to make an outdated example pass.
