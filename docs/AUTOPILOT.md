# Riddle Arabia Autopilot runbook

Autopilot is a bounded GitHub Actions maintenance workflow for `jame17291-sys/jakh.net`. It checks the site, regenerates approved derived files, and can publish a verified repair. It runs independently of Codex, an open browser, or an owner’s computer. It does not call an AI model, rewrite application code, or attempt unrestricted repairs.

The workflow is **Daily website maintenance**, defined in [site-autopilot.yml](../.github/workflows/site-autopilot.yml). Its scheduled start is **07:23 Dubai / 03:23 UTC daily**. The schedule runs from protected `main`; its actual start can be later. GitHub documents that scheduled runs can be delayed or dropped under heavy load and that public-repository schedules are disabled after 60 days without repository activity. Check the workflow itself when an expected run is missing. [GitHub schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## Limits and repair scope

| Control | Current behavior |
| --- | --- |
| Initial state | Paused in the API; the workflow also requires an explicit repository variable |
| Daily allowance | One claimed maintenance run and at most one reserved release per **UTC calendar day** |
| Release stages | One API compatibility/code-only stage followed by one static-site stage for the same reserved repair |
| Allowed source | Exact current protected `main`, with the current static build and API predecessor proved live |
| Automatic changes | Enumerated generated catalog metadata, search indexes, SEO/Arabic pages, sitemap and category illustrations |
| Bundle limit | At most 250 files and 12 MiB of generated output; exact reproducibility is required |
| AI spending | **$0**; no AI service is called |
| Runner | Standard GitHub-hosted `ubuntu-latest`, in this exact public repository |
| Maintenance job | 100-minute timeout; inspection has a 20-minute budget |
| Evidence | Latest 30 claimed-run receipts in the API; small maintenance JSON artifacts retained for one day |

The API and static stages belong to one daily release reservation; they are not two independent repair allowances. A failed or paused claimed run still occupies its day. Starting another run or rerunning a different attempt does not reset the allowance. The orchestrator refuses a start with less than 105 minutes remaining in the UTC day, so late manual runs do not cross the reservation boundary.

The repair engine executes generators from the trusted base, regenerates twice to establish a fixed point, and verifies the complete candidate tree. Authored question wording, answers, translations, application JavaScript, tests, workflows, API code, credentials and security settings are outside automatic repair scope. Deletions, renames, symlinks, submodules and file-mode changes are refused. See [Deterministic Autopilot repairs](AUTOPILOT-REPAIRS.md) for the exact engine contract and allowlist.

Checks include the production monitor, source contracts, static and bilingual validation, search/SEO validation, dependency audits, the public build/projection and accessibility. A repair must also pass the existing required CI before the GitHub merge API permits merging. An unrelated problem becomes a finding for review; a failing check does not authorize broader source edits.

GitHub currently provides free Actions usage for public repositories using standard GitHub-hosted runners. This implementation checks that the repository is public and uses the standard runner; it does not switch to private-repository, larger-runner or paid-AI execution. The $0 AI policy is not a guarantee that the website’s existing Cloudflare service, storage or other account usage can never incur charges. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

## Activate once

Keep both controls disabled until the reviewed implementation is merged and its API and admin page have been released through the normal release process. Autopilot cannot bootstrap its own API or deploy unrelated unreleased setup changes.

1. Confirm `main` is the repository’s protected default branch and required checks remain enforced. Keep the repository public and the workflow on its standard `ubuntu-latest` runner.
2. Create and install a dedicated repository-scoped **GitHub App** with repository permissions **Contents: Read and write** and **Pull requests: Read and write**. Install it on **only `jame17291-sys/jakh.net`**. Do not give it branch-protection bypass, administration or broader repository access. It supplies the short-lived installation token used only to push the generated branch and create its repair PR, so normal PR checks can run without the built-in token’s PR approval requirement. Ensure repository/organization Actions policy permits the workflow’s declared permissions and pinned actions. [GitHub token workflow behavior](https://docs.github.com/en/actions/concepts/security/github_token#when-github_token-triggers-workflow-runs), [GitHub App authentication in Actions](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow)
3. Create the separate GitHub environment **`autopilot-production`**. Set deployment access to **Protected branches only**, with `main` as the currently supported eligible branch. Do not configure required reviewers or a wait timer on this automatic environment. Its release still requires the Worker’s daily reservation and exact-workflow OIDC authorization. Add environment variables **`AUTOPILOT_GITHUB_APP_ID`** and **`AUTOPILOT_GITHUB_APP_INSTALLATION_ID`**, and environment secret **`AUTOPILOT_GITHUB_APP_PRIVATE_KEY`**, for the dedicated App. Use its actual App ID and installation ID, not its client ID.
4. Leave the existing **`production`** environment and its reviewer protection unchanged. Ordinary manual releases, with the Autopilot inputs left empty, continue to use that environment. Automatic releases use `autopilot-production` only after their extra authorization succeeds.
5. Provision the existing deployment credentials separately in `autopilot-production` under the names below. The current four credentials are scoped to `production`, with no repository-level copies; they are not inherited by the new environment. Use GitHub’s secret settings; do not put values in documentation, issues, receipts or workflow files.

| Existing name | Purpose in automatic release |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Identifies the existing Cloudflare account |
| `CLOUDFLARE_API_RELEASE_READ_TOKEN` | Reads the existing API release evidence for verification |
| `CLOUDFLARE_API_TOKEN` | Existing API Worker deployment credential |
| `CLOUDFLARE_STATIC_SITE_API_TOKEN` | Existing static Worker, assets and routes deployment credential |

6. Set repository Actions variable **`AUTOPILOT_RELEASE_ENABLED`** to the exact string **`true`**. This permits the maintenance job and automatic release gates to run; it does not change the API’s paused state.
7. Sign in to [Riddle Arabia administration](https://riddlearabia.com/admin) as an **OWNER**, open **Autopilot**, and choose **Resume Autopilot**. Wait for the confirmed **Active** state. Administrators and members cannot control this service.

The repository variable and the owner’s API state are independent controls. Both must permit operation. The App installation token is minted just before branch/PR publication and revoked afterward; the built-in `GITHUB_TOKEN` handles checks, merge, releases and findings issues. The Worker verifies a short-lived GitHub OIDC identity. The App’s private key remains an environment secret. No personal access token, stored website-admin password or AI API key is required, and this App publisher path does not require enabling the Actions setting for creating PRs with the built-in token.

## Read the panel and evidence

**Active** means the owner has enabled scheduled work; it is not a health certificate and does not prove GitHub has started a run. **Paused** means the API control is off. **Not connected** means the endpoint was unavailable to the panel; **Status unavailable** means the current status could not be confirmed. Refresh after resolving an error rather than assuming a failed update took effect.

The owner panel shows schedule limits, the latest recorded run and up to 30 run receipts. Receipts contain statuses, timestamps, source/candidate commits, check and repair counters, and deployment identity where recorded. Links open the corresponding GitHub maintenance/deployment runs. Changed-file paths are available in the maintenance JSON report; the panel’s repair figure is a count. Findings are counts of failed checks, not a complete inventory of individual broken links, vulnerabilities or accessibility nodes. GitHub check output supplies the detail.

| Recorded outcome | Operator interpretation |
| --- | --- |
| Checking / Applying repairs / Running checks | Work is in progress; no completed deployment is implied |
| No changes needed | Checks completed without a required generated-file repair and the source/live static identity matched |
| Needs attention | A check or source/live identity requires review; no automatic release is approved by this result |
| Release reserved | The daily slot has been reserved; deployment has not yet been reported complete |
| Deployed | The release workflows completed and the final site identity was recorded |
| Failed / Rolled back / Paused | Inspect the linked runs and release evidence before proceeding |

Autopilot creates or updates the bot-owned issue **`[Autopilot] Daily maintenance findings`** when checks fail or the cycle encounters an error. A subsequent clean cycle closes the open findings issue. Run details remain in GitHub according to its retention settings; the database keeps the latest 30 claimed runs, not an unlimited archive. The small `autopilot-<run-id>` artifact is intentionally retained for only one day. The existing deployment workflows retain their own release/rollback evidence separately.

Failures before a daily claim, skipped jobs, scheduler delays and a missing API do not necessarily produce a new database receipt. If activity looks stale, inspect the GitHub workflow and its logs before relying on the last entry displayed in the panel.

## Pause and resume

Choose **Pause Autopilot** in the owner panel and wait for the confirmed paused state. The API disables new claims and marks active receipts paused. The orchestrator and deployment workflows recheck permission before privileged stages.

Pause does not undo a commit, PR merge or deployment that has already happened. It also cannot retroactively stop an external operation that already crossed its authorization check. Check any running GitHub jobs when pausing during a release. If immediate interruption is needed, cancel the relevant maintenance and dispatched release runs in GitHub, then review the existing release/rollback evidence.

For a broader stop, also change `AUTOPILOT_RELEASE_ENABLED` away from `true` or disable **Daily website maintenance** in GitHub. These controls do not rewrite the API’s displayed enabled value. To resume, restore the repository variable, ensure the workflow is enabled and choose **Resume Autopilot**. Resume does not launch an immediate run or restore a consumed UTC-day allowance. A run paused after claiming its day cannot use resume to obtain a second release that day.

If GitHub disabled the schedule after inactivity, re-enable the workflow through its Actions page. [GitHub workflow enable/disable instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)

## Manual acceptance smoke

Use the first eligible day after setup, with current `main` already deployed. A manual dispatch is a real maintenance run: it consumes the same daily allowance and can publish a verified generated-file repair.

1. Confirm the OWNER panel loads in English and Arabic, shows the daily limits and $0 AI budget, and has working Pause/Resume controls. Confirm an ADMIN account has no Autopilot tab.
2. Pause, refresh, and confirm the paused state persists. Resume and refresh again. These control changes alone do not create a maintenance run.
3. In GitHub Actions, open **Daily website maintenance → Run workflow**, select **main**, and dispatch once. Do not fill the release workflows’ internal `autopilot_run_id` / `autopilot_day` inputs by hand to bypass the cycle.
4. Confirm the maintenance run starts on the standard runner, its receipt appears in the owner panel, and its GitHub link points to the same run ID.
5. On a clean repository, expect **No changes needed** and no repair PR or automatic release. If approved generated files need repair, inspect the PR’s allowlisted diff and check evidence; the cycle must validate, merge through branch protection, then run the authorized API and static release stages for the same candidate.
6. Confirm a reported deployment has the expected candidate/build identity and a successful linked release. If the cycle reports **Needs attention** or **Failed**, inspect the issue and logs instead of repeatedly dispatching runs that cannot acquire another daily slot.

Do not introduce defective production content merely to exercise the repair path. The isolated local suites cover deterministic repairs, denied source edits, API ownership/OIDC/daily locks and UI error paths:

```sh
npm run test:autopilot
npm run test:autopilot:browser
npm --prefix worker test
```

## Release boundaries and recovery

Before generating a candidate, the cycle builds its trusted base and compares its static build ID with the live admin response. Before the automatic API deployment, release evidence must prove that the predecessor API comes from that same source commit. Automatic API release is restricted to an unchanged **schema 9** with the compatibility/code-only path. Autopilot cannot request database migrations or a domain cutover.

These checks deliberately stop a generated repair from also releasing unrelated human changes that have been merged but not deployed. Release those changes through the existing reviewed process first. If a generated repair was merged but its deployment failed, a later zero-diff cycle still checks the source/live build identity and keeps the mismatch visible for review; it does not silently claim production is current or promise an automatic retry of the failed release.

There is no guarantee of an exact daily start, an immediate repair, or a successful release. Changes outside the allowlist, unavailable dependencies/services, drift in protected `main`, missing credentials, required-check failures, owner pause and runtime budgets can stop the cycle. A cancelled or timed-out maintenance job may leave a dispatched child workflow running or a receipt without a terminal update; inspect those linked jobs before recovery. Existing release workflows provide their established verification and rollback behavior, while Autopilot supplies the bounded scheduling, repair and authorization path.

The implementation is intentionally deterministic. Expanding the allowed files, enabling another category of repair, changing the spending policy or changing release authorization requires a reviewed source change.
