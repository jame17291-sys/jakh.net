# Riddle Arabia: free-first launch and growth

Decision date: 2026-09-16. This supersedes suggestions to introduce paid packs,
subscriptions, or paid hosting. The owner wants a free site, audience growth,
and advertising later. No ad application, advertising campaign, outreach,
tracking-account configuration, registrar change, or deployment is performed
by this source change.

## Product promise

Arabic-first riddles and logic challenges that are easy to try alone and share
with friends. Keep the English option. Begin with Arabic-speaking adults and
family groups as an audience hypothesis, not a proven demographic result.
Keep the existing cream/terracotta/hourglass identity during domain migration.

All public practice questions and difficulty levels are free to guests.
Accounts are optional for cloud progress and account-dependent competitive
features. Authentication, abuse controls, privacy consent and content safety
holds are not access paywalls and must not be removed. No paid tier or payment
integration is part of this plan.

Being number one is an ambition, not a measurable promise or launch claim.
Choose the initial comparison category, geography and search intents after
Search Console and real user data are available. Do not claim leadership in
site copy, manipulate rankings, buy traffic, buy links or publish bulk filler.

## What this source batch changes

- Remove the ten-preview guest gate and difficulty-unlock prerequisites.
- Replace random multiple-choice distractors in Quick Fire and Battle with
  question-specific bilingual choices. Ordinary practice remains available
  where an authored choice set is not ready.
- Provide a small initial authored question set with explanations, keeping its
  editorial status truthful. This is not a human review of the full corpus.
- Invalidate authored choices if published wording changes, so a Content
  Studio edit cannot silently pair a new question with stale choices.
- Add regression checks. Keep quarantine, migration, auth and consent gates.

See `content-review/FREE-FIRST-CONTENT-PASS.md` for exact content scope and
remaining editorial work. The homepage redesign is a separate, screenshot-led
step; it is not included in this batch.

## Release gates: before inviting the public

1. In the registrar and Cloudflare, confirm the authoritative nameservers and
   current DNSSEC chain. Prior checks found a stale DS problem; do not delete
   records based solely on that earlier observation. Validate normal resolvers
   (without disabling DNSSEC validation) before continuing.
2. Follow `RIDDLEARABIA-CUTOVER.md`. Preserve the existing D1 database,
   Durable Objects, credentials and migration receipts. Do not bypass protected
   branch checks or use automatic cutover rollback.
3. Finish the baseline domain cutover while `7cd4fa9` is still the protected
   main tip, before merging either growth stage. The exact-commit release gate
   does not permit simply deploying growth static before its API.
4. Release preparation stage A first: authored content and generated metadata,
   plus a scoring reader that understands both legacy and v2 commitments while
   still issuing legacy commitments. Keep the existing Battle implementation.
   Hold main on A; deploy API A with the normal compatibility/code-only process,
   then static A. Verify public authored data before proceeding. This is an
   intermediate release, not launch sign-off.
5. Only after A is verified, merge implementation stage B. Hold main on B;
   deploy API B (now reading authored data already live from A), then static B.
   The API enables authored-only Battle and v2 scoring issuance. A rollback to
   API A can still read B's live commitments. Do not roll back below that
   compatibility reader while any v2 challenges remain within their 15-minute
   lifetime. Preserve exact-commit, exact-version and receipt gates throughout.
6. Require all existing CI checks, including the protected browser regression,
   plus the new content/gameplay tests. A local unit-test pass is not browser QA.
7. Check Arabic/English mobile and desktop in an actual browser: homepage,
   free guest hard questions after more than ten reveals, Quick Fire answer /
   explanation / next / replay / share, unavailable-category feedback, login,
   recovery, leaderboard and two-client Battle invitation/WebSocket play.
8. Check old-to-new redirects, Arabic slash aliases, canonical and hreflang,
   sitemap/robots, offline behavior, privacy choices and accessibility focus.
9. Require the normal production monitor to pass on the intended deployment.
   Its quarantine-denial Battle check does not prove successful multiplayer
   play: separately require a positive two-client Battle smoke test. Keep public
   promotion on hold if either fails. Do not merge both stages before A deploys.

## First 90 days: outcome-led work

| Window | Deliverable | Evidence to examine |
| --- | --- | --- |
| Launch to day 14 | Stable domain; 10–15 observed user sessions; editor checks 100–150 flagship questions | First-question success, confusion, incorrect/ambiguous answer reports, round completion |
| Days 15–30 | Screenshot-led homepage iteration using existing daily challenge; consistent navigation; refine Arabic copy | Faster first play without harming completion, returning-player cohorts |
| Days 31–60 | Publish 20–30 original short challenge videos; opt-in trials with 5–10 relevant creators or communities; improve result sharing | Referred visitors who actually complete a round and return, not just views or share-button clicks |
| Days 61–90 | Expand only successful content clusters and formats; improve slow pages; assess whether an ad trial is justified | Search clicks, repeat play, engaged traffic by geography, support load and operating cost |

