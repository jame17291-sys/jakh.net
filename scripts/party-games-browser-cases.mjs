import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { PARTY_COPY } from '../party-games-copy.js';
import { partyPath, validQuizCode, validQuizToken } from '../party-games-engine.js';

const content = JSON.parse(await readFile(new URL('../data/party-games.json', import.meta.url), 'utf8'));
const canonical = new Map(content.knowMe.questions.map(q => [q.id, q]));
const CODE = 'ABCDEFGHJKMN';
const action = (page, name) => page.locator(`#party-app [data-party-action="${name}"]`);
const feedback = page => page.locator('#party-feedback');
const phone = { viewport: {width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block' };
const partyDataPath = pathname => /^\/data\/party-games(?:\.[a-f0-9]{16})?\.json$/u.test(pathname);

// Stateful HTTP contract fixture, not a substitute for the Worker tests. It
// preserves owner/guest roles, canonical public questions, server-only answers,
// first-score finality and idempotent lost-response retries across contexts.
function quizService({ createFailure = false, submitFailure = false } = {}) {
  const state = { creates:[], submits:[], states:[], closeRequests:[], publicResponses:[], rooms:new Map(), room:null, createFailure, submitFailure };
  function snapshot(token, room=state.room) {
    const sorted=[...room.players.values()].sort((a,b)=>b.score-a.score||a.order-b.order);
    const leaderboard=sorted.map((p,i)=>({name:p.name,score:p.score,rank:sorted.findIndex(other=>other.score===p.score)+1}));
    const own=room.players.get(token);
    const value={code:room.code,ownerName:room.name,expiresAt:room.expiresAt,role:token===room.token?'owner':own?'player':'guest',result:own?{score:own.score,total:10,rank:leaderboard.find(p=>p.name===own.name&&p.score===own.score).rank}:null,
      questions:room.questions.map(selected=>{const q=canonical.get(selected.id);return {id:q.id,question:q.text,options:{en:q.options.map(o=>o.en),ar:q.options.map(o=>o.ar)}};}),leaderboard};
    state.publicResponses.push(structuredClone(value)); return value;
  }
  state.seed = (name='Omar') => {
    state.room={code:CODE,name,token:'A'.repeat(43),expiresAt:Date.now()+7*86400000,questions:content.knowMe.questions.slice(0,10).map((q,i)=>({id:q.id,answerIndex:i%4})),players:new Map(),closed:false};state.rooms.set(CODE,state.room);
  };
  state.install = async context => {
    await context.route('**/api/know-me/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      const headers={'Access-Control-Allow-Origin':request.headers().origin||'*','Access-Control-Allow-Headers':'Accept, Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Private-Network':'true',Vary:'Origin'};
      const send=(body,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
      if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
      assert.equal(request.method(),'POST');
      assert.equal(request.headers().referer,undefined,'quiz requests do not disclose a referring private link');
      const body=JSON.parse(request.postData()||'{}');
      assert.ok(validQuizToken(body.token),'access token is sent in the body, never the URL');
      assert.equal(url.search,'');
      if(url.pathname==='/api/know-me/create') {
        state.creates.push(structuredClone(body));
        assert.equal(body.questions.length,10); assert.equal(new Set(body.questions.map(q=>q.id)).size,10);
        assert.ok(body.questions.every(q=>canonical.has(q.id)&&Number.isInteger(q.answerIndex)&&q.answerIndex>=0&&q.answerIndex<4));
        const existing=[...state.rooms.values()].find(room=>room.token===body.token);
        if(existing)state.room=existing;
        else {
          const code=state.rooms.size===0?CODE:`BCDEFGHJKMN${'PQRSTUVWXYZ23456789'[state.rooms.size-1]}`;
          state.room={code,name:body.name,token:body.token,expiresAt:Date.now()+7*86400000,questions:structuredClone(body.questions),players:new Map(),closed:false};state.rooms.set(code,state.room);
        }
        if(state.createFailure){state.createFailure=false;await send({code:'KNOW_ME_UNAVAILABLE'},503);return;}
        await send(snapshot(body.token),existing?200:201); return;
      }
      const match=/^\/api\/know-me\/([A-HJ-NP-Z2-9]{12})\/(state|submit|close)$/u.exec(url.pathname);
      assert.ok(match,`unexpected quiz endpoint ${url.pathname}`);
      const room=state.rooms.get(match[1]);
      if(!room||room.closed){await send({code:'QUIZ_NOT_FOUND'},404);return;}
      if(match[2]==='state'){state.states.push(structuredClone(body));if(state.stateGate)await state.stateGate;await send(snapshot(body.token,room));return;}
      if(match[2]==='close'){state.closeRequests.push(structuredClone(body));assert.equal(body.token,room.token);room.closed=true;await send({closed:true});return;}
      state.submits.push(structuredClone(body));
      assert.notEqual(body.token,room.token,'creator cannot take their own quiz');
      assert.equal(body.answers.length,10);assert.ok(body.answers.every(a=>Number.isInteger(a)&&a>=0&&a<4));
      if(!room.players.has(body.token))room.players.set(body.token,{name:body.name,score:body.answers.reduce((n,a,i)=>n+Number(a===room.questions[i].answerIndex),0),order:room.players.size});
      if(state.submitFailure){state.submitFailure=false;await send({code:'KNOW_ME_UNAVAILABLE'},503);return;}
      await send(snapshot(body.token,room));
    });
  };
  return state;
}

async function prepare(context, { deniedStorage=false, clipboardFailure=false }={}) {
  await context.addInitScript(({denied,copyFails})=>{
    if(denied)for(const method of ['getItem','setItem','removeItem'])Object.defineProperty(Storage.prototype,method,{configurable:true,value(){throw new DOMException('Test storage denied','SecurityError');}});
    else localStorage.setItem('jakh-consent-v1',JSON.stringify({version:2,noticeVersion:'2026-08-01',analytics:false,updatedAt:new Date(0).toISOString(),source:'party-browser-regression'}));
    window.__partyShared=[];window.__partyCopied=[];window.__partyPopstates=0;window.addEventListener('popstate',()=>{window.__partyPopstates++;});
    Object.defineProperty(navigator,'share',{configurable:true,value:async value=>{window.__partyShared.push(value);}});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{if(copyFails)throw Error('Test clipboard denied');window.__partyCopied.push(value);}}});
  },{denied:deniedStorage,copyFails:clipboardFailure});
}

