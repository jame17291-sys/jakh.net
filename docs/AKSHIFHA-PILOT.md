# Akshifha: five-case free pilot

Implemented 2026-09-16. This is a local implementation, not a production release,
native-editor approval, visual-audit sign-off, or evidence that players find it fun.

## Product decision

Feature one signature reasoning game at `/akshifha` and
`/ar/games/akshifha/`. The homepage, `/play`, and bilingual brain-games discovery
pages point to it. Chess and Backgammon remain secondary Classics. Mastermind,
SET, Go, Reversi, Catan Lite, Diplomacy Lite, Codenames and Hanabi are removed
from those promoted surfaces. Their source, existing URLs, and sitemap entries
are preserved. No games or user data were deleted.

The first iteration is deliberately text-first evidence cards in the existing
design system. It does not yet include illustrated scenes, custom artwork,
animation sequences, sound, co-op, party rooms, or an infinite content stream.
The two proposed social games are not implemented or advertised as playable.

## Play contract

- Exactly two evidence cards plus one conclusion make a valid submission.
- Incorrect submissions remain playable; checking is local and deterministic.
- Two explanatory hints are available, without a timer or paywall.
- Answer reveal requires confirmation and is recorded as revealed, not solved.
- Completed cases show the connecting evidence and full reasoning.
- Five complete original cases exist in Arabic and English. Their UTC daily
  rotation explicitly repeats. Each case also remains freely available in the
  casebook; there is no artificial daily lockout.
- Case IDs in challenge links pin the same puzzle across midnight. URLs contain
  no answer, personal identifier, claimed score, or preview hostname.
- Native sharing, clipboard copying, and a selectable-text fallback are supported.
  Cancelling a share is not recorded as successful sharing. Async callbacks from
  an old case cannot change a newly opened case.
- Language switching uses physical routes and preserves the case. In-progress
  selections restart after navigating between languages; completed casebook
  records are shared on the device.
- Progress is versioned and bounded in `riddlearabia-akshifha-v1`; corrupted or
  blocked storage cannot prevent play. Clearing it removes only this key.
  It is unverified personal practice, never an anti-cheat or leaderboard system.
- Solutions are shipped to the browser. Do not reuse this architecture for
  prizes, verified rankings, or server-scored competition.

## Content and fairness

Case 1 compares a cake's first sealing time with a van's departure. Case 2
matches a dinner package to its seating layout. Case 3 matches a printed file
version to its venue. Case 4 compares a booked bus line with its complete route.
Case 5 reconstructs a three-person photograph's order.

Rules state timing, reliability, capacity, version immutability, complete stop
lists, and viewing direction explicitly. Independent finite-world test models
enumerate candidate evidence pairs and require exactly one decisive pair with
neither card sufficient alone. Text-anchor tests help catch bilingual fact drift.
These tests do not understand all natural-language implications and do not
replace independent Arabic editorial review or first-time player observation.

Keep published IDs stable. If a future edit changes a puzzle's logic or answer,
introduce a new versioned ID and deliberately handle old challenge links instead
of silently changing what a shared case means.

## Measurement and privacy

Only the existing, optional consent-gated analytics provider is used. Events:
`akshifha_start`, `akshifha_check`, `akshifha_hint`, `akshifha_complete`,
`akshifha_next_case`, `akshifha_case_open`, `akshifha_share`. Fields are case IDs,
mode, language, attempt/hint counts, outcome and share method—not selected
evidence, answers or personal text. Provider failure must not break play.
No new analytics service, ads, monetization, account requirement or payment is added.
Events are not retroactively sent when someone later grants consent. Counts
therefore describe consenting sessions, not the whole audience or unique people.

## Build and QA

The entry module, three module dependencies and CSS receive content hashes.
Dependency URLs are rewritten before hashing the entry, so changed content
changes the module graph consistently. The service worker includes both routes
and their dependencies. The Akshifha scripts/CSS have a 30 KB combined gzip
budget; shared site styles and images are additional bytes.

Run from the repository root:

```sh
npm ci
npm ci --prefix site-worker
npm run test:contracts
node scripts/generate-arabic-routes.mjs --check
node scripts/generate-seo-pages.mjs --check
node scripts/validate-static.mjs
node scripts/validate-seo.mjs
node scripts/validate-bilingual.mjs
npm run check:performance
npm run build:site
npm --prefix site-worker test
```

The exact build uses `git ls-files`. New files must be tracked before building.
Do not bypass that inventory or the existing quarantine/publication checks.

Browser regression scenarios were added to the existing browser matrix for both
languages at 320px and 1280px, including solve/reveal, progress, navigation,
overflow and console errors. They were not executed in this session. Run the
existing protected browser-matrix workflow against the final build before
release, then visually inspect both layouts, keyboard focus, text expansion,
touch targets, share fallback and offline update behavior. DOM-harness tests
exercise actual handlers but cannot certify browser layout or screen readers.

## Release sequencing

This patch is stage C, based on the complete prior free-first stage B working
tree. It does not modify the API, schemas or migrations. It must not collapse
the previously documented baseline cutover → preparation A → implementation B
sequence. Rebase safely if upstream has advanced; never force-reset the repo.

Once prior prerequisites are satisfied, review/merge C through protected checks.
The static release still requires an API receipt from the exact same commit:
use the existing normal code-only API release for C, then static C. Do not
skip approvals merely because C's gameplay does not call the API. No deployment,
GitHub push, registrar changes, or account changes were made by this task.

## Next decision: earn a second round

Observe 10–15 first-time Arabic-speaking players, including mobile users, before
commissioning more games. Give them no explanation beyond the page. Record:

1. Can they make a valid first submission without help from the observer?
2. Do they understand and accept why the answer is correct?
3. Do they voluntarily start another case?
4. Does an invited friend successfully open and finish the same case?
5. Which clue feels ambiguous, trivial, or like irrelevant filler?

These are formative observations, not statistically proven retention benchmarks.
Revise weak cases before adding content. After consented production usage exists,
measure voluntary second-case starts, completion, successful challenge opens,
and return visits. Build the two-player complementary-clue concept only after
this loop shows a reason to return. Core gameplay remains free; ads remain off.
