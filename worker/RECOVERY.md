# JAKH API Recovery Runbook

This runbook covers Cloudflare Worker, D1, Durable Object, and credential
incidents. Production recovery is a deliberate destructive operation: record
the UTC incident time and obtain explicit owner approval before restoring D1,
rolling back a Worker, deleting sessions, or rotating password material.

Recovery readiness is evidenced by `.github/workflows/recovery-verification.yml`:

- Every Monday it performs read-only Time Travel lookups for the current
  production bookmark and a point 24 hours earlier. Its JSON receipt binds both
  bookmarks to the Git commit, Wrangler version, database UUID, and a SHA-256
  manifest of every migration.
- On January, April, July, and October 1 it replays every migration into a local
  D1 database, hashes the reconstructed SQLite schema, and emits a readiness
  receipt. The same quarterly schedule opens a protected-environment restore
  drill that waits for an authorized reviewer before it can touch the dedicated
  non-production database; neither job contacts the production database.
- The protected restore drill writes synthetic canary values to the dedicated
  `jakh-recovery-drill` D1 database, restores the baseline bookmark, verifies the
  baseline, restores the post-mutation bookmark, verifies the undo, and removes
  the canary. It cannot target the checked-in production UUID or database name.

Receipts are JSON GitHub artifacts retained for 90 days. They contain no table
rows, query results, credentials, password material, or database exports. A
failed check also emits a failed receipt when possible. Workflow logs and
artifacts are evidence, not backups; deleting a workflow run also deletes its
artifacts.

## Required one-time configuration

1. Create a Cloudflare API token with account-level **D1 Read** only. Save it as
   the repository secret `CLOUDFLARE_RECOVERY_READ_TOKEN`. The weekly job uses
   this token only for `d1 time-travel info`; it never executes SQL or restores.
2. Keep the Cloudflare account ID in the repository secret
   `CLOUDFLARE_ACCOUNT_ID`.
3. Create a separate, empty D1 database named exactly `jakh-recovery-drill`.
   Never bind an application Worker to it and never seed it with production
   exports or user data.
4. Create the GitHub environment `recovery-drill`, enable required reviewers,
   prevent self-review where available, restrict deployment branches to
   `main`, and store `CLOUDFLARE_RECOVERY_DRILL_TOKEN` and
   `CLOUDFLARE_RECOVERY_DRILL_DATABASE_ID` in that environment. The first secret
   is a token that needs **D1 Edit**; the second is the UUID of the dedicated
   `jakh-recovery-drill` database. The token should be a separate credential
   from deployment and read-only recovery tokens and should be limited to the
   JAKH Cloudflare account with the shortest practical lifetime.
5. Run **Verify recovery readiness** from `main`, choose `restore-drill`, enter
   `jakh-recovery-drill`, enter its UUID, and type the exact confirmation
   `RESTORE jakh-recovery-drill`. The protected environment approval is a second
   deliberate control. The workflow refuses a non-`main` ref, the production
   UUID, a different database name, or an inexact confirmation.
6. Approve the protected quarterly restore-drill job after confirming the target
   shown by GitHub is the dedicated non-production database. If approval is not
   granted, the quarterly drill is visibly overdue rather than silently skipped.

The workflow never creates or uploads a plaintext production export. If a
longer-than-Time-Travel backup is required, send an encrypted export directly
to separately controlled private storage and record only its checksum, storage
object version, encryption-key reference, retention date, and restore-test
receipt in the release record.

## Before every production migration

1. Require a successful current `recovery-bookmark-*` artifact. Record its
   workflow URL beside the release approval; it provides the Git commit,
   migration manifest, database identity, and current Time Travel bookmark.
   A receipt from another commit is not valid for the release.
2. Create an encrypted D1 export in private storage controlled separately from
   the public GitHub repository. Never upload a raw database export as a public
   repository artifact.
3. Apply migrations, deploy the Worker, and verify health, registration/login,
   profile sync, leaderboard, suggestions, and battle-room creation.
4. Keep the pre-change bookmark and export until the release has been stable
   through the recovery window.

Useful discovery commands (read-only unless an export is explicitly requested):

```sh
npx wrangler deployments list
npx wrangler d1 time-travel info DB
npx wrangler d1 export DB --remote --output /tmp/jakh-db-backup.sql
```

The export contains sensitive user data. Encrypt or move it immediately into
private storage controlled separately from GitHub, restrict access, and remove
the plaintext `/tmp/jakh-db-backup.sql` working copy safely. Never export a
production database into the repository tree.

## Database recovery

1. Stop deployments and write down the earliest known-good UTC time.
2. Preserve the current damaged state with a private encrypted export when safe.
3. Ask Wrangler for the bookmark corresponding to the known-good time; confirm
   the selected bookmark and expected data-loss window before proceeding.
4. Restore only after explicit owner approval:

   ```sh
   npx wrangler d1 time-travel restore DB --bookmark BOOKMARK
   ```

5. Re-run the production health and authenticated smoke tests. Document every
   lost or replayed operation and notify affected users when appropriate.

Cloudflare D1 Time Travel is automatic, but the recovery window is plan-limited.
The weekly bookmark receipt proves the current API can resolve both current and
24-hour historical bookmarks; it does not extend Cloudflare retention. Maintain
an encrypted export outside the production account when longer retention is
required and complete the protected non-production restore drill at least
quarterly.

## Running and interpreting verification

Local validation never contacts Cloudflare:

```sh
cd worker
npm ci --no-audit --no-fund
npm run recovery:validate
node --test tests/recovery-evidence.test.mjs
npm run recovery:readiness -- --output /tmp/jakh-recovery-readiness.json
```

For GitHub evidence, use the **Verify recovery readiness** workflow. A valid
receipt has `formatVersion: 1`, `status: "passed"`,
`plaintextDatabaseExportCreated: false`, the expected commit SHA, and matching
migration and schema hashes for the release. Treat missing, expired, failed, or
wrong-commit evidence as no evidence. Do not copy a successful receipt forward
to a different release.

## Worker rollback

Use `npx wrangler deployments list` to identify the last known-good version and
follow the current Wrangler rollback prompt. A Worker rollback does not undo a
D1 migration; evaluate Worker and database compatibility separately. Verify the
API and WebSocket smoke tests immediately after rollback.

## Credential or account compromise

1. Revoke the affected GitHub/Cloudflare sessions and API tokens, then create a
   least-privilege replacement token.
2. Pause production workflows until the default branch, workflow history,
   Cloudflare audit log, DNS records, Worker versions, and D1 changes are
   reviewed.
3. Invalidate active application sessions if user-session exposure is possible.
4. Rotate `IP_HASH_SALT` after clearing obsolete rate-limit data.
5. Do not rotate `PASSWORD_PEPPER` blindly: changing it makes existing password
   hashes unverifiable. Preserve evidence, deploy a forced-reset/versioned
   migration plan, invalidate sessions, and notify users as required.
6. Restore trusted code and data, rotate remaining secrets, validate production,
   and record the timeline, scope, decisions, and follow-up controls.
