# Zero-cost hosting guardrail

Riddle Arabia is served from `riddlearabia.com` by the static Worker `jakh-site`
(`www.riddlearabia.com` redirects to the apex) and from `api.riddlearabia.com` by
the API Worker `jakh-api`, which uses the D1 database `jakh-db`. The `jakh` names
are internal Cloudflare identifiers. Since 12 October 2026, `jakh.net`,
`www.jakh.net` and `api.jakh.net` belong to a different project. They are not
Riddle Arabia domains and must not be attached to these Workers.

## Last account check: 2026-08-03

Verified on 2026-08-03 against the live Cloudflare account and repository
configuration, before the site moved to `riddlearabia.com`. It has not been
re-checked since, so re-verify before relying on it:

- Workers plan: **Free**, shown as the current plan.
- Active Cloudflare subscriptions: only `Free Plan — jakh.net` with no recurring price. That zone was the project's domain at the time; it now belongs to a different project, so this line does not describe the current account.
- Cloudflare payment method: none on file.
- D1: 2 of 10 Free databases, 237.57 kB total storage, with `jakh-db` at 225.28 kB.
- Recent D1 usage: 979 rows read and 60 rows written on the inspected day, far below the Free daily limits.
- Hosting architecture: two Workers, static assets, one Worker Cron, one D1 database, and SQLite Durable Objects. No R2, Queues, paid runners, Containers, Hyperdrive, Vectorize, or other paid binding is configured.
- GitHub Actions: public repository and standard hosted runners only. Encrypted backup retention is capped at 35 days and plaintext SQL is forbidden from artifacts.

The repository configuration still matches the architecture line: `jakh-site`
and `jakh-api`, one API Worker cron (`17 * * * *`), one D1 binding, and the
`BATTLE_ROOMS` and `PASSWORD_HASHERS` SQLite Durable Objects. The plan,
subscription, payment and usage lines are account facts that only a new check
of the Cloudflare dashboard can confirm.

## Free allowances and repository checks

Cloudflare Free currently includes 100,000 Worker requests per day, five Cron triggers, 20,000 static files, 5 million D1 rows read per day, 100,000 D1 rows written per day, 5 GB total D1 storage, and 100,000 Durable Object requests per day. On the D1 Free plan, exceeding a daily database allowance fails requests instead of silently creating usage charges.

`node scripts/validate-production-hygiene.mjs` enforces the repository-side guardrails on every release: standard runners, no paid bindings, one of five Worker crons, asset limits, bounded encrypted-artifact retention, no plaintext backup upload, no legacy media, and one unified illustration per category.

No source-code check can stop a future account owner from manually upgrading a Cloudflare product or adding a payment method. Before changing infrastructure, re-check the live Billing and Workers Plans screens and keep the account on Free.
