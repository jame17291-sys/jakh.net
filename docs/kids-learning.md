# Kids Learning & Play

The kids hub is a dedicated static learning experience at `/kids-riddles` and
`/ar/topics/kids-riddles/`. It does not load the generic quiz application.

## Authoring and generation

- The five activity sources listed in `data/kids/inventory.json` contain 480
  distinct bilingual activities and questions. Each of six learning areas has
  80 entries: twenty for each of four age bands. The original 120 entries and
  their IDs are preserved. IDs are stable across language changes.
- `scripts/kids-resources.mjs` owns age/area descriptions, eight parent guides,
  and deterministic sets of 24 printable packs and 16 five-activity weeks.
- `scripts/generate-kids-pages.mjs` is the sole owner of the kids HTML and the
  lightweight browser catalog. `generate-seo-pages.mjs` calls it before the
  general SEO generator. General topic-shell generation skips kids.
- `scripts/kids-legacy.mjs` preserves the 30 original questions and IDs, adds
  age guidance and explanations, and makes them available in a separate
  original-riddles collection. It does not promote original review statuses.

Run `npm run generate:kids` after authoring, then
`node scripts/generate-seo-pages.mjs` and
`node scripts/generate-arabic-routes.mjs` for shared navigation and sitemaps.
All generated HTML is committed so content remains usable without JavaScript.

## Printable packs

Each pack has English and Arabic A4/Letter editions (96 PDFs). The PDFs contain
twenty activity sheets followed by a separate parent answer/variation guide. The same
activities have accessible HTML pages and require no printer.

Authoring command: `python3 scripts/generate-kids-pdfs.py`. Install
`reportlab`, `arabic-reshaper`, and `python-bidi` in the authoring environment.
The script uses system Arial on macOS; elsewhere set `KIDS_PDF_FONT` and
`KIDS_PDF_BOLD_FONT` to embeddable Arabic-capable TrueType font files. Arabic
is wrapped in logical order and shaped/reordered per line. The adjacent HTML
remains the semantic reading alternative to the print-oriented PDFs.

`data/kids/print-manifest.json` records source hashes, the generator hash, and
every PDF digest. A source edit makes the printable check fail until packs are
regenerated. Render the Arabic and English A4/Letter editions for visual QA;
text extraction alone cannot verify Arabic joining or direction.

## Parent toolkit

`kids-state.js` normalizes a versioned record under
`riddlearabia-kids-toolkit-v1`. It stores only activity IDs for saves, completion,
and Monday–Sunday planner slots. It does not read/write the quiz account
store, names, birthdays, or child profiles. Completion follows an activity
across languages. Adding a week merges without deleting earlier choices.
The parent can move/remove individual activities, print the week, or explicitly
clear the toolkit. If storage is unavailable, the current tab works with a
visible explanation. There is no account API or D1 migration.

## Validation and release

`npm run check:kids` checks inventory, bilingual fields, generated routes,
legacy identity, printable digests, filtering and toolkit state behavior.
The existing site build fingerprints the kids runtime, state module, stylesheet
and catalog, and serves PDFs. Every substantive kids route is in the bilingual
sitemap; the personal toolkit is noindex and filtered URLs keep their clean
canonical and receive noindex/no-store response headers. The existing site checks remain required.

`docs/content-review/kids-release-review.json` binds the completed AI editorial
review to the exact activity/resource/legacy source hashes. A content edit must
receive a new review and updated review record before publication checks pass.
This gate does not represent qualified educator or human approval.

Before publication, test the built artifact in English and Arabic at desktop
and 360px: find by age/time/materials, open/read an activity, reveal a hint and
answer, save/complete it, add/move/remove a planned activity, switch languages,
reload, print, reset, and follow an old `?card=kids-riddles-001` link. Check
keyboard access, readable focus, reduced motion, speech fallback, blocked
storage, and console/network failures. Content reviews here are explicitly
AI editorial reviews, not claims of qualified educator or human approval.

Roll out using the existing static-site release workflow after preview review.
Rollback is the ordinary previous static artifact; no server-side data changed.
