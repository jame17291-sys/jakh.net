# Admin editorial workspace

The admin workspace supports the correction journey from a visitor report to a bilingual draft and independent review. Account and security controls retain their existing permissions and confirmation rules.

## Daily work

- Overview prioritizes new feedback, drafts, pending reviews and active published overrides. Each editorial count opens its matching list. Account and service information is available under the secondary account summary.
- Content opens across all categories. Search matches IDs and English or Arabic question/answer text. Category names can be filtered separately. Results paginate and retain their filters when returning from the editor.
- At narrower widths, selecting a question opens a dedicated editor with Back to results. Wider layouts keep the list beside the editor. Short result lists do not reserve an empty fixed-height panel.
- English, Arabic and Compare control the editing view. Preview has its own language control. English content remains left-to-right inside the Arabic interface.
- Sources use separate title, publisher and HTTPS URL fields. Existing punctuation is preserved. Validation follows the API's eight-source limit.
- The save bar remains reachable while editing. Draft changes survive interface-language and section changes. Actions that would discard changes prompt first. Failed saves retain the user's input; input typed during an in-flight save is not replaced by the older response.

## Status and reports

Editorial status describes the working copy. The live-version label separately identifies the original static question or an active published override. A newer draft or pending review may coexist with an older published override, so the Live overrides filter uses publication state rather than editorial status.

Reports retain their original question wording. Open question finds the current item by its category and ID and shows both versions. Wording changes and missing records are explicit. This is relevant to `tv-shows-trivia-139`, whose wording was replaced by the Mind Lab remediation while retaining its ID.

Resolution notes reuse validated audit reasons and show the latest note, author and date. Saving a note without changing status records a `suggestion.note_added` event. Notes follow the existing audit-history lifecycle. No database migration is required. The update route accepts both the 24-character base64url IDs generated for feedback and UUIDs used by existing request flows.

## Validation and local preview

Use only synthetic data for destructive or publication-path UI checks:

```sh
npm run test:admin:fixtures
npm run test:admin:browser
node scripts/admin-workspace-fixture.mjs --port 4178
```

The fixture binds to loopback and never forwards API requests. Open `http://127.0.0.1:4178/admin` for the synthetic owner or append `?role=ADMIN` for the administrator. All fixture mutations are in memory. It is a development server and is excluded from the published static projection.

Regression coverage includes discovery, filters, editor navigation, bilingual previews, source validation, failed and concurrent saves, report context, resolution notes, existing publishing safeguards, narrow layouts, keyboard focus and automated accessibility checks. Worker tests separately exercise persistence, permissions and feedback routing against SQLite.

Production delivery uses the existing protected-main API and static-site workflows. Deploy the API before the static site; the static release's existing API-compatibility gate remains in force. Do not bypass branch checks or release receipts.
