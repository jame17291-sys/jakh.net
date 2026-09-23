import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { startAdminWorkspaceFixture } from "./admin-workspace-fixture.mjs";

const fixture = await startAdminWorkspaceFixture();
const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = process.env.JAKH_BROWSER_EXECUTABLE || (existsSync(macChrome) ? macChrome : undefined);
const screenshotDir = process.env.JAKH_AUTOPILOT_SCREENSHOT_DIR;
let browser;
const failures = [];
let passed = 0;

function initialData() {
  return { enabled: false, policy: { schedule: "Daily at 07:23 Dubai", maxRunsPerDay: 1, maxReleasesPerDay: 1, aiBudgetUsd: 0 }, runs: [], lastRun: null };
}

function runReceipt(status = "deployed") {
  return { day: "2026-09-23", runId: "123456789", runAttempt: 1, url: "https://github.com/example/riddlearabia/actions/runs/123456789", status,
    startedAt: "2026-09-23T03:23:00.000Z", updatedAt: "2026-09-23T03:29:00.000Z", sourceSha: "a".repeat(40), candidateSha: "b".repeat(40),
    findings: { brokenLinks: 2, accessibility: 1, performance: 0, dependencies: 0, content: 3, total: 6 }, fixesApplied: 2, checksPassed: 8, checksFailed: status === "failed" ? 1 : 0,
    releaseReservedAt: "2026-09-23T03:28:00.000Z", buildId: "site-build-test-20260923", workerVersion: "worker-test-version",
    deploymentRunId: "987654321", deploymentUrl: "https://github.com/example/riddlearabia/actions/runs/987654321" };
}

async function eventually(read, predicate, message) {
  const deadline = Date.now() + 10_000;
  let result;
  do {
    result = await read();
    if (predicate(result)) return result;
    await new Promise((done) => setTimeout(done, 30));
  } while (Date.now() < deadline);
  assert.fail(`${message}: ${JSON.stringify(result)}`);
}

