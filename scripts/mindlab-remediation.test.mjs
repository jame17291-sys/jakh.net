import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const read = filename => JSON.parse(fs.readFileSync(new URL(`../${filename}`,import.meta.url),'utf8'));
const plan = read('docs/content-review/mindlab-remediation-2026-09-23.json');
const cards = new Map(plan.scope.flatMap(topic => read(`data/${topic.slug}.json`)).map(card=>[card.id,card]));
const hash = card => crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex');

test('all 1,241 audit findings are repaired without deleting or renumbering the 3,275 public questions',()=>{
  assert.equal(plan.scope.length,51);
  assert.equal(plan.counts.publicQuestions,3275);
  assert.equal(cards.size,3275);
  assert.equal(plan.counts.auditFindings,1241);
  assert.equal(plan.changes.filter(c=>c.finding).length,1241);
  assert.equal(new Set(plan.changes.map(c=>c.id)).size,plan.changes.length);
  for (const topic of plan.scope) {
    const actual = read(`data/${topic.slug}.json`);
    assert.equal(actual.length,topic.count,topic.slug);
    assert.deepEqual(actual.map(c=>c.id),topic.ids,topic.slug);
  }
  for (const change of plan.changes) {
    assert.notEqual(change.beforeHash,change.afterHash,`${change.id}: not a real change`);
    assert.equal(hash(cards.get(change.id)),change.afterHash,`${change.id}: patch not applied`);
    assert.ok(change.reason?.trim(),change.id);
    assert.notEqual(change.patch.review?.status,'reviewed',`${change.id}: must not manufacture certification`);
  }
});

test('every repaired question has complete bilingual content and valid difficulty',()=>{
  for (const change of plan.changes) {
    const card = cards.get(change.id);
    for (const field of ['question','answer','subcategory']) {
      for (const lang of ['en','ar']) assert.ok(card[field]?.[lang]?.trim(),`${card.id}/${field}/${lang}`);
    }
    assert.match(card.question.ar,/[\u0600-\u06ff]/u,card.id);
    assert.ok(['easy','medium','hard','very-advanced'].includes(card.difficulty),card.id);
    for (const field of ['acceptedAnswers','quickFire','explanation']) {
      assert.notEqual(card[field],null,`${card.id}: deletion marker leaked into content`);
    }
    if (change.category==='story-mysteries') assert.equal(card.mode,'story',card.id);
  }
});

test('newly authored questions introduce no exact duplicate prompts within a topic',()=>{
  const changed = new Set(plan.changes.filter(c=>c.patch.question).map(c=>c.id));
  for (const topic of plan.scope) for (const lang of ['en','ar']) {
    const seen = new Map();
    for (const card of read(`data/${topic.slug}.json`)) {
      const key = card.question[lang].normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu,'');
      if (seen.has(key)) assert.ok(!changed.has(card.id) && !changed.has(seen.get(key)),`${topic.slug}/${lang}: ${card.id} duplicates ${seen.get(key)}`);
      seen.set(key,card.id);
    }
  }
});

test('twelve-ball answer identifies all 24 heavy/light cases in exactly three balanced weighings',()=>{
  const weighings = [
    [[5,7,8,9],[6,10,11,12]],
    [[2,3,4,6],[5,10,11,12]],
    [[1,4,9,10],[2,6,7,12]],
  ];
  const table = ['==L','=LR','=L=','=LL','LR=','RLR','L=R','L==','L=L','RRL','RR=','RRR'];
  const seen = new Set();
  for (const [left,right] of weighings) {
    assert.equal(left.length,right.length);
    assert.equal(new Set([...left,...right]).size,8);
  }
  for (let odd=1;odd<=12;odd++) for (const difference of [-1,1]) {
    const mass = ball=>10+(ball===odd ? difference : 0);
    const result = weighings.map(([left,right])=>{
      const delta=left.reduce((s,b)=>s+mass(b),0)-right.reduce((s,b)=>s+mass(b),0);
      return delta>0?'L':delta<0?'R':'=';
    }).join('');
    const heavyResult = difference===1?result:result.replace(/[LR]/g,c=>c==='L'?'R':'L');
    assert.equal(table.indexOf(heavyResult)+1,odd);
    seen.add(result);
  }
  assert.equal(seen.size,24);
  for (const lang of ['en','ar']) for (const [index,signature] of table.entries()) {
    assert.ok(cards.get('logic-puzzles-054').answer[lang].includes(`${index+1}:${signature}`));
  }
});

