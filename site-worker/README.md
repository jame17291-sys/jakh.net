# Riddle Arabia static edge Worker (`jakh-site`)

This package deploys the complete Riddle Arabia static site and its edge policy as one versioned Cloudflare Worker named `jakh-site`. It is deliberately separate from `worker/` (`jakh-api`), which serves `api.riddlearabia.com` and owns D1. The `jakh` names are internal identifiers. Its only custom domains are `riddlearabia.com` and `www.riddlearabia.com`. Since 12 October 2026, `jakh.net` and `www.jakh.net` belong to a different project and must never be attached to this Worker.

## Safety model

- `scripts/build-static-site.mjs` copies only allow-listed, Git-tracked public files. Local untracked files, repository tooling, documents, packages, and both Worker source trees cannot leak into the artifact.
- The generated `docs/content-review/production-quarantine.json` is a release contract, not an editorial deletion. The build keeps the full 3,553-card source corpus intact but emits only 51 categories and 3,275 cards. All five held route families and datasets are omitted from the artifact; direct, encoded, malformed, recursively encoded, and cached requests fail closed with `410`, `no-store`, no-index/no-archive policy, and cache clearing before redirect or asset lookup.
- This quarantine controls only runtime publication at `riddlearabia.com`, `api.riddlearabia.com`, and their generated deployment artifacts. The repository is currently public, so the full corpus remains reachable through GitHub source, raw-content URLs, commit history, and possible forks, caches, or copies; this Worker cannot retract them. Any repository/history containment is a separate owner-approved governance operation and must not be represented as accomplished by this release.
- The service worker uses the same exact five-category contract, never warms held data, returns the same quarantine response before online/offline cache lookup, and purges held entries during activation. The release manifest binds the exact policy digest and public/held totals into the build identity, and Worker startup refuses category drift or a held path in the graph.
- A SHA-256 build identity covers every final deployed byte. The Worker returns that identity in `X-JAKH-Site-Version` and content-derived weak ETags.
- HTML keeps `no-transform`, so Cloudflare does not compress it. The build adds a brotli and a gzip copy of each HTML page under the internal `/__precompressed/` directory, proves each decodes to the published bytes, and lists them in `htmlPrecompression`. The Worker only chooses a stored copy for a `GET` whose visitor accepts it and passes it through with `encodeBody: "manual"`; it never compresses, and `/__precompressed/` paths are never served as pages. `html-precompression.json` is the switch; see `docs/HTML-DELIVERY-POLICY.md`. Because the copies are deployed bytes, the build identity also depends on the zlib/brotli versions of the Node.js that built it.
- The build retains stable compatibility assets, emits 16-hex SHA-256 fingerprinted variants for the initial app/CSS, privacy CSS, both lazy feature pairs, and both search shards, then rewrites only the artifact dependency graph. `site-manifest.json` exposes and validates every stable-to-fingerprinted mapping.
- Mutable URLs are never marked immutable. HTML and the stable service worker revalidate; stable scripts/data revalidate after one hour. A generated asset receives a one-year immutable policy only when the digest embedded immediately before its extension matches its own final bytes.
- An already-open tab may ask for a fingerprint from the immediately prior release after a rollout. A missing hash that matches one of the nine known asset families is served from that family's stable compatibility URL with `Cache-Control: no-store` and an explicit fallback header. Unknown hash-shaped paths still return `404`, and current fingerprints remain immutable. This prevents lazy Search/Battle loads from breaking without pretending that replacement bytes match the old hash.
- The stable `/sw.js` has no operator-maintained cache counter in the artifact. Its cache namespace is deterministically derived from the complete deployable source graph, so any changed deployable byte creates a new offline-cache namespace while unchanged builds remain byte-for-byte reproducible.
- Physical `.html` and `/index.html` paths redirect directly to the clean canonical in one `301`, including simultaneous `www` and HTTP normalization. Query strings are retained.
- Security headers are applied to successful assets, redirects, `404` responses, conditional `304` responses, and Worker errors.
- Deployments capture the exact prior Worker version. A failed production smoke test triggers exact-version rollback and verifies the prior build identity.

## Local verification

```sh
npm ci --prefix site-worker --no-audit --no-fund
npm run build:site
npm run test:site
npm --prefix site-worker run check
```

The dry run does not deploy or modify Cloudflare.

The build is intentionally based on `git ls-files`; a local untracked public
file is not deployable merely because it exists. Fixture tests pass an explicit
file list and therefore do not depend on staging. Production must build the
exact protected commit, and the manifest's final-byte inventory is the release
and rollback boundary.

## Current production setup

- **Domains.** `wrangler.jsonc` attaches `riddlearabia.com` and `www.riddlearabia.com` as Worker custom domains, with `workers_dev` off. A `www` or plain-HTTP request gets a single `301` to the `https://riddlearabia.com` address. Any other hostname that reaches the Worker gets `404`. The only exception is the dormant `mta-sts.riddlearabia.com` handler described below.
- **Releases.** Static production releases go only through the manual **Deploy static site to Cloudflare Workers** workflow (`.github/workflows/static-site.yml`), run from protected `main` with the confirmation `DEPLOY riddlearabia.com FROM protected main`. A manual release uses the `production` environment, which must have required reviewers. Run it after the API deploy, from the same `main` commit; see `docs/DEPLOYMENT-CHECKLIST.md`.
- **`domain_cutover` stays `false`.** The input remains only for compatibility; the workflow refuses to run when it is `true`.
- **Baseline and rollback.** Before deploying, the workflow requires `riddlearabia.com` to serve a verified `jakh-site` Worker with an exact Worker version and `X-JAKH-Site-Version` build identity, and it records that version as the rollback target after proving it safe. After deploying, it runs the smoke, API and runtime checks. If the deployment or any of those checks fails, it rolls back to that exact version and verifies the rollback. None of this depends on redirects from retired domains. Do not weaken the baseline, version, schema or rollback safeguards.
- **No GitHub Pages path.** The **Legacy GitHub Pages (break-glass only)** workflow (`pages.yml`) can no longer publish anything. It always fails with a denial, so GitHub Pages is not a rollback route.

## Superseded: one-time `jakh.net` cut-over runbook

Earlier versions of this README contained the one-time runbook that first attached this Worker to `jakh.net` and `www.jakh.net`, using GitHub Pages as the DNS rollback. That runbook is superseded and has been removed: the domains now belong to a different project, and the Pages workflow it relied on is retired. Do not use it, or the DNS, Custom Domain or Pages steps in it, for Riddle Arabia. The last copy is kept only as history in [the README at `db7b3c7b`](https://github.com/jame17291-sys/jakh.net/blob/db7b3c7b81b08f188d13c26d29dc31e5b4ff4b08/site-worker/README.md#one-time-baseline-cutover-runbook). `docs/RIDDLEARABIA-CUTOVER.md` records the completed move to `riddlearabia.com`.

## MTA-STS capability

The Worker contains a dedicated handler and policy asset for `mta-sts.riddlearabia.com/.well-known/mta-sts.txt`, but the custom domain is intentionally absent and `MTA_STS_ENABLED` defaults to `false`. The bundled `mode: none` policy makes no unverified MX claim. Domain separation does not change mail records or activate this capability.

Mail ownership must first approve the actual Google Workspace MX patterns, enforcement mode, reporting destination, rollout, and rollback. Then replace `assets/mta-sts.txt`, add the custom-domain route, set `MTA_STS_ENABLED=true`, and publish the separately approved `_mta-sts` and `_smtp._tls` DNS records. Do not invent a TLS-RPT recipient.
