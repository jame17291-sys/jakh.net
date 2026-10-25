# Riddle Arabia — project guide for Claude

This repository (`jame17291-sys/jakh.net`) is **Riddle Arabia** (https://riddlearabia.com, API
https://api.riddlearabia.com). Despite the repository name it is not the jakh.net site.
This repository is public: never commit secrets, tokens, account emails or private data.

## Working model: GitHub is the source of truth

The owner works from different devices. Nothing important may live only on one machine.

- Start every task from a fresh `origin/main` (`git fetch origin` and branch from `origin/main`).
  Confirm the branch explicitly; never assume `origin/HEAD`.
- Do each task on its own branch, push it, and open a pull request into `main`. Never commit
  directly to `main`, never force-push `main`, never hard-reset someone else's work.
- Decisions, open questions and follow-ups go into the pull request, an issue, or the docs in
  this repository, not into local notes.
- Production is released only by the protected GitHub Actions workflows (see Release). No ad hoc
  local `wrangler deploy`, no local migrations against production.
- Cloudflare credentials live as GitHub Actions secrets. Never ask for them in chat, print them or
  copy them into files.

The owner prefers short, non-technical updates: what changed, what was checked, and any real
blocker. Do not claim production success, factual verification or accessibility from source
inspection alone.

## Naming trap

Internal Cloudflare names are still `jakh-site` (static Worker), `jakh-api` (API Worker) and
`jakh-db` (D1). Identifiers, headers, storage keys and URLs containing `jakh` are not obsolete by
default; do not mass-rename them.

Since 12 Oct 2026, `jakh.net`, `www.jakh.net` and `api.jakh.net` belong to a different project.
They must never be reattached to Riddle Arabia, used as an API or static origin, or given
credentialed CORS access. `www.riddlearabia.com` canonicalises to `riddlearabia.com`. Docs that
describe a jakh.net redirect period or a `domain_cutover=true` release are superseded.

Riddle Arabia is unrelated to the owner's JAKH ERP/Odoo project.

## Product rules

- Bilingual Arabic/English (natural Arabic, full RTL) with a complete English option. Question
  cards and interface copy use clear Modern Standard Arabic (the owner reversed the
  everyday-dialect style on 25 Oct 2026). See `docs/content-review/ARABIC-STYLE-GUIDE.md`. Keep the
  cream / terracotta / hourglass identity unless the owner asks otherwise.
- All public practice questions and difficulty levels are free to guests. Accounts are optional.
  Do not add guest question limits, difficulty paywalls, paid services, paid tiers or external
  speech APIs without an owner decision. Hosting stays zero-cost.
- Already built (do not re-propose as new): 51 public categories, Quick Fire, server-checked
  scoring, leaderboard, Battle rooms, Kids Learning & Play (480 activities), Akshifha, puzzle and
  word games, board games, Most Likely To, How Well Do You Know Me, Friendship Court, Panic Mode,
  Secret Word Impostor, accounts/privacy, admin workspace with Content Studio and Autopilot.
- Shuffle Challenge (at `/daily` and `/ar/daily/`) replaced the old one-question Daily Challenge:
  10 random cards from 10 different public topics at a chosen level. Logic in
  `shuffle-challenge-engine.js`, page module `shuffle-challenge.js`, styles `shuffle-challenge.css`.
- Five categories are quarantined (economics-and-finance, law-middle-east, medical-questions,
  pharmacy, survival). Keep the hold consistent across HTML, JSON, search, API, edge and service
  worker. A passing validator or AI review is not factual or bilingual approval.
- Analytics is consent-gated and off by default. Never collect identities, emails, recovery codes,
  room credentials, raw searches or private friendship answers. Do not invent legal entity,
  address, contact or terms facts.

## Architecture

Static HTML/CSS/vanilla JS frontend plus a TypeScript Cloudflare Worker API. Not React/Next.

- Frontend: `index.html`, `app.js`, `styles.css`, `site-i18n.js`, `game-i18n.js`, `data/`,
  `kids-*`, `akshifha*`, `puzzle-*`, `tv-trivia*`, `party-games*`, `friendship-games*`,
  `speech-quality.js` (free device voices only), `auth-*`, `privacy-*`, `admin*`, `sw.js`.
- API: `worker/src/` (routes, D1 access, security, admin/MFA, content, autopilot, battle rooms,
  word duel, know-me). D1 schema in `worker/migrations/`.
- Static edge: `site-worker/`. `scripts/build-static-site.mjs` builds only Git-tracked,
  allow-listed files, so new public files must be added to Git before validating the build.
- `site-manifest.json` and other `scripts/generate-*.mjs` outputs are generated; edit the
  generator or source, never hand-edit hashes or build IDs.

## Development and checks

Node.js 24. Use the lockfiles, not global tools:

```
npm ci --no-audit --no-fund
npm ci --prefix worker --no-audit --no-fund
npm ci --prefix site-worker --no-audit --no-fund
```

Pick checks by what changed (see `package.json` for the full list): `npm run build:site`,
`npm run test:contracts`, `npm run test:site`, `npm run check:production`,
`npm run check:performance`, `npm --prefix worker run check`,
`npm --prefix worker run test:coverage`, `npm --prefix site-worker run check`,
`npm run test:browser:matrix`, `npm run test:a11y`. Never weaken tests, budgets, coverage or
review gates to get a green result.

## Release (only when the owner asks)

Follow the current `docs/DEPLOYMENT-CHECKLIST.md` and workflow source.

1. Merge the pull request into protected `main` with required checks green.
2. Run **API deploy** (`.github/workflows/api-deploy.yml`) from `main` with
   `release_phase=compatibility` and `domain_cutover=false`.
3. Then run **Static site** (`.github/workflows/static-site.yml`) from the same `main` commit with
   `domain_cutover=false` and confirmation `DEPLOY riddlearabia.com FROM protected main`.
4. Verify production and keep the commit SHA, Worker versions, build ID and monitor result.

`migrate-final` (schema changes) is a separate operation with backup, restore proof and approval
requirements in the checklist. Worker rollback does not undo D1.

`production-monitor.yml`, `site-autopilot.yml` and `recovery-verification.yml` run on schedules.
`pages.yml` is legacy break-glass only.

## Where to read next

Read only what the task needs: `docs/DEPLOYMENT-CHECKLIST.md`; content: `docs/CONTENT-STUDIO.md`,
`docs/content-review/README.md`, `docs/content-review/ARABIC-STYLE-GUIDE.md`; admin: `docs/ADMIN-WORKSPACE.md`,
`docs/ADMIN-MFA.md`; autopilot: `docs/AUTOPILOT.md`; kids: `docs/kids-learning.md`; social games:
`docs/PARTY-GAMES.md`; puzzles: `docs/games/puzzle-room.md`; SEO/performance: `docs/SEO-ARCHITECTURE.md`,
`docs/PERFORMANCE-BUDGETS.md`, `docs/HTML-DELIVERY-POLICY.md`; release/recovery:
`docs/STATIC-API-RELEASE-GATE.md`, `docs/RELEASE-MANIFEST.md`, `worker/RECOVERY.md`.
Older remediation ledgers and counts are historical, not today's issue list.