async function ready(page) {
  await page.waitForFunction(()=>document.querySelector('#party-app h2')&&document.getElementById('party-app').getAttribute('aria-busy')==='false');
}
async function assertFits(page,label) {
  const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,controls:[...document.querySelectorAll('#party-app button,#party-app input,#party-app select,#party-app textarea')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {text:e.textContent||e.getAttribute('name'),x:r.x,width:r.width};})}));
  assert.ok(metrics.scrollWidth<=metrics.width,`${label}: horizontal overflow ${JSON.stringify(metrics)}`);
  for(const control of metrics.controls)assert.ok(control.x>=-0.5&&control.x+control.width<=metrics.width+0.5,`${label}: clipped control ${JSON.stringify(control)}`);
}
async function axe(page,label) {
  const result=await new AxeBuilder({page}).include('#party-app').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  assert.deepEqual(result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),[],`${label}: accessibility violations`);
}
async function mostSetup(page,{lang='en',mode='point',names,keyboard=false}={}) {
  await action(page,'start').click();
  await page.locator('#party-setup textarea[name="names"]').fill(names||(lang==='ar'?'عمر\nلينا':'Omar\nLina'));
  await page.locator(`#party-setup input[name="mode"][value="${mode}"]`).check();
  const submit=page.locator('#party-setup button[type="submit"]');
  if(keyboard){await submit.focus();await page.keyboard.press('Enter');}else await submit.click();
  await action(page,'begin-votes').waitFor();
}
async function ownerSetup(page,name) {
  await action(page,'start').click();await page.locator('#party-setup input[name="name"]').fill(name);
  await page.locator('#party-setup button[type="submit"]').click();await action(page,'answer-own').first().waitFor();
}
async function ownerAnswers(page,{swap=false,edit=false}={}) {
  if(swap){const before=await page.locator('#party-app h2').innerText();await action(page,'answer-own').nth(1).click();await action(page,'swap').click();assert.notEqual(await page.locator('#party-app h2').innerText(),before);assert.equal(await action(page,'next-own').isDisabled(),true,'a replacement needs its own answer');assert.equal(await page.locator('#party-app [aria-pressed="true"]').count(),0);}
  for(let i=0;i<10;i++) {
    assert.equal(await action(page,'next-own').isDisabled(),true,`question ${i+1} cannot continue unanswered`);
    await action(page,'answer-own').nth(i%4).click();assert.equal(await action(page,'answer-own').nth(i%4).getAttribute('aria-pressed'),'true');
    if(i===0){await action(page,'next-own').click();await action(page,'previous-own').click();assert.equal(await action(page,'answer-own').first().getAttribute('aria-pressed'),'true','back navigation preserves the choice');}
    await action(page,'next-own').click();
  }
  await action(page,'publish').waitFor();assert.equal(await page.locator('.party-review li').count(),10);
  if(edit){await action(page,'edit-own').nth(9).click();assert.equal(await action(page,'answer-own').nth(1).getAttribute('aria-pressed'),'true');await action(page,'answer-own').nth(3).click();await action(page,'next-own').click();assert.match(await page.locator('.party-review li').last().innerText(),/./u);}
}
async function guestAnswers(page,answers) {
  for(let i=0;i<10;i++) {
    const next=action(page,i===9?'submit':'next-guess');assert.equal(await next.isDisabled(),true);
    await action(page,'answer-guess').nth(answers[i]).click();
    if(i<9)await next.click();
  }
}
function assertNoAnswersDisclosed(service) {
  for(const response of service.publicResponses) {
    assert.ok(response.questions.every(q=>!('answerIndex'in q)&&!('answer'in q)&&!('correctIndex'in q)));
    for(const room of service.rooms.values())assert.equal(JSON.stringify(response).includes(room.token),false,'public responses never carry a private owner token');
  }
}
async function skipLinkAndBack(page) {
  const original=page.url(),popstates=await page.evaluate(()=>window.__partyPopstates);
  await page.locator('.skip-link').focus();await page.keyboard.press('Enter');assert.equal(new URL(page.url()).hash,'#party-main');
  await page.goBack();await page.waitForFunction(before=>window.__partyPopstates>before,popstates);assert.equal(page.url(),original);
}
async function assertNoExtraStateRequest(page,operation) {
  const requests=[],isState=request=>/\/api\/know-me\/[A-HJ-NP-Z2-9]{12}\/state$/u.test(new URL(request.url()).pathname)&&request.method()==='POST';
  const capture=request=>{if(isState(request))requests.push(request.url());};page.on('request',capture);
  try {
    await operation();
    // Observe the actual negative HTTP outcome after the popstate handler, not
    // a source-code check; any overlapping request is retained by capture.
    await page.waitForEvent('request',{predicate:isState,timeout:250}).catch(error=>{if(error.name!=='TimeoutError')throw error;});
    assert.deepEqual(requests,[],'same-document navigation never opens a second state request');
  }finally{page.off('request',capture);}
}

