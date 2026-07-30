# JAKH API Recovery Runbook

This runbook covers Cloudflare Worker, D1, Durable Object, and credential
incidents. Production recovery is a deliberate destructive operation: record
the UTC incident time and obtain explicit owner approval before restoring D1,
rolling back a Worker, deleting sessions, or rotating password material.

## Before every production migration

1. Record the current Git commit, Worker deployment/version, D1 schema version,
   and a current D1 Time Travel bookmark.
2. Create an encrypted D1 export in private storage controlled separately from
   the public GitHub repository. Never upload a raw database export as a public
   repository artifact.
3. Apply migrations, deploy the Worker, and verify health, registration/login,
   profile sync, leaderboard, suggestions, and battle-room creation.
4. Keep the pre-change bookmark and export until the release has been stable
   through the recovery window.

Useful discovery commands:

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

Cloudflare D1 Time Travel is automatic, but the Free-plan recovery window is
limited. Maintain a weekly encrypted export outside the production account and
perform a quarterly restore drill against a non-production database.

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
