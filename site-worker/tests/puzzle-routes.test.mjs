import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSiteHandler, applySiteHeaders } from '../src/site-edge.js';
import { PUZZLE_ROUTES } from '../../puzzle-routes.js';

const origin='https://riddlearabia.com';
const manifest=JSON.parse(await readFile(new URL('../generated/site-manifest.json',import.meta.url),'utf8'));
const mtaStsPolicy=await readFile(new URL('../assets/mta-sts.txt',import.meta.url),'utf8');
const handler=createSiteHandler({siteManifest:manifest,mtaStsPolicy});
const env={ASSETS:{async fetch(request){
  const path=new URL(request.url).pathname;
  assert.ok(manifest.files[path],`Only declared assets can be fetched: ${path}`);
  return new Response(path,{headers:{'content-type':'text/html; charset=utf-8'}});
}}};

test('legacy puzzle links redirect once to the exact bilingual game, retaining playable share and notification state',async()=>{
  for(const route of PUZZLE_ROUTES)for(const lang of ['en','ar']){
    const base=lang==='ar'?'/ar/play/index.html':'/play.html';
    const query=`game=${route.id}&date=2026-09-30&edition=2&difficulty=hard&duelRoom=ABCD2345`;
    const response=await handler.fetch(new Request(`http://www.riddlearabia.com${base}?${query}`),env);
    assert.equal(response.status,301);
    const target=new URL(response.headers.get('location'));
    assert.equal(target.origin,origin);assert.equal(target.pathname,route.paths[lang]);
    assert.equal(target.searchParams.has('game'),false);
    assert.equal(target.searchParams.get('date'),'2026-09-30');
    assert.equal(target.searchParams.get('duelRoom'),'ABCD2345');
    const final=await handler.fetch(new Request(target),env);
    assert.equal(final.status,200);assert.equal(final.headers.get('location'),null);
  }
});
test('clean game pages remain indexable while query game states are noindex and never overwrite clean caches',async()=>{
  for(const route of PUZZLE_ROUTES)for(const lang of ['en','ar']){
    for(const method of ['GET','HEAD']){
      const clean=await handler.fetch(new Request(origin+route.paths[lang],{method}),env);
      assert.equal(clean.status,200);assert.equal(clean.headers.get('x-robots-tag'),null);
      assert.match(clean.headers.get('cache-control'),/must-revalidate/);
      for(const query of ['date=2026-09-30','edition=2','variant=mini','difficulty=hard','duelRoom=ABCD2345','game=word']){
        const response=await handler.fetch(new Request(`${origin}${route.paths[lang]}?${query}`,{method}),env);
        assert.equal(response.status,200);assert.equal(response.headers.get('x-robots-tag'),'noindex, follow');
        assert.equal(response.headers.get('cache-control'),'no-store');
        if(method==='HEAD')assert.equal(await response.text(),'');
        const conditional=await handler.fetch(new Request(`${origin}${route.paths[lang]}?${query}`,{method,headers:{'if-none-match':clean.headers.get('etag')}}),env);
        assert.equal(conditional.status,304);assert.equal(conditional.headers.get('x-robots-tag'),'noindex, follow');
        assert.equal(conditional.headers.get('cache-control'),'no-store');
      }
    }
    const tracking=await handler.fetch(new Request(origin+route.paths[lang]+'?utm_source=friend'),env);
    assert.equal(tracking.headers.get('x-robots-tag'),null);
  }
});
test('unknown game selection does not invent a destination and unrelated routes retain their indexing policy',async()=>{
  const unknown=await handler.fetch(new Request(origin+'/play?game=not-a-game'),env);
  assert.equal(unknown.status,200);assert.equal(unknown.headers.get('location'),null);
  assert.equal(unknown.headers.get('x-robots-tag'),'noindex, follow');
  const absent=await handler.fetch(new Request(origin+'/not-a-game?date=2026-09-30'),env);
  assert.equal(absent.status,404);
  const ordinary=await handler.fetch(new Request(origin+'/about?date=2026-09-30'),env);
  assert.equal(ordinary.headers.get('x-robots-tag'),null);
});
test('a declared Google verification file is readable but excluded from indexing',()=>{
  const path='/google0123456789abcdef.html';
  const response=applySiteHeaders(new Response('google-site-verification: google0123456789abcdef.html'),{siteManifest:manifest,pathname:path,record:{sha256:'a'.repeat(64)}});
  assert.equal(response.status,200);assert.equal(response.headers.get('x-robots-tag'),'noindex');
  const ordinary=applySiteHeaders(new Response('page'),{siteManifest:manifest,pathname:'/google-not-a-proof.html',record:{sha256:'b'.repeat(64)}});
  assert.equal(ordinary.headers.get('x-robots-tag'),null);
});
