import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildReleaseManifest,
  verifyReleaseManifest,
} from "./release-manifest.mjs";

const COMMIT = "a".repeat(40);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "jakh-release-manifest-"));
  const pagesDir = join(root, "pages");
  const workerDir = join(root, "worker");
  const migrationsDir = join(root, "migrations");
  await Promise.all([
    mkdir(join(pagesDir, "assets"), { recursive: true }),
    mkdir(workerDir, { recursive: true }),
    mkdir(migrationsDir, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(pagesDir, "index.html"), "<h1>JAKH</h1>\n"),
    writeFile(join(pagesDir, "assets", "app.js"), "console.log('release');\n"),
    writeFile(join(workerDir, "index.js"), "export default {};\n"),
    writeFile(join(migrationsDir, "0001_initial.sql"), "CREATE TABLE example(id TEXT);\n"),
    writeFile(join(migrationsDir, "0002_more.sql"), "ALTER TABLE example ADD value TEXT;\n"),
  ]);
  return {
    root,
    options: {
      sourceCommit: COMMIT,
      expectedSchema: "8",
      pagesName: "pages-123-1",
      pagesDir,
      workerName: "worker-123-1",
      workerDir,
      migrationsDir,
    },
  };
}

test("release manifest deterministically binds both artifacts, migrations, schema, and commit", async (t) => {
  const { root, options } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await buildReleaseManifest(options);
  const second = await buildReleaseManifest(options);

  assert.deepEqual(first, second);
  assert.equal(first.sourceCommit, COMMIT);
  assert.equal(first.expectedSchema, "8");
  assert.equal(first.artifacts.pages.name, "pages-123-1");
  assert.equal(first.artifacts.pages.fileCount, 2);
  assert.equal(first.artifacts.worker.name, "worker-123-1");
  assert.equal(first.artifacts.worker.fileCount, 1);
  assert.deepEqual(
    first.database.migrations.map(({ name }) => name),
    ["0001_initial.sql", "0002_more.sql"],
  );
  assert.match(first.releaseSha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(await verifyReleaseManifest(first, options), first);
});

test("verification fails when either artifact changes", async (t) => {
  const { root, options } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = await buildReleaseManifest(options);

  await writeFile(join(options.pagesDir, "index.html"), "<h1>changed</h1>\n");
  await assert.rejects(
    () => verifyReleaseManifest(manifest, options),
    /does not match the supplied artifacts/u,
  );
});

test("manifest rejects ambiguous identities, malformed migrations, and overlapping artifacts", async (t) => {
  const { root, options } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(
    () => buildReleaseManifest({ ...options, sourceCommit: "abc123" }),
    /source commit is invalid/u,
  );
  await assert.rejects(
    () => buildReleaseManifest({ ...options, workerName: options.pagesName }),
    /artifact names must differ/u,
  );
  await writeFile(join(options.migrationsDir, "notes.txt"), "not a migration\n");
  await assert.rejects(
    () => buildReleaseManifest(options),
    /only numbered SQL migration files/u,
  );
  await rm(join(options.migrationsDir, "notes.txt"));
  await assert.rejects(
    () => buildReleaseManifest({ ...options, workerDir: join(options.pagesDir, "assets") }),
    /must not overlap/u,
  );
});
