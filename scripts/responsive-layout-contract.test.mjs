import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('app.js');
const css = read('styles.css');
const privacyConsent = read('privacy-consent.js');
const collections = read('collections.html');

test('fixed mobile layers share measured offsets and keep footer content reachable', () => {
  for (const token of [
    '--jakh-bottom-nav-height',
    '--jakh-install-banner-height',
    '--jakh-install-stack-height',
    '--jakh-privacy-banner-height',
    '--jakh-fixed-content-inset',
  ]) {
    assert.match(css, new RegExp(`${token}:\\s*0px`, 'u'), `${token} needs a safe initial value`);
    assert.match(privacyConsent, new RegExp(`setProperty\\('${token}'`, 'u'), `${token} must be measured`);
  }
  assert.match(privacyConsent, /visibleHeight\(bottomNav\)/u);
  assert.match(privacyConsent, /visibleHeight\(installBanner\)/u);
  assert.match(privacyConsent, /visibleHeight\(privacyBanner\)/u);
  assert.match(css, /bottom:\s*var\(--jakh-bottom-nav-height\)/u);
  assert.match(css, /var\(--jakh-bottom-nav-height\)[\s\S]*var\(--jakh-install-stack-height\)/u);
  assert.match(css, /\.site-footer\s*\{[\s\S]*padding-bottom:[\s\S]*var\(--jakh-fixed-content-inset\)/u);
  assert.match(css, /\.modal\s*\{[^}]*z-index:\s*1100/su);
  assert.match(css, /\.header-actions\s*\{[\s\S]*z-index:\s*200/su);
});

test('question and answer cards grow to their content without nested scrolling', () => {
  assert.match(css, /\.card-inner\s*\{[^}]*display:\s*grid;[^}]*min-height:\s*inherit;/su);
  assert.match(css, /\.card-face\s*\{[^}]*grid-area:\s*1\s*\/\s*1;[^}]*min-height:\s*inherit;/su);
  assert.match(css, /\.card-face\s*\{[^}]*overflow:\s*hidden;/su);
  assert.doesNotMatch(css, /\.card-face\s*\{[^}]*overflow(?:-y)?:\s*(?:auto|scroll)/su);
});

test('consent and install prompts cannot form an unbounded overlapping wall', () => {
  assert.match(app, /document\.getElementById\('privacyConsentBanner'\)/u);
  assert.match(app, /document\.addEventListener\('jakh:consentchange'/u);
  assert.match(css, /\.privacy-consent-banner\s*\{[\s\S]*max-height:\s*min\(/u);
  assert.match(css, /\.install-banner\s*\{[^}]*max-height:\s*min\(/su);
  assert.match(css, /\.privacy-consent-banner\s*\{[\s\S]*overflow-y:\s*auto/u);
  assert.match(css, /\.install-banner\s*\{[^}]*overflow-y:\s*auto/su);
  assert.match(privacyConsent, /data-consent-action="dismiss"/u);
  assert.match(privacyConsent, /consent-banner-dismiss/u);
  assert.match(app, /aria-labelledby', 'installBannerText'/u);
});

test('Game Hub has a truthful Games destination and only links expose aria-current', () => {
  assert.match(app, /href="\/play" class="bottom-nav-tab" data-tab="games"/u);
  assert.match(app, /const isGameHub = state\.page === 'play' \|\| normalizedPath === '\/play'/u);
  assert.match(app, /isGameHub[\s\S]*\? 'games'/u);
  assert.match(app, /isActive && tab\.matches\('a'\)[\s\S]*aria-current/u);
  assert.doesNotMatch(app, /data-tab="(?:daily|profile)"[^>]*aria-current/u);
});

test('mobile brand, shared actions, and text-only social links retain usable targets', () => {
  assert.match(css, /\.brand\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px/su);
  assert.match(css, /:where\([\s\S]*\.primary-btn[\s\S]*\.social-link[\s\S]*\)\s*\{\s*min-height:\s*44px/su);
  assert.doesNotMatch(css, /\.social-link span\s*\{\s*display:\s*none/u);
  assert.match(css, /\.social-link span\s*\{\s*display:\s*inline/u);
  assert.match(collections, /class="social-link"[^>]*><span>Instagram<\/span>/u);
  assert.match(collections, /class="social-link"[^>]*><span>Facebook<\/span>/u);
});

test('short landscape removes sticky header competition and keeps compact 44px actions', () => {
  assert.match(css, /@media \(max-width: 768px\) and \(max-height: 420px\)/u);
  assert.match(css, /\.site-header\s*\{[^}]*position:\s*relative !important;[^}]*top:\s*auto !important/su);
  assert.match(css, /\.privacy-consent-banner\s*\{[^}]*max-height:\s*min\(30svh, 6rem\)/su);
  assert.match(css, /\.install-banner-close\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/su);
  assert.match(css, /\.privacy-consent-dismiss\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/su);
});
