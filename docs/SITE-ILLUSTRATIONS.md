# Website illustrations

Riddle Arabia uses a coordinated warm wood, brass, ivory, and amber illustration
collection. The 22 original illustrations are joined by 68 new designs: one for
each of the 51 public topics and 17 additional game entries. Four existing game
illustrations remain assigned exclusively to Akshifha, chess, Backgammon, and
Quick Fire. All 72 topic/game assignments use different images.

Only optimized transparent WebP variants are published. The original PNGs stay
outside the website build. The new artwork was generated with the built-in
Imagegen tool; the complete subject briefs and prompts are preserved in
`docs/topic-game-illustration-prompts.json`.

## Placements

| Area | Illustrations |
| --- | --- |
| Home | Discovery, daily challenge, Akshifha, Arabic riddles, nostalgia, logic, regional history |
| Riddles & Quizzes | 51 individual topic pictures, overview, five section accents, suggest-a-topic |
| Games | 13 puzzle/collection cards, three bonus variations, Akshifha, chess, Backgammon, Quick Fire, Battle Room |
| Individual games | Compact Akshifha, chess, Backgammon introductions |
| Daily Challenge | Daily challenge introduction |
| Collections | Artwork for each collection card and collection introduction |
| Topics | Every public topic introduction uses the same exclusive picture as its directory card |
| About and brain games collection | Shared play |

English and Arabic versions of the same topic/game share its picture. Different
topics or games never share an assignment. Question cards remain text only;
illustrated directory cards retain their direct links, counts, and progress.
The publication quarantine continues to determine which topics ship. The five
held source topics receive no new public artwork.

## Maintenance

`site-illustrations.js` holds the image names, mappings, and responsive markup.
`directory-ui.js` uses it when visitors search or switch topic tabs.
`scripts/generate-riddlearabia-seo.mjs` uses the same mapping for no-JavaScript
directory content, collection pages, and topic introductions. Hand-authored
English hub and game pages contain the same generated image markup.
`scripts/puzzle-markup.mjs` and `puzzle-room.js` share the game mapping, including
the three bonus variants. The shared registry and directory/puzzle runtimes are
fingerprinted together so their imports remain consistent across releases.
The 26 canonical puzzle pages also show their own artwork beside the game
explanation. Bonus variants switch that accent to the variant's exclusive
picture when the game opens.

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

Canonical category SVGs and their existing validation remain intact. The image
validator checks every public topic assignment, game assignment, duplicate file
hashes, responsive files, and bilingual source markup. Directory tests also
check that interactive rendering retains all 51 distinct pictures. Static
builds use tracked files, so new image files must be staged before a local build.

## Validation and release

Run source and generation checks, the exact static build, contract tests,
browser regression matrix, and accessibility checks before release. Verify
both languages, narrow viewports, topic filters, puzzle filters, and bonus
cards. Image additions must not change the navigation touch-target requirement
or the production API/static source identity checks.

Use the repository's existing pull-request and production release process.
`.github/workflows/static-site.yml` requires current protected `main`, the
exact workflow confirmation, and a production reviewer. This change does not
alter deployment controls, Worker services, or hosting costs.
