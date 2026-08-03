# Static/API production release gate

The static site may be released only when the live `api.jakh.net` Worker is the
final API release from the exact same full source commit. A locally built API
dry-run and the cross-artifact manifest remain useful candidate inventories,
but neither is deployment evidence.

Immediately before the static deploy, `.github/workflows/static-site.yml` uses
a read-only Cloudflare token to capture `wrangler deployments status --json`
for `jakh-api`, and fetches the public `/api/health` contract. The gate requires:

- exactly one active Worker version serving 100% of traffic;
- an exact deployment message of `JAKH final <exact SHA> schema 9 run <id>`;
- the same full 40-character commit as the static workflow checkout;
- HTTP 200 health with `ok=true`, service `jakh-api`, actual and target schema
  `9`, schema-9 compatibility, and every schema-gated feature, including Content Studio, ready.

The workflow repeats the same proof after the static deployment. If that second
proof fails, the release is unverified and the existing exact-version static
rollback path runs. Both API gate receipts are retained with the static receipt.

## Required production secret

Configure `CLOUDFLARE_API_RELEASE_READ_TOKEN` in the protected `production`
environment. It must be restricted to the JAKH Cloudflare account and only the
read permission needed to inspect Worker deployment status. It must not grant
Worker edit/deploy, D1, DNS, zone, or account-administration access. The existing
`CLOUDFLARE_ACCOUNT_ID` identifies the account; the separate
`CLOUDFLARE_STATIC_SITE_API_TOKEN` remains the static deployment credential.

Until that read token exists and the live API has an exact final-release
message for the candidate commit on schema 9, the static workflow fails closed.

Run the deterministic gate contract locally without contacting Cloudflare:

```sh
node --test scripts/static-api-release-gate.test.mjs
```
