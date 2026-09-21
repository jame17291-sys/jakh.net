import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { startBrowserSite } from './local-browser-site.mjs';

const engines = { chromium, firefox, webkit };
const engineName = String(process.env.JAKH_BROWSER_ENGINE || 'chromium').toLowerCase();
const engine = engines[engineName];
if (!engine) throw new Error(`Unsupported JAKH_BROWSER_ENGINE ${engineName}`);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = resolve(process.env.JAKH_SITE_ROOT || root);
const manifestPath = process.env.JAKH_SITE_MANIFEST ? resolve(process.env.JAKH_SITE_MANIFEST) : null;
const host = engineName === 'webkit' ? 'localhost' : '127.0.0.1';

const server = await startBrowserSite({ siteRoot, manifestPath, loopbackHost: host });
const browser = await engine.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${server.baseUrl}/learning`, { waitUntil: engineName === 'webkit' ? 'commit' : 'domcontentloaded' });
  await page.waitForSelector('.learning-audience-grid .learning-card');
  assert.equal(await page.locator('.learning-audience-grid .learning-card').count(), 3);
  assert.match(await page.locator('#learningApp').innerText(), /University Essentials/u);

  await page.goto(`${server.baseUrl}/learning?audience=friends`, { waitUntil: engineName === 'webkit' ? 'commit' : 'domcontentloaded' });
  await page.waitForSelector('.learning-unit-card');
  assert.equal(await page.locator('.learning-unit-card').count(), 6);
  assert.match(await page.locator('#learningApp').innerText(), /Challenge collections/u);

  await page.goto(`${server.baseUrl}/learning?collection=social-logic-sprints`, { waitUntil: engineName === 'webkit' ? 'commit' : 'domcontentloaded' });
  await page.waitForSelector('[data-social-option]');
  await page.locator('[data-social-option="0"]').click();
  assert.match(await page.locator('.learning-feedback').innerText(), /evidence and explanation/u);

  await page.goto(`${server.baseUrl}/learning?unit=uni-quant-ratios`, { waitUntil: engineName === 'webkit' ? 'commit' : 'domcontentloaded' });
  const pick = async (activity, option) => {
    const control = page.locator(`[data-activity="${activity}"][data-option="${option}"]`);
    await control.waitFor({ state: 'visible' });
    await control.click();
    await page.locator('.learning-feedback').last().waitFor({ state: 'visible' });
  };
  await pick('mix', 1);
  await pick('unit', 2);
  await pick('recipe', 2);
  assert.match(await page.locator('#learningApp').innerText(), /Retrieval becomes available/u);
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith('riddlearabia-learning-progress:'));
    const all = JSON.parse(localStorage.getItem(key));
    all['uni-quant-ratios'].dueAt = Date.now() - 1;
    localStorage.setItem(key, JSON.stringify(all));
  });
  await page.reload({ waitUntil: engineName === 'webkit' ? 'commit' : 'domcontentloaded' });
  await pick('retrieve', 1);
  assert.match(await page.locator('#learningApp').innerText(), /Unit complete/u);

  await page.goto(`${server.baseUrl}/ar/learn/?unit=kids68-patterns`, { waitUntil: engineName === 'webkit' ? 'commit' : 'domcontentloaded' });
  await page.waitForSelector('.learning-stage');
  assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  assert.match(await page.locator('#learningApp').innerText(), /اكتشف النمط/u);
  await context.close();
  console.log(`Learning browser regression passed on ${engineName}.`);
} finally {
  await browser.close();
  await server.close();
}
