import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dailyIndex, validDay, requestedDay, resetCountdown, cleanActivity, recordCompletion, dailySummary, challengeURL, resultText, progressKey, createSudokuProgress, sudokuProgressKey } from '../puzzle-daily.js';
import { storageKey, createProgressStore, dayKey } from '../puzzle-catalog.js';
import { createSudoku, restoreSudokuState } from '../puzzle-logic.js';

test('30-day collection rotation visits every board exactly once for every game and variation', () => {
  for (const game of ['hive', 'links', 'trails', 'letter-square']) for (const variant of ['standard', 'mini']) {
    const indices = Array.from({length: 30}, (_,i) => dailyIndex(new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10), game, variant));
    assert.equal(new Set(indices).size,30);
    assert.ok(indices.every(index=>index>=0&&index<30));
    assert.equal(indices[0],dailyIndex('2026-10-31',game,variant));
  }
});
test('shared dates reject malformed, impossible and future dates', () => {
  for (const date of ['2026-02-30','2026-9-1','junk','<script>',null]) assert.equal(validDay(date),false);
  assert.equal(validDay('2028-02-29'),true);
  assert.equal(requestedDay('2026-09-29','2026-10-01'),'2026-09-29');
  assert.equal(requestedDay('2099-01-01','2026-10-01'),'2026-10-01');
  assert.equal(requestedDay('2020-01-01','2026-10-01'),'2026-10-01');
});
test('reset clock follows Dubai midnight across year and leap-day boundaries', () => {
  assert.deepEqual(resetCountdown(new Date('2026-09-29T19:59:30Z')),{hours:0,minutes:1,at:'2026-09-29T20:00:00.000Z'});
  assert.deepEqual(resetCountdown(new Date('2026-09-29T20:00:00Z')),{hours:24,minutes:0,at:'2026-09-30T20:00:00.000Z'});
  assert.equal(resetCountdown(new Date('2028-02-29T19:00:00Z')).at,'2028-02-29T20:00:00.000Z');
  assert.equal(resetCountdown(new Date('2026-12-31T20:00:00Z')).at,'2027-01-01T20:00:00.000Z');
});
test('completion counts are language-specific while a streak spans either language', () => {
  let value={};
  for(const [date,lang,game] of [['2026-09-29','ar','mini'],['2026-09-30','en','word'],['2026-10-01','ar','links'],['2026-10-01','ar','mini']]) value=recordCompletion(value,{date,lang,game},date);
  assert.deepEqual(dailySummary(value,'ar','2026-10-01'),{completed:['links','mini'],current:3,best:3,total:11,playedToday:true});
  assert.equal(dailySummary(value,'en','2026-10-01').completed.length,0);
  assert.equal(dailySummary(value,'en','2026-10-02').current,3,'yesterday streak remains available to continue');
  assert.equal(dailySummary(value,'en','2026-10-03').current,0);
  assert.equal(dailySummary(value,'en','2026-10-03').best,3);
});
test('replay, archive, bonus and future entries do not inflate daily achievements', () => {
  const date='2026-10-01',win={date,lang:'en',game:'word'};
  const value=recordCompletion({},win,date);
  assert.deepEqual(recordCompletion(value,win,date),value);
  for(const change of [{date:'2026-09-30'},{date:'2099-01-01'},{game:'duel'},{game:'bonus'},{variant:'clue'},{lang:'xx'}])assert.deepEqual(recordCompletion(value,{...win,...change},date),value);
});
test('malformed and old activity is removed with bounded retention', () => {
  const days={'2020-01-01':{'en:word':{game:'word',lang:'en'}},'2026-02-30':{},'2099-01-01':{},'2026-10-01':{'en:word':{game:'word',lang:'en',assisted:true,secret:'never retain'},'en:duel':{game:'duel',lang:'en'},bad:{game:'mini',lang:'ar'}}};
  assert.deepEqual(cleanActivity({days},'2026-10-01'),{version:1,days:{'2026-10-01':{'en:word':{game:'word',lang:'en',assisted:true}}}});
  assert.deepEqual(cleanActivity([], '2026-10-01'),{version:1,days:{}});
});
test('new content cannot reinterpret old saved words while logic and online seats keep their keys', () => {
  assert.notEqual(progressKey('hive','ar','2026-10-01'),storageKey('hive','ar','2026-10-01'));
  assert.equal(progressKey('sudoku','ar','2026-10-01'),storageKey('sudoku','ar','2026-10-01'));
  assert.equal(progressKey('duel','en','2026-10-01'),storageKey('duel','ar','2026-09-29'));
});
test('share results never contain answers, board letters or private seat information', () => {
  const state={completed:true,guesses:['SECRET','HIDDEN'],found:['FORBIDDEN'],chain:['ANSWER'],board:['PRIVATE'],token:'seat-token',session:{token:'room-secret'},assisted:true};
  for(const game of ['word','hive','links','trails','letter-square','sudoku','mosaic','domino','mini'])for(const lang of ['en','ar']) {
    const text=resultText({game,lang,date:'2026-10-01'},state);
    for(const secret of ['SECRET','HIDDEN','FORBIDDEN','ANSWER','PRIVATE','seat-token','room-secret'])assert.ok(!text.includes(secret),`${game}: ${secret}`);
    assert.ok(text.includes('date=2026-10-01'));
    assert.ok(text.includes('edition=2'));
  }
  assert.throws(()=>challengeURL({game:'duel',lang:'en',date:'2026-10-01'}));
});
test('streak data survives blocked browser storage within the page', () => {
  const store=createProgressStore(()=>{throw new Error('blocked');});
  const value=recordCompletion({}, {game:'mini',lang:'ar',date:'2026-10-01'},'2026-10-01');
  store.save('journal',value);
  assert.equal(dailySummary(store.read('journal'),'ar','2026-10-01').current,1);
});

