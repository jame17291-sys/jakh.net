# JAKH API

Cloudflare Worker backend for Riddle Arabia. It provides:

- Username/password sessions using HttpOnly cookies, plus one-time offline
  recovery codes (only SHA-256 digests are stored)
- Cloud progress, favorites, avatars, and streaks
- One-time, server-issued quiz challenges and server-checked public rankings
- Optional account-linked suggestions, account data export, permanent deletion,
  privacy preferences, and consent-gated learning-time analytics
- Real-time battle rooms using Durable Objects and hibernating WebSockets

## Runtime resources

- D1 binding: `DB`
- Durable Object binding: `BATTLE_ROOMS`
- Password-hashing Durable Object binding: `PASSWORD_HASHERS`
- Secrets: `PASSWORD_PEPPER`, `IP_HASH_SALT`
- Public API host: `https://api.riddlearabia.com`

The frontend runs on the separate static Worker at `riddlearabia.com`.
`api.riddlearabia.com` is its API custom domain, and the allowed browser origins
are the Riddle Arabia apex and `www` host. The `jakh.net` aliases are retired
for reuse by another project; do not add them to routes or credentialed CORS.

Password derivation runs inside a SQLite Durable Object so the strong PBKDF2
work factor does not exceed the Free Worker HTTP CPU limit. Card scores and
sync payloads are validated against the generated `src/card-index.json`.
Server-checked challenges use only concise bilingual canonical answers or
explicitly curated short-answer aliases, keep answer commitments server-side,
expire after 15 minutes, and can be submitted once. Scores are accuracy-only;
elapsed time is recorded for abuse review but creates no score or leaderboard
tiebreak advantage. The server checks the submitted answers, but it does not
verify who answered and cannot prevent a player from looking up public answers
or automating submissions. Responses therefore say `scoreType:
"server-checked"`, `serverChecked: true`, and `proctored: false` and include the
automation disclaimer. New clients use `/api/scores/server-checked/*`; the old
`/api/scores/verified/*` URL is retained only so deployed clients do not break
and is not a claim of proctoring.

`DELETE /api/scores/server-checked/challenge` requires authentication and a
`categoryId`. Normal cancellation also sends the issued `challengeId` and
`submissionToken`; all four ownership/category/id/token checks plus
`status = 'pending'` must match in one conditional update. This prevents a stale
tab from discarding a newer challenge. A category-only request is the explicit
reload-recovery option: it discards the caller's current pending challenge in
that category and can therefore affect another open tab. The response is only
`{ "discarded": true|false }` and never returns a stored or replacement token.

Analytics defaults to off. The write itself is conditional on a current consent
row. Scheduled retention maintenance processes up to ten 500-row batches per
operation per run. After the tenth full batch, a bounded `LIMIT 1` read-only
probe distinguishes exactly 5,000 drained rows from a remaining backlog. Only
an operation with a row still remaining raises
`RETENTION_CLEANUP_SATURATED`; it is never silently treated as drained. Every
named maintenance job runs even when another fails, then the event fails with
`SCHEDULED_MAINTENANCE_FAILED` and the failed job names. This bounded process
reduces expired data and makes excess backlog alertable, but does not promise
instant deletion under sustained load. Signed-in suggestions are linked to an
account only when the sender explicitly opts in.

`GET /api/auth/session` is the anonymous-safe session probe. Missing, malformed,
unknown, and expired cookies return `200 { "authenticated": false }`; a current
session returns only `id`, `username`, `avatar`, and `role`. It never returns an
email address, cookie value, or session-token digest.

## Account recovery contract

- `POST /api/auth/register` accepts `username`, `password`, and optional
  `email`; it returns `{ user, recoveryCode }` and sets the session cookie.
- `POST /api/auth/recovery/reset` accepts `username`, `recoveryCode`, and
  `newPassword`; it consumes the submitted code, revokes every old session,
  returns `{ user, recoveryCode }`, and sets a fresh session cookie.
- `POST /api/auth/recovery/rotate` requires a session plus `password` and
  returns `{ recoveryCode }` after replacing any previous code.
- `POST /api/user/password` requires `currentPassword` and `newPassword`; it
  revokes every session and sets a new current session cookie atomically.

Every returned recovery code is a high-entropy bearer secret shown once. The
client must ask the user to save the replacement; it must not persist the code
in browser storage or send it to analytics/logging.

