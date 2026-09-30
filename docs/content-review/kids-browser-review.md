# Kids experience integration review

Reviewed on 2026-09-30 against the generated static-site preview in the Codex
in-app Chromium browser. Desktop viewport: 1280 × 720. Mobile viewport:
360 × 800. Both English and Arabic were inspected.

## Verified in the browser

- Hub, activity, printable, age-pathway and toolkit layouts render without
  horizontal overflow at 360px. The Arabic hub uses RTL controls and correctly
  ordered numeric age ranges. Desktop retains the cream/brown animal artwork.
- Combining ages 5–6, up to ten minutes, and paper/pencils returns five matching
  activities. Language switching retains the filter values. Choosing a different
  age from an age pathway moves to the full library with that age selected.
- Opened a matching activity, expanded its hint and explained answer, saved it,
  marked completion and planned it for Wednesday. Entered Play together and
  returned to the parent view using Escape.
- Switched the activity to Arabic and reloaded: saved/completed state persisted.
  Opened the Arabic planner, moved the activity to Friday, switched back to
  English and reloaded: Friday retained the activity and completion mark.
- Removed a planned entry and confirmed that saved/completed state remained
  independent. Opened the reset dialog and cleared only synthetic preview data.
- Loaded a ready-made week and verified five distinct activities on Monday to
  Friday, with Saturday/Sunday available for family choices.
- Invoked Print our week and dismissed the browser's native print flow. The
  generated print-sheet content and print failure behavior are separately
  covered by runtime tests; no physical printer was used.
- An existing `?card=kids-riddles-001` link opens the preserved original question,
  reveals its answer/explanation and places keyboard focus on the question.
- The skip link focuses `main#top`. Keyboard activation, Escape behavior,
  control labels and the accessibility tree were inspected. This was not a
  screen-reader software certification or a complete assistive-device matrix.
- Reduced-motion emulation produces zero transition duration on kids controls.
- No console errors or warnings were reported during the tested flows.

## Automated complementary checks

- Runtime tests execute actual generated bilingual HTML and the actual module
  with denied storage access/read, quota failure and unavailable speech. They
  verify visible explanations, usable tab-only tools and readable instructions.
- Reset tests verify that original progress/favorite keys are byte-for-byte
  unchanged. No actual child or account data is collected by the toolkit.
- Worker route tests cover clean versus filtered indexing/cache policy,
  GET/HEAD/conditional requests, and unrelated routes.
- Source and digest checks cover the full bilingual inventory, references,
  reviewed content, preserved riddle identifiers and all 96 printable PDFs.

Native Arabic speech voice quality depends on installed device voices and was
not listening-tested. Written instructions remain available throughout.
