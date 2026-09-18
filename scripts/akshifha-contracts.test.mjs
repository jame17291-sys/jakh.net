import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import { AKSHIFHA_UI } from '../akshifha-copy.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const english = read('akshifha.html');
const arabic = read('ar/games/akshifha/index.html');
const runtime = read('akshifha.js');

test('Akshifha has complete bilingual UI copy and localized static shells', () => {
  assert.deepEqual(Object.keys(AKSHIFHA_UI.ar).sort(), Object.keys(AKSHIFHA_UI.en).sort());
  for (const key of Object.keys(AKSHIFHA_UI.en)) {
    assert.ok(AKSHIFHA_UI.en[key].trim(), key);
    assert.match(AKSHIFHA_UI.ar[key], /[\u0621-\u064a]/u, key);
  }
  for (const [language, html] of [['en', english], ['ar', arabic]]) {
    assert.match(html, new RegExp(`<html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}"`, 'u'));
    for (const match of html.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/gu)) {
      assert.equal(typeof AKSHIFHA_UI[language][match[1]], 'string', match[1]);
    }
    for (const match of html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</gu)) {
      assert.equal(match[2], AKSHIFHA_UI[language][match[1]], `${language}:${match[1]}`);
    }
  }
  assert.match(arabic, /href="\/ar\/play\/"/u);
  assert.match(arabic, /href="\/ar\/privacy\/"/u);
  assert.match(arabic, /href="\/ar\/collections\/"/u);
});

test('game controls have stable IDs and native keyboard semantics', () => {
  const ids = [...english.matchAll(/\bid="([^"]+)"/gu)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of runtime.matchAll(/byId\('([^']+)'\)/gu)) assert.ok(ids.includes(match[1]), match[1]);
  assert.match(english, /<form id="ak-answer-form"/u);
  assert.equal((english.match(/<fieldset\b/gu) || []).length, 2);
  assert.equal((english.match(/<legend\b/gu) || []).length, 2);
  assert.match(runtime, /input\.type = 'checkbox'/u);
  assert.match(runtime, /input\.type = 'radio'/u);
  assert.match(english, /id="ak-result-title" tabindex="-1"/u);
  assert.match(english, /id="ak-feedback"[^>]*role="status"/u);
  assert.match(english, /<label for="ak-share-text"/u);
  assert.match(read('akshifha.css'), /prefers-reduced-motion: reduce/u);
  assert.match(read('akshifha.css'), /min-height: 44px/u);
});

test('standalone game keeps guest play isolated and its payload bounded', () => {
  assert.doesNotMatch(english, /src="\/?(?:app|battle-mode|game-i18n)\.js/u);
  assert.doesNotMatch(runtime, /innerHTML|insertAdjacentHTML|\beval\s*\(|fetch\s*\(|new WebSocket/u);
  const assets = ['akshifha.js', 'akshifha-engine.js', 'akshifha-cases.js', 'akshifha-copy.js', 'akshifha-study.js', 'akshifha.css'];
  const gzipBytes = assets.reduce((sum, file) => sum + gzipSync(read(file), { level: 9 }).length, 0);
  assert.ok(gzipBytes < 36_000, `Akshifha-only scripts and CSS exceed 36 KB gzip: ${gzipBytes}`);
  assert.match(runtime, /allowed: \(\) => window\.JakhPrivacy\?\.analyticsAllowed\?\.\(\) === true/u);
  assert.doesNotMatch(runtime, /localStorage\.clear\(/u);
});
