import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { startBrowserSite } from './local-browser-site.mjs';
import { runPartyGameRegressions } from './party-games-browser-cases.mjs';
import { FRIENDSHIP_COPY } from '../friendship-games-copy.js';
import { friendshipPath } from '../friendship-games-engine.js';
import { partyPath } from '../party-games-engine.js';

const engine = process.env.JAKH_BROWSER_ENGINE || 'chromium';
const engines = {chromium,firefox,webkit};
assert.ok(engines[engine],`Unsupported browser engine: ${engine}`);
const live = process.env.JAKH_QA_LIVE === '1';
const strict = process.env.JAKH_QA_STRICT === '1';
const onlyArcade = process.env.JAKH_QA_ONLY_ARCADE === '1';
const onlyParty = process.env.JAKH_QA_ONLY_PARTY === '1';
const filter = process.env.JAKH_QA_FILTER || '';
const runTag = (process.env.JAKH_QA_RUN_TAG || '').replace(/[^a-z0-9_-]/gi,'');
const out = resolve(process.env.JAKH_QA_OUTPUT || 'output/friendship-games-qa');
await mkdir(out, { recursive: true });
const artifactRoot = process.env.JAKH_SITE_ROOT;
const server = live ? null : await startBrowserSite({siteRoot:artifactRoot,manifestPath:process.env.JAKH_SITE_MANIFEST,loopbackHost:engine==='webkit'?'localhost':'127.0.0.1'});
const baseUrl = live ? 'https://riddlearabia.com' : server.baseUrl;
const browser = await engines[engine].launch({headless:true,...(engine==='chromium'&&existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
const report={engine,baseUrl,source:live?'live':artifactRoot?'built artifact':'source files',artifactRoot:artifactRoot||null,manifestPath:process.env.JAKH_SITE_MANIFEST||null,buildId:server?.artifactManifest?.buildId||null,strict,startedAt:new Date().toISOString(),suites:[],findings:[],screenshots:[]};
const nav=engine==='webkit'?'commit':'domcontentloaded';
const action=(page,name)=>page.locator(`#party-app [data-party-action="${name}"]`);
async function createContext(browser,options={}) {
  const compatible={...options};if(engine==='firefox')delete compatible.isMobile;
  const context=await browser.newContext({...compatible,serviceWorkers:'block'});
  context.setDefaultTimeout(12_000);context.setDefaultNavigationTimeout(45_000);
  if(!live)await context.route('**/api/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    const value=pathname==='/api/health'?{ok:true,schema:'10',targetSchema:'10',features:{registration:true,adminMfa:true}}:pathname==='/api/auth/session'?{authenticated:false}:pathname==='/api/content/questions'?{overrides:[]}:{error:'Not found',code:'NOT_FOUND'};
    await route.fulfill({status:['/api/health','/api/auth/session','/api/content/questions'].includes(pathname)?200:404,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(value)});
  });
  await context.addInitScript(()=>localStorage.setItem('jakh-consent-v1',JSON.stringify({version:2,noticeVersion:'2026-08-01',analytics:false,updatedAt:new Date(0).toISOString(),source:'friendship-qa'})));
  return context;
}
function trackPageErrors(page){const errors=[];page.on('pageerror',e=>errors.push(e.message));return()=>assert.deepEqual(errors,[],errors.join('\n'));}
async function runTest(name,callback){if(filter&&!name.includes(filter))return;const began=Date.now();try{await callback();report.suites.push({name,status:'passed',durationMs:Date.now()-began});console.log(`PASS ${name}`);}catch(e){report.suites.push({name,status:'failed',error:e.stack,durationMs:Date.now()-began});console.log(`FAIL ${name}: ${e.message}`);}}
async function shot(page,name){const filename=`${engine}-${live?'live':'local'}-${name}.png`;await page.screenshot({path:resolve(out,filename),fullPage:true});report.screenshots.push(filename);}
async function fits(page,label){const m=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('#party-app button,#party-app input,#party-app textarea,#party-app select')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent,x:r.x,width:r.width};})}));assert.ok(m.scrollWidth<=m.width,`${label}: overflow ${JSON.stringify(m)}`);for(const r of m.controls)assert.ok(r.x>=-.5&&r.x+r.width<=m.width+.5,`${label}: clipped ${JSON.stringify(r)}`);}
async function axe(page,label){const r=await new AxeBuilder({page}).include('#party-app').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],label);}
async function setup(page,lang,game){
  await page.goto(`${baseUrl}${friendshipPath(game,lang)}`,{waitUntil:nav});await action(page,'setup').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'),lang);
  if(lang==='ar')assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  await action(page,'setup').click();
  const names=page.locator('#friendship-setup textarea');
  await names.fill('');await page.locator('#friendship-setup button[type="submit"]').click();assert.equal(await page.locator('#friendship-setup').count(),1,'blank names blocked');
  await names.fill('Omar\nomar');await page.locator('#friendship-setup button[type="submit"]').click();assert.equal(await page.locator('#friendship-setup').count(),1,'duplicates blocked');
  assert.ok(await page.locator('#party-feedback').innerText(),'duplicate feedback visible');
  if(strict)assert.doesNotMatch(await page.locator('#party-feedback').innerText(),/undefined|null/u,'localized validation error is real copy');
  if(strict&&game==='impostor'){await names.fill('Omar\nLina');await page.locator('#friendship-setup button[type="submit"]').click();assert.equal(await page.locator('#friendship-setup').count(),1,'impostor requires3 players');assert.match(await page.locator('#party-feedback').innerText(),/3/u);}
  await names.fill(lang==='ar'?'عمر\nلينا\nمايا':'Omar\nLina\nMaya');await page.locator('#friendship-setup select').selectOption('5');
  await page.locator('#friendship-setup button[type="submit"]').click();assert.equal(await page.locator('#friendship-setup').count(),0);await fits(page,`${lang} ${game} started`);
  if(strict)assert.equal(await page.locator('#party-feedback').innerText(),'','successful start clears old setup feedback');
  else if(await page.locator('#party-feedback').innerText())report.findings.push({game,lang,issue:'Setup error remains visible after successful start',text:await page.locator('#party-feedback').innerText()});
}
async function coveredRole(page,game,lang,label){
  const role=page.locator('.friendship-secret');
  const reveals=['reveal-secret','show-secret','ready-secret'];
  for(const candidate of reveals)if(await action(page,candidate).count()){assert.equal(await role.count(),0,'role hidden until recipient ready');await action(page,candidate).click();if(strict)assert.equal(await page.locator('#party-app h2').evaluate(e=>document.activeElement===e),true,'phase change moves keyboard focus to new heading');return;}
  if(strict)assert.fail('role must have a private readiness screen');
  if(await role.count())report.findings.push({game,lang,issue:'Role/word shown before private readiness screen',stage:label,text:await page.locator('#party-app').innerText()});
}
async function verifySkip(page,lang,game){
  await setup(page,lang,game);
  if(game==='court'){
    await action(page,'start-vote').click();await action(page,'ready').click();await action(page,'vote').nth(1).click();assert.equal(await page.locator('.party-reveal').count(),0,'partial jury ballot stays hidden');
  }else if(game==='panic'){
    await action(page,'start-timer').click();
  }else{
    await action(page,'reveal-secret').click();
  }
  for(let round=0;round<5;round++){
    await action(page,'skip').click();
    if(round===0){assert.equal(await page.locator('.friendship-secret').count(),0,'skipping erases private role');assert.equal(await page.locator('.party-reveal').count(),0,'skipping erases private ballot');}
  }
  assert.deepEqual((await page.locator('.party-leaderboard strong').allInnerTexts()).map(Number),[0,0,0],'all skipped rounds award zero points');
}
async function verifyBackDuringTimer(page){
  await setup(page,'en','panic');await action(page,'start-timer').click();
  await page.goto(`${baseUrl}/play`,{waitUntil:nav});
  await new Promise(resolveWait=>setTimeout(resolveWait,5600));
  await page.goBack({waitUntil:nav});
  await page.waitForFunction(()=>document.querySelector('#party-app h2'));
  const reset=await action(page,'setup').count();
  if(!reset)await action(page,'panic-success').waitFor({timeout:1500});
  report.suites.push({name:'Panic browser Back after elapsed timer',status:'observed',outcome:reset?'fresh page resets local game':'restored local game expires to judging'});
}
async function playImpostor(page,lang,size){
  const names=lang==='ar'?['عمر','لينا','مايا']:['Omar','Lina','Maya'];
  const expectedScores=Object.fromEntries(names.map(name=>[name,0]));
  await coveredRole(page,'impostor',lang,'round1 initial');await shot(page,`${size}-${lang}-impostor-first-role`);
  let prior=null;const revealed=[];
  for(let round=0;round<5;round++){
    for(let person=0;person<3;person++){
      if(person||round)await coveredRole(page,'impostor',lang,`round${round+1} player${person+1}`);
      assert.equal(await page.locator('.friendship-secret').count(),1);
      await action(page,'next-secret').click();
    }
    assert.equal(await action(page,'start-vote').count(),1);await action(page,'start-vote').click();
    for(let voter=0;voter<3;voter++){
      assert.equal(await action(page,'vote').count(),0,'ballot hidden during handoff');assert.equal(await page.locator('.party-reveal').count(),0);
      await action(page,'ready').click();assert.equal(await action(page,'vote').count(),3);await action(page,'vote').nth(0).click();
    }
    const name=await page.locator('.party-reveal strong').innerText();revealed.push(name);prior=name;
    assert.ok(Object.hasOwn(expectedScores,name),'revealed impostor is a participant');
    // Every ballot selected player0. They are caught if all votes name them;
    // any other impostor escapes and earns the published two-point reward.
    if(name!==names[0])expectedScores[name]+=2;
    await fits(page,`${lang} impostor reveal`);if(round===0)await shot(page,`${size}-${lang}-impostor-reveal`);
    await action(page,'next-round').click();
  }
  assert.equal(await page.locator('.party-leaderboard li').count(),3);
  const actualScores=await page.locator('.party-leaderboard li').evaluateAll(rows=>Object.fromEntries(rows.map(row=>[row.querySelector('bdi').textContent,Number(row.querySelector('strong').textContent)])));
  assert.deepEqual(actualScores,expectedScores,'scoreboard matches the independently tallied public roles and ballots');
  await axe(page,'impostor scoreboard');
  report.suites.push({name:`impostor revealed roles ${size}/${lang}`,status:'observed',roles:revealed});
  await shot(page,`${size}-${lang}-impostor-scoreboard`);await action(page,'setup').click();assert.equal(await page.locator('#friendship-setup').count(),1);
}
async function playCourt(page,lang,size){
  const names=lang==='ar'?['عمر','لينا','مايا']:['Omar','Lina','Maya'];
  for(let round=0;round<5;round++){
    await action(page,'start-vote').click();
    for(let voter=0;voter<2;voter++){
      const heading=await page.locator('#party-app h2').innerText();
      if(strict)assert.equal(heading.includes(names[round%3]),false,'phone handoff cannot target accused');
      else if(heading.includes(names[round%3]))report.findings.push({game:'court',lang,issue:'Handoff targets accused, then readiness silently opens juror ballot',round:round+1,heading});
      assert.equal(await action(page,'vote').count(),0);assert.equal(await page.locator('.party-reveal').count(),0);
      if(round===0&&voter===0)await shot(page,`${size}-${lang}-court-first-handoff`);
      await action(page,'ready').click();assert.equal(await action(page,'vote').count(),2);
      await action(page,'vote').nth(1).click();
    }
    assert.equal(await page.locator('.party-reveal').count(),1);await fits(page,'court reveal');await action(page,'next-round').click();
  }
  assert.deepEqual((await page.locator('.party-leaderboard strong').allInnerTexts()).map(Number),[2,2,1]);await axe(page,'court scoreboard');await shot(page,`${size}-${lang}-court-scoreboard`);
  await action(page,'games').click();assert.equal(new URL(page.url()).pathname,lang==='ar'?'/ar/play/':'/play');
}
async function playPanic(page,lang,size){
  for(let round=0;round<5;round++){
    const before=await page.locator('#party-app').innerText();
    const started=Date.now();await action(page,'start-timer').click();assert.equal(await action(page,'panic-success').count(),0,'cannot judge before countdown');
    if(strict){const prompt=await page.locator('#party-app h2 + p').innerText();assert.equal(before.includes(prompt),false,'challenge hidden until countdown starts');}
    if(strict&&round===0&&size==='mobile'){
      await page.evaluate(()=>{const deadline=Date.now()+5500;while(Date.now()<deadline){/* Simulate a suspended mobile JS thread. */}});
      await action(page,'panic-success').waitFor({timeout:1000});
    }
    await action(page,'panic-success').waitFor();const elapsed=Date.now()-started;assert.ok(elapsed>=4500&&elapsed<10000,`5-second timer elapsed ${elapsed}`);
    await fits(page,'panic judging');if(round===0)await shot(page,`${size}-${lang}-panic-judge`);
    await action(page,round===1?'panic-fail':'panic-success').click();await action(page,'next-round').click();
  }
  assert.deepEqual((await page.locator('.party-leaderboard strong').allInnerTexts()).map(Number),[2,1,1]);await axe(page,'panic scoreboard');await shot(page,`${size}-${lang}-panic-scoreboard`);
  await page.reload({waitUntil:nav});await action(page,'setup').waitFor();assert.equal(await page.locator('.party-leaderboard').count(),0,'local game intentionally resets on reload');
}
try {
  if(live&&!onlyArcade)for(const size of ['mobile','desktop'])for(const lang of ['en','ar'])for(const game of ['mostLikely','knowMe'])await runTest(`live ${size} ${lang} ${game}: local game or unshared quiz draft`,async()=>{
    const context=await createContext(browser,{viewport:size==='mobile'?{width:390,height:844}:{width:1440,height:1000},...(size==='mobile'?{isMobile:true,hasTouch:true}:{})});const page=await context.newPage(),noErrors=trackPageErrors(page),writes=[];
    page.on('request',r=>{if(/\/api\/know-me\/(?:create|[^/]+\/(?:submit|close))$/u.test(new URL(r.url()).pathname))writes.push(r.url());});
    try{
      await page.goto(`${baseUrl}${partyPath(game,lang)}`,{waitUntil:nav});await action(page,'start').waitFor();await action(page,'start').click();await fits(page,'live party setup');
      if(game==='mostLikely'){
        await page.locator('#party-setup textarea').fill(lang==='ar'?'عمر\nلينا\nمايا':'Omar\nLina\nMaya');await page.locator('#party-setup button[type="submit"]').click();
        for(let round=0;round<10;round++){await action(page,'begin-votes').click();await page.locator('[data-party-pick="0"]').check();await action(page,'reveal-point').click();await fits(page,'live most reveal');await action(page,'next-round').click();}
        assert.equal(await page.locator('.party-leaderboard li').count(),3);
      }else{
        await page.locator('#party-setup input').fill(lang==='ar'?'عمر':'Omar');await page.locator('#party-setup button[type="submit"]').click();
        for(let question=0;question<10;question++){assert.equal(await action(page,'next-own').isDisabled(),true);await action(page,'answer-own').nth(question%4).click();await fits(page,'live KnowMe choice');await action(page,'next-own').click();}
        await action(page,'publish').waitFor();assert.equal(await page.locator('.party-review li').count(),10);
      }
      await axe(page,'live party final');await shot(page,`${size}-${lang}-${game}-live-local-result`);assert.deepEqual(writes,[],'live QA never publishes, submits or deletes a shared quiz');noErrors();
    }finally{await context.close();}
  });
  if(!live&&!onlyArcade)await runPartyGameRegressions({browser,createContext,runTest,trackPageErrors,baseUrl,artifactManifest:server.artifactManifest,navigationReadyEvent:nav});
  if(!live&&!onlyArcade)await runPartyGameRegressions({browser,createContext:(browser,options)=>createContext(browser,{...options,viewport:{width:1440,height:1000},isMobile:false,hasTouch:false}),runTest:(name,callback)=>/private phone ballots|point-together mode|Know Me creates/u.test(name)?runTest(`desktop: ${name}`,callback):Promise.resolve(),trackPageErrors,baseUrl,artifactManifest:server.artifactManifest,navigationReadyEvent:nav});
  if(!onlyParty)for(const size of ['mobile','desktop'])for(const lang of ['en','ar'])for(const game of ['impostor','court','panic'])await runTest(`${size} ${lang} ${game}: validation, full 5-round game, privacy, score, restart`,async()=>{
    const context=await createContext(browser,{viewport:size==='mobile'?{width:390,height:844}:{width:1440,height:1000},...(size==='mobile'?{isMobile:true,hasTouch:true}:{})});const page=await context.newPage(),noErrors=trackPageErrors(page);
    try{await setup(page,lang,game);await ({impostor:playImpostor,court:playCourt,panic:playPanic}[game])(page,lang,size);if(strict){await verifySkip(page,lang,game);if(game==='panic'&&lang==='en'&&size==='mobile')await verifyBackDuringTimer(page);}noErrors();}finally{await context.close();}
  });
} finally {
  report.finishedAt=new Date().toISOString();await writeFile(resolve(out,`${engine}-${live?'live':'local'}-gameplay${runTag?`-${runTag}`:''}.json`),JSON.stringify(report,null,2)+'\n');await browser.close();await server?.close();
}
console.log(JSON.stringify({suites:report.suites.length,failures:report.suites.filter(s=>s.status==='failed').length,findings:report.findings.length}));
if(report.suites.some(s=>s.status==='failed'))process.exitCode=1;
