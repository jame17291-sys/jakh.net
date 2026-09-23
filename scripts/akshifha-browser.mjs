import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { CASES } from '../akshifha-cases.js';
import { AKSHIFHA_UI } from '../akshifha-copy.js';
import { startBrowserSite } from './local-browser-site.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDir = process.env.JAKH_SCREENSHOT_DIR ? resolve(process.env.JAKH_SCREENSHOT_DIR) : null;
const firstCase = CASES.find(item => item.number === 6);
const progressKey = 'riddlearabia-akshifha-v1';
assert(firstCase, 'The homepage introduction needs case six');
assert.equal(CASES.length, 11, 'The collection includes six new and five original cases');

async function mockApi(context) {
  await context.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = {
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Accept, Content-Type',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS, POST, PATCH, DELETE',
      'Access-Control-Allow-Origin': request.headers().origin || 'https://riddlearabia.com',
      'Access-Control-Allow-Private-Network': 'true',
      Vary: 'Origin',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let body;
    if (path === '/api/health') body = {
      ok: true, schema: '9', targetSchema: '9',
      features: { registration: true, accountRecovery: true, accountDeletion: true, contentStudio: true },
    };
    else if (path === '/api/auth/session') body = { authenticated: false };
    else if (path === '/api/content/questions') body = { overrides: [] };
    else body = { error: 'Not found', code: 'NOT_FOUND' };
    return route.fulfill({ status: body.error ? 404 : 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await context.addInitScript(() => {
    localStorage.setItem('jakh-consent-v1', JSON.stringify({
      version: 2, noticeVersion: '2026-08-01', analytics: false,
      updatedAt: new Date(0).toISOString(), source: 'akshifha-browser-regression',
    }));
  });
}

async function noHorizontalOverflow(page, label) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    overflowing: [...document.querySelectorAll('body *')]
      .map(element => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName, id: element.id, className: element.className, left: rect.left, right: rect.right };
      })
      .filter(({ left, right }) => left < -1 || right > document.documentElement.clientWidth + 1)
      .slice(0, 12),
  }));
  assert(widths.document <= widths.viewport + 1 && widths.body <= widths.viewport + 1,
    `${label}: horizontal overflow ${JSON.stringify(widths)}`);
}

async function screenshot(page, name, fullPage = false) {
  if (!screenshotDir) return;
  await page.screenshot({ path: resolve(screenshotDir, `${name}.png`), fullPage });
}

async function visibleText(page, selector, expected) {
  await page.locator(selector).waitFor({ state: 'visible' });
  assert.equal(await page.locator(selector).textContent(), expected);
}

