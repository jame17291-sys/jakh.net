import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dayKey, storageKey, createProgressStore} from '../puzzle-catalog.js';

test('blocked storage preserves page-local progress and online seats between game mounts',()=>{
 let failures=0;
 const store=createProgressStore(()=>{throw new Error('Storage denied');},()=>failures++);
 assert.equal(store.read('word'),null);
 store.save('word',{guesses:['RIVER']});
 store.save('duel',{session:{code:'ABCD2345',token:'private-seat'}});
 assert.deepEqual(store.read('word'),{guesses:['RIVER']});
 assert.deepEqual(store.read('duel'),{session:{code:'ABCD2345',token:'private-seat'}});
 assert.equal(failures,3);
 const anotherPage=createProgressStore(()=>{throw new Error('Storage denied');});
 assert.equal(anotherPage.read('duel'),null,'memory does not imply persistence across pages');
});
test('failed writes and deletions never restore stale progress after reset',()=>{
 const backend={getItem:()=>JSON.stringify({guesses:['OLD']}),setItem:()=>{throw new Error('Quota');},removeItem:()=>{throw new Error('Denied');}};
 const store=createProgressStore(()=>backend);
 assert.deepEqual(store.read('word'),{guesses:['OLD']});
 store.save('word',{guesses:['FRESH']});
 assert.deepEqual(store.read('word'),{guesses:['FRESH']});
 store.reset('word');
 assert.equal(store.read('word'),null,'reset tombstone takes precedence over stale browser data');
 store.save('word',{guesses:[]});
 assert.deepEqual(store.read('word'),{guesses:[]});
});
test('progress snapshots are isolated and successful persistence survives a new page',()=>{
 const data=new Map(),backend={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const store=createProgressStore(()=>backend),state={values:[1,2]};
 store.save('sudoku',state);state.values.push(3);
 const restored=store.read('sudoku');restored.values.push(4);
 assert.deepEqual(store.read('sudoku'),{values:[1,2]});
 assert.deepEqual(createProgressStore(()=>backend).read('sudoku'),{values:[1,2]});
 store.reset('sudoku');assert.equal(createProgressStore(()=>backend).read('sudoku'),null);
 data.set('broken','{invalid');assert.equal(store.read('broken'),null);
});

test('Dubai rollover changes solo puzzle date exactly at local midnight',()=>{
 assert.equal(dayKey(new Date('2026-09-29T19:59:59Z')),'2026-09-29');
 assert.equal(dayKey(new Date('2026-09-29T20:00:00Z')),'2026-09-30');
 assert.equal(dayKey(new Date('2026-12-31T20:00:00Z')),'2027-01-01');
});
test('solo progress is isolated while online seats survive language and date changes',()=>{
 assert.notEqual(storageKey('word','ar','2026-09-29'),storageKey('word','en','2026-09-29'));
 assert.notEqual(storageKey('word','en','2026-09-29'),storageKey('word','en','2026-09-30'));
 assert.notEqual(storageKey('word','en','2026-09-29','clue'),storageKey('word','en','2026-09-29'));
 assert.equal(storageKey('duel','ar','2026-09-29'),storageKey('duel','en','2026-09-30'));
});
test('deployed puzzle graph pins every lazy engine, stylesheet and word bank',async()=>{
 const read=p=>readFile(new URL(`../site-worker/dist/${p}`,import.meta.url),'utf8');
 const manifest=JSON.parse(await readFile(new URL('../site-worker/generated/site-manifest.json',import.meta.url),'utf8'));
 const entry=await read(manifest.fingerprints['/puzzle-room.js'].slice(1));
 for(const name of ['puzzle-catalog.js','puzzle-words.js','puzzle-logic.js','puzzle-crossword.js','puzzle-duel.js','puzzle-words.css','puzzle-logic.css','puzzle-duel.css']) {
  assert.ok(entry.includes(manifest.fingerprints[`/${name}`]),`${name} must be pinned`);
  assert.ok(manifest.files[manifest.fingerprints[`/${name}`]],`${name} must exist`);
 }
 const words=await read(manifest.fingerprints['/puzzle-words.js'].slice(1));
 assert.ok(words.includes(manifest.fingerprints['/puzzle-word-data.js']));
 for(const file of ['play.html','ar/play/index.html']){const html=await read(file);assert.ok(html.includes(manifest.fingerprints['/puzzle-room.js']));assert.ok(html.includes(manifest.fingerprints['/puzzle-room.css']));}
});
