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
Mind Lab, Play, Privacy, and the ten playable game routes remain indexable where
appropriate. `sitemap.xml` contains only these indexable canonicals.

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
```

The static build also rejects retired public SEO artifacts and legacy public
branding. Public SEO pages use the current brand asset at
`/assets/riddlearabia-logo.webp`.
