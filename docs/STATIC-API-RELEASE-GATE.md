# Static/API production release gate

The static site may be released only when the live `api.riddlearabia.com` Worker is the
final API release from the exact same full source commit. A locally built API
dry-run and the cross-artifact manifest remain useful candidate inventories,
but neither is deployment evidence.

Immediately before the static deploy, `.github/workflows/static-site.yml` uses
a read-only Cloudflare token to capture `wrangler deployments status --json`
for `jakh-api`, and fetches the public `/api/health` contract. The gate requires:

- exactly one active Worker version serving 100% of traffic;
- an exact deployment message of `JAKH final <exact SHA> schema 10 run <id>`;
- the same full 40-character commit as the static workflow checkout;
- HTTP 200 health with `ok=true`, service `jakh-api`, actual and target schema
  `10`, schema-10 compatibility, and every schema-gated feature, including Content
  Studio and admin MFA, ready.

The workflow repeats the same proof after the static deployment. If that second
proof fails, the release is unverified and the existing exact-version static
rollback path runs. Both API gate receipts are retained with the static receipt.

## Build and deployment jobs

The static workflow runs three jobs in order:

1. `authorize` checks the confirmation phrase, protected `main`, the exact
   dispatched commit and the environment rules.
2. `build` installs every package and runs all validation once, including the
   browser matrix and accessibility checks. It has a read-only token and no
   deployment environment, Cloudflare credential or OIDC identity. It packages
   the exact candidate (static assets, generated Worker manifest, candidate
   receipts and the inventoried API dry-run bundle) into one deterministic archive.
   It publishes the archive's SHA-256, the build ID and the inventory SHA as job outputs.
3. `release` is the only job in the `production` (or reserved
   `autopilot-production`) environment, so a manual release needs one approval.
   The approval is requested after the build has passed. Before any credential
   is used, the job installs only the `site-worker` lockfile, downloads the
   archive, and checks it:
   - its SHA-256 matches the build job's output;
   - it contains only regular files under the four candidate roots;
   - its build ID matches;
   - `release-manifest.mjs verify` reproduces the same inventory SHA.

   It then runs the unchanged deploy, smoke, live-proof, rollback and receipt steps.

The API deployment-status reads above use the static lockfile's Wrangler with the
API's own `worker/wrangler.jsonc`. Both lockfiles pin the same Wrangler version,
and a contract test keeps them equal.

## Required production secret

Configure `CLOUDFLARE_API_RELEASE_READ_TOKEN` in the protected `production`
environment. It must be restricted to the JAKH Cloudflare account and only the
read permission needed to inspect Worker deployment status. It must not grant
Worker edit/deploy, D1, DNS, zone, or account-administration access. The existing
`CLOUDFLARE_ACCOUNT_ID` identifies the account; the separate
`CLOUDFLARE_STATIC_SITE_API_TOKEN` remains the static deployment credential.

Until that read token exists and the live API has an exact final-release
message for the candidate commit on schema 10, the static workflow fails closed.

Run the deterministic gate contract locally without contacting Cloudflare:

```sh
node --test scripts/static-api-release-gate.test.mjs
```
