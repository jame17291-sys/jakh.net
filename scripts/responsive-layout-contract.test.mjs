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
const navigation = read('site-navigation.js');
const navigationMarkup = read('scripts/site-navigation-markup.mjs');

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
  assert.match(css, /body\[data-page\]\s*\{[^}]*padding-bottom:\s*0(?:\s*!important)?\s*;/u, "app pages must not create trailing document space after the footer");
  assert.match(css, /\.site-footer\s*\{[\s\S]*margin-bottom:\s*0;[\s\S]*max\(62px,\s*var\(--jakh-fixed-content-inset\)\)/u, "fixed-control clearance must remain inside the footer");
  assert.match(css, /\.modal\s*\{[^}]*z-index:\s*1100/su);
  assert.match(css, /\.primary-navigation a, \.site-utilities a\s*\{[^}]*min-height:\s*44px/su);
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

test('one navigation exposes real Games and Daily destinations and only current links are selected', () => {
  assert.match(navigationMarkup, /\['games', ar \? '\/ar\/play\/' : '\/play'/u);
  assert.match(navigationMarkup, /\['daily', ar \? '\/ar\/daily\/' : '\/daily'/u);
  assert.match(navigation, /querySelectorAll\('\.primary-navigation \[data-nav\]'\)/u);
  assert.match(navigation, /link\.dataset\.nav === active[\s\S]*setAttribute\('aria-current', 'page'\)[\s\S]*else link\.removeAttribute\('aria-current'\)/u);
  assert.doesNotMatch(app, /function injectBottomNav|function injectHeaderHamburger|class="bottom-nav-tab"/u);
  assert.doesNotMatch(navigationMarkup, /<button[^>]*aria-current|data-site-profile[^>]*aria-current/u);
});

test('mobile brand, shared actions, and fresh collection links retain usable targets', () => {
  assert.match(css, /\.brand\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px/su);
  assert.match(css, /:where\([\s\S]*\.primary-btn[\s\S]*\.social-link[\s\S]*\)\s*\{\s*min-height:\s*44px/su);
  assert.doesNotMatch(css, /\.social-link span\s*\{\s*display:\s*none/u);
  assert.match(css, /\.social-link span\s*\{\s*display:\s*inline/u);
  assert.match(collections, /href="\/play"/u);
  assert.match(collections, /href="\/privacy"/u);
  assert.doesNotMatch(collections, /@jakh|jakh\.net|JAKH Riddles/iu);
});

test('short landscape removes sticky header competition and keeps compact 44px actions', () => {
  assert.match(css, /@media \(max-width: 768px\) and \(max-height: 420px\)/u);
  assert.match(css, /\.site-header\s*\{[^}]*position:\s*relative !important;[^}]*top:\s*auto !important/su);
  assert.match(css, /\.privacy-consent-banner\s*\{[^}]*max-height:\s*min\(30svh, 6rem\)/su);
  assert.match(css, /\.install-banner-close\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/su);
  assert.match(css, /\.privacy-consent-dismiss\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/su);
});

test('shared navigation and activity layouts reflow at phone widths with visible focus', () => {
  assert.match(css, /\.unified-header\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto/su);
  assert.match(css, /@media \(max-width: 1024px\)[\s\S]*\.unified-header \.primary-navigation\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*grid-row:\s*2/su);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*\.activity-grid, \.home-next-grid, \.game-directory\s*\{[^}]*grid-template-columns:\s*1fr/su);
  assert.match(css, /\.library-subnav, \.library-tools\s*\{[^}]*flex-wrap:\s*wrap/su);
  assert.match(css, /\.ml-cluster-bar\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap/su);
  assert.match(css, /:where\(a, button, summary, input, select, textarea\):focus-visible\s*\{[^}]*outline:\s*3px solid var\(--accent\)/su);
  assert.match(css, /\.more-play-modes summary, \.question-filters summary\s*\{[^}]*min-height:\s*44px/su);
  assert.match(css, /#cardGrid\s*\{[^}]*scroll-margin-top:/su);
});
