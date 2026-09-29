import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCrossword,crosswordComplete,CLUES} from '../puzzle-crossword.js';
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
