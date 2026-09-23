# Platform Status

`/admin` includes an owner-only Platform Status area for seeing Riddle Arabia's
operational picture without treating unrelated vendor dashboards as one metric.
It is deliberately separate from the editorial Overview, which remains focused
on reports, drafts, and review work.

## Access and safety

- The browser must obtain the dashboard data from the owner-protected API;
  hiding a tab is never used as authorization.
- Provider credentials and provider response bodies must never be included in
  `admin.html`, `admin.js`, `admin-config.js`, analytics events, or an API
  response.
- A future provider integration must use a separate least-privilege read-only
  credential stored as a Worker secret. Do not reuse a deployment, database
  export, or recovery credential for dashboard reads.
- Each card identifies its data freshness. A stale or unconnected source is
  not evidence that Riddle Arabia itself is unavailable.

## What the first release reports

| Source | Purpose | Interpretation |
| --- | --- | --- |
| Riddle Arabia | Accounts, sessions, completed activity, feedback, API and schema readiness | First-party product state. Account analytics remain consent-limited. |
| Cloudflare | Edge traffic and Worker invocation aggregates | The API supports a server-side GraphQL snapshot for edge requests, visits, data transfer, and API/site Worker requests and errors. It is live only after the dedicated read-only connection below is configured. |
| GitHub | Production-monitor and release workflow context | Deployment and monitor metadata need a read-only GitHub connection for live run data. Repository views/clones are not website visits. |
| Google Analytics 4 | Consented visitor and event reporting | The site loader is consent-gated. A card does not prove property ownership or collected events until the GA4 read connection is verified. |
| GoDaddy | Registrar, renewal, lock, and nameserver state | It is a domain-health source, not a visitor-traffic source once Cloudflare is authoritative. |
| Google Search Console | Organic clicks, impressions, indexing, and sitemap performance | It measures Google Search discovery, not all website visits, and needs property access. |

## Connecting a provider later

Add integrations one at a time, with a fixed allowlist of provider hosts and
paths, response-size limits, timeouts, and a cached aggregate snapshot. The
admin browser should receive only the normalized values it needs to render:
source state, headline, safe metric values, observation time, and a trusted
detail link.

Recommended order:

1. GitHub Actions/deployments/monitor read access.
2. GA4 after property ownership and consented event delivery are verified.
3. Search Console after property verification.
4. GoDaddy domain read access for expiry and renewal monitoring.

Do not combine Cloudflare edge requests, GA4 consented users, Search Console
clicks, and GitHub repository views into a single `traffic` number. They answer
different questions and have different coverage.

## Cloudflare activation

The Cloudflare adapter uses separate fixed GraphQL queries for zone traffic
and account Worker usage, requested concurrently, with a five-minute fresh cache
per Cloudflare location, a 24-hour aggregation window, and a 24-hour
stale-snapshot ceiling. GraphQL failures, malformed results, and timeouts
return a clear unavailable/stale state; they never expose provider messages or
credentials in the owner console. A failed dataset cannot suppress valid
aggregates from the other scope. The owner-protected API may include only
allowlisted diagnostic categories for the failing scope, never provider error
text, resource identifiers, or credentials.

If Cloudflare returns an empty aggregate for an idle or undeployed Worker, the
card is marked **Partial data** and omits that metric rather than presenting a
made-up zero. The remaining returned aggregates are still valid.

Create a dedicated API token such as `riddlearabia-admin-analytics` with only
these two policies: **Zone → Zone Analytics → Read** restricted to
`riddlearabia.com`, and **Account → Account Analytics → Read** for the
account. The account-level read policy is required for Worker invocation
aggregates; it grants no DNS, Worker-edit, billing, logging, or credential
management access. Give it a short reviewable expiry. Do not reuse the
deployment, D1 backup, recovery, or release-status credentials.

Set these values only as API Worker secrets:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ANALYTICS_API_TOKEN` | Dedicated read-only Cloudflare analytics token |
| `CLOUDFLARE_ANALYTICS_ACCOUNT_ID` | Riddle Arabia Cloudflare account ID |
| `CLOUDFLARE_ANALYTICS_ZONE_ID` | Riddle Arabia zone ID |
| `CLOUDFLARE_ANALYTICS_API_WORKER_NAME` | Optional override; defaults to `jakh-api` |
| `CLOUDFLARE_ANALYTICS_SITE_WORKER_NAME` | Optional override; defaults to `jakh-site` |

The dashboard labels edge requests, Cloudflare visits, bytes served, and Worker
invocations separately. These are operational aggregates, not billing totals,
unique-visitor counts, or a replacement for GA4.
