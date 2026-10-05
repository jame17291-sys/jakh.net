import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildStaticSite, isDeployableFile } from '../../scripts/build-static-site.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function requestedSpeechModules(application, caller = 'app') {
  const constant = application.match(/^const SPEECH_MODULE_URL = (['"])([^'"]+)\1;$/mu);
  assert.ok(constant, 'the built application defines its speech module URL');
  const start = application.indexOf('function prepareSpeech(');
  assert.ok(start >= 0, 'the actual application speech loader is present');
  const loader = application.slice(start, application.indexOf('\n}', start) + 2);
  const adapted = loader.replace('import(path)', 'captureModuleImport(path)');
  assert.notEqual(adapted, loader, 'only the native module importer is adapted for the VM');
  const requests = [];
  const control = { dataset: {}, textContent: 'Read instructions aloud', disabled: false, setAttribute() {}, removeAttribute() {} };
  const context = vm.createContext({
    state: { audioEnabled: true }, document: { querySelectorAll: () => [] },
    resetAudioButton() {}, t: value => value, showToast() {},
    $: () => null, $$: () => [control], announce() {}, speechFailure() {},
    captureModuleImport(path) { requests.push(path); return Promise.reject(new Error('Simulated first-load and retry failures')); },
  });
  const bindings = caller === 'kids'
    ? 'let speechModule = null, speechLoad = null, speechAttempts = 0;'
    : 'let _speechQuality = null, _speechQualityPromise = null, _speechLoadAttempts = 0;';
  const loadPromise = caller === 'kids' ? 'speechLoad' : '_speechQualityPromise';
  vm.runInContext(`${bindings}\n${constant[0]}\n${adapted}`, context);
  vm.runInContext('prepareSpeech();', context);
  await vm.runInContext(loadPromise, context);
  vm.runInContext('prepareSpeech(true);', context);
  await vm.runInContext(loadPromise, context);
  vm.runInContext('prepareSpeech(true);', context);
  assert.equal(requests.length, 2, 'the reader bounds failed module requests to the initial load and one retry');
  return requests;
}

test('a speech-only release reaches both read-aloud callers and their pages while preserving unrelated assets', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'jakh-speech-release-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = join(temporary, 'source');
  const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8' });
  assert.equal(tracked.status, 0, tracked.stderr);
  const fileList = tracked.stdout.split('\0').filter(file => file && isDeployableFile(file));
  for (const required of ['speech-quality.js', 'app.js', 'kids-learning.js']) {
    assert.ok(fileList.includes(required), `${required} is included in the release fixture`);
  }
  await Promise.all([...fileList, 'docs/content-review/production-quarantine.json'].map(async file => {
    const destination = join(source, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(repositoryRoot, file), destination);
  }));
  const build = async name => {
    const outputDirectory = join(temporary, `${name}-dist`);
    const manifest = await buildStaticSite({
      sourceRoot: source, fileList, outputDirectory,
      manifestPath: join(temporary, `${name}-manifest.json`),
      manifestModulePath: join(temporary, `${name}-manifest.js`),
    });
    return { manifest, outputDirectory };
  };
  const baseline = await build('baseline');
  const speechSource = await readFile(join(source, 'speech-quality.js'), 'utf8');
  await writeFile(join(source, 'speech-quality.js'), `${speechSource}\n// Isolated speech-only release revision.\n`);
  const changed = await build('changed');
  const readArtifact = (release, path) => readFile(join(release.outputDirectory, path.slice(1)), 'utf8');

  for (const parent of ['/speech-quality.js', '/app.js', '/kids-learning.js']) {
    const previousPath = baseline.manifest.fingerprints[parent];
    const currentPath = changed.manifest.fingerprints[parent];
    assert.ok(previousPath && currentPath, `${parent} has a content fingerprint`);
    assert.notEqual(currentPath, previousPath, `${parent} changes when the speech leaf changes`);
    const bytes = await readArtifact(changed, currentPath);
    const sha256 = digest(bytes);
    assert.ok(currentPath.endsWith(`.${sha256.slice(0, 16)}.js`), `${parent} URL identifies its actual bytes`);
    assert.equal(changed.manifest.files[currentPath].sha256, sha256);
    assert.equal(changed.manifest.files[previousPath], undefined, 'an obsolete module is absent from the candidate artifact');
  }
  for (const release of [baseline, changed]) {
    const speechPath = release.manifest.fingerprints['/speech-quality.js'];
    const application = await readArtifact(release, release.manifest.fingerprints['/app.js']);
    assert.deepEqual(await requestedSpeechModules(application), [speechPath, `${speechPath}?retry=1`],
      'both native loader attempts preserve the published speech module fingerprint');
    const kids = await readArtifact(release, release.manifest.fingerprints['/kids-learning.js']);
    assert.deepEqual(await requestedSpeechModules(kids, 'kids'), [speechPath, `${speechPath}?retry=1`],
      'Kids initial load and its bounded retry request the same published engine');
    assert.ok(release.manifest.files[speechPath], 'the imported engine exists in the artifact');
    for (const caller of [application, kids]) {
      assert.doesNotMatch(caller, /(['"])(?:\.\/|\/)speech-quality\.js\1/u,
        'published callers never resolve the mutable canonical speech URL');
    }
  }

  for (const [page, caller] of [
    ['/chemistry.html', '/app.js'], ['/ar/topics/chemistry/index.html', '/app.js'],
    ['/kids-riddles/activities/kids-3-4-language-01/index.html', '/kids-learning.js'],
    ['/ar/topics/kids-riddles/activities/kids-3-4-language-01/index.html', '/kids-learning.js'],
  ]) {
    const previous = await readArtifact(baseline, page);
    const current = await readArtifact(changed, page);
    assert.notEqual(current, previous, `${page} points to the changed caller`);
    assert.ok(current.includes(changed.manifest.fingerprints[caller]), `${page} pins its current caller`);
    assert.ok(!current.includes(baseline.manifest.fingerprints[caller]), `${page} cannot select the previous caller`);
  }
  assert.notEqual(changed.manifest.sourceGraphId, baseline.manifest.sourceGraphId);
  assert.notEqual(changed.manifest.offlineCacheIdentity, baseline.manifest.offlineCacheIdentity);
  const previousWorker = await readArtifact(baseline, '/sw.js');
  const currentWorker = await readArtifact(changed, '/sw.js');
  assert.ok(currentWorker.includes(`const CACHE_VERSION = '${changed.manifest.offlineCacheIdentity}';`));
  assert.equal(currentWorker.replaceAll(changed.manifest.offlineCacheIdentity, '<release-identity>'),
    previousWorker.replaceAll(baseline.manifest.offlineCacheIdentity, '<release-identity>'),
    'the speech change renews the worker cache generation without changing its unrelated shell');

  for (const asset of [
    '/styles.css', '/kids-learning.css', '/kids-state.js', '/data/kids/catalog.json',
    '/battle-mode.js', '/battle-selection.js', '/tv-trivia.js', '/puzzle-room.js',
    '/data/catalog.json', '/data/chemistry.json', '/data/math.json',
  ]) {
    assert.ok(baseline.manifest.fingerprints[asset], `${asset} is exercised by the fixture`);
    assert.equal(changed.manifest.fingerprints[asset], baseline.manifest.fingerprints[asset],
      `${asset} stays stable when only speech changes`);
  }
  for (const asset of ['/assets/riddlearabia-logo.webp', '/sitemap.xml', '/robots.txt']) {
    assert.ok(baseline.manifest.files[asset]);
    assert.deepEqual(changed.manifest.files[asset], baseline.manifest.files[asset], `${asset} stays byte-identical`);
  }
});
