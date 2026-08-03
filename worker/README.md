# JAKH API

Cloudflare Worker backend for the static JAKH site. It provides:

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
- Public API host: `https://api.jakh.net`

The frontend stays on GitHub Pages. `api.jakh.net` must be a Cloudflare Worker
custom domain so cookies remain first-party to JAKH.

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

During the schema 8 → 9 release, the compatibility Worker keeps login, profile,
progress, leaderboard, suggestion, game, scoring, and the static question corpus
available. Content Studio returns `503 CONTENT_STUDIO_UNAVAILABLE` until schema 9
creates its draft and immutable revision tables. The health response reports the
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
   contains no migration command. It verifies D1 did not change and rolls back
   to the exact prior Worker version if the compatibility health contract fails.
2. `migrate-final` refuses before any D1 mutation unless the one active Worker
   reports the source version, actual current schema, target schema, a
   compatibility range containing both schemas, and honest feature readiness.
   Its deployment metadata must also bind that Worker to the exact current Git
   commit and target schema; if `main` changed, rerun `compatibility` first.
   Only then does it capture Time Travel evidence, apply migrations, prove the
   same Worker on the target schema, and deploy the final Worker. A failed final
   verification rolls back to that proven-compatible Worker version; Worker
   rollback never reverses D1.

For code-only releases, use `compatibility`; when D1 is already at the source
schema, `migrate-final` deliberately refuses. Do not bypass this protocol with a
manual `wrangler d1 migrations apply` followed by `wrangler deploy`.

Production is served only from the `api.jakh.net` custom domain. Keep
`workers_dev` disabled so the API does not have a second public hostname.

Never commit `.dev.vars`, Cloudflare tokens, or generated secrets.
