import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadKidsContent, kidsRoutePairs, kidsPath, KIDS_ACTIVITY_FILES } from './generate-kids-pages.mjs';
import { isDeployableFile } from './build-static-site.mjs';
import { kidsImageContractFailures } from './kids-image-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const content = loadKidsContent();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const routeFile = route => route === '/kids-riddles' ? 'kids-riddles.html' : `${route.slice(1)}index.html`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('dedicated bilingual kids hubs require their matching responsive hero, module runtime and complete activity finder', () => {
  for (const relative of ['kids-riddles.html', 'ar/topics/kids-riddles/index.html']) {
    const html = read(relative);
    const check = value => kidsImageContractFailures(value, relative, 'topic-kids-riddles');
    assert.deepEqual(check(html), [], relative);
    const mutations = [
      html.replace('class="kids-hero-art"', 'class="retired-hero"'),
      html.replace('/assets/illustrations/topic-kids-riddles-480.webp', '/assets/illustrations/classic-riddles-480.webp'),
      html.replace('/assets/illustrations/topic-kids-riddles-960.webp 960w', '/assets/illustrations/classic-riddles-960.webp 960w'),
      html.replace(/sizes="[^"]+"(?= width="960" height="640" alt="" loading="eager")/u, ''),
      html.replace('data-kids-page="hub"', 'data-page="category"'),
      html.replace('type="module" src="/kids-learning.js"', 'src="/app.js?v=legacy"'),
      html.replace('data-kids-filters', 'data-retired-filters'),
      html.replace('name="age"', 'name="retiredAge"'),
      html.replace('name="noPrinter"', 'name="retiredPrinter"'),
      html.replaceAll('data-activity-card', 'data-retired-card'),
    ];
    for (const mutated of mutations) {
      assert.notEqual(mutated, html, 'fixture mutation must change the real authored markup');
      assert.ok(check(mutated).length > 0, `${relative}: malformed kids markup must fail validation`);
    }
  }
});

test('the complete bilingual launch inventory has balanced and usable activity content', () => {
  assert.equal(content.activities.length,480);
  assert.equal(content.packs.length,24);
  assert.equal(content.plans.length,16);
  assert.equal(content.guides.length,8);
  for (const area of content.areas) assert.equal(content.activities.filter(a=>a.area===area.id).length,80);
  for (const age of content.ages) for (const area of content.areas) assert.equal(content.activities.filter(a=>a.age===age.id&&a.area===area.id).length,20);
  const ids = new Set(content.activities.map(a=>a.id));
  for (const age of content.ages) for (const area of content.areas) for(let n=1;n<=20;n++) {
    assert.ok(ids.has(`kids-${age.id}-${area.id}-${String(n).padStart(2,'0')}`));
  }
  const titles = {en:new Set(),ar:new Set()};
  for (const a of content.activities) {
    assert.match(a.id,/^kids-(?:3-4|5-6|7-8|9-12)-(?:language|maths|logic|science|creativity|life)-(?:0[1-9]|1[0-9]|20)$/);
    assert.ok([5,10,15,20,30].includes(a.minutes),a.id);
    assert.ok(['none','paper','household','craft'].includes(a.materialGroup),a.id);
    assert.ok(['story','puzzle','game','making','experiment','movement'].includes(a.format),a.id);
    assert.ok(['adult','early','independent'].includes(a.reading),a.id);
    assert.ok(['together','nearby','independent'].includes(a.adult),a.id);
    assert.equal(a.screenFree,true,a.id);
    for (const lang of ['en','ar']) {
      for (const field of ['title','summary','objective','alternatives','preparation','prompt','answer','explanation','easier','harder','extension','supervision']) {
        const minimumLength = field === 'answer' ? 1 : 6;
        assert.ok(typeof a[field]?.[lang]==='string'&&a[field][lang].trim().length>=minimumLength,`${a.id}/${field}/${lang}`);
        assert.doesNotMatch(a[field][lang],/\b(?:TODO|TBD|Lorem ipsum)\b/u);
        if(lang==='ar') assert.match(a[field][lang],/[\u0600-\u06ff]/u,`${a.id}/${field} needs Arabic`);
      }
      for (const field of ['steps','materials','hints']) {
        assert.ok(Array.isArray(a[field]?.[lang])&&a[field][lang].length>0,`${a.id}/${field}/${lang}`);
        for(const item of a[field][lang]) assert.ok(typeof item==='string'&&item.trim().length>1);
      }
      assert.ok(a.steps[lang].length>=3,`${a.id} must have actionable steps`);
      assert.equal(titles[lang].has(a.title[lang]),false,`${a.id} duplicate title`);
      titles[lang].add(a.title[lang]);
    }
  }
});

test('the expansion adds distinct questions while preserving the original activities', () => {
  const originals = {
    'data/kids/activities-young.json':'31a9c80524368126e09e58ebd7447d33494d1beb7ecff53e3d02240371a341a4',
    'data/kids/activities-older.json':'d67cc19704d674e34bcb35601938daada75871e405e2bb67e84d9db2b22d80cd',
  };
  for(const [file,digest] of Object.entries(originals)) assert.equal(hash(fs.readFileSync(path.join(root,file))),digest);
  const additions=content.activities.filter(a=>Number(a.id.split('-').at(-1))>5);
  assert.equal(additions.length,360);
  for(const lang of ['en','ar']) {
    const prompts=additions.map(a=>a.prompt[lang].normalize('NFKC').replace(/\s+/gu,' ').trim());
    assert.equal(new Set(prompts).size,360,`${lang}: every new activity needs its own question`);
  }
});

