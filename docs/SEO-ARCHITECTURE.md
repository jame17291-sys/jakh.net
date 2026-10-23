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
curated set of real question cards. The two riddle pairs (`/riddles` with `/ar/alghaz/`, and
`/arabic-riddles` with `/ar/alghaz-arabiya/`) feature 30 published riddles
each, ordered from easy to hard; the other collections feature eight.
`docs/content-review/featured-policy.json` fixes each count, and
`npm run check:featured` rejects held cards and any card featured on two
collections, so indexable pages never repeat each other. The brain-games experience publishes a
current game list rather than copying quiz content.

`/collections` and `/about` are hand-designed bilingual hubs. The homepage,
Mind Lab, Play, Daily, Privacy, Akshifha, and the ten classic game routes remain
indexable. Thirteen new bilingual puzzle destinations add twelve playable
engines and one Bonus collection. With the bilingual Kids Learning & Play
pages the sitemap lists 1,176 canonical URLs (88 core pages plus 1,088 kids
pages); `sitemap.xml` contains only indexable canonicals. Search-engine
submission is described in `docs/SEARCH-DISCOVERY.md`.

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

## Sharing and language entry

Every collection page offers a WhatsApp link for the whole collection and
for each card. Card links send the question and a link back to the card
(`#card-id`), never the answer. They are plain `wa.me` links with no script.

The English home page sends a visitor to `/ar/` only when the browser's
first language is Arabic, the visit did not come from inside the site, and
no language was chosen (`jakh-home-language`, set by the language links, or
the saved site language). Crawlers use an English locale and are never
redirected, so `/` and `/ar/` stay separately indexable with reciprocal
`hreflang`; `x-default` remains `/`.

The shared link preview is `assets/riddlearabia-og-image.png`, 1200×630.
`validate-seo` checks every page's `og:image:width/height` against the
real image.

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
