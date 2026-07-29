# JAKH API

Cloudflare Worker backend for the static JAKH site. It provides:

- Username/password sessions using HttpOnly cookies
- Cloud progress, favorites, avatars, streaks, and leaderboards
- Suggestions and authenticated time analytics
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

## Validation

```sh
npm install
npm run check
npm test
npx wrangler deploy --dry-run
```

Apply D1 migrations before each production deployment:

```sh
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Production is served only from the `api.jakh.net` custom domain. Keep
`workers_dev` disabled so the API does not have a second public hostname.

Never commit `.dev.vars`, Cloudflare tokens, or generated secrets.
