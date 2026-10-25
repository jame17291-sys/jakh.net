# Kids riddles additions: review record, 25 October 2026

**What changed.** On 25 October 2026 the owner asked for ten more kids riddles and approved them. The kids riddles grow from 30 (12 easy, 8 medium, 10 hard) to 40 (14 easy, 13 medium, 13 hard), with no very-advanced level. Three existing cards change: `kids-riddles-015` moves from medium to easy, and `kids-riddles-019` and `kids-riddles-021` get new puzzles because their old ones repeated logic-puzzles templates (`logic-puzzles-017` and `-016`). Card IDs do not change, so shared links and saved progress keep working. A new subtopic, Animals & Nature (الحيوانات والطبيعة), holds four of the new riddles.

The riddles were drafted in the 2026-10-25 phase-2 content pass (change set `g5-puzzles-math`). They were held back then because this review record binds the exact source of `scripts/kids-legacy.mjs`, so any change needs a new review entry. Every card, its explanation and its sources are recorded in `content-additions-2026-10-25.json`.

## Who reviewed it

**This is not a human editorial review.** The owner requested and approved the content. Claude, an AI, converted the Arabic to clear Modern Standard Arabic and reviewed every new and changed card, together with its explanation in `scripts/kids-legacy.mjs`. No qualified educator, native-speaker editor or family trial has checked these riddles. The cards keep review status pending.

## Checks performed

- **Answers.** Each answer was worked through and has one fair reading. Number puzzles were checked by arithmetic: 3 cats still catch 100 mice in 100 minutes; 2 × 2 × 2 = 8 cubes; 5 girls + 1 shared brother = 6 children; Monday, Wednesday, Friday, Sunday; any number × 0 = 0, and 1 does not fit. The haystack riddle says the farmer heaps *all the hay together*, so the single-pile answer is fair. Factual clues were checked against opened sources: most fish have no eyelids and rest rather than sleep (NOAA), the Moon's phases come from how much of its sunlit half we see (NASA), and falconry is a Gulf tradition (UNESCO). The fish riddle now says "rest" instead of "sleep", as NOAA does.
- **Age fit.** Every explanation has an age band: the date palm is for ages 5–6, the others for 7–8 or 9–12. Content is family-safe; the trick riddles reward careful reading rather than catching children out.
- **Arabic.** Every riddle works in Arabic as well as in English; none depends on English wordplay. The sea and nail riddle is a traditional Arabic riddle. The Arabic follows `ARABIC-STYLE-GUIDE.md`: Modern Standard Arabic, first-person riddles ending with «ما أنا؟», Arabic punctuation and one digit system per card. The dialect contract test passes.
- **Repeats.** None of the riddles repeats a riddle in `kids-riddles` or `classic-riddles`. The phase-2 falcon clue ("the fastest animal when I dive") repeated `animal-kingdom` card `ani-43`, so the riddle now uses the falconer's gloved arm instead. `node scripts/audit-question-bank.mjs --strict` passes.

## Release binding

`kids-release-review.json` records this revision and the new SHA-256 of `scripts/kids-legacy.mjs`; `coverage.preservedRiddles` is now 40. The activities, printable packs and their digests are unchanged.