function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  const backend = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  return { data, backend, store: createProgressStore(() => backend) };
}
test('a shared Sudoku difficulty preserves the legacy board and every previously saved level', () => {
  const base = progressKey('sudoku', 'en', '2026-10-01');
  const old = { version: 1, difficulty: 'medium', notes: [[3]], values: [7], hints: 2 };
  const {store, backend} = memoryStore({[base]: old});
  const shared = createSudokuProgress(store, base, 'hard');
  assert.equal(shared.difficulty, 'hard'); assert.deepEqual(shared.read({}), {});
  assert.deepEqual(store.read(sudokuProgressKey(base, 'medium')), old);
  const hard = {version: 1, difficulty: 'hard', values: [2], notes: [[4]], hints: 1};
  shared.save(hard);
  assert.deepEqual(shared.select('medium'), old);
  assert.deepEqual(shared.select('hard'), hard);
  assert.deepEqual(store.read(base), hard, 'the old key remains the most recently saved board');
  const fresh = createSudokuProgress(createProgressStore(() => backend), base);
  assert.equal(fresh.difficulty, 'hard'); assert.deepEqual(fresh.read({}), hard);
  assert.deepEqual(fresh.select('medium'), old);
});
test('Sudoku reset clears only its selected level and never resurrects its base snapshot', () => {
  const base = 'reset-sudoku', medium = {difficulty:'medium', version:1, values:[1]}, hard = {difficulty:'hard', version:1, values:[2]};
  const {store} = memoryStore({[base]:medium});
  const p = createSudokuProgress(store, base, 'hard'); p.save(hard); p.reset();
  assert.equal(store.read(base), null); assert.deepEqual(p.read({}), {});
  assert.deepEqual(createSudokuProgress(store, base, 'hard').read({}), {});
  assert.deepEqual(p.select('medium'), medium);
  p.save(medium); p.select('hard'); p.reset();
  assert.deepEqual(store.read(base), medium, 'resetting an unplayed level preserves the last played level');
});
test('Sudoku level selection rejects invalid names and retains page-local slots when storage fails', () => {
  const store = createProgressStore(() => { throw new Error('Denied'); });
  const p = createSudokuProgress(store, 'offline-sudoku', '<script>');
  assert.equal(p.difficulty, 'medium');
  p.save({difficulty:'medium', notes:[[2]], values:[3]}); p.select('easy'); p.save({difficulty:'easy', values:[4]});
  assert.deepEqual(p.select('medium').notes, [[2]]);
  assert.throws(() => p.select('__proto__')); assert.throws(() => p.save({difficulty:'impossible'}));
  p.reset(); assert.deepEqual(p.read({}), {}); assert.deepEqual(p.select('easy').values, [4]);
});
test('Sudoku share links preserve current difficulty and reconstruct exactly the same seeded board', () => {
  const context = {game:'sudoku',lang:'ar',date:'2026-10-01',difficulty:'medium'};
  for (const difficulty of ['easy','medium','hard']) {
    const text = resultText(context,{completed:true,difficulty,values:Array(81).fill(9)});
    const url = new URL(text.split('\n').at(-1));
    assert.equal(url.searchParams.get('difficulty'), difficulty);
    const original = createSudoku('same-daily-seed', difficulty), received = createSudoku('same-daily-seed', url.searchParams.get('difficulty'));
    assert.deepEqual(received.givens, original.givens); assert.deepEqual(received.solution, original.solution);
    assert.equal(restoreSudokuState({}, received).difficulty, difficulty);
  }
  assert.equal(new URL(challengeURL({...context,difficulty:'bad'})).searchParams.get('difficulty'),'medium');
});

