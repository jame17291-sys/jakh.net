# Production synthetic account monitor

`scripts/synthetic-account-monitor.mjs` is a destructive production smoke test
with a deliberately narrow target: Riddle Arabia at `https://riddlearabia.com`
and its API at `https://api.riddlearabia.com`. It creates one random username
beginning with `jakh_synth_` and exercises the authenticated session, a
password change (the session cookie must rotate, the old session and old
password must stop working, and the new password must sign in), default-denied
analytics with opt-in and revocation, account export, and exact
server-checked challenge cancellation. It then permanently deletes that same
account in a `finally` block and checks that the API Worker version did not
change during the run. It does not create a privacy request, suggestion,
score submission, or battle room, so a successful run leaves no intentionally
persistent product record.

The `jakh_synth_` prefix and `JAKH_*` variable names are internal identifiers,
like the `jakh-api` Worker name. They do not refer to `jakh.net`, which has
belonged to a different project since 12 October 2026 and is never a Riddle
Arabia origin.

The command refuses to start unless all of these controls are present:

- `JAKH_SYNTHETIC_ACCOUNT_CONFIRM` exactly equals
  `CREATE_AND_DELETE_JAKH_SYNTHETIC_ACCOUNT`;
- `JAKH_SYNTHETIC_ACCOUNT_PREFIX` exactly equals `jakh_synth_`;
- `JAKH_SYNTHETIC_RELEASE_COMMIT` is the full lowercase 40-character candidate
  commit;
- `JAKH_SYNTHETIC_RESULT_PATH` is set for the retained JSON receipt;
- the site and API origins are exactly `https://riddlearabia.com` and
  `https://api.riddlearabia.com`. These are the defaults; `JAKH_SITE_ORIGIN`
  and `JAKH_API_ORIGIN`, if set, must equal them.

No password, session token, or recovery code is written to the receipt. If any
check fails after registration, deletion is still attempted. An unconfirmed
cleanup makes the command fail loudly and records the exact synthetic username
for immediate operator investigation. Never suppress or retry such a failure
without first resolving whether that account still exists.

Run only after explicit production owner approval. Before creating the
account, the command itself requires `/api/health` to report `ok`, schema and
target schema `10`, a Worker version, and ready registration, account
recovery, account deletion, Content Studio and admin MFA features:

```sh
JAKH_SYNTHETIC_ACCOUNT_CONFIRM=CREATE_AND_DELETE_JAKH_SYNTHETIC_ACCOUNT \
JAKH_SYNTHETIC_ACCOUNT_PREFIX=jakh_synth_ \
JAKH_SYNTHETIC_RELEASE_COMMIT="$GITHUB_SHA" \
JAKH_SYNTHETIC_RESULT_PATH="$RUNNER_TEMP/jakh-synthetic-account.json" \
node scripts/synthetic-account-monitor.mjs
```

Retain the receipt with the cross-artifact manifest and API release receipts.
The monitor is intentionally not part of an unattended schedule until an owner
approves account mutation, alert ownership, and cleanup escalation.

The implementation contract is non-destructive and uses a simulated API:

```sh
node --test scripts/synthetic-account-monitor.test.mjs
```
