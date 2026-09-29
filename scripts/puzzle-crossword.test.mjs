import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCrossword,crosswordComplete,CLUES,normalizeLetter,restoreCrosswordState,editCrosswordText,nextCrosswordCell} from '../puzzle-crossword.js';
for(const lang of ['en','ar'])for(const size of [5,9,13])test(`${lang} ${size}: 90 daily seeds have connected, clued, consistent grids`,()=>{
 for(let seed=1;seed<=90;seed++){
  const p=makeCrossword(size,lang,seed);
  assert.ok(p.entries.length>=({5:3,9:6,13:12}[size]),`too few entries ${seed}: ${p.entries.length}`);
  assert.equal(new Set(p.entries.map(e=>e.word)).size,p.entries.length);
  for(const e of p.entries)assert.equal(e.indices.map(i=>p.grid[i]).join(''),e.word);
  for(const dir of ['across','down'])for(let r=0;r<size;r++)for(let c=0;c<size;c++){
   const index=r*size+c;if(!p.grid[index])continue;
   if(dir==='across'&&c>0&&p.grid[index-1])continue;
   if(dir==='down'&&r>0&&p.grid[index-size])continue;
   let run=[],rr=r,cc=c;while(rr<size&&cc<size&&p.grid[rr*size+cc]){run.push(rr*size+cc);if(dir==='across')cc++;else rr++;}
   if(run.length>1)assert.ok(p.entries.some(e=>e.d===dir&&e.indices.join()===run.join()),`unclued run ${run}`);
  }
  const reached=new Set(p.entries[0].indices);let previous=-1;while(previous!==reached.size){previous=reached.size;for(const e of p.entries)if(e.indices.some(i=>reached.has(i)))e.indices.forEach(i=>reached.add(i));}
  assert.equal(reached.size,p.grid.filter(Boolean).length);
  assert.ok(crosswordComplete(p,p.grid));assert.ok(!crosswordComplete(p,Array(size*size).fill('')));
  assert.deepEqual(makeCrossword(size,lang,seed),p);
 }
});
test('clue banks have no duplicate words and all clues are authored',()=>{for(const entries of Object.values(CLUES)){assert.equal(new Set(entries.map(e=>e[0])).size,entries.length);entries.forEach(([w,c])=>{assert.ok(w.length>=3);assert.ok(c.length>5);});}});

test('crossword restores safe dense cells and recomputes stale completion flags for every size/language',()=>{
 for(const lang of ['en','ar'])for(const size of [5,9,13]){
  const p=makeCrossword(size,lang,1234);
  for(const bad of [null,false,'done',[],{completed:true},{values:Array(size*size).fill({toString:null}),completed:true},{values:Array(size*size)}]){
   const state=restoreCrosswordState(p,bad);
   assert.equal(state.values.length,size*size);assert.equal(Object.keys(state.values).length,size*size);assert.equal(state.completed,false);
   assert.ok(state.values.every(v=>v===''));
  }
  const correct=restoreCrosswordState(p,{values:p.grid,completed:false});assert.equal(correct.completed,true);assert.deepEqual(restoreCrosswordState(p,correct),correct);
  const corrupted=restoreCrosswordState(p,{values:p.grid.map(v=>v?'123🙂':'A')});assert.ok(corrupted.values.every(v=>v===''));
  assert.equal(crosswordComplete(p,null),false);assert.equal(crosswordComplete(p,Array(size*size).fill(3)),false);
  assert.equal(crosswordComplete(p,[]),false);assert.equal(restoreCrosswordState(p,null).completed,false);
 }
 assert.equal(normalizeLetter({toString:null}),'');assert.equal(normalizeLetter('قَــمَر'),'قمر');assert.equal(normalizeLetter('ｃ'),'C');
});

test('starter clues and assistance survive missing or malformed saves',()=>{
 for(const lang of ['en','ar'])for(const size of [5,9,13]){
  const p=makeCrossword(size,lang,4);
  for(const value of [null,{values:[]},{values:'bad',assisted:false}]){
   const state=restoreCrosswordState(p,value,true);assert.equal(state.assisted,true);
   for(const e of p.entries)assert.equal(state.values[e.indices[0]],e.word[0]);
   assert.deepEqual(restoreCrosswordState(p,state,true),state);
  }
  assert.equal(restoreCrosswordState(p,{assisted:'false'}).assisted,false);
  assert.equal(restoreCrosswordState(p,{assisted:true}).assisted,true);
 }
});

test('single letters and pasted words fill only the selected word, in logical Arabic order too',()=>{
 for(const lang of ['en','ar'])for(const size of [5,9,13]){
  const p=makeCrossword(size,lang,9),blank=Array(size*size).fill('');
  for(const e of p.entries){
   const edit=editCrosswordText(p,blank,e,e.indices[0],e.word);
   assert.equal(e.indices.map(i=>edit.values[i]).join(''),e.word);assert.deepEqual(edit.changed,e.indices);
   assert.equal(edit.next,e.indices.at(-1));assert.ok(blank.every(v=>v===''));
   const tail=editCrosswordText(p,blank,e,e.indices.at(-1),e.word);assert.deepEqual(tail.changed,[e.indices.at(-1)]);assert.equal(tail.values[e.indices.at(-1)],e.word[0]);
   const replacement=editCrosswordText(p,edit.values,e,e.indices[0],lang==='ar'?'ب':'Z');assert.equal(replacement.values[e.indices[0]],lang==='ar'?'ب':'Z');
   const clear=editCrosswordText(p,replacement.values,e,e.indices[0],'123🙂');assert.equal(clear.values[e.indices[0]],'');assert.equal(clear.next,e.indices[0]);
  }
 }
});

test('arrow navigation follows visual direction without horizontal wrapping or entering blocks',()=>{
 const grid=['A','','B','','C','','','',''];
 const en={size:3,lang:'en',grid},ar={size:3,lang:'ar',grid};
 assert.equal(nextCrosswordCell(en,0,'ArrowRight'),2);assert.equal(nextCrosswordCell(en,2,'ArrowRight'),2);
 assert.equal(nextCrosswordCell(en,2,'ArrowLeft'),0);assert.equal(nextCrosswordCell(en,0,'ArrowLeft'),0);
 assert.equal(nextCrosswordCell(ar,0,'ArrowLeft'),2);assert.equal(nextCrosswordCell(ar,2,'ArrowLeft'),2);
 assert.equal(nextCrosswordCell(ar,2,'ArrowRight'),0);assert.equal(nextCrosswordCell(en,4,'ArrowUp'),4);
 assert.equal(nextCrosswordCell(en,4,'Other'),4);
});

test('boundary seeds are deterministic and unsupported generator inputs fail explicitly',()=>{
 for(const lang of ['en','ar'])for(const size of [5,9,13])for(const seed of [0,0xffffffff,0x80000000,-1]){
  const p=makeCrossword(size,lang,seed);assert.deepEqual(makeCrossword(size,lang,seed),p);assert.ok(crosswordComplete(p,p.grid));
 }
 assert.throws(()=>makeCrossword(1),RangeError);assert.throws(()=>makeCrossword(5,'toString'),RangeError);
 assert.deepEqual(makeCrossword(5,'en',NaN),makeCrossword(5,'en',1));
});
