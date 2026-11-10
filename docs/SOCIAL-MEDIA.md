# Social media operation

Riddle Arabia posts one bilingual question card reel a day, at 17:00 Gulf time, on Facebook and Instagram. The owner
does not run this by hand: the content comes from the repository, the scheduling goes through
Metricool, and a weekly task queues the next seven days.

## Accounts and tools (state on 10 Nov 2026)

- Metricool brand **Riddle Arabia** (timezone Asia/Dubai) with the Facebook page *Riddle Arabia*
  and the Instagram professional account *riddle_arabia* connected. Metricool is connected to
  the owner's Claude account as a connector; posts are created with its `createScheduledPost`.
- **X** is not connected: Metricool allows X only on a paid plan. Decision pending with the
  owner. Until then, nothing is posted to X.
- Credentials never live in this repository or in chat. Connecting a network is always the
  owner signing in; Claude does not enter passwords.

## Content: plans and cards

- `docs/social/plan-YYYY-MM.json` is a 28-day plan: one card per day, rotating through the
  public collections in `scripts/social-cards.mjs` (`ROTATION`). Cards come only from the SEO
  collection pages, so they already passed `npm run check:featured` (no held category, no card
  shared between collections). Only easy/medium cards up to 170 characters are planned.
- `assets/social/<date>-<id>-q.png` and `-a.png` are the question and answer images
  (1080×1080, Arabic on top, English below, cream/terracotta). They are served from
  `riddlearabia.com/assets/social/...` after the release that includes them.
- Each plan entry carries the exact `captions` for Instagram (link in bio) and Facebook
  (collection links with `?ref=facebook`), so a reviewer can read what will be posted.
- Every day (`reel: true` in the plan) carries a **card reel**: a 15-second
  vertical video (1080×1920) at `assets/social/<date>-<id>.mp4`: the question appears, a
  7-second countdown with soft ticks, the answer flips in with a chime, then the collection's
  end card. Sound is synthesised in ffmpeg (no sampled or licensed audio). Rendered by
  `node scripts/generate-social-reels.mjs --plan docs/social/plan-2026-11.json` (Playwright +
  ffmpeg; `--preview <date>` writes four JPEG frames instead of a video). About 0.6–0.9 MB each.
- Regenerate or extend: `node scripts/generate-social-cards.mjs --plan docs/social/plan-2026-11.json`
  renders missing images; `--new-plan docs/social/plan-2026-12.json --start 2026-12-09 --days 28`
  writes the next plan, excluding every card used by earlier plans, with Thursdays marked as
  reel days (all of them). Needs Playwright (same as the browser suites). `scripts/social-cards.test.mjs` pins
  the plan to its generator. `npm run generate:social` renders both images and reels.

## Scheduling

- Instagram: a Reel from the day's mp4 with the Instagram caption.
- Facebook: a Reel from the same mp4 with the Facebook caption (the answer is in the video).
- Posting time: 17:00 Asia/Dubai every day, published automatically (never as a draft).
- The question/answer images remain available as a fallback if a network rejects a video.
- A weekly scheduled task queues the next seven days from the current plan and reports what it
  queued in one line. The plan file is the source of truth; nothing is improvised at post time.
- A new plan is needed every 28 days: a small PR with the plan and its images, merged like any
  other change (the release publishes the images).

## Rules

- Everything posted is a question card from the public site, in the site's Modern Standard
  Arabic and English. No politics, no religion debates, no held categories, no paid promotion,
  no engagement bait beyond "answer in the comments".
- Analytics: Metricool's own numbers plus the `?ref=` tags in site logs. No tracking is added to
  the site for this.
