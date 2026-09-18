# Akshifha: two-week playtest

This is a protocol ready to run, not completed research. No participants have been contacted. No reminders, releases or automated follow-ups have been scheduled. There are no claimed results.

## Decision to make

Do clearer, more varied mysteries earn another freely chosen round? If they do, what makes someone come back for an unseen case? Test the game before committing to a daily publishing schedule or a larger redesign.

Recruit 8–12 intended players, including people who normally play in Arabic and people who normally play in English. Prefer their usual phones or computers. Record the device and selected language. Describe the intended audience before recruiting; a sample of colleagues alone does not represent every visitor.

Use participant codes such as P01 in private facilitator notes. Do not put names, email addresses, participant codes or notes into analytics URLs or events. Ask permission for observation and any recording separately. People may decline website analytics and still participate fully; observer notes are enough for this small study.

## Preparation: days 1–2

1. Verify the build and event behavior using the checklist below. Make sure all players see the same build and case wording. Record the build/date in the notes.
2. Choose one original case, one deeper new case and five editorially reviewed library questions. Use identical questions for all participants. Record those five question IDs before starting; do not compare random quizzes of different difficulty.
3. Suggested original: case 2, **The quiz-night booking** (`one-table-please`). Suggested new case: case 6, **Two stages, one host** (`two-stages-one-host`). Case 7 (`the-mascots-last-turn`) or case 8 (`who-has-the-last-clue`) can be an alternative new case if its language or difficulty better fits the intended audience. Decide before the first session.
4. Prepare links: English `/akshifha?case=CASE_ID&mode=practice`, Arabic `/ar/games/akshifha/?case=CASE_ID&mode=practice`. Use the same language throughout each comparison unless language switching is the task being tested.
5. Rotate presentation order across the sample: original/new/quiz, new/quiz/original, quiz/original/new, and their reverse orders. Balance these orders across Arabic and English where practical. This reduces obvious order bias; it is not a randomized experiment or proof of causality.

## First session: days 3–6, about 15–20 minutes each

Say:

> Try this as you normally would. You can say what you are thinking if you feel comfortable. I am testing the website, so confusion is useful feedback. You can stop whenever you want.

Arabic equivalent:

> جرّب الموقع كما تستخدمه عادةً. يمكنك أن تقول ما تفكّر فيه إذا كان ذلك مريحاً لك. نحن نختبر الموقع، لذلك فإن أي شيء غير واضح يساعدنا على تحسينه. يمكنك التوقف متى شئت.

Open the assigned first experience. Do not explain which evidence is relevant or suggest the answer. Observe whether they can describe the task, make a deduction, guess, ask for help or leave. Distinguish help understanding the controls from help solving the mystery.

After its first result, give the player space to act. Do not point at “Next case,” suggest sharing or ask whether they want another until you have recorded what they choose independently. If they start another case, let them play. Record its ID and whether it was actually unfamiliar to them. This is the only clean first-exposure continuation opportunity in a facilitated comparison; later choices have already been influenced by the protocol.

Then move to the remaining assigned experiences. These are **prompted comparison tasks**. Their completion and next-case clicks must not be counted as unprompted continuation. Record the order and any previous exposure to the specific cases or questions.

After each mystery, ask the player to explain why the solution follows from the evidence in their own words. A correct button choice alone does not establish understanding. Record the exact clue or phrase they dispute; avoid summarizing all disagreement as “too hard.”

Finish with these neutral questions:

- What did you think you were trying to do?
- Which clue changed your mind?
- Was there anything you could interpret more than one way?
- Which experience would you choose again, and why?
- What would make another case worth opening?

Do not ask whether the site is boring or whether the redesign is better. Record volunteered comments about enjoyment, but give more weight to observed choices than polite approval.

## Return observation: days 7–12

The delivered casebook makes all 11 cases available immediately. **Rotation does not publish a fresh case.** Do not describe a rotating case or an already-solved case as a new release.

At the end of the first session, say once that the site remains available if they want to use it again. Avoid sending reminders during the observation window. At a pre-agreed debrief, ask whether they returned beforehand, on which day, what brought them back and which case they chose. Label these as **self-reported returns** unless independently observed. The debrief itself is a prompt; play after that contact belongs in the prompted group.

If you offer an unseen case at follow-up, first check that the participant has not already viewed or solved it. Suggested reserve cases are 9 (`the-sealed-final-score`), 10 (`the-chest-with-two-controls`) and 11 (`one-entry-left`), but they remain publicly accessible. Record any earlier exposure. A follow-up invitation tests response to an invitation; it does not establish spontaneous retention.

