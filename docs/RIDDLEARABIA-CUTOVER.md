# Riddle Arabia domain cutover

This is a one-time production migration from `jakh.net` to
`riddlearabia.com`. It preserves the existing Cloudflare Workers, D1 database,
Durable Object Battle rooms, and GitHub repository. The public site and API
move; internal Worker names, bindings, and account data do not.

## Before the cutover

1. In Cloudflare, add the `riddlearabia.com` zone and retain every existing
   mail-related DNS record that is actually in use (MX, TXT, DKIM, SPF, DMARC,
   CAA). Do not replace DNS records wholesale.
2. Check DNSSEC before changing nameservers. A parent-zone DS record for the
   previous DNS provider can make validating resolvers return `SERVFAIL` after
   the move. Save the current DS/DNSKEY evidence, disable the old provider's
   DNSSEC at the registrar, and remove only its obsolete DS records. If the
   nameservers have already changed, resolve this mismatch before continuing;
   changing A/CNAME records does not repair a broken DNSSEC chain. Wait for the
   published DS TTL to expire, then check again through validating resolvers.
   Follow [Cloudflare's nameserver setup guide](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)
   and [DNSSEC troubleshooting](https://developers.cloudflare.com/dns/dnssec/troubleshooting/).
3. In GoDaddy, change only the domain's nameservers to the two Cloudflare
   nameservers shown for that zone. Wait until Cloudflare reports the zone as
   **Active**. The current GoDaddy default website will stop serving once the
   nameserver change propagates.
4. Confirm that `riddlearabia.com`, `www.riddlearabia.com`, and
   `api.riddlearabia.com` are available as Cloudflare custom domains. The
   checked-in Worker configuration declares all three alongside the legacy
   hosts.
5. Confirm the GitHub `production` environment and Cloudflare API secrets are
   available. The release workflows deliberately refuse unprotected or
   unapproved releases.
6. Confirm that the legacy site is already a verified `jakh-site` Worker with
   a valid build ID and exact runtime Worker version. The domain cutover flag
   does not bypass the first-Worker bootstrap requirement. If the legacy site
   still uses Pages, follow the separately documented baseline migration first.

After the Cloudflare zone is active, enable Cloudflare DNSSEC and publish the
exact DS record Cloudflare supplies at the registrar. Verify the resulting
chain through a validating resolver; do not reuse the old provider's DS values.
Public DNS records alone do not prove Cloudflare activation, certificate
issuance, or Custom Domain attachment. Those remain separate launch checks.

## Release order

Run these workflows from protected `main`, with the production-environment
approval. The cutover flag deliberately disables automatic rollback: a
pre-cutover Worker does not know the new hosts, so an automatic rollback could
turn a domain-routing failure into a larger outage.

1. Dispatch **Deploy API** with:
   - `release_phase`: `compatibility`
   - `domain_cutover`: `true`
   Both API release phases temporarily use `https://jakh.net` as
   `STATIC_ORIGIN` when this flag is true. This keeps new Battle rooms and
   server-checked challenges working while the new static host is not yet
   deployed; API routes and allowed browser origins already include the new
   domain. Keep `domain_cutover: true` for any required `migrate-final` run.
2. Confirm `https://api.riddlearabia.com/api/health` is healthy and that a
   request from `https://riddlearabia.com` receives the expected credentialed
   CORS response. It must report schema `9`, the intended Worker version, and
   the release must be from the same exact commit as the static release. If
   compatibility still reports schema `8`, complete the guarded `migrate-final`
   phase and its encrypted backup/restore gate before deploying the site.
3. Dispatch **Deploy static site to Cloudflare Workers** with:
   - confirmation: `DEPLOY riddlearabia.com FROM protected main`
   - `domain_cutover`: `true`
4. Retain the workflow receipts. The static release requires the new public
   host, API health, the exact Worker version, the generated build identity,
   and direct legacy redirects before it can complete.
5. After the static release passes, dispatch **Deploy API** again from the
   same protected commit with `release_phase: compatibility` and
   `domain_cutover: false`. This code-only release restores the configured
   `STATIC_ORIGIN` to `https://riddlearabia.com`; until it completes, canonical
   question requests follow the verified legacy-site redirect. Confirm the
   new API Worker version and repeat a new Battle room and server-checked
   challenge before declaring the migration complete.

The pre-deploy monitor uses the explicit `legacy-cutover` contract against
`jakh.net` and `api.jakh.net`: it verifies the captured predecessor Worker,
stable pages and assets, the legacy-origin sitemap, public catalog/search
counts, and every quarantine probe without requiring the new brand or curated
routes to be live already. The receipt accepts this contract only for the
cutover predecessor. Candidate verification always uses the full current
Riddle Arabia contract; automatic rollback remains disabled for the cutover.

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
