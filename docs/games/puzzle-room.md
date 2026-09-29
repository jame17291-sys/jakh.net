# Riddle Arabia puzzle room

The English `/play` and Arabic `/ar/play/` directories now include all thirteen requested menu categories. Games open within the directory through `?game=...`; the existing Akshifha, Chess, Backgammon and quiz links remain available. Names, clue banks, puzzle content and artwork are original Riddle Arabia implementations.

| Reference category | Riddle Arabia game ID | Implementation |
| --- | --- | --- |
| Bonus Puzzles | bonus | Three real variants: 3×3 Connections, a letter clue, and a crossword head start |
| Crossplay | duel | Online two-player word board with invite codes, private racks and server validation |
| Crossword / Midi / Mini | crossword / midi / mini | Connected, clued 13×13 / 9×9 / 5×5 generated grids |
| Spelling Bee | hive | Seven letters, required centre, curated words, pangram scoring |
| Wordle | word | Five letters, six guesses, duplicate-letter allocation, keyboard |
| Pips | domino | Domino placement, rotation, flipping and region constraints |
| Strands | trails | Adjacent-letter paths, full board coverage, spanning answer, earned hints |
| Connections | links | Four groups of four, four mistakes, duplicate attempt protection |
| Tiles | mosaic | Three-layer matching, chains, hints and undo |
| Letter Boxed | letter-square | Alternating sides, linked words and all twelve letters |
| Sudoku | sudoku | Unique solution, three difficulties, notes/check/hint/undo |

## Content and progress

Each language has 24 Five Letters answers, 3 Hives, 6 Connections sets, 2 Trails and 2 Letter Squares. Crossword clue banks generate connected grids; Sudoku, dominoes and mosaic generate seeded boards. This is a finite editorial library, openly identified as such in the interface. The games do not promise a newly authored puzzle every day. Word dictionaries are curated, displayed in game, and do not accept every valid word in the language.

Solo puzzle selection changes at midnight in `Asia/Dubai`. An open round keeps its current puzzle until navigation. Progress is local to the browser, game, language, variant and date. Word Duel seats are language/date independent. Increment the storage namespace when changing an existing puzzle's identity or incompatible state format, so an older saved answer cannot be interpreted against replacement content.

Arabic words are independent Arabic puzzles. Word games normalize alef forms and strip diacritics/tatweel while preserving ta marbuta and alef maqsura; Word Duel additionally normalizes alef maqsura to ya, as disclosed in its rules. Arabic crossword entries preserve authored spelling and run right to left. Number/spatial grids retain explicit coordinates.

## Online Word Duel

The API uses the existing Cloudflare Worker and rate-limit table, plus the new `WORD_DUEL_ROOMS` binding to `WordDuelRoom`. Wrangler migration `v2` adds a SQLite Durable Object class. There is no D1 schema migration in this change.

Rooms have two private browser seats. A cryptographically random resume token is transmitted in POST bodies, stored only as a hash by the room, and never put into invite URLs. Snapshots expose the requesting player's rack and the opponent's rack count; they never expose the bag, other rack or token hashes. The server validates every move, dictionary word, crossing, score and revision. Poll responses are scoped to the active session and cannot roll the client back to an older revision.

Rooms expire after 30 minutes waiting or 24 hours without a move. A match ends after the bag/endgame conditions, six scoreless turns, resignation, or the disclosed 80-move cap. Vocabulary contains 1,639 English and 643 Arabic house words. This implements invite-based online play; it does not include matchmaking, accounts, ranked leaderboards, notifications, or account cloud sync.

## Verification

- `npm run test:puzzles` builds the site and runs puzzle engines, inventory, date/storage isolation, and the deployed dependency graph tests.
- `npm run test:contracts` includes the new puzzle tests alongside the existing site contracts.
- `npm --prefix worker test` includes the Word Duel rules, room and route tests.
- `npm --prefix worker run check` validates TypeScript.
- `npm --prefix site-worker test` validates the production artifact, routes, headers, CSP and cache policy.

Browser QA used the Codex in-app browser: English and Arabic mobile routes at 390px, desktop layout, successful crossword and word completion, reload persistence, Sudoku error/undo, full domino solve, mosaic layer matching/undo, letter-square chain completion, Connections one-away/duplicate/complete states, and full Trails completion. Two independent browser origins created and joined an online room, played GOLD and SAND for 12 and 6 points, synchronized turns, reloaded, and changed interface language without losing their seats. Separate real local API flows also covered English and Arabic games.

## Release

Publish the API before the static site, through the existing protected release workflows. The API release must include the `WordDuelRoom` binding and `v2` migration. A static-only deployment cannot provide online matches. Preserve the existing protected-main/environment approvals and release receipts; do not use direct Wrangler deployment to bypass them. No production deployment was performed during implementation.

The build fingerprints all puzzle modules and stylesheets in dependency order, including dynamic imports and the word bank, so content changes propagate to the HTML entry point. Stable assets remain available under the existing compatibility policy.
