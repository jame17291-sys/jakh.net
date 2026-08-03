# JAKH static edge Worker

This package deploys the complete static site and its edge policy as one versioned Cloudflare Worker. It is deliberately separate from `worker/`, which serves `api.jakh.net` and owns D1.

## Safety model

- `scripts/build-static-site.mjs` copies only allow-listed, Git-tracked public files. Local untracked files, repository tooling, documents, packages, and both Worker source trees cannot leak into the artifact.
- The generated `docs/content-review/production-quarantine.json` is a release contract, not an editorial deletion. The build keeps the full 3,553-card source corpus intact but emits only 51 categories and 3,275 cards. All five held route families and datasets are omitted from the artifact; direct, encoded, malformed, recursively encoded, and cached requests fail closed with `410`, `no-store`, no-index/no-archive policy, and cache clearing before redirect or asset lookup.
- This quarantine controls only runtime publication at `jakh.net`, `api.jakh.net`, and their generated deployment artifacts. The repository is currently public, so the full corpus remains reachable through GitHub source, raw-content URLs, commit history, and possible forks, caches, or copies; this Worker cannot retract them. Any repository/history containment is a separate owner-approved governance operation and must not be represented as accomplished by this release.
- The service worker uses the same exact five-category contract, never warms held data, returns the same quarantine response before online/offline cache lookup, and purges held entries during activation. The release manifest binds the exact policy digest and public/held totals into the build identity, and Worker startup refuses category drift or a held path in the graph.
- A SHA-256 build identity covers every final deployed byte. The Worker returns that identity in `X-JAKH-Site-Version` and content-derived weak ETags.
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

## Production activation

The Static Site workflow is manual and requires protected-main and protected-environment approval. Its normal-release preflight deliberately refuses a first release unless `jakh.net` is already serving a verified baseline `jakh-site` Worker with an exact Worker version and `X-JAKH-Site-Version` build identity. Do not weaken that preflight to make the first migration convenient.

The legacy GitHub Pages workflow is manual-only and must not be run after the custom domains point at this Worker.

### One-time baseline cutover runbook

This is a separate, owner-approved migration procedure, not a normal release. Record this exact confirmation in the change ticket before touching DNS:

`BOOTSTRAP jakh-site AND PRESERVE LEGACY DNS ROLLBACK`

Do not start unless all of the following are true:

1. The candidate is the current tip of protected `main`; all contract, performance, browser-matrix, accessibility, site, and Wrangler dry-run gates passed for that exact commit.
2. The `production` environment approval is recorded and the least-privilege bootstrap token has `Workers Scripts: Edit`, `Workers Routes: Edit`, `DNS: Read`, and `DNS: Edit` for only the JAKH account and zone. Record the account and zone IDs; never paste them into the repository.
3. A maintenance window and a named rollback operator are active. The rollback operator must remain present until both `jakh.net` and `www.jakh.net` pass the post-cutover smoke suite.
4. A quarantine-safe legacy Pages artifact from this exact commit is already deployed and verified as the rollback baseline. A pre-quarantine Pages artifact is never an acceptable rollback target. Do not run the Pages workflow after the Worker custom domains are attached.

Before the API release or any DNS/custom-domain change, publish the exact
projected artifact to GitHub Pages while Pages still owns `jakh.net` and
`www.jakh.net`:

1. From the current tip of protected `main`, dispatch `Legacy GitHub Pages (break-glass only)`, enter the exact confirmation `DEPLOY LEGACY GITHUB PAGES`, and supply the approved change reference. The workflow must build the same 539-file projection; never upload the repository root or the full source tree.
2. Verify the Pages deployment itself on both `jakh.net` and `www.jakh.net`: public catalog `51`/`3,275`, card index and both search shards `3,275`, the exact quarantine policy digest, and `404` for every held English route, Arabic route, and category-data path. Retain both host reports, the artifact manifest, commit, deployment URL/ID, probe bodies and hashes, statuses, UTC times, and workflow run as the Pages rollback receipt.
3. Only after that receipt passes, deploy and verify the API compatibility phase. The `migrate-final` phase is currently intentionally fail-closed before D1 mutation: it must not be enabled until it consumes a successful same-commit compatibility receipt and creates, encrypts, uploads, and verifies an off-account D1 backup receipt. Cloudflare Time Travel alone does not satisfy that requirement.
4. Only after both the safe Pages baseline and API phases pass may the one-time `jakh-site` custom-domain cutover begin. If any prerequisite fails, leave Pages and DNS in place.

Never restore or redeploy a pre-quarantine Pages artifact. DNS rollback must
return traffic only to the verified projected Pages baseline from the exact
approved commit.

Before deleting any conflicting record, save these immutable evidence files outside the mutable checkout and retain them with the release receipt:

