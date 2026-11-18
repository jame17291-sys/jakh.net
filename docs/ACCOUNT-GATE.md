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

Guests also get a "Sign up free" button in every page header (inserted by `account-gate.js`
before the Profile link, so no page HTML changes). On phones it takes the place of the Profile
link to keep the header on one row, and below 480px the label shortens to "Sign up"; the form it opens has a Sign in tab. Members never see it.

One free try a day (owner decision 17 Nov 2026): the play and kids panels offer "Try one free
game today" / "Try one free activity today". The chosen page is stored as
`localStorage['ra-trial']` (`<local date>|<path>`), the page reloads with `ra-trial` on
`<html>`, and its play area stays open on that browser until the date changes. Every other
game shows the panel with "You have used today's free try." Harder levels, Quick Fire and
Battle are never part of the free try. The Arabic and English routes of a game are one free
try: the stored value also holds the path behind the page's language link
(`<local date>|<path>|<other-language path>`).

The hint holds no account data. An unreachable API never signs a member out of the gate.

## After signing in

- The first page a visitor opens after signing in or up shows one dismissible line: "Welcome!
  Every game and every level is now open to you." (`sessionStorage['ra-welcome']`, cleared
  when shown).
- On the home page a member sees "Welcome back." with their Shuffle Challenge streak, read
  from this browser's `ra-shuffle-streak-v1`, and a link to `/daily`. The home page still
  makes no account request, so account progress is not shown there.

## Measuring the funnel

For visitors who allowed analytics (and only then), `account-gate.js` sends these Google
Analytics events through the consent module's `gtag`. Each carries three parameters only:
`gate` (`play`, `kids`, `levels`, `trial` or `header`), `surface` (`panel`, `dialog` or
`header`) and `language`.

| Event | Meaning |
| --- | --- |
| `gate_view` | a guest was shown a registration panel or prompt (`gate: trial` = playing the free try) |
| `gate_trial_start` | a guest started today's free try |
| `gate_signup_click` | a guest chose "Create free account" or the header "Sign up free" |
| `gate_signin_click` | a guest chose "Sign in" on a panel |
| `sign_up`, `login` | already sent by `app.js` when an account is created or signed in |

Read the funnel as `gate_view` → `gate_signup_click` → `sign_up`. To break events down by
`gate` or `surface` in Google Analytics, register them once as event-scoped custom dimensions.
Counts cover consenting visitors only, so compare ratios, not totals.

## Limits to keep in mind

- It is a browser-side prompt, not a security boundary. `data/*.json` and the HTML still
  contain every question. Enforcing it on the server would mean moving the question bank
  behind the API, which is a separate project.
  Owner decision, 18 Nov 2026: not building this. The repository is public, so every
  question is readable on GitHub whatever the website serves; a server-side lock would only
  be real with a private repository. It would also remove the harder cards from the pages
  Google reads. Revisit only if the funnel numbers show visitors getting around the wall.
- Children are asked to involve a grown-up. Registration collects a username, a password
  and an optional email; do not add child profile fields.
- New game or activity pages must be added to `PLAY_AREAS` in `account-gate.js` and covered
  in `scripts/account-gate.test.mjs`.
- Search: see "Registration wall" in `docs/SEO-ARCHITECTURE.md`.
