# JAKH — Project Memory (CLAUDE.md)

## Vision
Transform jakh.net from a static bilingual riddle platform into an **adaptive, AI-enhanced Bilingual Intelligence Hub** — fun, smart, mobile-first learning in native English and Arabic.

## Current Architecture (as of 2026-04)

### Frontend — `/Users/jameelkhabaze/JAKH/site/`
- **Stack:** Vanilla JS SPA (`app.js` ~3100 LOC), single CSS file (`styles.css`), 48+ static HTML files
- **Pattern:** One `index.html` (homepage) + one HTML per category (`history.html`, `math.html`, etc.), all sharing the same `app.js` + `styles.css`
- **State:** All in a global `state` object. No framework, no bundler. Tabs/SPAs are simulated via JS DOM manipulation.
- **i18n:** Full EN/AR translation table in `app.js` (`TRANSLATIONS.en` / `TRANSLATIONS.ar`). Language toggle sets `document.documentElement.dir` and re-renders.
- **PWA:** `manifest.webmanifest` + `sw.js` (cache-first for assets, network-first for API, pre-caches all category HTML/JSON). Already installable.
- **Theme:** Dark (After-hours) by default. CSS custom properties (`--bg`, `--text`, `--accent`, `--panel`, etc.). Light mode via `html[data-theme='light']`.
- **Fonts:** Fraunces (display), Instrument Sans (UI), JetBrains Mono, IBM Plex Sans Arabic via Google Fonts.
- **Difficulty:** easy → medium → hard → very-advanced. Hard/very-advanced gated: guests get 10 free trial flips then paywall; logged-in users need skill gate (10 correct answers).

### Backend — `/var/www/jakh.net-api/` (TypeScript/Express)
- **Deployment:** EC2 (`ubuntu@18.185.129.207`), PM2 process `jakh-api`, port 3000, reverse-proxied by Nginx
- **DB:** PostgreSQL via Prisma ORM
- **Auth:** JWT in httpOnly cookie + `currentSessionId` single-device hardening
- **Routes:** `/api/auth`, `/api/user`, `/api/team`, `/api/analytics`, `/api/admin`, `/api/suggestions`, `/api/tts`, `/api/leaderboard`
- **TTS:** Proxies Google Translate TTS (rate-limited 120/hr/IP)

### Data — `/Users/jameelkhabaze/JAKH/site/data/` (56 JSON files)
```json
// Per-category file e.g. ancient-civilizations.json
{
  "slug": "ancient-civilizations",
  "title": { "en": "Ancient Civilizations", "ar": "الحضارات القديمة" },
  "count": 40,
  "cards": [{
    "id": "anc-1",
    "difficulty": "easy",
    "question": { "en": "...", "ar": "..." },
    "answer":   { "en": "...", "ar": "..." }
  }]
}
```
Card can also have: `mode` ("quiz"|"story"), `subcategory` ({en,ar}), `explanation` ({en,ar}), `emoji`.

### Prisma Schema (key models)
- `User`: id, username, email, password, role (USER/ADMIN/OWNER), currentSessionId, streakFreezeCount
- `UserProgress`: userId, categoryId, cardId, status (difficulty | "wrong-{difficulty}")
- `UserFavorite`: userId, categoryId, cardId
- `Team`: id, name, score
- `UserTeam`: userId, teamId

## Deployment Workflow
```bash
# Deploy site files
scp -i ~/Downloads/JAKH.pem /Users/jameelkhabaze/JAKH/site/app.js \
    /Users/jameelkhabaze/JAKH/site/styles.css \
    ubuntu@18.185.129.207:/var/www/jakh.net/
scp -i ~/Downloads/JAKH.pem /Users/jameelkhabaze/JAKH/site/*.html \
    ubuntu@18.185.129.207:/var/www/jakh.net/

# Deploy API (after editing server files via SSH)
ssh -i ~/Downloads/JAKH.pem ubuntu@18.185.129.207
cd /var/www/jakh.net-api && npm run build && pm2 restart jakh-api

# Version bump (cache-busting) — always do before deploying
find /Users/jameelkhabaze/JAKH/site/ \( -name "*.html" \) | \
  xargs sed -i '' 's/v=OLD_VERSION/v=NEW_VERSION/g'
# Also update app.js and styles.css references
```

## Coding Standards

### JavaScript (app.js)
- Global `state` object — mutate directly, no Proxy/reactive layer
- `escapeHtml()` on all user-visible strings from data files
- All i18n through `t('key')` — add keys to BOTH `TRANSLATIONS.en` and `TRANSLATIONS.ar`
- Event delegation on `els.cardGrid` for all card actions (via `data-action` attributes)
- Never add external JS libraries — keep the bundle zero-dependency
- `trackEvent(name, params)` for every user action that matters analytically
- `apiFetch(path, options)` for all API calls (handles auth, base URL)

