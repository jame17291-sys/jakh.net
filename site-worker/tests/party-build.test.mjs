import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { buildStaticSite } from '../../scripts/build-static-site.mjs';

const root = resolve(import.meta.dirname, '../..');
const assets = ['data/party-games.json', 'party-games-engine.js', 'party-games-copy.js', 'party-games-markup.js', 'party-games.css', 'party-games.js'];
const pages = ['most-likely-to.html', 'how-well-do-you-know-me.html', 'ar/games/most-likely-to/index.html', 'ar/games/how-well-do-you-know-me/index.html'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

test('party content and rules changes propagate through the actual module graph to all four HTML pages', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'riddlearabia-party-build-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const sourceRoot = join(temporary, 'source');
  const fileList = ['index.html', '404.html', 'app.js', 'styles.css', 'site-navigation.js', 'privacy-consent.js', ...assets, ...pages];
  for (const file of fileList) {
    const destination = join(sourceRoot, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(root, file), destination);
  }
  const build = async name => {
    const outputDirectory = join(temporary, name);
    const manifest = await buildStaticSite({ sourceRoot, fileList, outputDirectory, manifestPath: join(temporary, `${name}.json`), manifestModulePath: join(temporary, `${name}.js`) });
    return { manifest, outputDirectory };
  };
  const baseline = await build('baseline');
  const data = JSON.parse(await readFile(join(sourceRoot, assets[0]), 'utf8'));
  data.integrationRevision = 'only-public-content-changed';
  await writeFile(join(sourceRoot, assets[0]), `${JSON.stringify(data)}\n`);
  const contentChanged = await build('content-changed');
  await writeFile(join(sourceRoot, 'party-games-engine.js'), `${await readFile(join(sourceRoot, 'party-games-engine.js'), 'utf8')}\n// Isolated rules revision.\n`);
  const rulesChanged = await build('rules-changed');
  assert.ok(baseline.manifest.fingerprints['/privacy-consent.js'], 'the privacy gate is immutable for returning visitors');
  for (const [before, after, leaf] of [[baseline, contentChanged, '/data/party-games.json'], [contentChanged, rulesChanged, '/party-games-engine.js']]) {
    assert.notEqual(after.manifest.fingerprints[leaf], before.manifest.fingerprints[leaf]);
    assert.notEqual(after.manifest.fingerprints['/party-games.js'], before.manifest.fingerprints['/party-games.js'], `${leaf}: callers must change`);
    const runtime = await readFile(join(after.outputDirectory, after.manifest.fingerprints['/party-games.js'].slice(1)), 'utf8');
    assert.ok(runtime.includes(after.manifest.fingerprints[leaf]), `${leaf}: actual entry pins changed dependency`);
    for (const page of pages) {
      const html = await readFile(join(after.outputDirectory, page), 'utf8');
      assert.ok(html.includes(after.manifest.fingerprints['/party-games.js']), page);
      assert.ok(html.includes(after.manifest.fingerprints['/party-games.css']), page);
      assert.ok(html.includes(after.manifest.fingerprints['/privacy-consent.js']), `${page}: latest analytics boundary bypasses old mutable caches`);
      assert.notEqual(after.manifest.files[`/${page}`].sha256, before.manifest.files[`/${page}`].sha256, `${page}: entry change reaches HTML`);
      assert.equal(digest(html), after.manifest.files[`/${page}`].sha256);
    }
    assert.equal(after.manifest.fingerprints['/app.js'], before.manifest.fingerprints['/app.js'], 'the initial app does not contain party content');
    assert.equal(after.manifest.fingerprints['/styles.css'], before.manifest.fingerprints['/styles.css']);
  }
});
