# JAKH API

Cloudflare Worker backend for the static JAKH site. It provides:

- Username/password sessions using HttpOnly cookies
- Cloud progress, favorites, avatars, streaks, and leaderboards
- Suggestions and authenticated time analytics
- Real-time battle rooms using Durable Objects and hibernating WebSockets

## Runtime resources

- D1 binding: `DB`
- Durable Object binding: `BATTLE_ROOMS`
- Secrets: `PASSWORD_PEPPER`, `IP_HASH_SALT`
- Public API host: `https://api.jakh.net`

The frontend stays on GitHub Pages. `api.jakh.net` must be a Cloudflare Worker
custom domain so cookies remain first-party to JAKH.

## Validation

```sh
npm install
npm run check
npm test
```

Apply D1 migrations before each production deployment:

```sh
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Never commit `.dev.vars`, Cloudflare tokens, account IDs, or generated secrets.