A genuine fresh-release test requires a later, reviewed case that participants could not access during their first visit. Publish it on a real stated date, record its case ID and exposure, and distinguish returns before versus after a reminder. That publication is a separate future action, not part of this delivered build.

Do not call these observations “7-day retention.” This sample has uneven entry dates, consent gaps, browser-local progress and no implemented cohort identity. Report the actual observation interval for every participant.

## Metrics and their limits

Use counts such as `n/N`, with separate Arabic/English observations. With 8–12 participants, do not claim statistical significance or generalize percentages to the whole audience. Mark incomplete observation as missing; do not silently convert it into failure.

| Measure | Definition | What it cannot establish |
| --- | --- | --- |
| Task comprehension | Players who explain the required action without coaching / players observed on their first mystery | Whether they will enjoy solving it |
| First-mystery engagement | Players who submit a valid check, request a hint or confirm revealing the solution / players shown a first mystery | Attention from page loads alone |
| First-mystery completion | Players reaching a result / players engaging with their first mystery | Independent solves: report solved, assisted and revealed separately |
| Unprompted continuation | Players independently opening an unfamiliar next mystery after their first result / players reaching that first result and offered another unfamiliar case | Motivation inferred from a click, or clicks during assigned tasks |
| Second-case engagement | Players who engage with that unfamiliar next mystery / players who independently open it | Completion or later return |
| Solution understanding | Players who correctly explain the decisive connection / players asked after a result | Understanding merely from a correct selection |
| Unseen-case return | Eligible participants returning within the stated window to a case they have not seen / participants with an unfamiliar case available and an observed or reported follow-up | True new-content release response or standard retention |
| Share action | Completed native-share calls and successful clipboard copies, reported separately | Actual message delivery, a recipient visit or recipient completion |

For continuation, exclude replay, known cases, prompted tasks and participants who had no unfamiliar case left. Report how many were excluded and why. A reveal is a completed round for the opportunity to continue, but never a solved case.

For returns, keep three rows: before any reminder, after a reminder, and unknown reminder/exposure status. Keep “no follow-up information” separate from “did not return.” Shared devices and cleared progress make automatic new-versus-returning-person counts unreliable.

## Implemented event instrumentation

`akshifha-study.js` adds in-memory context to the game's existing device-consent-gated analytics events. It makes no network request itself, adds no cookie or local/session-storage key, and creates no participant identifier. The existing analytics provider and its privacy behavior are unchanged. Necessary local game progress remains separate from measurement.

The module observes only rounds opened while `JakhPrivacy.analyticsAllowed()` is exactly `true`. It checks that gate on every event. Missing or throwing privacy controls mean no measurement. Changing consent or clearing game progress resets the in-memory context. Giving consent halfway through a round does **not** reconstruct earlier activity: that round is omitted and observation resumes at the next case opening. This avoids manufacturing a complete funnel from partial consent.

| Event | Meaning |
| --- | --- |
| `akshifha_start` | A case was displayed while analytics was allowed. This is exposure, not proof of engagement. |
| `akshifha_engage` | Once per observed round, on its first valid check, hint request or confirmed reveal/completion. Merely inspecting evidence is not measured. |
| `akshifha_check` | A valid answer submission; includes attempt count and correctness, not answer text. |
| `akshifha_hint` | A hint was requested; includes the hint count. |
| `akshifha_complete` | Once per observed round, with `solved`, `assisted` or `revealed` outcome. |
| `akshifha_next_case` | Next action from the current result; destination ID included. Consult the following start/engage before calling it continued play. |
| `akshifha_case_open` | Casebook selection intent; destination ID included. |
| `akshifha_share` | Successful native share or clipboard operation, with method. Manual fallback and cancelled sharing produce no successful-share event. |

All events retain `case_id`, `game_mode` and `language`. Context fields are deliberately descriptive:

| Field | Values / interpretation |
| --- | --- |
| `measurement_version` | `1`, to distinguish these events from earlier events without the context below |
| `entry_point` | `initial`, `next`, `replay`, `casebook`, `daily`, `continue`; the top continue control is separate from next on the result |
| `round_kind` | `first_case`, `next_uncompleted`, `replay`, `other_case`, `next_history_unknown`; replay includes a case opened earlier on the same observed page, even if never completed |
| `case_history` | `completed`, `opened_this_page`, `no_saved_completion`, `unavailable`; no saved completion is not proof that a person has never seen the case |
| `prior_progress` | `present`, `none`, `unavailable`, captured at opening; these count local saved-progress status, not first-time and returning people |
| `observed_round_index` | Incrementing round number in this consented page instance; resets after reload, consent changes or progress reset; not a visitor or analytics-session ID |
| `first_page_case` | Whether entry was the initial case on this page, including a replay or linked challenge |
| `after_first_completion` | Next action followed completion of that initial page case; filter `round_kind=next_uncompleted` to exclude replays and unknown history |