async function runJourney(browser, server, { language, width, height }) {
  const label = `${language}-${width}`;
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(30_000);
  await mockApi(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const location = message.location();
    errors.push(`${message.text()} (${location.url || 'unknown source'})`);
  });
  try {
    const home = language === 'ar' ? '/ar/' : '/';
    await page.goto(`${server.baseUrl}${home}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.site-utilities .language-route-link').waitFor();
    const start = page.locator(`a[data-i18n="homeFeatureCta"][href*="case=${firstCase.id}"]`);
    await start.waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), language);
    assert.equal(await page.locator('html').getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr');
    await noHorizontalOverflow(page, `${label} home`);
    await screenshot(page, `${label}-home`);
    await start.click();
    await page.locator('#ak-game').waitFor({ state: 'visible' });
    assert.equal(new URL(page.url()).searchParams.get('case'), firstCase.id);
    assert.equal(new URL(page.url()).searchParams.get('mode'), 'practice');
    await visibleText(page, '#ak-case-title', firstCase.title[language]);
    assert.equal(await page.locator('.ak-case-entry').count(), CASES.length);
    assert.equal(await page.locator('#ak-continue').isHidden(), true, 'Empty casebooks have no continuation');
    assert.equal(await page.locator('#ak-check').isDisabled(), true);
    await noHorizontalOverflow(page, `${label} case`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await screenshot(page, `${label}-case`, true);

    // Exactly two clues and a conclusion are needed. Choosing two clues also
    // disables the remaining clues until one is deselected.
    await page.locator(`input[name="evidence"][value="${firstCase.solution.evidenceIds[0]}"]`).check();
    assert.equal(await page.locator('#ak-check').isDisabled(), true);
    await page.locator(`input[name="evidence"][value="${firstCase.solution.evidenceIds[1]}"]`).check();
    const unusedClue = firstCase.evidence.find(item => !firstCase.solution.evidenceIds.includes(item.id));
    assert.equal(await page.locator(`input[name="evidence"][value="${unusedClue.id}"]`).isDisabled(), true);
    await page.locator(`input[name="conclusion"][value="${firstCase.solution.optionId}"]`).check();
    assert.equal(await page.locator('#ak-check').isEnabled(), true);
    await page.locator('#ak-check').click();
    await visibleText(page, '#ak-result-title', AKSHIFHA_UI[language].akSolved);
    assert.equal(await page.locator('#ak-proof li').count(), 2);
    const solved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), progressKey);
    assert.deepEqual(solved.cases[firstCase.id], { completed: true, attempts: 1, hintsUsed: 0, revealed: false });
    assert.equal(await page.locator('#ak-continue').isVisible(), true, 'Partial progress offers continuation');
    await screenshot(page, `${label}-solved`, true);

    await page.locator('#ak-next').click();
    await page.locator('#ak-result').waitFor({ state: 'hidden' });
    const secondId = new URL(page.url()).searchParams.get('case');
    assert.notEqual(secondId, firstCase.id, 'Another-case action opens another case');
    const secondCase = CASES.find(item => item.id === secondId);
    assert(secondCase);
    await visibleText(page, '#ak-case-title', secondCase.title[language]);
    assert.equal(await page.locator('#ak-check').isDisabled(), true);
    assert.equal(await page.locator('input[name="evidence"]:checked').count(), 0);
    await page.locator('#ak-reveal').click();
    await page.locator('#ak-reveal-confirm').waitFor({ state: 'visible' });
    await page.locator('#ak-reveal-no').click();
    await page.locator('#ak-reveal-confirm').waitFor({ state: 'hidden' });
    await page.locator('#ak-reveal').click();
    await page.locator('#ak-reveal-yes').click();
    await visibleText(page, '#ak-result-title', AKSHIFHA_UI[language].akRevealed);
    const revealed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), progressKey);
    assert.equal(revealed.cases[secondId].revealed, true);
    assert.equal(revealed.cases[secondId].attempts, 0);
    assert.equal(Object.keys(revealed.cases).length, 2);
    await noHorizontalOverflow(page, `${label} revealed result`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#ak-game').waitFor({ state: 'visible' });
    await visibleText(page, `[data-case-id="${firstCase.id}"] .ak-case-entry-status`, AKSHIFHA_UI[language].akStatusSolved);
    await visibleText(page, `[data-case-id="${secondId}"] .ak-case-entry-status`, AKSHIFHA_UI[language].akStatusRevealed);
    assert.equal(new URL(page.url()).searchParams.get('case'), secondId);
    const otherLanguage = language === 'en' ? 'ar' : 'en';
    await page.locator(`.site-utilities .language-route-link[hreflang="${otherLanguage}"]`).click();
    await page.waitForURL(url => url.pathname === (otherLanguage === 'ar' ? '/ar/games/akshifha/' : '/akshifha'));
    await visibleText(page, '#ak-case-title', secondCase.title[otherLanguage]);
    assert.equal(new URL(page.url()).searchParams.get('case'), secondId, 'Changing language retains the case');
    assert.equal(await page.locator('html').getAttribute('dir'), otherLanguage === 'ar' ? 'rtl' : 'ltr');
    await visibleText(page, `[data-case-id="${firstCase.id}"] .ak-case-entry-status`, AKSHIFHA_UI[otherLanguage].akStatusSolved);
    await noHorizontalOverflow(page, `${label} switched language`);

    // A returning pilot player may follow a friend's link to an old case.
    // Saved progress must not silently replace that explicit challenge.
    const originalCases = CASES.filter(item => item.number <= 5);
    await page.evaluate(({ key, ids }) => {
      const cases = Object.fromEntries(ids.map(id => [id, {
        completed: true, attempts: 1, hintsUsed: 0, revealed: false,
      }]));
      localStorage.setItem(key, JSON.stringify({ version: 1, cases }));
    }, { key: progressKey, ids: originalCases.map(item => item.id) });
    const sharedCase = originalCases[0];
    const gamePath = otherLanguage === 'ar' ? '/ar/games/akshifha/' : '/akshifha';
    await page.goto(`${server.baseUrl}${gamePath}?case=${sharedCase.id}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#ak-game').waitFor({ state: 'visible' });
    await visibleText(page, '#ak-case-title', sharedCase.title[otherLanguage]);
    assert.equal(new URL(page.url()).searchParams.get('case'), sharedCase.id, 'Saved progress keeps explicit shared challenges');
    assert.equal(await page.locator('#ak-continue').isVisible(), true);
    await page.locator('#ak-continue').click();
    await visibleText(page, '#ak-case-title', firstCase.title[otherLanguage]);
    assert.equal(new URL(page.url()).searchParams.get('case'), firstCase.id, 'Continuation skips the five completed original cases');
    assert.equal(new URL(page.url()).searchParams.get('mode'), 'practice');

    await page.evaluate(({ key, ids }) => {
      const cases = Object.fromEntries(ids.map(id => [id, {
        completed: true, attempts: 1, hintsUsed: 0, revealed: false,
      }]));
      localStorage.setItem(key, JSON.stringify({ version: 1, cases }));
    }, { key: progressKey, ids: CASES.map(item => item.id) });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#ak-game').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ak-continue').isHidden(), true, 'Complete casebooks have no continuation');
    await page.goto(`${server.baseUrl}${gamePath}#ak-casebook`, { waitUntil: 'domcontentloaded' });
    await page.locator('#ak-game').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.activeElement?.id === 'ak-casebook-title');
    assert.equal(new URL(page.url()).hash, '#ak-casebook', 'Casebook entry retains its fragment through mount');
    const casebookTop = await page.locator('#ak-casebook').evaluate(element => element.getBoundingClientRect().top);
    assert(casebookTop >= 0 && casebookTop < height, 'Casebook is scrolled into the viewport after it becomes visible');
    assert.equal(await page.locator('.primary-navigation a[data-nav="games"]').isVisible(), true, 'Shared Games navigation remains available on mobile');
    await page.locator(`[data-case-id="${firstCase.id}"]`).click();
    assert.equal(new URL(page.url()).hash, '', 'Choosing a case clears the old casebook destination');
    await visibleText(page, '#ak-case-title', firstCase.title[otherLanguage]);
    assert.deepEqual(errors, [], `${label}: browser console or page errors`);
    console.log(`PASS ${label}: home, solve, next, reveal, saved progress, language, continuation, and overflow`);
    return { language, width, height, passed: true };
  } finally { await context.close(); }
}

if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const server = await startBrowserSite({
  siteRoot: resolve(process.env.JAKH_SITE_ROOT || root),
  manifestPath: process.env.JAKH_SITE_MANIFEST ? resolve(process.env.JAKH_SITE_MANIFEST) : null,
});
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.JAKH_BROWSER_EXECUTABLE || undefined });
  const results = [];
  for (const profile of [
    { language: 'en', width: 1440, height: 1000 },
    { language: 'ar', width: 1440, height: 1000 },
    { language: 'en', width: 320, height: 740 },
    { language: 'ar', width: 320, height: 740 },
  ]) results.push(await runJourney(browser, server, profile));
  if (screenshotDir) await writeFile(resolve(screenshotDir, 'results.json'), `${JSON.stringify({ browser: 'chromium', version: browser.version(), results }, null, 2)}\n`);
} finally {
  if (browser) await browser.close();
  await server.close();
}
