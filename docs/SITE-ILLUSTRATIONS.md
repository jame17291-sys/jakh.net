# Website illustrations

The 22 final Riddle Arabia illustrations use the existing warm parchment,
wood, and amber visual theme. Only the optimized transparent WebP variants
are published; original PNGs and the superseded Backgammon draft stay out of
the website build.

## Placements

| Area | Illustrations |
| --- | --- |
| Home | Discovery, daily challenge, Akshifha, Arabic riddles, nostalgia, logic, regional history |
| Riddles & Quizzes | Overview, five subject-section accents, suggest-a-topic |
| Games | Akshifha, chess, corrected Backgammon, Quick Fire |
| Individual games | Compact Akshifha, chess, Backgammon introductions |
| Daily Challenge | Daily challenge introduction |
| Collections | Artwork for each collection card and collection introduction |
| Topics | Subject artwork, with dedicated space, geography, football, books, music, food, inventions, and children's illustrations |
| About and brain games collection | Shared play |

The same placements are generated for English and Arabic routes. Full topic
pages use their specific illustration where available and their subject's
illustration otherwise. Question cards and compact topic links remain text
only. The publication quarantine continues to determine which topics ship.

## Maintenance

`site-illustrations.js` holds the image names, mappings, and responsive markup.
`directory-ui.js` uses it when visitors search or switch topic tabs.
`scripts/generate-riddlearabia-seo.mjs` uses the same mapping for no-JavaScript
directory content, collection pages, and topic introductions. Hand-authored
English hub and game pages contain the same generated image markup.

After changing source pages or mappings, regenerate checked-in output:

```sh
node scripts/generate-seo-pages.mjs
node scripts/generate-arabic-routes.mjs
node scripts/validate-responsive-images.mjs
```

Images have 480- and 960-pixel variants, explicit dimensions, and `sizes`
appropriate to their placement. Introductory images load eagerly; section
and card images load lazily. Empty alternative text is intentional: these
decorative illustrations repeat the adjacent heading and do not convey game
instructions, evidence, or answers. Logical CSS properties follow RTL.

Canonical category SVGs and their existing validation remain intact. The
directory validator permits one responsive section illustration per subject
while still rejecting images inside compact topic cards. Static builds use
tracked files, so new image files must be staged before a local build.

## Validation and release

The initial integration passed the static build, SEO generation checks,
Arabic generation checks, static/bilingual validators, production hygiene,
game focus, performance budgets, contract tests, and site Worker tests.
All 44 WebPs were checked for the expected dimensions and transparency; all
22 final image names occur in the page HTML.

Browser screenshots, browser regression, and accessibility browser checks
could not run in the preparation environment because Chromium could not
launch. They must run in the existing CI/release environment before release.

Use the repository's existing pull-request and production release process.
`.github/workflows/static-site.yml` requires current protected `main`, the
exact workflow confirmation, and a production reviewer. This change does not
alter deployment controls, Worker services, or hosting costs.
