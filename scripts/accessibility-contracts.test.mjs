import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');

function colorToken(name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'iu'));
  assert.ok(match, `missing --${name} color token`);
  return match[1];
}

function luminance(hex) {
  const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map(channel => (
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrast(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function mix(foreground, background, foregroundShare) {
  const channel = (hex, index) => Number.parseInt(hex.slice(index, index + 2), 16);
  const mixed = [1, 3, 5].map(index => Math.round(
    (channel(foreground, index) * foregroundShare)
    + (channel(background, index) * (1 - foregroundShare)),
  ));
  return `#${mixed.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

test('card and filter rerenders preserve a deterministic keyboard target', () => {
  assert.match(app, /function captureCardFocus\(id, preferredActions = \[\]\)/u);
  assert.match(app, /function restoreCardFocus\(request\)/u);
  assert.match(app, /updateCardEl\(id, \['flip'\]\)/u);
  assert.match(app, /updateCardElOrRefresh\(id, \['unmark'\]\)/u);
  assert.match(app, /renderSubcategoryFilters\(state\.subcategory\)/u);
  assert.match(app, /aria-pressed="\$\{state\.subcategory === chip\.key \? 'true' : 'false'\}"/u);
  assert.match(app, /aria-controls="cardGrid"/u);
});

test('shared overlays trap focus, close with Escape, and restore their opener', () => {
  assert.match(app, /const overlayFocusReturns = new Map\(\)/u);
  assert.match(app, /function describeFocusTarget\(node\)/u);
  assert.match(app, /if \(e\.key === 'Escape' && typeof onEscape === 'function'\)/u);
  for (const key of ['auth', 'leaderboard', 'global-search', 'paywall']) {
    assert.match(app, new RegExp(`key: '${key}'`, 'u'));
  }
  assert.match(app, /releaseFocus\(modal, \{ restore: true \}\)/u);
  assert.match(app, /releaseFocus\(overlay, \{ restore: true \}\)/u);
});

test('authentication modes implement the tabs pattern with roving keyboard focus', () => {
  assert.match(app, /class="auth-tabs" role="tablist"/u);
  assert.match(app, /type="button" role="tab" class="auth-tab/u);
  assert.match(app, /aria-selected="\$\{/u);
  assert.match(app, /aria-controls="authForm"/u);
  assert.match(app, /tabindex="\$\{.*\? '0' : '-1'\}"/u);
  assert.match(app, /event\.key === 'Home'/u);
  assert.match(app, /event\.key === 'End'/u);
  assert.match(app, /role="tabpanel" aria-labelledby="\$\{activeTabId\}"/u);
});

test('search focus and purple foregrounds have deterministic contrast-safe styling', () => {
  const purpleInk = colorToken('purple-ink');
  const purpleAccent = colorToken('accent-2');
  const accent = colorToken('accent');
  assert.ok(contrast(purpleInk, '#ffffff') >= 4.5, 'purple text must pass on white panels');
  assert.ok(contrast(purpleInk, '#eef5fb') >= 4.5, 'purple text must pass on soft panels');
  assert.ok(
    contrast(purpleInk, mix(purpleAccent, '#ffffff', 0.24)) >= 4.5,
    'purple text must pass on the strongest purple hover tint',
  );
  assert.ok(contrast(accent, '#ffffff') >= 3, 'focus ring must pass non-text contrast on white');
  assert.ok(contrast(accent, '#eef5fb') >= 3, 'focus ring must pass non-text contrast on soft panels');
  assert.match(css, /\.gs-result:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--accent\)/su);
  assert.doesNotMatch(css, /\.gs-result[^}]*outline:\s*none/su);
  assert.match(css, /\.gs-result-cat[^}]*color:\s*var\(--purple-ink\)/su);
  assert.match(css, /\.random-btn[^}]*color:\s*var\(--purple-ink\)/su);
});

test('permanent-deletion account fields retain explicit labels and autocomplete', () => {
  assert.match(privacy, /<label for="deleteUsername">/u);
  assert.match(privacy, /id="deleteUsername"[^>]*autocomplete="username"/u);
  assert.match(privacy, /<label for="deletePassword">/u);
  assert.match(privacy, /id="deletePassword"[^>]*autocomplete="current-password"/u);
});