Useful automated funnels are first-page exposure → engage → complete, and first-page complete → `start` with `after_first_completion=true` and `round_kind=next_uncompleted` → that round's engage. In analytics, scope to the same page visit and inspect the event order; raw event totals alone do not establish that the same people progressed through a funnel. Browser reloads/language changes begin another page instance. There is intentionally no additional identifier to stitch them together.

Clicks cannot identify whether a facilitator prompted the player. Use the observer notes as the authority for unprompted continuation and report the automated version as **next uncompleted case opens/engagements**. Consent, blocked analytics, provider delivery failure, cleared local progress and other devices all create gaps. Do not extrapolate the measured subset to people who declined measurement.

For the aggregate saved-progress split, count initial `akshifha_start` events with `first_page_case=true` by `prior_progress`. Label the result “initial page opens with/without available saved completion,” never first-ever users, returning users or retention.

### Verification before relying on analytics

Run `node --test scripts/akshifha-study.test.mjs`. The tests cover denied/mid-round consent, revocation, repeated completion, next versus replay, missing storage, restricted event fields and provider failures.

In a browser, also verify the integrated build:

1. Choose Essential only. Open, check, hint, reveal, continue and share. Gameplay still works and no Akshifha analytics event is sent. Verify no analytics provider loader/network request is initiated by the game.
2. Allow device analytics before opening a fresh case. In a development analytics destination or provider debug view, verify one start, one engage, correctly ordered checks/hints, and one complete with the current-round outcome. Avoid polluting production reports with test events.
3. Continue to an uncompleted case, replay it, then choose an earlier case from the casebook. Verify their context differs. Clear progress and verify observation does not retain the previous context.
4. Deny analytics mid-round. Verify subsequent events stop. Re-allow it: no old events should be backfilled. A newly opened case can be observed again.
5. Block browser storage and separately block the analytics destination. Confirm the game remains usable. Unknown saved progress must be `unavailable`; transport failure must not freeze play.
6. Repeat the critical path on an Arabic phone-width page and an English page. Inspect the actual analytics destination: a call queued locally is not proof the provider received it.

No live analytics configuration, custom dimensions, deployment or successful provider delivery is asserted by this document. If you use a provider dashboard, register the fields needed for the report and verify availability before the study. The manual protocol remains usable without analytics.

## Observation sheet

Use one row per player with these fields. Leave unavailable values blank and note the reason.

| Field group | Record |
| --- | --- |
| Setup | Participant code, build/date, language, device, chosen experience order, previous exposure |
| First mystery | Case ID, understood unaided (yes/no), engaged (yes/no), outcome, attempts/hints, help understanding controls versus help solving |
| Next choice | Offered unfamiliar case (yes/no), next action, case ID, familiar/unfamiliar/unknown, prompted (yes/no), next-case engagement |
| Content | Exact disputed phrase/clue, explanation in player's words, volunteered reaction |
| Comparison | Original/new/quiz observations and preference with reason; all instructed tasks labelled prompted |
| Return | Observation dates, reported/observed, returned before contact (yes/no/unknown), trigger/reminder, case ID, previous exposure |
| Share | Chosen independently (yes/no), copy/native/manual, actual recipient play only if separately observed with permission |

Do not store these notes in the public repository. Keep consented recordings and recruitment contact details outside the study outcome sheet, using your normal private research process.

## Review and next decision: days 13–14

- If task comprehension repeatedly fails, fix onboarding before adding more cases.
- If a specific clue is repeatedly disputed in either language, repair it and retest that case. Do not hide the issue inside average completion.
- If players understand the game but do not choose another mystery, improve the reasoning and reveal before adding rewards or more content.
- If they choose another and understand the solutions, test one real fresh release before promising a publishing cadence.
- If they return only after contact, report a prompted response and investigate the natural occasion for play.
- If use clusters around people playing together, test a facilitated group session before building multiplayer infrastructure.

The output is a short report of actual counts, case-specific observations, known gaps and one justified next investment. Keep claims proportional to the evidence.
