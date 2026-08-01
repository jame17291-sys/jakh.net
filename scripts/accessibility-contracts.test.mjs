import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const featureModule = fs.readFileSync(path.join(root, 'search-leaderboard.js'), 'utf8');
const sharedCss = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const featureCss = fs.readFileSync(path.join(root, 'search-leaderboard.css'), 'utf8');
const css = [
  sharedCss,
  featureCss,
].join('\n');
const interactiveSource = `${app}\n${featureModule}`;
const privacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
const privacyCss = fs.readFileSync(path.join(root, 'privacy.css'), 'utf8');
const adminCss = fs.readFileSync(path.join(root, 'admin.css'), 'utf8');

function gameSource(name) {
  return fs.readFileSync(path.join(root, `${name}.html`), 'utf8');
}

function colorToken(name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'iu'));
  assert.ok(match, `missing --${name} color token`);
  return match[1];
}

function colorTokenFrom(source, name) {
  const match = source.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'iu'));
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
    assert.match(interactiveSource, new RegExp(`key: '${key}'`, 'u'));
  }
  assert.match(interactiveSource, /releaseFocus\(modal, \{ restore: true \}\)/u);
  assert.match(interactiveSource, /releaseFocus\(overlay, \{ restore: true \}\)/u);
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

test('shared CSS does not reference undeclared design tokens', () => {
  const declarations = new Set([...css.matchAll(/--([\w-]+)\s*:/gu)].map(match => match[1]));
  const references = new Set([...css.matchAll(/var\(\s*--([\w-]+)/gu)].map(match => match[1]));
  const runtimeTokens = new Set(['dx', 'dy', 'rot', 'section-accent', 'section-gradient']);
  const undefinedTokens = [...references]
    .filter(name => !declarations.has(name) && !runtimeTokens.has(name))
    .sort();
  assert.deepEqual(undefinedTokens, []);
  for (const retiredName of ['surface', 'accent-strong', 'warn']) {
    assert.doesNotMatch(sharedCss, new RegExp(`var\\(\\s*--${retiredName}\\b`, 'u'));
  }
});

test('completed daily challenge remains fully opaque with contrast-safe completion styling', () => {
  assert.match(sharedCss, /\.daily-done\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--easy\)/su);
  assert.doesNotMatch(sharedCss, /\.daily-done\s*\{[^}]*opacity\s*:/su);
  assert.match(sharedCss, /\.daily-done-badge\s*\{[^}]*color:\s*var\(--easy\)/su);
  assert.match(sharedCss, /\.daily-done-badge\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--easy\)[^;]*var\(--panel\)/su);
});