export async function runPartyGameRegressions({browser,createContext,runTest,trackPageErrors,baseUrl,artifactManifest,navigationReadyEvent}) {
  const open=async(game,lang,{service,contextOptions=phone,...prepareOptions}={})=>{
    const context=await createContext(browser,contextOptions);await prepare(context,prepareOptions);if(service)await service.install(context);
    const page=await context.newPage(),noErrors=trackPageErrors(page);
    await page.goto(`${baseUrl}${partyPath(game,lang)}`,{waitUntil:navigationReadyEvent});await ready(page);return {context,page,noErrors};
  };

  await runTest('party games private phone ballots use handoffs, hide interim votes, reveal ties and finish ten rounds in EN/AR',async()=>{
    for(const lang of ['en','ar']) {
      const {context,page,noErrors}=await open('mostLikely',lang);const t=PARTY_COPY[lang],names=lang==='ar'?['عمر','لينا']:['Omar','Lina'];
      try {
        await action(page,'start').click();await axe(page,`${lang}: private setup`);await action(page,'home').click();
        await mostSetup(page,{lang,mode:'vote'});const question=await page.locator('#party-app h2').innerText();await axe(page,`${lang}: private question`);
        await action(page,'begin-votes').click();assert.match(await page.locator('#party-app h2').innerText(),new RegExp(names[0],'u'));
        assert.equal(await page.locator('#party-app').getByText(question,{exact:true}).count(),0,'a handoff covers the question and prior ballot');
        assert.equal(await action(page,'vote').count(),0);await action(page,'ready').click();await action(page,'vote').nth(0).click();
        assert.match(await page.locator('#party-app h2').innerText(),new RegExp(names[1],'u'));assert.equal(await action(page,'vote').count(),0);assert.equal(await page.locator('.party-reveal').count(),0);
        await action(page,'ready').click();await action(page,'vote').nth(1).click();
        assert.equal(await page.locator('.party-reveal h3').innerText(),t.tie);assert.equal(await page.locator('.party-reveal li').count(),2);
        for(const row of await page.locator('.party-reveal li').allInnerTexts())assert.ok(row.includes(`1 ${t.votes}`));
        await axe(page,`${lang}: private reveal`);await assertFits(page,`${lang}: private reveal`);
        await action(page,'next-round').click();await action(page,'skip').click();assert.equal(await page.locator('.party-reveal h3').innerText(),t.skipped);await action(page,'next-round').click();
        await action(page,'begin-votes').click();for(let voter=0;voter<2;voter++){await action(page,'ready').click();await action(page,'vote').nth(0).click();}await action(page,'next-round').click();
        for(let index=3;index<10;index++){await action(page,'skip').click();await action(page,'next-round').click();}
        assert.equal(await page.locator('#party-app h2').innerText(),t.highlights);
        const results=await page.locator('.party-leaderboard li').allInnerTexts();assert.ok(results[0].includes(names[0])&&results[0].includes(`2 ${t.picks}`));assert.ok(results[1].includes(names[1])&&results[1].includes(`1 ${t.picks}`));
        await axe(page,`${lang}: private final results`);noErrors();
      }finally{await context.close();}
    }
  });

  await runTest('party games point-together mode records all tied players, skips without points and confirms end-game cancellation',async()=>{
    for(const lang of ['en','ar']) {
      const {context,page,noErrors}=await open('mostLikely',lang);const t=PARTY_COPY[lang];
      try {
        await mostSetup(page,{lang});await action(page,'begin-votes').click();assert.equal(await action(page,'reveal-point').isDisabled(),true);
        await page.locator('[data-party-pick="0"]').check();await page.locator('[data-party-pick="1"]').check();await action(page,'reveal-point').click();
        assert.equal(await page.locator('.party-reveal h3').innerText(),t.tie);assert.equal(await page.locator('.party-reveal li').count(),2);
        await action(page,'next-round').click();await action(page,'begin-votes').click();await page.locator('[data-party-pick="0"]').check();await action(page,'ask-exit').click();assert.equal(await page.locator('.party-confirm').count(),1);
        await action(page,'cancel-confirm').click();assert.equal(await page.locator('.party-confirm').count(),0);assert.equal(await page.locator('[data-party-pick="0"]').isChecked(),true,'cancel retains the pending group pick');assert.equal(await action(page,'reveal-point').isDisabled(),false);assert.equal(await action(page,'ask-exit').evaluate(button=>document.activeElement===button),true,'cancel returns keyboard focus to its opener');await action(page,'reveal-point').click();assert.equal(await page.locator('.party-reveal li').count(),1);await action(page,'next-round').click();
        for(let index=2;index<10;index++){await action(page,'skip').click();await action(page,'next-round').click();}
        const results=await page.locator('.party-leaderboard li').allInnerTexts();assert.ok(results[0].includes(`2 ${t.picks}`));assert.ok(results[1].includes(`1 ${t.picks}`));
        await action(page,'setup').click();await page.locator('#party-setup textarea').fill('Omar,Lina');await page.locator('#party-setup button[type="submit"]').click();await action(page,'ask-exit').click();await action(page,'confirm').click();assert.equal(await page.locator('#party-setup').count(),1);noErrors();
      }finally{await context.close();}
    }
  });

  await runTest('party games Know Me creates, swaps, reviews and shares ten choices; a separate friend is scored and remembers the result',async()=>{
    for(const lang of ['en','ar']) {
      const service=quizService(),owner=await open('knowMe',lang,{service});let guest;
      const name=lang==='ar'?'عمر':'Omar',friend=lang==='ar'?'لينا':'Lina';
      try {
        await ownerSetup(owner.page,name);await axe(owner.page,`${lang}: creator choices`);await ownerAnswers(owner.page,{swap:true,edit:true});await axe(owner.page,`${lang}: creator review`);
        await action(owner.page,'publish').click();await owner.page.locator('#party-share-link').waitFor();assert.equal(service.creates.length,1);
        assert.equal(service.creates[0].questions[9].answerIndex,3,'review edit is sent to the server');
        const share=await owner.page.locator('#party-share-link').inputValue(),shareUrl=new URL(share);assert.equal(shareUrl.search,`?quiz=${CODE}`);assert.equal(validQuizCode(shareUrl.searchParams.get('quiz')),true);
        await action(owner.page,'share').click();assert.deepEqual(await owner.page.evaluate(()=>window.__partyShared.map(s=>s.url)),[share]);
        await action(owner.page,'copy').click();assert.deepEqual(await owner.page.evaluate(()=>window.__partyCopied),[share]);assert.equal(await feedback(owner.page).innerText(),PARTY_COPY[lang].copied);
        const guestContext=await createContext(browser,phone);await prepare(guestContext);await service.install(guestContext);const page=await guestContext.newPage();guest={context:guestContext,page,noErrors:trackPageErrors(page)};
        await page.goto(share,{waitUntil:navigationReadyEvent});await ready(page);assert.ok((await page.locator('#party-app h2').first().innerText()).includes(name));assert.equal(await page.locator('#party-share-link').count(),0,'a friend never receives owner controls');
        await page.locator('#party-challenge input[name="name"]').fill(friend);await page.locator('#party-challenge button[type="submit"]').click();
        const answers=service.room.questions.map((q,i)=>i<2?(q.answerIndex+1)%4:q.answerIndex);await guestAnswers(page,answers);await action(page,'submit').click();await page.locator('.party-score').waitFor();
        assert.equal(await page.locator('.party-score').innerText(),'8 / 10');assert.equal(service.submits.length,1);assert.deepEqual(service.submits[0].answers,answers);await axe(page,`${lang}: friend result`);
        await page.reload({waitUntil:navigationReadyEvent});await ready(page);assert.equal(await page.locator('.party-score').innerText(),'8 / 10');assert.equal(await action(page,'answer-guess').count(),0);assert.equal(service.submits.length,1,'reload fetches the first result without resubmitting');
        const alternate=page.locator('.language-route-link');assert.equal(new URL(await alternate.getAttribute('href'),baseUrl).search,`?quiz=${CODE}`);await alternate.click();await ready(page);assert.equal(await page.locator('.party-score').innerText(),'8 / 10');assert.equal(await page.locator('html').getAttribute('lang'),lang==='ar'?'en':'ar');
        await action(owner.page,'refresh').click();await owner.page.locator('.party-leaderboard li').waitFor();assert.ok((await owner.page.locator('.party-leaderboard').innerText()).includes(friend));assert.ok((await owner.page.locator('.party-leaderboard').innerText()).includes('8 / 10'));
        await action(owner.page,'ask-close').click();await action(owner.page,'cancel-confirm').click();assert.equal(service.room.closed,false);await action(owner.page,'ask-close').click();await action(owner.page,'confirm').click();await ready(owner.page);assert.equal(service.room.closed,true);assert.equal(await owner.page.locator('#party-share-link').count(),0);assert.equal(new URL(owner.page.url()).search,'');
        assertNoAnswersDisclosed(service);owner.noErrors();guest.noErrors();
      }finally{if(guest)await guest.context.close();await owner.context.close();}
    }
  });

  await runTest('party games lost create and submit responses preserve choices and retry the same identity without duplicate quizzes or scores',async()=>{
    for(const lang of ['en','ar']) {
      const service=quizService({createFailure:true,submitFailure:true}),owner=await open('knowMe',lang,{service});let guest;
      try {
        await ownerSetup(owner.page,lang==='ar'?'مايا':'Maya');await ownerAnswers(owner.page);const review=await owner.page.locator('.party-review').innerText();
        await action(owner.page,'publish').click();await owner.page.waitForFunction(()=>document.getElementById('party-feedback').textContent.includes(document.documentElement.lang==='ar'?'تعذّر الاتصال':'Could not connect'));
        assert.equal(await owner.page.locator('.party-review').innerText(),review);assert.equal(await action(owner.page,'publish').isDisabled(),false);assert.equal(await owner.page.locator('#party-app').getAttribute('aria-busy'),'false');
        await action(owner.page,'publish').click();await owner.page.locator('#party-share-link').waitFor();assert.equal(service.creates.length,2);assert.deepEqual(service.creates[1],service.creates[0],'ambiguous create retries reuse token and all ten choices');
        const guestContext=await createContext(browser,phone);await prepare(guestContext);await service.install(guestContext);const page=await guestContext.newPage();guest={context:guestContext,page,noErrors:trackPageErrors(page)};
        await page.goto(await owner.page.locator('#party-share-link').inputValue(),{waitUntil:navigationReadyEvent});await ready(page);await page.locator('#party-challenge input').fill(lang==='ar'?'لينا':'Lina');await page.locator('#party-challenge button[type="submit"]').click();
        const answers=service.room.questions.map(q=>q.answerIndex);await guestAnswers(page,answers);await action(page,'submit').click();await page.waitForFunction(()=>document.getElementById('party-feedback').textContent.includes(document.documentElement.lang==='ar'?'تعذّر الاتصال':'Could not connect'));
        assert.equal(await action(page,'answer-guess').nth(answers[9]).getAttribute('aria-pressed'),'true');assert.equal(await action(page,'submit').isDisabled(),false);
        await action(page,'previous-guess').click();assert.equal(await action(page,'answer-guess').nth(answers[8]).getAttribute('aria-pressed'),'true');await action(page,'next-guess').click();await action(page,'submit').click();await page.locator('.party-score').waitFor();
        assert.equal(await page.locator('.party-score').innerText(),'10 / 10');assert.equal(service.submits.length,2);assert.deepEqual(service.submits[1],service.submits[0]);assert.equal(service.room.players.size,1);assert.equal(await page.locator('.party-leaderboard li').count(),1);
        assertNoAnswersDisclosed(service);owner.noErrors();guest.noErrors();
      }finally{if(guest)await guest.context.close();await owner.context.close();}
    }
  });

  await runTest('party games edits after a committed create response is lost publish a new quiz and score the updated choices',async()=>{
    for(const lang of ['en','ar'])for(const edit of ['answer','question']) {
      const service=quizService({createFailure:true}),owner=await open('knowMe',lang,{service});let guest;
      try {
        await ownerSetup(owner.page,lang==='ar'?'مايا':'Maya');await ownerAnswers(owner.page);await action(owner.page,'publish').click();
        await owner.page.waitForFunction(()=>document.getElementById('party-feedback').textContent.includes(document.documentElement.lang==='ar'?'تعذّر الاتصال':'Could not connect'));
        const original=structuredClone(service.creates[0]),oldCode=service.room.code;
        assert.equal(service.rooms.size,1,'the original request committed before its response failed');
        await action(owner.page,'edit-own').nth(9).click();
        if(edit==='question') {
          const oldQuestion=await owner.page.locator('#party-app h2').innerText();await action(owner.page,'swap').click();assert.notEqual(await owner.page.locator('#party-app h2').innerText(),oldQuestion);
          assert.equal(await action(owner.page,'next-own').isDisabled(),true,'the replacement needs a fresh creator choice');
        }
        const replacementAnswer=(original.questions[9].answerIndex+1)%4;
        await action(owner.page,'answer-own').nth(replacementAnswer).click();await action(owner.page,'next-own').click();await action(owner.page,'publish').click();await owner.page.locator('#party-share-link').waitFor();
        assert.equal(service.creates.length,2);const updated=service.creates[1];
        assert.notEqual(updated.token,original.token,'edited creation payload gets a new identity instead of reopening the committed old quiz');
        assert.deepEqual(updated.questions.slice(0,9),original.questions.slice(0,9),'unmodified draft choices survive the failed request');
        assert.equal(updated.questions[9].answerIndex,replacementAnswer);
        if(edit==='question')assert.notEqual(updated.questions[9].id,original.questions[9].id);else assert.equal(updated.questions[9].id,original.questions[9].id);
        assert.equal(service.rooms.size,2);assert.deepEqual(service.rooms.get(oldCode).questions,original.questions,'a failed response never silently edits the already committed quiz');
        const share=await owner.page.locator('#party-share-link').inputValue(),newCode=new URL(share).searchParams.get('quiz');assert.ok(validQuizCode(newCode));assert.notEqual(newCode,oldCode,'the shared link belongs to the edited quiz');
        const guestContext=await createContext(browser,phone);await prepare(guestContext);await service.install(guestContext);const page=await guestContext.newPage();guest={context:guestContext,page,noErrors:trackPageErrors(page)};
        await page.goto(share,{waitUntil:navigationReadyEvent});await page.locator('#party-challenge').waitFor();await page.locator('#party-challenge input').fill(lang==='ar'?'لينا':'Lina');await page.locator('#party-challenge button[type="submit"]').click();
        const guesses=updated.questions.map(q=>q.answerIndex);await guestAnswers(page,guesses);assert.equal(await page.locator('#party-app h2').innerText(),canonical.get(updated.questions[9].id).text[lang],'friend receives the reviewed question set');
        await action(page,'submit').click();await page.locator('.party-score').waitFor();assert.equal(await page.locator('.party-score').innerText(),'10 / 10','grading uses the updated creator answers rather than the earlier committed quiz');
        assert.deepEqual(service.submits[0].answers,guesses);assert.equal(service.rooms.get(newCode).players.size,1);assert.equal(service.rooms.get(oldCode).players.size,0);
        assertNoAnswersDisclosed(service);owner.noErrors();guest.noErrors();
      }finally{if(guest)await guest.context.close();await owner.context.close();}
    }
  });

  await runTest('party games skip-link and browser Back preserve point picks and friend guesses without overlapping a delayed refresh',async()=>{
    for(const lang of ['en','ar']) {
      const most=await open('mostLikely',lang);
      try {
        await mostSetup(most.page,{lang});await action(most.page,'begin-votes').click();await most.page.locator('[data-party-pick="0"]').check();const question=await most.page.locator('#party-app h2').innerText();
        await skipLinkAndBack(most.page);assert.equal(await most.page.locator('#party-app h2').innerText(),question);assert.equal(await most.page.locator('[data-party-pick="0"]').isChecked(),true);assert.equal(await action(most.page,'reveal-point').isDisabled(),false);most.noErrors();
      }finally{await most.context.close();}
      const service=quizService();service.seed(lang==='ar'?'عمر':'Omar');
      const context=await createContext(browser,phone);await prepare(context);await service.install(context);const page=await context.newPage(),noErrors=trackPageErrors(page);let releaseRefresh;
      try {
        await page.goto(`${baseUrl}${partyPath('knowMe',lang)}?quiz=${CODE}`,{waitUntil:navigationReadyEvent});await page.locator('#party-challenge').waitFor();await page.locator('#party-challenge input').fill(lang==='ar'?'لينا':'Lina');await page.locator('#party-challenge button[type="submit"]').click();
        await action(page,'answer-guess').nth(0).click();await action(page,'next-guess').click();await action(page,'answer-guess').nth(1).click();const question=await page.locator('#party-app h2').innerText();
        await assertNoExtraStateRequest(page,()=>skipLinkAndBack(page));assert.equal(await page.locator('#party-app h2').innerText(),question);assert.equal(await action(page,'answer-guess').nth(1).getAttribute('aria-pressed'),'true');assert.equal(service.states.length,1);
        await action(page,'previous-guess').click();assert.equal(await action(page,'answer-guess').nth(0).getAttribute('aria-pressed'),'true');await action(page,'next-guess').click();
        const answers=service.room.questions.map(q=>q.answerIndex);
        for(let i=1;i<10;i++){await action(page,'answer-guess').nth(answers[i]).click();if(i<9)await action(page,'next-guess').click();}
        await action(page,'submit').click();await page.locator('.party-score').waitFor();assert.equal(await page.locator('.party-score').innerText(),'10 / 10');
        service.stateGate=new Promise(resolve=>{releaseRefresh=resolve;});const refreshRequest=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname===`/api/know-me/${CODE}/state`);await action(page,'refresh').click();await refreshRequest;await page.waitForFunction(()=>document.getElementById('party-app').getAttribute('aria-busy')==='true');
        await assertNoExtraStateRequest(page,()=>skipLinkAndBack(page));assert.equal(service.states.length,2,'exactly one delayed refresh request remains in flight');assert.equal(await page.locator('.party-score').innerText(),'10 / 10');
        releaseRefresh();service.stateGate=null;await ready(page);assert.equal(await page.locator('.party-score').innerText(),'10 / 10');assert.equal(await action(page,'refresh').isDisabled(),false);assert.equal(service.submits.length,1);noErrors();
      }finally{releaseRefresh?.();await context.close();}
    }
  });

  await runTest('party games missing and incomplete quiz links show localized recovery and can retry without an account',async()=>{
    for(const lang of ['en','ar']) {
      const service=quizService(),{context,page,noErrors}=await open('knowMe',lang,{service});
      try {
        await page.goto(`${baseUrl}${partyPath('knowMe',lang)}?quiz=${CODE}`,{waitUntil:navigationReadyEvent});await ready(page);assert.equal(await page.locator('#party-app h2').innerText(),PARTY_COPY[lang].unavailable);assert.equal(await action(page,'retry-quiz').count(),1);
        service.seed(lang==='ar'?'عمر':'Omar');await action(page,'retry-quiz').click();await page.locator('#party-challenge').waitFor();assert.equal(await action(page,'retry-quiz').count(),0);
        const states=service.states.length;await page.goto(`${baseUrl}${partyPath('knowMe',lang)}?quiz=ABC`,{waitUntil:navigationReadyEvent});await ready(page);assert.equal(await feedback(page).innerText(),PARTY_COPY[lang].invalidLink);assert.equal(await action(page,'retry-quiz').count(),0);assert.equal(service.states.length,states,'invalid link does not request a quiz');
        await action(page,'new-quiz').click();await page.locator('#party-setup').waitFor();assert.equal(new URL(page.url()).search,'');noErrors();
      }finally{await context.close();}
    }
  });

  await runTest('party games remain playable when storage is denied and offer manual sharing when clipboard access fails',async()=>{
    for(const lang of ['en','ar']) {
      const most=await open('mostLikely',lang,{deniedStorage:true});
      try{await mostSetup(most.page,{lang});await action(most.page,'begin-votes').click();await most.page.locator('[data-party-pick="0"]').check();await action(most.page,'reveal-point').click();assert.equal(await most.page.locator('.party-reveal li').count(),1);most.noErrors();}finally{await most.context.close();}
      const service=quizService(),owner=await open('knowMe',lang,{service,deniedStorage:true,clipboardFailure:true});
      try {
        assert.equal(await owner.page.locator('.party-warning').innerText(),PARTY_COPY[lang].storage);await ownerSetup(owner.page,lang==='ar'?'عمر':'Omar');await ownerAnswers(owner.page);await action(owner.page,'publish').click();await owner.page.locator('#party-share-link').waitFor();
        assert.equal(await owner.page.locator('.party-warning').innerText(),PARTY_COPY[lang].storage);await action(owner.page,'copy').click();assert.equal(await feedback(owner.page).innerText(),PARTY_COPY[lang].copyFailed);
        const selection=await owner.page.locator('#party-share-link').evaluate(input=>({focused:document.activeElement===input,start:input.selectionStart,end:input.selectionEnd,length:input.value.length}));assert.deepEqual(selection,{focused:true,start:0,end:selection.length,length:selection.length},'manual copy selects the complete link');
        await action(owner.page,'refresh').click();await ready(owner.page);assert.equal(await owner.page.locator('#party-share-link').count(),1,'the open tab retains owner access without persistent storage');owner.noErrors();
      }finally{await owner.context.close();}
    }
  });

  await runTest('party games narrow EN/AR phone layouts support keyboard setup, tied picks and visible focus',async()=>{
    for(const lang of ['en','ar']) {
      const names=lang==='ar'?'عبدالرحمنالمستكشف\nليناالمغامرة':'AlexandertheExplorer\nLinatheAdventurer';
      const {context,page,noErrors}=await open('mostLikely',lang,{contextOptions:{...phone,viewport:{width:320,height:568}}});
      try {
        await action(page,'start').focus();await page.keyboard.press('Enter');await assertFits(page,`${lang}: 320px setup`);await page.locator('#party-setup textarea').fill(names);await page.locator('#party-setup button[type="submit"]').focus();await page.keyboard.press('Enter');
        await action(page,'begin-votes').focus();await page.keyboard.press('Enter');await page.locator('[data-party-pick="0"]').focus();await page.keyboard.press('Space');assert.equal(await page.locator('[data-party-pick="0"]').isChecked(),true);await page.locator('[data-party-pick="1"]').focus();await page.keyboard.press('Space');
        await assertFits(page,`${lang}: 320px selections`);const focus=await page.locator('[data-party-pick="1"]').evaluate(input=>({focused:document.activeElement===input,outline:getComputedStyle(input).outlineStyle}));assert.equal(focus.focused,true);assert.notEqual(focus.outline,'none','keyboard focus is visible');
        await action(page,'reveal-point').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.party-reveal h3').innerText(),PARTY_COPY[lang].tie);await assertFits(page,`${lang}: 320px reveal`);await axe(page,`${lang}: keyboard reveal`);noErrors();
      }finally{await context.close();}
      const quiz=await open('knowMe',lang,{contextOptions:{...phone,viewport:{width:320,height:568}}});
      try{await ownerSetup(quiz.page,lang==='ar'?'لينا':'Lina');await action(quiz.page,'answer-own').nth(2).focus();await quiz.page.keyboard.press('Enter');assert.equal(await action(quiz.page,'answer-own').nth(2).getAttribute('aria-pressed'),'true');await assertFits(quiz.page,`${lang}: 320px quiz choices`);quiz.noErrors();}finally{await quiz.context.close();}
    }
  });

  await runTest('party games shared Know Me challenges play without the catalog and preserve create intent after a catalog retry',async()=>{
    for(const lang of ['en','ar']) {
      const service=quizService();service.seed(lang==='ar'?'عمر':'Omar');
      const context=await createContext(browser,phone);await prepare(context);await service.install(context);let catalogRequests=0,blockCatalog=true;
      await context.route(url=>partyDataPath(url.pathname),async route=>{catalogRequests++;if(blockCatalog)await route.fulfill({status:503,contentType:'text/plain',body:'test catalog outage'});else await route.continue();});
      const page=await context.newPage(),noErrors=trackPageErrors(page);
      try {
        await page.goto(`${baseUrl}${partyPath('knowMe',lang)}?quiz=${CODE}`,{waitUntil:navigationReadyEvent});await page.locator('#party-challenge').waitFor();assert.equal(catalogRequests,0,'shared quiz uses its public API projection without downloading the authoring catalog');
        await page.locator('#party-challenge input').fill(lang==='ar'?'لينا':'Lina');await page.locator('#party-challenge button[type="submit"]').click();await guestAnswers(page,service.room.questions.map(q=>q.answerIndex));await action(page,'submit').click();await page.locator('.party-score').waitFor();assert.equal(await page.locator('.party-score').innerText(),'10 / 10');assert.equal(catalogRequests,0);
        await action(page,'new-quiz').click();await action(page,'reload-data').waitFor();assert.equal(catalogRequests,1);assert.equal(await page.locator('#party-app h2').first().innerText(),PARTY_COPY[lang].failed);
        blockCatalog=false;await action(page,'reload-data').click();await page.locator('#party-setup').waitFor();assert.equal(catalogRequests,2);assert.equal(await page.locator('#party-setup input[name="name"]').count(),1,'retry returns directly to the requested creation form');assert.equal(new URL(page.url()).search,'');noErrors();
      }finally{await context.close();}
    }
  });

  await runTest('party games failed content loads recover with one explicit retry of the same deployed data dependency',async()=>{
    for(const lang of ['en','ar']) {
      const context=await createContext(browser,phone);await prepare(context);let requests=0;const paths=[];
      await context.route(url=>partyDataPath(url.pathname),async route=>{requests++;paths.push(new URL(route.request().url()).pathname);if(requests===1)await route.fulfill({status:503,contentType:'text/plain',body:'test outage'});else await route.continue();});
      const page=await context.newPage(),noErrors=trackPageErrors(page);
      try {
        await page.goto(`${baseUrl}${partyPath('mostLikely',lang)}`,{waitUntil:navigationReadyEvent});await action(page,'reload-data').waitFor();assert.equal(await page.locator('#party-app h2').innerText(),PARTY_COPY[lang].failed);
        await action(page,'reload-data').click();await action(page,'start').waitFor();assert.equal(await action(page,'start').isDisabled(),false);assert.equal(requests,2);assert.ok(paths.every(p=>p===(artifactManifest?.fingerprints?.['/data/party-games.json']||'/data/party-games.json')),'retry keeps the build-pinned content');
        await mostSetup(page,{lang});assert.equal(await action(page,'begin-votes').count(),1);noErrors();
      }finally{await context.close();}
    }
  });
}
