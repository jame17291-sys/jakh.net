# Riddle Arabia public-search architecture

Riddle Arabia uses a deliberately small, editorial search surface. It is not a
catalogue dump and it does not publish pagination pages for every topic.

## Indexable pages

The source of truth is `scripts/riddlearabia-seo.mjs`. It defines eight original
bilingual experiences:

- Riddles
- Arabic riddles
- Logic challenges
- Family riddles
- General knowledge
- Arabia & Middle East history
- Spacetoon nostalgia
- Brain games

Each experience has its own bilingual copy, purpose, canonical pair, reciprocal
`hreflang`, social metadata, and schema. Quiz experiences publish a small,
curated set of real question cards. The brain-games experience publishes a
current game list rather than copying quiz content.

`/collections` and `/about` are hand-designed bilingual hubs. The homepage,
Mind Lab, Play, Daily, Privacy, Akshifha, and the ten classic game routes remain
indexable. Thirteen new bilingual puzzle destinations add twelve playable
engines and one Bonus collection, bringing the sitemap to 78 canonical URLs.
`sitemap.xml` contains only these indexable canonicals.

The new destinations use `puzzle-routes.js` for route identity and
`puzzle-pages.js` for localized rules and factual metadata. The public SEO
entrypoint also runs `scripts/generate-puzzle-pages.mjs`. Each page includes a
working game frame, unique initial HTML metadata, rules, limitations, related
games, and reciprocal language links. Bonus is a collection, not a thirteenth
engine. `/play` and `/brain-games` describe the same 13 puzzle entries and three
featured/classic games; legacy games retain their existing URLs.

Game invitations, dated puzzles and variants are not separate search landing
pages. Legacy `/play?game=...` links redirect to the corresponding clean route,
while preserving state options and existing save identities. Stateful responses
carry `X-Robots-Tag: noindex, follow`; their requests remain crawlable so Google
can read that instruction. The service worker does not cache those responses
under a clean-page key. Language switching preserves date and edition.

Sitemap modification dates record meaningful page changes, using the site's
Dubai calendar date. Regeneration alone must not refresh those dates. Google
ownership verification files are protocol assets; only an exact Google filename
and matching one-line payload are exempt from editorial HTML checks. They are
served at the exact `.html` URL, carry noindex, and stay out of the sitemap.

## Functional topic routes

The existing topic URLs remain available as app-powered, bilingual category
shells. They load the full current question bank in the browser, but carry
`noindex,follow` so thin programmatic topic pages do not compete with the
editorial experiences. No `/page/N/` pages are generated or published.

## Migration and release safety

The old English collection folders and former Arabic collection folders are
deleted from the static source. One-hop redirects live at the edge for their
replacement routes, preserving query strings.

Run these before a release:

```sh
node scripts/generate-seo-pages.mjs --check
node scripts/generate-arabic-routes.mjs --check
node scripts/validate-seo.mjs
node scripts/validate-bilingual.mjs
node --test scripts/puzzle-seo.test.mjs
```

The static build also rejects retired public SEO artifacts and legacy public
branding. Public SEO pages use the current brand asset at
`/assets/riddlearabia-logo.webp`.
