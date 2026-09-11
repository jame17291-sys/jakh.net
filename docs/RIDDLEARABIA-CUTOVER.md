# Riddle Arabia domain cutover

This is a one-time production migration from `jakh.net` to
`riddlearabia.com`. It preserves the existing Cloudflare Workers, D1 database,
Durable Object Battle rooms, and GitHub repository. The public site and API
move; internal Worker names, bindings, and account data do not.

## Before the cutover

1. In Cloudflare, add the `riddlearabia.com` zone and retain every existing
   mail-related DNS record that is actually in use (MX, TXT, DKIM, SPF, DMARC,
   CAA). Do not replace DNS records wholesale.
2. In GoDaddy, change only the domain's nameservers to the two Cloudflare
   nameservers shown for that zone. Wait until Cloudflare reports the zone as
   **Active**. The current GoDaddy default website will stop serving once the
   nameserver change propagates.
3. Confirm that `riddlearabia.com`, `www.riddlearabia.com`, and
   `api.riddlearabia.com` are available as Cloudflare custom domains. The
   checked-in Worker configuration declares all three alongside the legacy
   hosts.
4. Confirm the GitHub `production` environment and Cloudflare API secrets are
   available. The release workflows deliberately refuse unprotected or
   unapproved releases.

## Release order

Run these workflows from protected `main`, with the production-environment
approval. The cutover flag deliberately disables automatic rollback: a
pre-cutover Worker does not know the new hosts, so an automatic rollback could
turn a domain-routing failure into a larger outage.

1. Dispatch **Deploy API** with:
   - `release_phase`: `compatibility`
   - `domain_cutover`: `true`
2. Confirm `https://api.riddlearabia.com/api/health` is healthy and that a
   request from `https://riddlearabia.com` receives the expected credentialed
   CORS response.
3. Dispatch **Deploy static site to Cloudflare Workers** with:
   - confirmation: `DEPLOY riddlearabia.com FROM protected main`
   - `domain_cutover`: `true`
4. Retain the workflow receipts. The static release requires the new public
   host, API health, the exact Worker version, the generated build identity,
   and direct legacy redirects before it can complete.

## Acceptance checks

- `https://riddlearabia.com/` returns the Riddle Arabia site.
- `https://www.riddlearabia.com/anything?battle=CODE` redirects once to
  `https://riddlearabia.com/anything?battle=CODE`.
- `https://jakh.net/anything?battle=CODE` and
  `https://www.jakh.net/anything?battle=CODE` each redirect once to the
  matching `riddlearabia.com` URL.
- `https://api.riddlearabia.com/api/health` is healthy.
- A new Battle Room invitation has the form
  `https://riddlearabia.com/?battle=CODE`; opening it in a second browser
  session joins the same room.
- Existing user accounts and Battle rooms remain intact. Users will need to
  sign in again because secure host-only session cookies cannot be transferred
  from `api.jakh.net` to `api.riddlearabia.com`.

## Legacy-domain rule

Keep both `jakh.net` and `www.jakh.net` attached to the static Worker and
returning direct permanent redirects for at least 12 months. Do not point them
at an unrelated website during that period: doing so loses old links, breaks
search-engine site-move signals, and can strand shared invitations. After the
redirect retention window, remove the old custom domains only after reviewing
traffic, search-index coverage, and inbound-link data.
