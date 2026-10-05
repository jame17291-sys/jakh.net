# Performance budgets

The initial application payload excludes both large invocation-only feature
areas. `app.js` retains compatibility wrappers and the account/session startup
path; the first invocation loads the matching JavaScript and CSS in parallel:

- Live Battle Room: `/battle-mode.js` and `/battle-mode.css`.
- Global search and server-checked leaderboard/challenge:
  `/search-leaderboard.js` and `/search-leaderboard.css`.

The checked-in initial pair is 361,281 raw bytes, 88,028 gzip bytes, and 71,363
Brotli bytes. Search still requests only the active-language shard after the
feature opens. Language switching rebuilds an open overlay with its query intact.

Battle is an online-only WebSocket feature. Lazy assets intentionally are not
part of the service worker's guaranteed offline shell. The existing same-origin
JavaScript/CSS runtime route caches them after a successful online load. On a
cold offline load, a lazy-feature request fails through the existing localized
unavailable/error state; cached local questions remain usable.

## Cache identity boundary

The static-site build closes the asset-identity portion of PERF-04 without
breaking stable compatibility URLs. It retains the source versions of
`/app.js`, `/styles.css`, `/privacy.css`, both lazy feature pairs, and both
language shards with revalidation caching. Alongside them it emits SHA-256
fingerprinted copies using a 16-hex-character digest prefix.

References are rewritten only inside the built artifact and in dependency
order: language shards feed the fingerprinted search module; that module and
the Battle assets feed the fingerprinted app. The shared speech engine feeds
both the app and Kids reader, including their bounded download retry URLs;
HTML points at the fingerprinted
app and page CSS. The stable `/sw.js` points its guaranteed shell at the same
fingerprinted app/CSS graph. Its cache namespace is derived from a SHA-256 of
the complete deployable graph rather than a manually maintained version, so a
change to any deployable byte rotates the offline caches.

`site-manifest.json` records the stable-to-fingerprinted mapping, the complete
final-byte inventory, the source-graph identity, and the resulting offline
cache identity. Edge caching grants `immutable` only when the filename embeds
at least 12 hex characters that match the served file's own SHA-256 digest.
HTML, `/sw.js`, release metadata, and all stable compatibility URLs continue to
revalidate. Exact Worker-version rollback therefore restores the complete
prior HTML, asset graph, service worker, and manifest as one unit.

Run the deterministic budget gate with:

```sh
node scripts/validate-performance-budgets.mjs
node --test scripts/performance-budget.test.mjs
```

## Enforced limits

| Asset | Raw | Gzip (level 9) | Brotli (quality 11) |
| --- | ---: | ---: | ---: |
| `app.js` | 262,000 B | 68,000 B | 55,000 B |
| `styles.css` | 110,000 B | 22,000 B | 18,000 B |
| Initial `app.js` + `styles.css` | 370,000 B | 90,000 B | 72,000 B |
| Search + leaderboard JavaScript | 34,000 B | 9,000 B | 7,500 B |
| Search + leaderboard CSS | 8,000 B | 2,200 B | 1,800 B |
| `battle-mode.js` | 30,000 B | 8,000 B | 7,000 B |
| `battle-mode.css` | 12,000 B | 3,000 B | 2,500 B |
| Shared read-aloud JavaScript | 5,000 B | 2,200 B | 1,900 B |
| English search shard | 600,000 B | 210,000 B | 175,000 B |
| Arabic search shard | 825,000 B | 230,000 B | 190,000 B |

The search shards are separately budgeted because they load only when global
search opens. The gate measures the exact checked-in bytes with fixed compression
settings, so results are repeatable across runs.

The reader loads on pages that offer read-aloud controls. Its 4,969 raw bytes,
1,966 gzip bytes and 1,663 Brotli bytes include synchronous mobile activation,
retained chunks for long instructions, startup timeout, cancellation and error
recovery. Replacing separate Kids speech handling also gives both areas the
same voice selection and Arabic number preparation. After removing redundant
voice heuristics and cleanup, the shared engine costs 548 additional gzip bytes
over the previous implementation. Its compressed limits increase from 1,800
gzip / 1,500 Brotli bytes to the bounds above; its raw limit and all initial
application limits stay unchanged.

When an intentional product change needs more bytes, first remove equivalent
cost or document measured user impact before raising a limit. Do not silently
relax a budget to make the gate pass.
