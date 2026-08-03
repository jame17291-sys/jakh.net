# JAKH API recovery runbook

Production recovery is deliberate. Record the incident time and obtain owner approval before restoring D1, rolling back a Worker, ending sessions, or rotating credentials.

## Automatic protection

`.github/workflows/recovery-verification.yml` runs every Sunday at 01:17 UTC:

1. Export `jakh-db` with a dedicated account-scoped **D1 Write** token. Cloudflare exposes D1 export as a `POST` operation and rejects a D1 Read token even though exporting does not mutate the database. This credential is reserved exclusively for the encrypted backup workflow and has no unrelated permissions.
2. Encrypt the export immediately with AES-256-GCM and a 256-bit GitHub Actions secret. The authenticated header binds the database UUID, Git commit, run, checksum, size, and retention.
3. Remove the first plaintext copy.
4. Authenticate and decrypt into the runner's isolated workspace, import it into ephemeral local D1, verify the supported schema and table inventory, and remove every remaining `.sql` file.
5. Verify current and 24-hour Cloudflare Time Travel bookmarks and the live API health endpoint.
6. Upload only the encrypted `.jakh` file and data-free JSON receipts. Retention is 35 days, so five weekly recovery points remain while storage stays bounded.

The public repository never receives plaintext database content. Anyone may be able to download a public Actions artifact, so the artifact is treated as public ciphertext. Recovery requires the separately stored `D1_BACKUP_ENCRYPTION_KEY` secret. A missing key, token, export, authentication tag, checksum, restore proof, table inventory, Time Travel receipt, or health check fails the workflow.

Cloudflare D1 Time Travel is also always on. The Free plan retains seven days. It is a second recovery path, not a replacement for the encrypted off-Cloudflare artifact.

Quarterly, the same workflow reconstructs the complete schema from migrations and records a deterministic readiness receipt. It also runs a protected, manually approved Time Travel restore-and-undo drill against the dedicated `jakh-recovery-drill` database. The drill credential is isolated in the `recovery-drill` environment, and the command refuses the production UUID and name before invoking Wrangler.

## Required configuration

- Repository variable `CLOUDFLARE_ACCOUNT_ID`: the JAKH Cloudflare account ID.
- Repository secret `CLOUDFLARE_D1_BACKUP_EXPORT_TOKEN`: account-owned Cloudflare token with only D1 Write, limited to the JAKH account and used exclusively for encrypted exports and their recovery evidence.
- Repository secret `D1_BACKUP_ENCRYPTION_KEY`: 32 random bytes encoded as base64.
- Production environment secret `CLOUDFLARE_API_TOKEN`: deployment credential used only by protected production jobs.
- Recovery-drill environment secrets `CLOUDFLARE_RECOVERY_DRILL_TOKEN`, `CLOUDFLARE_RECOVERY_DRILL_DATABASE_ID`, and `CLOUDFLARE_ACCOUNT_ID`: protected quarterly drill configuration. The token has D1 Write access and must never be moved to an unprotected repository secret.

Do not print, copy into an issue, or commit any of these values. Replacing the encryption key makes older artifacts unreadable; retain the old key securely until every artifact encrypted with it has expired.

## Before every production migration

The `migrate-final` job is fail-closed. Before applying migrations it must:

1. Prove the active compatibility Worker reports the current schema in its declared compatible range and was deployed from the exact commit and target schema.
2. Prove that exact Worker is a healthy rollback target.
3. Create, encrypt, upload, decrypt, locally restore, and attest a fresh production export from the same commit.
4. Verify no plaintext `.sql` file remains and record `migration-authorization.json` with `databaseMutationAllowed: true`.
5. Capture current and 24-hour Time Travel bookmarks.

Only then can migrations run. After migration, the workflow proves the same compatibility Worker still passes strict production monitoring before the final Worker is deployed. A Worker rollback never reverses a D1 migration.

## Restore from an encrypted weekly artifact

1. Stop deployments and record the earliest known-good UTC time.
2. Download the chosen `encrypted-d1-backup-*` artifact and verify the workflow, commit, timestamp, database UUID, `status: "passed"`, and checksum in `backup-receipt.json`.
3. Decrypt into an access-restricted temporary directory:

   ```sh
   D1_BACKUP_ENCRYPTION_KEY='base64-key-from-secure-custody' \
     node scripts/d1-backup.mjs verify \
       --input /secure/temp/jakh-db.sql.jakh \
       --receipt /secure/temp/backup-receipt.json \
       --output /secure/temp/restore.sql
   ```

4. Restore into a non-production D1 database first with `wrangler d1 execute --file`, then verify schema, counts, authentication, privacy, scoring, and battle-room behavior.
5. Preserve the current production state with another encrypted export when safe.
6. After explicit owner approval, import the verified SQL into the intended target or use a selected Time Travel bookmark. Confirm the database UUID before any command.
7. Run strict production monitoring and authenticated smoke tests, document any data-loss window, then securely remove plaintext working files.

## Time Travel recovery

Ask Wrangler for the bookmark corresponding to the known-good time, confirm the data-loss window, then restore only after owner approval:

```sh
npx wrangler d1 time-travel info DB --timestamp UNIX_SECONDS
npx wrangler d1 time-travel restore DB --bookmark BOOKMARK
```

## Credential or account compromise

Revoke affected GitHub and Cloudflare sessions/tokens, pause production workflows, review the protected branch, workflow history, Cloudflare audit log, DNS, Worker versions, and D1 changes, then issue least-privilege replacements. Do not rotate `PASSWORD_PEPPER` blindly: that would invalidate existing password hashes. Use a versioned reset plan, invalidate sessions, and notify affected users when required.
