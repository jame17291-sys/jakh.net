import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { RIDDLE_ARABIA_GAME_CATALOG } from './riddlearabia-seo.mjs';

const root = resolve(import.meta.dirname, '..');
const read = file => readFile(resolve(root, file), 'utf8');
const slugs = ['most-likely-to', 'how-well-do-you-know-me'];
const path = (slug, lang) => lang === 'ar' ? `/ar/games/${slug}/` : `/${slug}`;
const file = (slug, lang) => lang === 'ar' ? `ar/games/${slug}/index.html` : `${slug}.html`;

test('both games are discoverable in each language without downloading the game runtime on the hub', async () => {
  for (const lang of ['en', 'ar']) {
    const hub = await read(lang === 'ar' ? 'ar/play/index.html' : 'play.html');
    const directory = hub.match(/<!-- party-directory:start -->([\s\S]*?)<!-- party-directory:end -->/u)?.[1];
    assert.ok(directory, `${lang}: generated party directory`);
    assert.match(directory, /<section\b(?=[^>]*\bdata-party-directory\b)(?=[^>]*\bdata-puzzle-directory\b)/u);
    assert.ok(hub.indexOf('<!-- party-directory:end -->') < hub.indexOf('<!-- puzzle-room:start -->'), 'party cards are discoverable before the long puzzle library and cannot be replaced by puzzle rendering');
    assert.doesNotMatch(hub, /<(?:script|link)\b[^>]*(?:src|href)=["'][^"']*(?:party-games\.(?:js|json)|party-games-engine\.js)/u);
    const guide = await read(lang === 'ar' ? 'ar/alab-al-dimagh/index.html' : 'brain-games.html');
    for (const slug of slugs) {
      const entry = RIDDLE_ARABIA_GAME_CATALOG.find(game => game.slug === slug);
      assert.ok(entry, slug);
      assert.ok(directory.includes(`href="${path(slug, lang)}"`), `${lang}/${slug}: real playable card`);
      assert.ok(directory.includes(entry.names[lang]), `${lang}/${slug}: localized name`);
      assert.ok(guide.includes(`href="${path(slug, lang)}"`), `${lang}/${slug}: searchable guide destination`);
    }
    const lists = [...hub.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gu)]
      .map(match => JSON.parse(match[1])).filter(node => node['@type'] === 'ItemList');
    assert.equal(lists.length, 1);
    for (const slug of slugs) assert.ok(lists[0].itemListElement.some(item => (item.url || item.item?.url) === `https://riddlearabia.com${path(slug, lang)}`));
  }
});

test('the four dedicated pages have clean bilingual canonicals, game navigation and lazy assets', async () => {
  const sitemap = await read('sitemap.xml');
  for (const slug of slugs) for (const lang of ['en', 'ar']) {
    const html = await read(file(slug, lang));
    assert.match(html, new RegExp(`<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`, 'u'));
    assert.match(html, /<body\b[^>]*\bdata-party-game=/u);
    assert.ok(html.includes(`<link rel="canonical" href="https://riddlearabia.com${path(slug, lang)}"`));
    for (const alternate of ['en', 'ar']) assert.ok(html.includes(`hreflang="${alternate}" href="https://riddlearabia.com${path(slug, alternate)}"`));
    assert.match(html, /data-nav="games" aria-current="page"/u);
    assert.match(html, /<script type="module" src="\/party-games\.js"/u);
    assert.match(html, /<link rel="stylesheet" href="\/party-games\.css"/u);
    assert.doesNotMatch(html, /<script\b[^>]*src="\/app\.js/u);
    assert.doesNotMatch(html, /(?:ownerToken|playerToken|answerIndices|correctIndex)\s*[=:]/u);
    assert.ok(sitemap.includes(`<loc>https://riddlearabia.com${path(slug, lang)}</loc>`));
  }
});

test('language navigation retains a shared quiz code only on party pages and never copies private tokens', async () => {
  const navigation = await read('site-navigation.js');
  for (const party of [true, false]) {
    const links = ['home', 'library', 'kids', 'games', 'daily'].map(nav => ({ dataset: { nav }, attrs: {}, setAttribute(name, value) { this.attrs[name] = value; }, removeAttribute(name) { delete this.attrs[name]; } }));
    const alternate = { href: 'https://riddlearabia.com/ar/games/how-well-do-you-know-me/', addEventListener() {} };
    const document = {
      body: { hasAttribute: name => name === 'data-party-game' && party, matches: () => false },
      querySelectorAll: selector => selector === '.language-route-link' ? [alternate] : links,
    };
    vm.runInNewContext(navigation, {
      document, navigator: {}, URL, URLSearchParams,
      location: { pathname: '/how-well-do-you-know-me', search: '?quiz=ABCDEFGHIJKL&ownerToken=private&playerToken=private&utm_source=group', hash: '' },
    });
    const target = new URL(alternate.href, 'https://riddlearabia.com');
    assert.equal(target.searchParams.get('quiz'), party ? 'ABCDEFGHIJKL' : null);
    assert.equal(target.searchParams.has('ownerToken'), false);
    assert.equal(target.searchParams.has('playerToken'), false);
    assert.equal(target.searchParams.has('utm_source'), false);
    assert.deepEqual(links.filter(link => link.attrs['aria-current']).map(link => link.dataset.nav), party ? ['games'] : []);
  }
});

test('privacy describes the shared quiz data boundary and retention in both authored languages', async () => {
  for (const relative of ['privacy.html', 'ar/privacy/index.html']) {
    const html = await read(relative);
    assert.match(html, /Shared friendship quizzes/u);
    assert.match(html, /اختبارات الصداقة المشارَكة/u);
    assert.match(html, /guesses are graded when submitted and are not stored/u);
    assert.match(html, /تُصحَّح تخمينات الأصدقاء عند إرسالها ولا تُحفظ/u);
    assert.match(html, /Anyone with the quiz link/u);
    assert.match(html, /أي شخص يحمل رابط الاختبار/u);
    assert.match(html, /expires seven days after creation/u);
    assert.match(html, /سبعة أيام من إنشائه/u);
    assert.match(html, /deleted immediately when the creator closes/u);
    assert.match(html, /تُحذف فوراً عندما يغلق المنشئ/u);
    assert.match(html, /clearing this device removes that token but does not close the server quiz/u);
    assert.match(html, /لا تضيف اللعبة ملفات ارتباط أو مقدّمي خدمة جدد/u);
  }
});

test('optional analytics cannot receive quiz invitations or participant data and saved consent is untouched', async () => {
  const source = await read('privacy-consent.js');
  const start = source.indexOf('  function loadAnalytics() {');
  const end = source.indexOf('\n  }', start);
  assert.ok(start >= 0 && end > start);
  const actualLoader = source.slice(start, end + 4);
  for (const partyGame of ['knowMe', 'mostLikely', undefined]) {
    const calls = [], scripts = [];
    const preference = Object.freeze({ analytics: true, noticeVersion: '2026-08-01' });
    const context = vm.createContext({
      document: {
        body: { dataset: { partyGame } },
        getElementById: () => null,
        createElement: () => ({ dataset: {}, addEventListener() {} }),
        head: { appendChild: script => scripts.push(script) },
      },
      window: { gtag: (...args) => calls.push(args) },
      ANALYTICS_DISABLE_KEY: 'ga-disable-example', ANALYTICS_SCRIPT_ID: 'analytics', ANALYTICS_ID: 'example',
      analyticsLoaded: false, analyticsLibraryReady: false, analyticsExecutedThisPage: false,
      ensureGtag() {}, consentPayload: analytics => ({ analytics_storage: analytics ? 'granted' : 'denied' }), Date, encodeURIComponent,
      localStorage: { setItem() { assert.fail('page policy must not rewrite the saved consent choice'); }, getItem: () => preference },
    });
    vm.runInContext(`${actualLoader}\nloadAnalytics();`, context);
    assert.equal(preference.analytics, true);
    if (partyGame === 'knowMe') {
      assert.deepEqual(calls, []);
      assert.deepEqual(scripts, []);
      assert.equal(context.window['ga-disable-example'], true);
      assert.equal(context.analyticsLoaded, false);
      assert.equal(context.analyticsExecutedThisPage, false);
    } else {
      assert.equal(scripts.length, 1, 'other pages retain the consented loader');
      assert.ok(calls.some(args => args[0] === 'config'));
      assert.equal(context.window['ga-disable-example'], false);
    }
  }
});

test('the actual static validator rejects malformed party data and does not exempt similarly named structured banks', async t => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'riddlearabia-party-static-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const content = JSON.parse(await read('data/party-games.json'));
  const invalid = [
    data => { data.version = 2; },
    data => { data.mostLikely.questions[0].text.ar = ''; },
    data => { data.knowMe.questions[0].options.pop(); },
    data => { data.knowMe.questions[1].id = data.knowMe.questions[0].id; },
  ];
  for (const [index, mutate] of invalid.entries()) {
    const data = structuredClone(content); mutate(data);
    const preload = resolve(temporary, `invalid-${index}.mjs`);
    // Substitute only the public bank's filesystem read. The original
    // validator and every other source file execute without modification.
    await writeFile(preload, `import fs from 'node:fs';\nconst actual=fs.readFileSync;\nfs.readFileSync=(file,...args)=>String(file)===${JSON.stringify(resolve(root, 'data/party-games.json'))}?${JSON.stringify(JSON.stringify(data))}:actual(file,...args);\n`);
    const result = spawnSync(process.execPath, ['--import', preload, 'scripts/validate-static.mjs'], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
    assert.notEqual(result.status, 0, `malformed bank ${index} must fail the source gate`);
    assert.match(result.stderr, /data\/party-games\.json: invalid party game bank/u);
  }
  const preload = resolve(temporary, 'unrecognized-bank.mjs');
  const unknown = resolve(root, 'data/party-games-extra.json');
  await writeFile(preload, `import fs from 'node:fs';\nconst read=fs.readFileSync,list=fs.readdirSync;\nfs.readFileSync=(file,...args)=>String(file)===${JSON.stringify(unknown)}?${JSON.stringify(JSON.stringify(content))}:read(file,...args);\nfs.readdirSync=(dir,options)=>{const files=list(dir,options);return String(dir)===${JSON.stringify(resolve(root, 'data'))}&&!options?.withFileTypes?[...files,'party-games-extra.json']:files;};\n`);
  const result = spawnSync(process.execPath, ['--import', preload, 'scripts/validate-static.mjs'], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  assert.notEqual(result.status, 0, 'an unrecognized object bank must still fail as a malformed category');
  assert.match(result.stderr, /data\/party-games-extra\.json: category files must be plain card arrays/u);
});