These are planning windows and sample sizes, not commitments to unattended
future work. Do not publish messages or spend money without owner direction.

### Editorial acceptance for each flagship question

- Natural Arabic that works without an untranslated English pun; equivalent
  English wording, with native-speaker review still required.
- One defensible answer under the exact clues; accepted variants recorded
  where needed; short explanation rather than a bare assertion.
- Three genuinely incorrect, plausible options of the same answer type for
  multiple-choice play. Do not borrow arbitrary answers from other questions.
- Appropriate difficulty and enough reading time; timed mode excludes long
  stories and unresolved ambiguities.
- Exact source and date for factual or mutable claims, or reproducible proof
  for a logic/calculation puzzle. Follow the existing evidence workflow.
- Original or licensed text/assets, especially for nostalgia/media topics.
- Keep `pending` until the declared editorial and bilingual approval workflow
  has actually been completed. Automation must never invent reviewer names.

Prioritize native Arabic wordplay, clear logic, visual puzzles with accessible
descriptions, family challenges, and well-sourced regional culture/football.
Maintain the existing five-category safety quarantine.

## Measurement: configure and verify before interpreting

The existing code contains consent-gated Google Analytics events. That is not
proof that the owner controls the configured property or that events arrive.
Confirm property ownership and DebugView collection without changing consent
defaults or adding a second tracker. Search Console verification and property
access remain owner-side tasks. Do not put account names, emails, recovery
codes, room host credentials, or raw visitor search text in new analytics.

North-star metric: weekly returning players who complete a round. Define a
returning player as a consented identifier with an earlier play session, and
report the measurement coverage: analytics opt-out and device changes mean
this is not a census of all visitors. Never track around a refusal of consent.

| Question | Measurement |
| --- | --- |
| Do people finish? | `timed_quiz_end` divided by `timed_quiz_start`, with completed rounds distinguished from exits |
| Do they return? | D1/D7 cohorts from the same defined first-play event and analytics timezone; only mature cohorts |
| Does sharing bring players? | Existing `share_card` / `share_result` are intent signals; separately inspect `shared_card_open` and resulting plays |
| Does search bring useful visits? | Search Console impressions, clicks and landing pages; pair with consented on-site engagement |
| Is the experience reliable? | Production monitor failures, frontend errors, successful room creation and completed multiplayer sessions |

Set an initial two-week baseline, then improve completion and return rates.
Do not substitute page views for useful play, inflate engagement with forced
clicks, or treat an analytics event as an ad impression.

## SEO: focused, useful and migration-safe

- Verify both domains in Search Console; apply the appropriate move procedure,
  submit the new sitemap and watch old/new landing pages and indexing.
- Preserve URL mappings. Keep the intentionally limited indexable surface.
  Do not mass-remove `noindex` from topic shells.
- Improve pages around distinct reader intents: Arabic riddles with answers,
  family riddles, clear logic challenges and daily play. Each needs original
  usefulness, working answers and relevant internal links.
- Use original short videos and real community distribution to earn visits;
  measure completed rounds from each campaign using non-personal UTM labels.
- Keep structured data truthful; do not fabricate ratings, reviews or claims
  of popularity. Do not add FAQ/review markup merely to chase rich results.

Google guidance: [people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
and [site moves](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes).

## Ads later: separate explicit go/no-go

No ad scripts, ad publisher identifiers or fabricated `ads.txt` entries are
added in this release. More traffic does not itself guarantee ad approval or
profit. There is no claimed universal minimum traffic threshold here.

Consider a small ad test only after: the site is stable, original content and
rights are documented, repeat play is visible in several weeks of cohorts,
the owner has approved the network/account and consent setup, and actual
geographic traffic and costs support a worthwhile trial.

Start with a restrained placement on a non-timed editorial page. Keep ads
away from answer, play, next and share controls. Do not add interstitials,
forced clicks, rewarded-answer locks, deceptive download buttons or
automatic refresh. Keep ad-free gameplay as the default initial experiment.
Check the network's current child-audience, privacy and regional consent
requirements before any rollout; current analytics consent is not blanket
permission for advertising.

Evaluate actual net revenue alongside completion, returning play, performance
and user complaints. Stop or reduce placements if they harm the core
experience. The site remains free; advertising must not reintroduce access
gates. Read [AdSense placement policies](https://support.google.com/adsense/answer/1346295?hl=en)
when preparing that separate release.

## Owner-dependent actions still open

- Registrar/Cloudflare DNSSEC confirmation and approved production cutover.
- GitHub branch/PR creation through working write access, protected checks,
  review and deployment. No permission bypass.
- Actual browser screenshots and visual direction selection before redesign.
- Arabic editorial sign-off, analytics/Search Console access verification,
  and real user feedback.
- Future ad-account approval and explicit launch of an ad experiment.