test('Truth/Lie/Random solution works for every assignment and either arbitrary first answer',()=>{
  const permutations = values => values.length ? values.flatMap((value,index)=>
    permutations(values.filter((_,i)=>i!==index)).map(tail=>[value,...tail])) : [[]];
  const directAnswer = (type,proposition)=>type==='Truth'?proposition:!proposition;
  const normalized = (type,proposition)=>directAnswer(type,directAnswer(type,proposition));
  for (const types of permutations(['Truth','Lie','Random'])) for (const randomAnswer of [false,true]) {
    const first = types[0]==='Random'?randomAnswer:normalized(types[0],types[1]==='Random');
    const x = first?2:1;
    assert.notEqual(types[x],'Random');
    const second=normalized(types[x],types[0]==='Random');
    const randomIndex=second?0:3-x;
    const third=normalized(types[x],types[x]==='Truth');
    const found=[];
    found[randomIndex]='Random';
    found[x]=third?'Truth':'Lie';
    found[3-randomIndex-x]=third?'Lie':'Truth';
    assert.deepEqual(found,types);
  }
  assert.match(cards.get('classic-riddles-081').answer.en,/If yes, choose X=C; if no, choose X=B/);
});

test('repair application is idempotent and rejects concurrent edits before writing any category',()=>{
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(),'mindlab-remediation-test-'));
  try {
    for (const dir of ['scripts','docs/content-review','data']) fs.mkdirSync(path.join(fixture,dir),{recursive:true});
    fs.copyFileSync(new URL('./apply-mindlab-remediation.mjs',import.meta.url),path.join(fixture,'scripts/apply-mindlab-remediation.mjs'));
    const before = [{id:'one',answer:{en:'old',ar:'قديم'}},{id:'two',answer:{en:'old',ar:'قديم'}}];
    const after = before.map(card=>({...card,answer:{en:'new',ar:'جديد'}}));
    const model = {
      counts:{changedQuestions:2},categoryChanges:{},
      scope:before.map(c=>({slug:c.id,ids:[c.id]})),
      changes:before.map((c,i)=>({id:c.id,beforeHash:hash(c),afterHash:hash(after[i]),patch:{answer:after[i].answer}})),
    };
    const write = (name,value)=>fs.writeFileSync(path.join(fixture,name),JSON.stringify(value));
    write('docs/content-review/mindlab-remediation-2026-09-23.json',model);
    write('data/catalog.json',{categories:[]});
    const run = (...args)=>spawnSync(process.execPath,[path.join(fixture,'scripts/apply-mindlab-remediation.mjs'),...args],{encoding:'utf8'});
    write('data/one.json',[before[0]]);
    write('data/two.json',[{...before[1],authorNote:'concurrent edit'}]);
    const conflict=run('--apply');
    assert.notEqual(conflict.status,0);
    assert.match(conflict.stderr,/Refusing to overwrite concurrent edits/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture,'data/one.json'))),[before[0]],'must not partially apply');
    write('data/two.json',[before[1]]);
    assert.equal(run('--check').status,1);
    assert.equal(run('--apply').status,0);
    assert.equal(run('--check').status,0);
    assert.equal(run('--apply').status,0);
    for (const c of after) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture,'data',`${c.id}.json`))),[c]);
  } finally {
    fs.rmSync(fixture,{recursive:true,force:true});
  }
});
