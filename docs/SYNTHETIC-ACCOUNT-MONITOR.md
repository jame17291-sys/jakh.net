# Production synthetic account monitor

`scripts/synthetic-account-monitor.mjs` is a destructive production smoke test
with a deliberately narrow target. It creates one random username beginning
with `jakh_synth_`, exercises the authenticated session, default-denied and
revoked analytics, account export, and exact server-checked challenge
cancellation, then permanently deletes that same account in a `finally` block.
It does not create a privacy request, suggestion, score submission, or battle
room, so a successful run leaves no intentionally persistent product record.

The command refuses to start unless all of these controls are present:

- `JAKH_SYNTHETIC_ACCOUNT_CONFIRM` exactly equals
  `CREATE_AND_DELETE_JAKH_SYNTHETIC_ACCOUNT`;
- `JAKH_SYNTHETIC_ACCOUNT_PREFIX` exactly equals `jakh_synth_`;
- `JAKH_SYNTHETIC_RELEASE_COMMIT` is the full lowercase 40-character candidate
  commit;
- `JAKH_SYNTHETIC_RESULT_PATH` is set for the retained JSON receipt;
- origins are exactly `https://jakh.net` and `https://api.jakh.net`.

No password, session token, or recovery code is written to the receipt. If any
check fails after registration, deletion is still attempted. An unconfirmed
cleanup makes the command fail loudly and records the exact synthetic username
for immediate operator investigation. Never suppress or retry such a failure
without first resolving whether that account still exists.

Run only after explicit production owner approval and only after the final API
receipt proves schema 9 and Content Studio readiness:

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