test('packs and weekly plans reference distinct real activities of the intended age', () => {
  const byId=new Map(content.activities.map(a=>[a.id,a]));
  for(const resource of [...content.packs,...content.plans]) {
    const expected = resource.area ? 20 : 5;
    assert.equal(resource.activityIds.length,expected,resource.id);
    assert.equal(new Set(resource.activityIds).size,expected,resource.id);
    for(const id of resource.activityIds) {
      const a=byId.get(id);assert.ok(a,`${resource.id}: ${id}`);assert.equal(a.age,resource.age);
      if(resource.area)assert.equal(a.area,resource.area);
    }
  }
  for(const plan of content.plans)assert.ok(new Set(plan.activityIds.map(id=>byId.get(id).area)).size>=5);
});

test('learning pages are crawlable bilingual HTML with a dedicated runtime and safe next steps', () => {
  for(const routes of kidsRoutePairs(content)) for(const lang of ['en','ar']) {
    const html=read(routeFile(routes[lang]));
    assert.ok(html.includes(`<html lang="${lang}" dir="${lang==='ar'?'rtl':'ltr'}">`));
    assert.ok(html.includes(`rel="canonical" href="https://riddlearabia.com${routes[lang]}"`));
    assert.ok(html.includes(`hreflang="${lang==='ar'?'en':'ar'}" href="https://riddlearabia.com${routes[lang==='ar'?'en':'ar']}"`));
    assert.match(html,/src="\/kids-learning\.js"/);
    assert.doesNotMatch(html,/src="\/app\.js|true-crime|battle-mode|data-nav="library" aria-current/);
    assert.match(html,/data-nav="kids" aria-current="page"/);
    assert.equal((html.match(/<h1\b/g)||[]).length,1,routes[lang]);
    assert.ok(html.includes('content="index,follow,max-image-preview:large"'));
  }
  for(const a of content.activities) for(const lang of ['en','ar']) {
    const html=read(routeFile(kidsPath(lang,`activities/${a.id}`)));
    assert.ok(html.includes(a.id));
    assert.match(html,/class="kids-steps"/);
    assert.match(html,/data-kids-complete=/);
    assert.match(html,/<option value="mon">/);
    assert.match(html,/kids-answer/);
  }
  assert.match(read('kids-riddles/toolkit/index.html'),/content="noindex,follow/);
  const arabicMath = read(routeFile(kidsPath('ar','activities/kids-5-6-maths-06')));
  assert.ok(arabicMath.includes('\u2066\u202d7 − 4 = 3\u202c\u2069'), 'Arabic explanations keep arithmetic in an isolated LTR span');
  const arabicFraction = read(routeFile(kidsPath('ar','activities/kids-9-12-maths-19')));
  assert.ok(arabicFraction.includes('اضرب بسط \u2066\u202d3/4\u202c\u2069 ومقامه'), 'Arabic hint lists keep fractions in logical reading order');
  const arabicDigits = read(routeFile(kidsPath('ar','activities/kids-9-12-logic-03')));
  assert.ok(arabicDigits.includes('\u2066\u202d٢+١+١+٣=٧\u202c\u2069'), 'Arabic-Indic arithmetic keeps its intended order too');
  const arabicTimes = read(routeFile(kidsPath('ar','activities/kids-9-12-life-01')));
  assert.ok(arabicTimes.includes('\u2066\u202d٤:٠٠–٤:٠٥\u202c\u2069'), 'Complete time operands stay together in Arabic ranges');
});

test('all original shared riddle IDs and answers survive with reviewed explanations', () => {
  const source=JSON.parse(read('data/kids-riddles.json'));
  assert.deepEqual(content.legacy.map(c=>c.id),source.map(c=>c.id));
  for(let i=0;i<source.length;i++) {
    assert.deepEqual(content.legacy[i].question,source[i].question);
    assert.deepEqual(content.legacy[i].answer,source[i].answer);
    for(const lang of ['en','ar'])assert.ok(content.legacy[i].explanation[lang].length>35);
  }
});

test('every printable is published, current with its activity source, and byte-verified', () => {
  const manifest=JSON.parse(read('data/kids/print-manifest.json'));
  assert.equal(manifest.files.length,96);
  for(const [file,digest] of Object.entries(manifest.inputs)) assert.equal(hash(fs.readFileSync(path.join(root,file))),digest,`${file}: regenerate printable packs`);
  assert.equal(hash(fs.readFileSync(path.join(root,'scripts/generate-kids-pdfs.py'))),manifest.generatorSha256);
  for(const item of manifest.files) {
    assert.equal(isDeployableFile(item.path),true,item.path);
    const bytes=fs.readFileSync(path.join(root,item.path));
    assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
    assert.equal(hash(bytes),item.sha256,item.path);
    assert.ok(item.pages>=40&&item.pages<=60,item.path);
    assert.ok(item.bytes>5000);
  }
});

// Reviewed source must stay tied to the content used by the release.
test('kids publication requires a completed review of the exact content source', () => {
  const review=JSON.parse(read('docs/content-review/kids-release-review.json'));
  assert.equal(review.status,'reviewed');
  assert.equal(review.coverage.activities,content.activities.length);
  assert.equal(review.coverage.printablePacks,content.packs.length);
  assert.equal(review.coverage.weeklyPlans,content.plans.length);
  assert.equal(review.coverage.parentGuides,content.guides.length);
  assert.equal(review.coverage.preservedRiddles,content.legacy.length);
  for(const file of ['data/kids/inventory.json',...KIDS_ACTIVITY_FILES,'scripts/kids-resources.mjs','scripts/kids-legacy.mjs']) {
    assert.equal(hash(fs.readFileSync(path.join(root,file))),review.sourceSha256[file],`${file}: complete content review before publication`);
  }
  for(const file of review.notes) assert.ok(read(file).length>100);
});
