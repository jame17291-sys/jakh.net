# Account gate

Owner decision, 17 November 2026: a visitor must register a free account to play any
game, and to see questions at any level above Piece of Cake. Kids Learning & Play is
included. The site stays free of charge.

## What a guest still gets

- Every Piece of Cake question on topic pages and on the search collection pages.
- All page text: titles, introductions, rules, how-to-play, hubs and directories.
- Privacy Centre, About, and the sign-in / registration form.

## What needs an account

| Area | How it is gated |
| --- | --- |
| Topic pages (`app.js`) | `getFilteredCards()` returns only `easy` cards while `isGuest()`; a panel under the list says how many are locked |
| Quick Fire, Battle | `startTimedQuiz()` and `openBattleModal()` open the registration prompt for guests |
| Global search | guests get Piece of Cake results only (`search-leaderboard.js` filters by `data/card-index.json`) and a note about the rest |
| Collection pages | cards above Piece of Cake carry `members-only` and are hidden for guests |
| Board games, puzzles, party and friendship games, Akshifha, Shuffle Challenge, TV trivia | the play area is hidden and a registration panel takes its place |
| Kids activity, pack, plan, riddles and toolkit pages | the same, with wording addressed to a grown-up |

## How it works

`account-gate.js` is loaded on every page right after `site-navigation.js`. It reads a
yes/no hint (`localStorage['ra-member']`), adds `ra-guest` to `<html>` for guests, hides the
selectors listed at the top of the file, and inserts the panel. Pages that run `app.js`
confirm the session there (`checkCloudSession()` calls `syncMember()`); other pages ask
`/api/auth/session` at most once a minute. The registration links go to
`/mind-lab?profile=1&signup=1&next=<page>`; after signing in or saving the recovery code the
visitor returns to that page (`postAuthDestination()` accepts same-site public paths only).

The hint holds no account data. An unreachable API never signs a member out of the gate.

## Limits to keep in mind

- It is a browser-side prompt, not a security boundary. `data/*.json` and the HTML still
  contain every question. Enforcing it on the server would mean moving the question bank
  behind the API, which is a separate project.
- Children are asked to involve a grown-up. Registration collects a username, a password
  and an optional email; do not add child profile fields.
- New game or activity pages must be added to `PLAY_AREAS` in `account-gate.js` and covered
  in `scripts/account-gate.test.mjs`.
- Search: see "Registration wall" in `docs/SEO-ARCHITECTURE.md`.
