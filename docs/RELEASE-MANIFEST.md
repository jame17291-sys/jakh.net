# Cross-artifact release manifest

JAKH Pages and API releases use separate deployment systems. A release is not
one auditable unit until one record binds the exact source commit to both built
artifacts and the D1 migration set. `scripts/release-manifest.mjs` creates that
record without contacting GitHub, Cloudflare, or production.

The manifest is deterministic: timestamps, filesystem metadata, absolute paths,
and credentials are excluded. It records every regular file's relative path,
byte count, and SHA-256 digest; aggregate digests for the Pages artifact, Worker
artifact, and migrations; the expected schema; both immutable artifact names;
the full 40-character source commit; and a digest over the complete record.
Symbolic links, overlapping Pages/Worker directories, malformed migration
filenames, ambiguous artifact names, and self-referential output locations fail
closed.

## Create a candidate record

Build the exact artifacts first. The directories below are examples; use the
actual upload directories from the candidate run.

```sh
node scripts/release-manifest.mjs create \
  --source-commit "$GITHUB_SHA" \
  --expected-schema 8 \
  --pages-name "github-pages-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" \
  --pages-dir "$RUNNER_TEMP/jakh-pages-artifact" \
  --worker-name "jakh-api-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" \
  --worker-dir "$RUNNER_TEMP/jakh-worker-artifact" \
  --migrations-dir worker/migrations \
  --output "$RUNNER_TEMP/jakh-release/release-manifest.json"
```

The output must live outside all three inventoried directories. Retain it with
the Pages deployment ID, API compatibility receipt, API final receipt, recovery
bookmark, backup/restore evidence, monitor results, and approval record.

## Verify before either deployment phase

Download the retained artifacts rather than rebuilding them, then run:

```sh
node scripts/release-manifest.mjs verify \
  --manifest "$RUNNER_TEMP/jakh-release/release-manifest.json" \
  --source-commit "$GITHUB_SHA" \
  --expected-schema 8 \
  --pages-name "github-pages-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" \
  --pages-dir "$RUNNER_TEMP/jakh-pages-artifact" \
  --worker-name "jakh-api-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" \
  --worker-dir "$RUNNER_TEMP/jakh-worker-artifact" \
  --migrations-dir worker/migrations
```

Verification recomputes the complete record and rejects any byte, name, schema,
migration, or commit mismatch. A successful manifest does not prove that either
artifact was deployed; deployment receipts must independently name the same
commit and artifact identities.

Run the focused contract with:

```sh
node --test scripts/release-manifest.test.mjs
```
