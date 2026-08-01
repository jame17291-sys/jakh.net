import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  ASSET_BUDGETS,
  INITIAL_ROUTE_BUDGET,
  auditPerformanceBudgets,
  budgetFailures,
} from './validate-performance-budgets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('current initial and lazy feature assets stay inside deterministic budgets', () => {
  const report = auditPerformanceBudgets(root);
  assert.deepEqual(report.failures, []);
  assert.deepEqual(INITIAL_ROUTE_BUDGET.assets, ['app.js', 'styles.css']);
  assert.ok(Object.hasOwn(ASSET_BUDGETS, 'data/search-index.en.json'));
  assert.ok(Object.hasOwn(ASSET_BUDGETS, 'data/search-index.ar.json'));
  assert.ok(Object.hasOwn(ASSET_BUDGETS, 'search-leaderboard.js'));
  assert.ok(Object.hasOwn(ASSET_BUDGETS, 'search-leaderboard.css'));
});

test('budget comparison reports every exceeded encoding', () => {
  assert.deepEqual(
    budgetFailures(
      'fixture.js',
      { raw: 101, gzip: 51, brotli: 40 },
      { raw: 100, gzip: 50, brotli: 40 },
    ),
    [
      'fixture.js raw is 101 bytes; budget is 100 bytes',
      'fixture.js gzip is 51 bytes; budget is 50 bytes',
    ],
  );
});

test('Battle implementation and styles are absent from the initial bundles', () => {
  const app = read('app.js');
  const sharedStyles = read('styles.css');
  const battleModule = read('battle-mode.js');
  const battleStyles = read('battle-mode.css');

  assert.doesNotMatch(app, /\bconst battleState\s*=/u);
  assert.doesNotMatch(app, /\bfunction handleBattleMessage\b/u);
  assert.doesNotMatch(sharedStyles, /\.battle-overlay\b/u);
  assert.match(app, /import\(BATTLE_MODULE_PATH\)/u);
  assert.match(app, /openBattleModal\('', 'join', code\)/u);
  assert.match(battleModule, /export function createBattleMode\(dependencies\)/u);
  assert.match(battleModule, /new WebSocket\(getBattleWsUrl\(code\)\)/u);
  assert.match(battleStyles, /\.battle-overlay\b/u);
  assert.match(battleStyles, /@keyframes battle-pulse/u);
  new vm.Script(app, { filename: 'app.js' });
});

test('search, leaderboard, and server-checked implementation stay outside initial bundles', () => {
  const app = read('app.js');
  const sharedStyles = read('styles.css');
  const featureModule = read('search-leaderboard.js');
  const featureStyles = read('search-leaderboard.css');

  assert.doesNotMatch(app, /function rankGlobalSearch\b/u);
  assert.doesNotMatch(app, /function renderVerifiedChallenge\b/u);
  assert.doesNotMatch(sharedStyles, /\.global-search-overlay\b/u);
  assert.doesNotMatch(sharedStyles, /\.verified-leaderboard-card\b/u);
  assert.match(app, /import\(SEARCH_LEADERBOARD_MODULE_PATH\)/u);
  assert.match(featureModule, /export function createSearchLeaderboard\(dependencies\)/u);
  assert.match(featureModule, /export function rankGlobalSearch\(/u);
  assert.match(featureModule, /\/scores\/server-checked\/challenge/u);
  assert.match(featureStyles, /\.global-search-overlay\b/u);
  assert.match(featureStyles, /\.verified-leaderboard-card\b/u);
  assert.match(app, /async function hydrateCloudCapabilities\(\)/u);
  assert.match(app, /await checkCloudSession\(\)/u);
  assert.doesNotMatch(featureModule, /\bcheckCloudSession\b|\bsessionInitialized\b/u);
});

test('service worker runtime-caches lazy assets without adding them to the required core', () => {
  const serviceWorker = read('sw.js');
  const coreStart = serviceWorker.indexOf('const REQUIRED_CORE_ASSETS = [');
  const coreEnd = serviceWorker.indexOf('\n];', coreStart);
  assert.ok(coreStart >= 0 && coreEnd > coreStart);
  const coreAssets = serviceWorker.slice(coreStart, coreEnd);

  assert.doesNotMatch(coreAssets, /battle-mode\.(?:js|css)/u);
  assert.doesNotMatch(coreAssets, /search-leaderboard\.(?:js|css)/u);
  assert.ok(
    serviceWorker.includes("url.pathname.match(/\\.(js|css|webmanifest)$/u)"),
    'service worker must runtime-cache lazy JavaScript and CSS',
  );
});

test('Battle loading, active, and close states share the application focus lifecycle', () => {
  const app = read('app.js');
  const battleModule = read('battle-mode.js');

  assert.match(app, /function activateBattleFocus\(initialFocus = '#battleExitBtn'\)/u);
  assert.match(app, /key: 'battle'/u);
  assert.match(app, /activateBattleFocus\('#battleLoadExitBtn'\)/u);
  assert.match(app, /releaseFocus\(overlay, \{ restore: true \}\)/u);
  assert.match(app, /activateFocus: activateBattleFocus/u);
  assert.match(app, /deactivateFocus: deactivateBattleFocus/u);
  assert.match(battleModule, /activateFocus\(battleInitialFocus\(\)\)/u);
  assert.match(battleModule, /deactivateFocus\(\)/u);
  assert.match(battleModule, /return battleState\.tab === 'join' \? '#battleCodeInput' : '#battleNameInput'/u);
  assert.doesNotMatch(battleModule, /battleState\.totalPlayers/u);
});
