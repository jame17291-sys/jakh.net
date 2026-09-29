import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dayKey, storageKey} from '../puzzle-catalog.js';

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