let rootHarnessId = 0;
async function dashboardHarness({blocked = false, initial = {}, lang = 'en', search = ''} = {}) {
  const {backend, data} = memoryStore(initial), nodes = new Map();
  class Node {
    constructor() { this.children=[];this.dataset={};this.attrs={};this.hidden=false;this.textContent=''; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children=items; }
    setAttribute(name,value) { this.attrs[name]=String(value); }
    removeAttribute(name) { delete this.attrs[name]; }
    addEventListener() {}
  }
  const node = id => { if (!nodes.has(id)) nodes.set(id,new Node());return nodes.get(id); };
  const values = {
    document:{ documentElement:{lang}, hidden:false, getElementById:node, createElement:()=>new Node(), querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){} },
    window:{addEventListener(){}}, location:{search,origin:'https://riddlearabia.com'}, navigator:{},
    localStorage:blocked?{getItem(){throw new Error('Denied');}}:backend, setInterval:()=>0,
  };
  const descriptors = new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const close = () => { for (const [key,descriptor] of descriptors) { if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]; } };
  try {
    for (const [key,value] of Object.entries(values)) Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    const source=(await readFile(new URL('../puzzle-room.js',import.meta.url),'utf8')).replace(/'\.\/([^']+)'/g,(_,name)=>JSON.stringify(new URL(`../${name}`,import.meta.url).href));
    await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${rootHarnessId++}`);
    return {node,data,close};
  } catch(error) {close();throw error;}
}
test('real dashboard never awards achievements from unvalidated saved completion flags', async () => {
  const h=await dashboardHarness({initial:{[progressKey('hive','en',dayKey())]:{completed:true}}});
  try {
    assert.equal(h.node('puzzle-daily-completed').textContent,'0 / 11');
    assert.equal(h.node('puzzle-daily-streak').textContent,'0');
    assert.equal(h.data.has('ra-puzzle-activity-v1'),false);
  } finally {h.close();}
});
test('real dashboard exposes page-only storage warning even while the game stage is hidden', async () => {
  const h=await dashboardHarness({blocked:true});
  try {
    assert.equal(h.node('puzzle-stage').hidden,true);
    assert.match(h.node('puzzle-daily-note').textContent,/only while this page stays open/);
    assert.equal(h.node('puzzle-daily-note').attrs.role,'status');
  } finally {h.close();}
});

test('real bilingual game and bonus cards retain sixteen exclusive responsive illustrations', async () => {
  const images = node => [
    ...(node.attrs['data-illustration'] ? [node.attrs] : []),
    ...node.children.flatMap(images),
  ];
  for (const lang of ['en', 'ar']) {
    const assigned = [];
    for (const [search, root, count] of [['', 'puzzle-cards', 13], ['?game=bonus', 'puzzle-mount', 3]]) {
      const h = await dashboardHarness({lang, search});
      try {
        const rendered = images(h.node(root));
        assert.equal(rendered.length, count);
        for (const art of rendered) {
          assert.equal(art.loading, 'lazy');
          assert.equal(art.alt, '');
          assert.equal(art.width, '960');
          assert.equal(art.height, '640');
          assert.match(art.srcset, /480w, .*960w$/u);
          assigned.push(art['data-illustration']);
        }
      } finally {h.close();}
    }
    assert.equal(new Set(assigned).size, 16, `${lang}: bonus variants must not reuse main game pictures`);
  }
});