- `GET /zones/{zone_id}` and verify that the returned active zone name is exactly `jakh.net`.
- `GET /zones/{zone_id}/dns_records?name=jakh.net&per_page=100` and `GET /zones/{zone_id}/dns_records?name=www.jakh.net&per_page=100`. Preserve every returned field and separately identify only the conflicting `A`, `AAAA`, or `CNAME` web records; never alter MX, TXT, CAA, or other records.
- `GET /accounts/{account_id}/workers/domains` and verify neither hostname is attached to another Worker.
- The HTTP status, redirect chain, response headers, SHA-256 body hash, and UTC capture time for `https://jakh.net/`, `https://www.jakh.net/`, `https://jakh.net/sw.js`, a known `404` URL, and every held route/data probe from the verified quarantine-safe Pages receipt.
- The candidate `site-manifest.json`, commit SHA, build ID, dry-run output, run ID, operator, and the exact confirmation above.

Cloudflare does not allow a Worker Custom Domain on a hostname with an existing CNAME. Delete only the snapshotted conflicting web records, then run the exact candidate once with all placeholders resolved from the approved receipt (never from memory):

```sh
test "$BOOTSTRAP_CONFIRMATION" = "BOOTSTRAP jakh-site AND PRESERVE LEGACY DNS ROLLBACK"
test -n "$SOURCE_COMMIT" && test -n "$BUILD_ID" && test -n "$CHANGE_REFERENCE"
(
  cd site-worker
  ./node_modules/.bin/wrangler deploy --strict \
    --message "JAKH site baseline $SOURCE_COMMIT build $BUILD_ID change $CHANGE_REFERENCE"
)
(
  cd site-worker
  ./node_modules/.bin/wrangler deployments status --json \
    > "$RECEIPT_DIR/bootstrap-deployment-before-smoke.json"
)
WORKER_VERSION="$(node scripts/site-release-receipt.mjs active-version \
  --deployment "$RECEIPT_DIR/bootstrap-deployment-before-smoke.json")"
node scripts/site-release-receipt.mjs smoke \
  --expected-build-id "$BUILD_ID" \
  --expected-worker-version "$WORKER_VERSION" \
  --output "$RECEIPT_DIR/bootstrap-smoke.json" \
  --attempts 8 \
  --delay-ms 10000
(
  cd site-worker
  ./node_modules/.bin/wrangler deployments status --json \
    > "$RECEIPT_DIR/bootstrap-deployment-after-smoke.json"
)
test "$(node scripts/site-release-receipt.mjs active-version \
  --deployment "$RECEIPT_DIR/bootstrap-deployment-after-smoke.json")" = "$WORKER_VERSION"
```

Confirm exactly one version serves 100%, the expected build identity is live on every probe, and the deployment message contains the approved commit, build, and change reference. A successful verified baseline makes every later release eligible for the normal automated version rollback.

If deploy, certificate issuance, redirect, header, build identity, or smoke verification fails, stop the cutover and perform this rollback in order:

1. List `GET /accounts/{account_id}/workers/domains` again and detach only the `jakh-site` domain IDs for `jakh.net` and `www.jakh.net` with `DELETE /accounts/{account_id}/workers/domains/{domain_id}`. Do not detach a domain owned by another service.
2. Re-list both hostnames' DNS records. Use `POST /zones/{zone_id}/dns_records/batch` to delete only the current conflicting web-record IDs and recreate the saved legacy web records with their exact type, name, content, TTL, proxy state, comments, tags, and settings. The batch response must report `success: true`.
3. Re-list DNS and compare the restored records field-for-field with the pre-cutover snapshot. Then repeat the legacy HTTP probes until their status, redirects, body hashes, public counts, policy digest, and held-route/data `404` behavior match the saved quarantine-safe Pages baseline. DNS propagation is not atomic, so a successful API response alone is not recovery evidence.
4. If the quarantine-safe Pages artifact is unavailable or cannot be proven, stop recovery and escalate; never dispatch, restore, or accept an older pre-quarantine artifact as a shortcut.
5. Retain the before/after DNS snapshots, Custom Domain lists, API responses, probes, and timestamps. Do not retry bootstrap until the rollback evidence is complete and reviewed.

The relevant Cloudflare operations are the [Custom Domains API](https://developers.cloudflare.com/api/go/resources/workers/subresources/domains/), [DNS batch API](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/batch/), and [Custom Domains migration guidance](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## MTA-STS capability

The Worker contains a dedicated handler and policy asset for `mta-sts.jakh.net/.well-known/mta-sts.txt`, but the custom domain is intentionally absent and `MTA_STS_ENABLED` defaults to `false`. The bundled `mode: none` policy makes no unverified MX claim.

Mail ownership must first approve the actual Google Workspace MX patterns, enforcement mode, reporting destination, rollout, and rollback. Then replace `assets/mta-sts.txt`, add the custom-domain route, set `MTA_STS_ENABLED=true`, and publish the separately approved `_mta-sts` and `_smtp._tls` DNS records. Do not invent a TLS-RPT recipient.
