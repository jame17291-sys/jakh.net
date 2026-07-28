# JAKH — jakh.net

Bilingual English–Arabic knowledge playground with riddles, curated learning
collections, and ten self-contained board and logic games.

## Production

The production site is the static app in `web/`. GitHub Pages deploys that
directory when `main` changes. Core browsing, games, language switching, search,
card flips, and solved progress work without a server; progress is stored on the
current device.

Server-backed account, battle, leaderboard, reporting, and suggestion controls
are capability-gated and stay out of the interface when `/api/health` is not
available.

## Local preview

```sh
cd web
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173`.

## Repository

- `web/` — production website
- `api/` — optional TypeScript API source, not part of the Pages artifact
- `ios/` — optional Capacitor wrapper, not part of the Pages artifact
- `.github/workflows/deploy.yml` — production Pages deployment
