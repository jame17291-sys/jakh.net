# Riddle Arabia roadmap — November 2026

Drafted 2026-11-08 after the search click-through pass (#185, #186) and the move to
release-on-merge (#188–#190); updated 2026-11-09 (see `docs/HANDOVER-2026-11-09.md`). Baseline: Search Console shows 60 clicks in the 28 days to
5 Nov and 77 in the last three months. The site has far more product than audience, so this
plan weights distribution and measurement over new features, and keeps every change
measurable against that baseline.

Each phase is its own pull request (or a few). Phases 1 and 3 need no owner decision beyond
merge. Phases 2 and 4 contain decisions only the owner can make; they are marked.

## Phase 1 — Daily return loop (shipped 8 Nov, #193)

**Why.** Nothing on the site asks a visitor to come back tomorrow. Shuffle Challenge is already
a daily format; a streak and a shareable result are the cheapest known retention mechanic and
fit the free, no-account rule.

**Scope.**
- Streak on Shuffle Challenge: days in a row with a finished round, stored in the browser only
  (localStorage, no account, no server). Shown on the recap and on the `/daily` landing card.
  Missing a day resets to 1 on the next finished round; no guilt copy.
- Shareable recap: a text block like the Wordle grid (date, score, ten result icons, link),
  copied with the Clipboard API or `navigator.share` on phones, with a visible fallback when both
  are unavailable (the party games already do this).
- Both bilingual, MSA Arabic per the style guide, RTL-safe, keyboard-reachable.

**Not in scope.** Accounts, server-side streaks, notifications, leaderboards.

**Measure.** Shared recaps carry `?ref=shuffle-share` so Search Console and the server logs show
return visits without any identity; streak length is never sent anywhere.

**Checks.** `test:contracts`, `check:performance` (app.js budget), browser matrix in CI.

## Phase 1b — Trophy case (shipped 8 Nov, #195)

**Why.** The owner asked about rewards, rankings and Duolingo-style mechanics. Most of
Duolingo's engine is already here or does not fit (hearts and gems contradict the free rule;
leagues need an audience; push notifications are intrusive). The one missing piece that both
rewards *and* redirects players into more content is a trophy case tied to things on the site.

**Shipped.** Achievements moved to `achievements.js` (out of the app.js budget), six Shuffle
trophies and a 3-day streak added, guests earn trophies and get the unlock toast, and the
Shuffle recap shows earned trophies first, then the next four to aim for. All browser-local.

**Not in scope, by decision.** Hearts or lives, gems or any shop, leagues, push
notifications, ranking changes. Revisit a "you beat X% of players today" line once there are
a few dozen rounds a day: it needs only aggregate counts and no identity.

## Phase 2 — Quarantined categories: prepare, do not publish (owner decision)

**Why.** 278 finished cards in five categories (medical 100, pharmacy 50, law 48, economics 40,
survival 40) are held from production. They are low-competition search topics in Arabic.

**The constraint that matters.** `docs/content-review/README.md` makes release conditional on
claim-level evidence *and* independent sign-off by a subject-matter expert whose verified
qualification matches the domain (doctor, pharmacist, lawyer). An AI review is not that
sign-off and cannot be made into one. So the deliverable of this phase is to make the human
review cheap, not to replace it.

**Scope.**
- For one category first (medical, 100 cards): a per-card pre-review table with the claim, the
  best public source found, a confidence note, and a flag for cards that are dated, ambiguous,
  regionally variable, or unsafe as trivia (dosages, self-treatment). Output as evidence
  candidates in the existing template format, never written into `evidence.json`.
- A shortlist: cards that look safe to approve, cards to fix, cards to drop.

**Owner decision needed.** Whether to engage a qualified reviewer for each domain (a friend who
is a doctor or pharmacist is enough if their qualification is recorded as the gate requires).
Without that reviewer this phase produces no public change, and that is by design.

## Phase 3 — Search surface, round two (after the early-December data)

**Why.** Titles and two new collections went live on 8 Nov. The next changes should follow
Search Console, not guesses: queries at positions 5–20 with impressions, pages with impressions
and few clicks, and whether `/math-riddles` and `/hard-riddles` gained impressions.

**Candidates, in rough order of search demand.**
- More collection pairs from banks with no search page yet. Science, geography, football,
  flags, history, animals, space and anime shipped on 9 Nov; TV shows, psychology, software and
  superheroes remain. Same pattern as the math and hard collections, 30 cards each, drawn from
  unfeatured cards; each one widens `seo-pagination.test.mjs` deliberately.
- A short article section for long-tail phrases the collections do not cover ("riddles for a
  five-year-old in Arabic", "riddles that trick adults"), two or three to start.
- Sitemap resubmitted in Search Console after each release.

**Not before December.** Changing *existing* titles again before Google has re-crawled makes
the 8 Nov change unmeasurable. Adding new collection pages is fine at any time; they do not
disturb that measurement, so the collections above can start in November.

## Phase 4 — Knowing what visitors do (owner decision)

**Why.** Analytics is consent-gated and off by default, which is right. The cost is that the only
number the owner has is search clicks. Which of roughly twenty features people actually use is
unknown, so investment is guesswork.

**Proposal.** A page-view and game-start counter with no cookies, no identifiers, no IP storage
and no consent prompt (nothing personal is processed): the edge worker increments a per-route,
per-day count. Readable in the admin workspace. This is a product and privacy decision for the
owner; the privacy page must describe it if adopted.

## Distribution (ongoing, owner's hands)

The strongest lever for a small site is links and shares, and it cannot come from the codebase.
Post `/hard-riddles` on r/riddles and r/puzzles; post `/ar/alghaz-saaba/` and
`/ar/alghaz-riyadiyat/` in Arabic Facebook, Telegram and WhatsApp groups; one riddle a day with
the link on Instagram and X. Ready-to-paste posts for both new pages are in Phase 1's pull
request.

## Order and timing

| When | Work | Needs owner |
| --- | --- | --- |
| 8–9 Nov | Phases 1 and 1b shipped; sitemap resubmitted; social posts drafted | done |
| 9 Nov | Collections round two (#200: science, geography, football, flags) and round three (history, animals, space, anime) | merge only |
| Week of 10 Nov | Owner shares the new pages; request indexing for the sixteen new URLs | owner |
| Mid November | Phase 2 pre-review of medical (no public change) | reviewer decision |
| Early December | Read Search Console; pick Phase 3 items | share the data |
| December | Phase 3 | merge only |
| When decided | Phase 4 | yes |

Everything here follows the repository rules: own branch, pull request, release on merge,
no claims of production success or factual approval from source inspection alone.