### CSS (styles.css)
- CSS custom properties for all design tokens (never hardcode colors)
- Dark mode = default (`:root`); light mode = `html[data-theme='light']`
- Use logical properties (`inset-inline-start`, `margin-inline`, etc.) not `left`/`right` for RTL compatibility
- Mobile-first. Breakpoints: 480px, 600px, 720px, 768px, 1040px
- Animations must respect `prefers-reduced-motion`
- Never use `!important` except for overriding legacy specificity bugs

### API (TypeScript/Express)
- All routes: rate-limit + input validation + sanitize path params with `/^[a-z0-9-]+$/`
- Auth routes must verify `currentSessionId` against DB (not just JWT payload)
- All DB access through Prisma — no raw SQL
- Errors: never expose stack traces to client

### HTML (category pages)
- All 48+ pages share identical structure — edit `category-template.html` first, then propagate via `build.py`
- `data-i18n` attribute marks elements updated on language toggle
- Never inline styles — use CSS classes

## Roadmap (Intelligence Hub phases)

### Phase 1 — Foundation (current)
- [x] PWA (manifest, service worker, offline)
- [x] Bilingual EN/AR with RTL
- [x] Difficulty gating + trial paywall (10 free flips)
- [x] Team mode (sync scoring)
- [x] TTS (text-to-speech)
- [x] Daily challenge + streaks
- [x] Admin panel
- [x] After-hours dark theme + micro-animations
- [ ] AI Socratic Hint system (`/api/hint` → Claude Haiku)
- [ ] Adaptive difficulty recommendation (client-side solve-rate logic)
- [ ] SW cache version sync with app version

### Phase 2 — Intelligence Layer
- [ ] Socratic AI Tutor: progressive hints, never reveals answer
- [ ] Adaptive Difficulty Engine: tracks solve rate + speed, adjusts card difficulty served
- [ ] Dynamic question generation: LLM generates new cards for thin categories on demand
- [ ] User solve-time tracking (add `solvedAt`, `timeToSolve` to UserProgress)

### Phase 3 — Specialized Modules
- [ ] Foundation Track: bilingual phonics/letter-sound for ages 4-7 (new `mode: 'phonics'`)
- [ ] B2B Team Mode: WebSocket live multiplayer rooms (needs socket.io or Cloudflare Durable Objects)
- [ ] Corporate room codes + private question sets

### Phase 4 — Scale & Performance
- [ ] Edge deployment (Cloudflare Workers or Vercel Edge for static assets)
- [ ] Lighthouse 100/100 (image optimization, font subsetting, critical CSS inline)
- [ ] Social sharing image generation (canvas/Satori)
- [ ] Monthly leaderboard seasons

## Key Design Decisions

1. **No framework migration** — the vanilla JS SPA is fast and works. Add AI/features as progressive enhancement, not a rewrite. Next.js migration only if SSR/SEO becomes critical.

2. **AI hints are additive** — the hint button sits alongside existing flip-for-answer. Users can ignore it. It calls `/api/hint` which proxies Claude Haiku (cheap, fast, bilingual).

3. **Adaptive difficulty = client-side first** — no new DB tables needed. Use existing `UserProgress` data to compute solve rate per difficulty and suggest the right starting difficulty for new sessions.

4. **RTL = logical CSS** — switching to `inset-inline-*` / `margin-inline-*` / `padding-inline-*` throughout CSS means RTL is free. Avoid `left`/`right` in any new CSS.

5. **Trial paywall converts guests** — 10 free hard/very-advanced flips, then paywall modal → register CTA. Do not add a payment system until user base justifies it.

## Environment Variables (server)
```
DATABASE_URL=          # PostgreSQL connection string
JWT_SECRET=            # JWT signing key (required — exits if missing)
ANTHROPIC_API_KEY=     # Claude API key for /api/hint route
```

## File Map
```
site/
  index.html            — Homepage (hero, category grid, daily challenge)
  [slug].html           — Category page (44+ files, same structure)
  app.js                — All client-side logic (~3100 LOC)
  styles.css            — All styles (~1570 LOC)
  sw.js                 — Service worker (cache-first PWA)
  manifest.webmanifest  — PWA manifest
  admin.html            — Admin panel (ADMIN/OWNER role only)
  category-template.html — Template for new category pages
  build.py              — Script to generate category HTML from template
  data/                 — 56 category JSON files
  assets/               — Logo, icons, OG image

api/ (server: /var/www/jakh.net-api/)
  src/
    index.ts            — Express app entry, route registration
    routes/
      auth.ts           — Login, register, logout, session
      user.ts           — Profile, progress, favorites, score
      team.ts           — Team CRUD, score update
      analytics.ts      — Page analytics ingestion
      admin.ts          — Content management (ADMIN+ only)
      suggestions.ts    — User topic suggestions
      tts.ts            — Text-to-speech proxy (Google TTS)
      leaderboard.ts    — Global leaderboard
      hints.ts          — [PLANNED] AI Socratic hints via Claude
    prisma.ts           — Prisma client singleton
```