test('privacy focus indicators use a solid contrast-safe token and external stylesheet', () => {
  const focus = colorTokenFrom(privacyCss, 'privacy-focus');
  for (const surfaceName of ['privacy-surface', 'privacy-soft', 'privacy-mint', 'privacy-blue', 'privacy-danger-soft']) {
    assert.ok(contrast(focus, colorTokenFrom(privacyCss, surfaceName)) >= 3, `${surfaceName} focus contrast`);
  }
  assert.match(privacyCss, /outline:\s*3px solid var\(--privacy-focus\)/u);
  assert.doesNotMatch(privacyCss, /outline:[^;]*rgba\(/u);
  assert.match(privacy, /href="\/privacy\.css\?v=\d+"/u);
  assert.doesNotMatch(privacy, /<style\b/iu);
  assert.doesNotMatch(privacy, /\sstyle="/iu);
});

test('Arabic administration uses an Arabic font stack without Latin tracking or uppercase transforms', () => {
  assert.match(adminCss, /html\[lang="ar"\]\s*\{[^}]*font-family:\s*"Noto Sans Arabic"/su);
  assert.match(adminCss, /html\[lang="ar"\]\s*:where\([\s\S]*?\.eyebrow[\s\S]*?\)\s*\{[^}]*letter-spacing:\s*normal[^}]*text-transform:\s*none/su);
});

test('permanent-deletion account fields retain explicit labels and autocomplete', () => {
  assert.match(privacy, /<label for="deleteUsername">/u);
  assert.match(privacy, /id="deleteUsername"[^>]*autocomplete="username"/u);
  assert.match(privacy, /<label for="deletePassword">/u);
  assert.match(privacy, /id="deletePassword"[^>]*autocomplete="current-password"/u);
});

test('interactive chess and Reversi grids own semantic rows and cells', () => {
  const chess = gameSource('chess');
  const reversi = gameSource('reversi');

  assert.match(chess, /id="chessBoard" role="grid" aria-rowcount="8" aria-colcount="8"/u);
  assert.match(chess, /row\.setAttribute\('role', 'row'\)[\s\S]*row\.appendChild\(sq\)[\s\S]*boardEl\.appendChild\(row\)/u);
  assert.match(chess, /id="capturedByWhite" role="group"/u);
  assert.match(chess, /id="capturedByBlack" role="group"/u);

  assert.match(reversi, /id="rvBoard" role="grid" aria-rowcount="8" aria-colcount="8"/u);
  assert.match(reversi, /row\.setAttribute\('role', 'row'\)[\s\S]*row\.appendChild\(cell\)[\s\S]*boardEl\.appendChild\(row\)/u);
});

test('Mastermind and Codenames expose complete grid ownership', () => {
  const mastermind = gameSource('mastermind');
  const codenames = gameSource('codenames');

  assert.match(mastermind, /id="mmBoard" role="grid" aria-rowcount="10" aria-colcount="6"/u);
  assert.match(mastermind, /numEl\.setAttribute\('role', 'rowheader'\)/u);
  assert.match(mastermind, /peg\.setAttribute\('role', 'gridcell'\)/u);
  assert.match(mastermind, /feedbackEl\.setAttribute\('role', 'gridcell'\)/u);

  assert.match(codenames, /id="cnGrid" role="grid" aria-rowcount="5" aria-colcount="5"/u);
  assert.match(codenames, /row\.setAttribute\('role', 'row'\)[\s\S]*row\.appendChild\(card\)/u);
  assert.match(codenames, /grid\.querySelectorAll\('\.cn-card'\)/u);
});

test('map-like game surfaces use accurate group and button semantics', () => {
  const catan = gameSource('catan');
  const diplomacy = gameSource('diplomacy');

  assert.match(catan, /id="catan-board" role="group"/u);
  assert.match(catan, /cell\.setAttribute\('role', 'button'\)/u);
  assert.doesNotMatch(catan, /id="catan-board" role="grid"/u);

  assert.match(diplomacy, /id="dip-map" role="group"/u);
  assert.match(diplomacy, /card\.setAttribute\('role', 'button'\)/u);
  assert.match(diplomacy, /card\.setAttribute\('aria-disabled', String\(!canInteract\)\)/u);
  assert.doesNotMatch(diplomacy, /cap\.textContent\s*=\s*terr\.capital/u);
});

test('game-over dialogs leave the accessibility tree while hidden', () => {
  for (const name of ['codenames', 'hanabi']) {
    const source = gameSource(name);
    assert.match(source, new RegExp(`id="${name === 'codenames' ? 'cn' : 'hb'}Modal" hidden`, 'u'));
    assert.match(source, /modal\.hidden = false[\s\S]*modal\.classList\.add\('visible'\)/u);
    assert.match(source, /modal\.classList\.remove\('visible'\)[\s\S]*modal\.hidden = true/u);
  }
});

test('game-specific small text uses contrast-safe foregrounds', () => {
  const backgammon = gameSource('backgammon');
  const codenames = gameSource('codenames');
  const hanabi = gameSource('hanabi');

  assert.match(backgammon, /\.bg-point-num\s*\{[^}]*color:\s*#162638/su);
  assert.match(backgammon, /\.bg-bar-label\s*\{[^}]*color:\s*#162638/su);
  assert.match(backgammon, /\.bg-mid-label\s*\{[^}]*color:\s*#162638/su);
  assert.match(codenames, /\.cn-turn-badge\.human-turn\s*\{[^}]*color:\s*#7f2718/su);
  assert.match(codenames, /\.cn-turn-badge\.ai-turn\s*\{[^}]*color:\s*#185581/su);
  assert.match(hanabi, /\.hb-btn-gilt\s*\{[^}]*color:\s*#785000/su);
});