async function scenario(name, test, options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 1280, height: 850 }, forcedColors: options.forcedColors });
  const page = await context.newPage();
  const api = { data: initialData(), status: 200, mutationStatus: 200, reads: 0, writes: [], hold: null, entered: false };
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(10_000);
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== fixture.baseUrl) { external.push(url.href); await route.abort(); return; }
    if (url.pathname !== "/api/admin/autopilot") { await route.continue(); return; }
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      api.writes.push(body);
      api.entered = true;
      if (api.hold) await api.hold;
      if (api.mutationStatus === 200) api.data.enabled = body.enabled;
      await route.fulfill({ status: api.mutationStatus, contentType: "application/json", body: JSON.stringify(api.mutationStatus === 200 ? api.data : { error: "Fixture update unavailable" }) });
    } else {
      api.reads++;
      api.entered = true;
      if (api.hold) await api.hold;
      await route.fulfill({ status: api.status, contentType: "application/json", body: JSON.stringify(api.status === 200 ? api.data : { error: "Fixture service unavailable" }) });
    }
  });
  try {
    await page.goto(`${fixture.baseUrl}/admin?role=${options.role || "OWNER"}&lang=${options.lang || "en"}`);
    await page.locator("#adminApp").waitFor({ state: "visible" });
    await test(page, api);
    assert.deepEqual(errors, [], "Browser errors");
    assert.deepEqual(external, [], "The local fixture must not contact a live service");
    console.log(`PASS autopilot UI: ${name}`);
    passed++;
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL autopilot UI: ${name}\n${error.stack || error}`);
  } finally { await context.close(); }
}

async function openAutopilot(page) {
  await page.locator("#autopilotTab").click();
  await eventually(() => page.locator("#autopilotPanel").getAttribute("aria-busy"), (value) => value === "false", "Autopilot must finish loading");
}

try {
  browser = await chromium.launch({ headless: true, executablePath });
  await scenario("owner sees truthful paused defaults and can resume then pause", async (page, api) => {
    await openAutopilot(page);
    assert.equal(await page.locator("#autopilotStatus").textContent(), "Paused");
    assert.match(await page.locator("#autopilotLastRun").textContent(), /No runs have been recorded/u);
    assert.match(await page.locator("#autopilotPolicy").textContent(), /07:23/u);
    assert.match(await page.locator("#autopilotBudgetMessage").textContent(), /No paid AI calls/u);
    await page.locator("#autopilotToggle").click();
    await eventually(() => page.locator("#autopilotStatus").textContent(), (value) => value === "Active", "Resume should require confirmed API data");
    await page.locator("#autopilotToggle").click();
    await eventually(() => page.locator("#autopilotStatus").textContent(), (value) => value === "Paused", "Pause should require confirmed API data");
    assert.deepEqual(api.writes, [{ enabled: true }, { enabled: false }]);
  });
  await scenario("administrators have no Autopilot control or request", async (page, api) => {
    assert.equal(await page.locator("#autopilotTab").isVisible(), false);
    assert.equal(await page.locator("#autopilotPanel").isVisible(), false);
    await page.locator("#refreshButton").click();
    assert.equal(api.reads, 0);
    assert.deepEqual(api.writes, []);
  }, { role: "ADMIN" });
  await scenario("missing service shows not connected and retry recovers", async (page, api) => {
    api.status = 404;
    await openAutopilot(page);
    assert.equal(await page.locator("#autopilotStatus").textContent(), "Not connected");
    assert.equal(await page.locator("#autopilotToggle").isVisible(), false);
    assert.match(await page.locator("#autopilotLastRun").textContent(), /unavailable/u);
    api.status = 200;
    await page.locator("#autopilotRefresh").click();
    await eventually(() => page.locator("#autopilotStatus").textContent(), (value) => value === "Paused", "Retry should load authoritative status");
  });
  await scenario("loading and pending mutations cannot create duplicate updates", async (page, api) => {
    let release;
    api.hold = new Promise((done) => { release = done; });
    await page.locator("#autopilotTab").click();
    await eventually(() => api.entered, Boolean, "Initial GET should be held");
    assert.equal(await page.locator("#autopilotStatus").textContent(), "Loading…");
    assert.equal(await page.locator("#autopilotRefresh").isDisabled(), true);
    api.hold = null; release();
    await eventually(() => page.locator("#autopilotToggle").isEnabled(), Boolean, "Initial GET should unlock controls");
    api.entered = false;
    api.hold = new Promise((done) => { release = done; });
    await page.locator("#autopilotToggle").click();
    await eventually(() => api.entered, Boolean, "POST should be held");
    assert.equal(await page.locator("#autopilotStatus").textContent(), "Updating…");
    assert.equal(await page.locator("#autopilotToggle").isDisabled(), true);
    assert.equal(await page.locator("#autopilotRefresh").isDisabled(), true);
    assert.equal(api.writes.length, 1);
    api.hold = null; release();
    await eventually(() => page.locator("#autopilotStatus").textContent(), (value) => value === "Active", "POST should resolve");
  });
  await scenario("failed changes remain uncertain until a fresh successful read", async (page, api) => {
    await openAutopilot(page);
    api.mutationStatus = 503;
    await page.locator("#autopilotToggle").click();
    await page.locator("#autopilotError").waitFor({ state: "visible" });
    assert.equal(await page.locator("#autopilotStatus").textContent(), "Status unavailable");
    assert.equal(await page.locator("#autopilotToggle").isDisabled(), true);
    await page.locator("#autopilotRefresh").click();
    await eventually(() => page.locator("#autopilotStatus").textContent(), (value) => value === "Paused", "Refresh should restore the confirmed server state");
  });
  await scenario("run receipts expose findings and deployment links while rejecting unsafe URLs", async (page, api) => {
    const latest = runReceipt("deployed");
    const failed = { ...runReceipt("failed"), runId: "456", url: "javascript:alert(1)", deploymentUrl: "https://example.test/unsafe", sourceSha: "<img src=x onerror=alert(1)>" };
    api.data = { ...initialData(), enabled: true, lastRun: latest, runs: [latest, failed] };
    await openAutopilot(page);
    assert.equal(await page.locator(".autopilot-run").count(), 2);
    assert.match(await page.locator("#autopilotRuns").textContent(), /Failed/u);
    assert.match(await page.locator("#autopilotRuns").textContent(), /Repairs applied/u);
    assert.equal(await page.locator(".autopilot-run").nth(1).locator("a").count(), 0);
    assert.equal(await page.locator("#autopilotRuns img").count(), 0);
    assert.equal(await page.locator(".autopilot-run").first().locator("a").count(), 2);
    assert.equal(await page.locator(".autopilot-machine").first().getAttribute("dir"), "ltr");
  });
  for (const lang of ["en", "ar"]) for (const width of [320, 390, 1280]) {
    await scenario(`${lang} accessibility and eight-tab reflow at ${width}px`, async (page, api) => {
      const run = runReceipt("needs_attention");
      api.data = { ...initialData(), lastRun: run, runs: [run] };
      await openAutopilot(page);
      assert.equal(await page.locator("#adminTabs [data-tab]:visible").count(), 8);
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(dimensions.scroll <= dimensions.width + 1, JSON.stringify(dimensions));
      assert.equal(await page.locator("html").getAttribute("dir"), lang === "ar" ? "rtl" : "ltr");
      await page.locator(".autopilot-run summary").click();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      assert.deepEqual(results.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })), []);
    }, { lang, width, forcedColors: width === 390 ? "active" : "none" });
  }
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    for (const [lang, width] of [["en", 1280], ["ar", 390]]) {
      await scenario(`${lang} labeled local-fixture preview`, async (page, api) => {
        const run = { ...runReceipt("needs_attention"), findings: { brokenLinks: 0, accessibility: 1, performance: 0, dependencies: 0, content: 0, total: 1 },
          fixesApplied: 0, checksFailed: 1, candidateSha: null, releaseReservedAt: null, buildId: null, workerVersion: null,
          deploymentRunId: null, deploymentUrl: null };
        api.data = { ...initialData(), lastRun: run, runs: [run] };
        await openAutopilot(page);
        await page.locator(".autopilot-run summary").click();
        await page.evaluate(async (language) => {
          const label = document.createElement("div");
          label.textContent = language === "ar" ? "معاينة محلية — بيانات اختبار وليست بيانات الموقع الفعلي" : "LOCAL PREVIEW — TEST DATA, NOT LIVE SITE DATA";
          label.dir = language === "ar" ? "rtl" : "ltr";
          label.style.cssText = "padding:12px 20px;background:#17314a;color:#fff;text-align:center;font:700 14px/1.6 system-ui,sans-serif;";
          document.body.prepend(label);
          await document.fonts.ready;
          window.scrollTo(0, 0);
        }, lang);
        const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(dimensions.scroll <= dimensions.width + 1, JSON.stringify(dimensions));
        await page.screenshot({ path: path.join(screenshotDir, `autopilot-preview-${lang}.png`), fullPage: true });
      }, { lang, width, forcedColors: "none" });
    }
  }
} finally {
  await browser?.close();
  await fixture.close();
}
console.log(`Autopilot UI: ${passed} passed, ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;