## Sign-in and recovery limits

Usernames are public on the leaderboard, so sign-in limits must not let a
stranger lock a known account out. All windows are 15 minutes and use the
existing `rate_limits` table; no schema change is involved.

- `POST /api/auth/login`: only failed passwords count toward the account
  limits; a success hands its slot back.
  Register, sign-in and recovery set a long-lived, opaque
  `__Host-jakh_device` cookie (HttpOnly, Secure, SameSite=Strict, Path=/;
  `jakh_device` on plain-HTTP localhost). It holds a random nonce and an HMAC
  over the account ID and nonce, keyed from `PASSWORD_PEPPER` through HKDF with
  its own label. It grants no access. A browser presenting a valid cookie for
  the account it is signing in to gets its own budget of 10 failures and skips
  the shared limits below. Every other browser meets a limit of 20 requests
  per network and shares one budget of 20 failures per account from any
  network, which still caps distributed password guessing. While that shared
  budget is used up, a browser the account has not seen before waits up to 15
  minutes or uses recovery.
- `POST /api/auth/recovery/reset`: at most 8 requests per network and 5 failed
  codes per account and network. Recovery codes are 256-bit random values, so
  there is no account-wide recovery limit for a stranger to exhaust.
- Logout keeps the device cookie; account deletion clears it.

During the schema 9 → 10 release, the compatibility Worker keeps login, profile,
progress, leaderboard, suggestion, game, scoring, and the static question corpus
available. Privileged admin operations return `503 MFA_UNAVAILABLE` until
schema 10 creates the MFA tables. The health response reports the
actual D1 schema, target schema, compatible schema range, and feature-readiness
flags; it never reports a missing-table feature as ready.

## Validation

```sh
npm install
npm run check
npm test
npx wrangler deploy --dry-run
```

Production schema changes use two separate, manually selected runs of **Deploy
API** from the same validated source:

1. `compatibility` deploys the target Worker against the current D1 schema and
   contains no migration command. It verifies D1 did not change. A failed
   compatibility health contract rolls back only when the exact prior Worker
   version has independently passed the required runtime safety proof.
2. `migrate-final` refuses before any D1 mutation unless the one active Worker
   reports the source version, actual current schema, target schema, a
   compatibility range containing both schemas, and honest feature readiness.
   Its deployment metadata must also bind that Worker to the exact current Git
   commit and target schema; if `main` changed, rerun `compatibility` first.
   Only then does it export, encrypt, restore-test, and retain a database backup,
   capture Time Travel evidence, apply migrations, prove the
   same Worker on the target schema, and deploy the final Worker. A failed final
   verification rolls back to that proven-compatible Worker version; Worker
   rollback never reverses D1.

For code-only releases, use `compatibility`; when D1 is already at the source
schema, `migrate-final` deliberately refuses. Do not bypass this protocol with a
manual `wrangler d1 migrations apply` followed by `wrangler deploy`.

The canonical production API hostname is `api.riddlearabia.com`. Production
configuration declares only that API hostname and uses `riddlearabia.com` for
room invitations and shared links. Keep `domain_cutover` false: the former
one-time migration path is retired.
Keep `workers_dev` disabled to avoid an additional `workers.dev` endpoint.

Never commit `.dev.vars`, Cloudflare tokens, or generated secrets.

## Production deployment ownership

Production API and static releases must run through their protected GitHub
Actions workflows. Cloudflare Workers Builds for `jakh-api` must remain
validation-only: repository root `/worker`, production branch `main`, build
command `npm run check`, and deploy command `npx wrangler deploy --dry-run`.
This configuration was observed and saved on 2026-09-30. The static site Worker
has no connected repository.

A second deployment pipeline can replace a verified Worker and remove its
source annotation before migration. Keep the exact-source gate intact; after
any configuration change that creates a Worker version, rerun compatibility
before migration.

The follow-up production monitor identifies release workflows by their file
path, since GitHub can return the custom run title as the run name. Only a
successful API compatibility run with its exact source SHA may use the supported
pre-migration schema range. Scheduled, manual, and final-release monitoring keep
the strict target-schema contract. Release checks use the triggering source
commit; the classifier is loaded separately from the monitor workflow's exact
commit so older or rerun releases do not need to contain newer workflow helpers.
