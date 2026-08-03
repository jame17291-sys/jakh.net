import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";

import { startBrowserSite } from "./local-browser-site.mjs";

const BROWSER_ENGINES = Object.freeze({ chromium, firefox, webkit });
const BROWSER_ENGINE = String(process.env.JAKH_BROWSER_ENGINE || "chromium").toLowerCase();
if (!BROWSER_ENGINES[BROWSER_ENGINE]) {
  throw new Error(`Unsupported JAKH_BROWSER_ENGINE "${BROWSER_ENGINE}"; expected chromium, firefox, or webkit.`);
}
// WebKit can keep DOMContentLoaded pending while deferred application work is
// settling even though the document is already committed and queryable. The
// suites' explicit locator/readiness checks are the authoritative gates.
const NAVIGATION_READY_EVENT = BROWSER_ENGINE === "webkit" ? "commit" : "domcontentloaded";
// The Playwright WebKit build on macOS accepts the loopback response through
// localhost/IPv6 but leaves 127.0.0.1 navigation pending indefinitely.
const LOOPBACK_HOST = BROWSER_ENGINE === "webkit" ? "localhost" : "127.0.0.1";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_ROOT = resolve(process.env.JAKH_SITE_ROOT || REPOSITORY_ROOT);
const SITE_MANIFEST_PATH = process.env.JAKH_SITE_MANIFEST
  ? resolve(process.env.JAKH_SITE_MANIFEST)
  : null;

async function mockApi(context) {
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const origin = request.headers().origin || "https://jakh.net";
    const headers = {
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Accept, Content-Type",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS, POST, PATCH, DELETE",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Private-Network": "true",
      Vary: "Origin",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers,
      });
      return;
    }
    if (path === "/api/health") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify({
          ok: true,
          schema: "9",
          targetSchema: "9",
          features: { registration: true, accountRecovery: true, accountDeletion: true, contentStudio: true },
        }),
      });
      return;
    }
    if (path === "/api/auth/session") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify({ authenticated: false }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      headers,
      body: JSON.stringify({ error: "Not found", code: "NOT_FOUND" }),
    });
  });
}

function trackPageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return (allowedPatterns = []) => {
    const unexpected = errors.filter((message) => (
      !allowedPatterns.some((pattern) => pattern.test(message))
    ));
    assert.deepEqual(unexpected, [], `Unexpected page errors:\n${unexpected.join("\n")}`);
  };
}

async function createContext(browser, options = {}) {
  const compatibleOptions = { ...options };
  if (BROWSER_ENGINE === "firefox") delete compatibleOptions.isMobile;
  const context = await browser.newContext(compatibleOptions);
  context.setDefaultNavigationTimeout(60_000);
  context.setDefaultTimeout(60_000);
  await mockApi(context);
  return context;
}

async function setCurrentDeniedConsent(context) {
  await context.addInitScript(() => {
    localStorage.setItem("jakh-consent-v1", JSON.stringify({
      version: 2,
      noticeVersion: "2026-08-01",
      analytics: false,
      updatedAt: new Date(0).toISOString(),
      source: "browser-regression",
    }));
  });
}

function assertInsideViewport(rect, viewport, label) {
  assert(rect, `${label} is missing`);
  const detail = `${JSON.stringify(rect)} in ${JSON.stringify(viewport)}`;
  assert(rect.x >= -0.5, `${label} extends beyond the left edge: ${detail}`);
  assert(rect.x + rect.width <= viewport.width + 0.5, `${label} extends beyond the right edge: ${detail}`);
  assert(rect.y >= -0.5, `${label} extends above the viewport: ${detail}`);
  assert(rect.y + rect.height <= viewport.height + 0.5, `${label} extends below the viewport: ${detail}`);
}

async function runTest(name, callback) {
  const started = performance.now();
  await callback();
  console.log(`PASS ${name} (${Math.round(performance.now() - started)}ms)`);
}

async function main() {
  const server = await startBrowserSite({
    siteRoot: SITE_ROOT,
    manifestPath: SITE_MANIFEST_PATH,
    loopbackHost: LOOPBACK_HOST,
  });
  const { artifactManifest, baseUrl } = server;
  const searchAssetPaths = [
    artifactManifest?.fingerprints?.["/search-leaderboard.js"] || "/search-leaderboard.js",
    artifactManifest?.fingerprints?.["/search-leaderboard.css"] || "/search-leaderboard.css",
  ];
  const configuredExecutable = process.env.JAKH_BROWSER_EXECUTABLE;
  const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executablePath = BROWSER_ENGINE === "chromium"
    ? configuredExecutable || (existsSync(macChrome) ? macChrome : undefined)
    : undefined;
  const browser = await BROWSER_ENGINES[BROWSER_ENGINE].launch({ headless: true, executablePath });

  try {
    await runTest("search and modal focus behavior", async () => {
      const context = await createContext(browser, {
        viewport: { width: 1280, height: 800 },
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      const assertNoPageErrors = trackPageErrors(page);
      try {
        const navigation = await page.goto(`${baseUrl}/`, { waitUntil: NAVIGATION_READY_EVENT });
        if (artifactManifest) {
          const headers = await navigation.allHeaders();
          assert.equal(headers["x-jakh-site-version"], artifactManifest.buildId);
          assert.equal(
            headers["x-jakh-local-csp-adjustment"],
            "upgrade-insecure-requests-disabled-on-http-loopback",
          );
          assert.match(headers["content-security-policy"], /frame-ancestors 'none'/u);
          assert.doesNotMatch(headers["content-security-policy"], /script-src[^;]*unsafe-inline/u);
          assert.equal(
            await page.locator(`script[src="${artifactManifest.fingerprints["/app.js"]}"]`).count(),
            1,
            "artifact HTML must load the fingerprinted application",
          );
        }
        await page.locator("#globalSearchBtn").waitFor();
        await page.locator('[data-consent-action="essential"]').click();
        await page.locator("h1").waitFor();

        assert.equal(await page.locator('#searchLeaderboardStyles').count(), 0);
        assert.equal(await page.evaluate((paths) => performance.getEntriesByType('resource').some(entry => (
          paths.includes(new URL(entry.name).pathname)
        )), searchAssetPaths), false, 'search/leaderboard assets must not load during startup');

        await page.locator("#globalSearchBtn").click();
        await page.locator("#globalSearchInput").fill("what");
        const summary = page.locator(".global-search-summary");
        await summary.waitFor();
        const match = /^(\d+) results found\. Showing the top (\d+)/u.exec(await summary.innerText());
        assert(match, "Global search did not disclose its full and displayed result counts");
        const total = Number(match[1]);
        const shown = Number(match[2]);
        assert.equal(await page.locator(".gs-result").count(), shown);
        assert(total >= shown && shown <= 30);
        await page.locator('#searchLeaderboardStyles').waitFor({ state: 'attached' });
        await page.waitForFunction((expectedPaths) => {
          const paths = new Set(performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname));
          return expectedPaths.every(path => paths.has(path));
        }, searchAssetPaths);
        await page.keyboard.press("Escape");
        await page.locator("#globalSearchOverlay").waitFor({ state: "hidden" });
        await page.waitForFunction(() => document.activeElement?.id === "globalSearchBtn");
        assert.equal(await page.evaluate(() => document.activeElement?.id), "globalSearchBtn");

        await page.locator('#leaderboardBtn').click();
        await page.locator('#leaderboardModal').waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.activeElement?.matches('button[data-close-modal="leaderboard"]'));
        await page.keyboard.press('Escape');
        await page.locator('#leaderboardModal').waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.activeElement?.id === 'leaderboardBtn');

        await page.locator("#openAuthBtn").click();
        await page.locator("#authUsername").waitFor();
        await page.waitForFunction(() => document.activeElement?.id === "tabSignin");
        assert.equal(await page.evaluate(() => document.activeElement?.id), "tabSignin");
        await page.keyboard.press("Escape");
        await page.locator("#authModal").waitFor({ state: "hidden" });
        await page.waitForFunction(() => document.activeElement?.id === "openAuthBtn");
        assert.equal(await page.evaluate(() => document.activeElement?.id), "openAuthBtn");

        await page.locator("#langSelect").selectOption("ar");
        await page.waitForURL(`${baseUrl}/ar/`);
        assert.equal(await page.locator("html").getAttribute("lang"), "ar");
        assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
        await page.locator("#langSelect").selectOption("en");
        await page.waitForURL(`${baseUrl}/`);
        assert.equal(await page.locator("html").getAttribute("lang"), "en");
        assertNoPageErrors();
      } finally {
        await context.close();
      }
    });

    await runTest("blocked storage, filters, cards, and Quick Fire race guard", async () => {
      const context = await createContext(browser, {
        viewport: { width: 1280, height: 800 },
        serviceWorkers: "block",
      });
      await context.addInitScript(() => {
        for (const name of ["getItem", "setItem", "removeItem", "clear", "key"]) {
          Object.defineProperty(Storage.prototype, name, {
            configurable: true,
            value() { throw new DOMException("Storage blocked by test", "SecurityError"); },
          });
        }
        Object.defineProperty(Storage.prototype, "length", {
          configurable: true,
          get() { throw new DOMException("Storage blocked by test", "SecurityError"); },
        });
      });
      const page = await context.newPage();
      const assertNoPageErrors = trackPageErrors(page);
      try {
        await page.goto(`${baseUrl}/science?utm_source=browser&q=atom&difficulty=hard`, {
          waitUntil: NAVIGATION_READY_EVENT,
        });
        await page.locator("#playModeQuickFireBtn").waitFor();
        await page.waitForFunction(() => document.querySelectorAll("#cardGrid .riddle-card").length > 0);
        await page.locator("#resetPageBtn").click();
        await page.waitForFunction(() => document.querySelectorAll("#cardGrid .riddle-card").length === 20);
        assert.match(await page.locator("#resultsLabel").innerText(), /20 of 100/u);
        await page.locator("#loadMoreBtn").waitFor();
        const resetUrl = new URL(page.url());
        assert.equal(resetUrl.searchParams.get("utm_source"), "browser");
        assert.equal(resetUrl.searchParams.has("q"), false);
        assert.equal(resetUrl.searchParams.has("difficulty"), false);

        const firstFlip = page.locator('#cardGrid [data-action="flip"]').first();
        const cardId = await firstFlip.getAttribute("data-id");
        // Safari/WebKit intentionally does not always move focus to a button
        // on pointer click. Use the keyboard path so this assertion measures
        // the product's focus restoration contract consistently.
        await firstFlip.focus();
        await firstFlip.press("Enter");
        await page.waitForFunction((expectedId) => (
          document.activeElement?.getAttribute("data-id") === expectedId
          && document.activeElement?.closest(".card-back") !== null
        ), cardId);
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-id")), cardId);
        assert.equal(await page.evaluate(() => document.activeElement?.closest(".card-back") !== null), true);
        await page.evaluate(() => document.activeElement?.click());
        await page.waitForFunction((expectedId) => (
          document.activeElement?.getAttribute("data-id") === expectedId
          && document.activeElement?.closest(".card-front") !== null
        ), cardId);
        assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-id")), cardId);
        assert.equal(await page.evaluate(() => document.activeElement?.closest(".card-front") !== null), true);

        await page.locator("#playModeQuickFireBtn").click();
        await page.locator('#tqOptions [data-tq-option="0"]').waitFor();
        assert.equal(await page.locator("#tqAnswerWrap").evaluate((node) => node.classList.contains("hidden")), true);
        assert.equal(await page.locator("#tqOptions [data-tq-option]").count(), 4);
        await page.evaluate(() => {
          const option = document.querySelector('#tqOptions [data-tq-option="0"]');
          option?.click();
          option?.click();
        });
        assert.equal(await page.locator("#tqAnswerWrap").evaluate((node) => node.classList.contains("hidden")), false);
        assert.equal(await page.locator("#tqOptions [data-tq-option]:disabled").count(), 4);
        await page.waitForTimeout(1_650);
        assert.equal((await page.locator("#tqProgressText").innerText()).trim(), "2 / 10");
        await page.keyboard.press("Escape");
        await page.locator("#timedQuizOverlay").waitFor({ state: "hidden" });
        await page.waitForFunction(() => document.activeElement?.id === "playModeQuickFireBtn");
        assert.equal(await page.evaluate(() => document.activeElement?.id), "playModeQuickFireBtn");
        assertNoPageErrors();
      } finally {
        await context.close();
      }
    });

    await runTest("natural Arabic read-aloud voice and controls", async () => {
      const context = await createContext(browser, {
        viewport: { width: 1280, height: 800 },
        serviceWorkers: "block",
      });
      await context.addInitScript(() => {
        const voices = [
          { name: "Arabic", voiceURI: "basic-ar-sa", lang: "ar-SA", localService: true },
          {
            name: "Microsoft Salma Online (Natural)",
            voiceURI: "natural-ar-eg",
            lang: "ar-EG",
            localService: false,
          },
        ];
        class TestUtterance {
          constructor(text) { this.text = text; }
        }
        const synthesis = {
          getVoices: () => voices,
          addEventListener() {},
          removeEventListener() {},
          cancel() { window.__speechCancelled = true; },
          speak(utterance) {
            window.__spokenArabic = {
              text: utterance.text,
              voice: utterance.voice?.name,
              lang: utterance.lang,
              rate: utterance.rate,
              pitch: utterance.pitch,
            };
          },
        };
        Object.defineProperty(window, "SpeechSynthesisUtterance", {
          configurable: true,
          value: TestUtterance,
        });
        Object.defineProperty(window, "speechSynthesis", {
          configurable: true,
          value: synthesis,
        });
      });
      const page = await context.newPage();
      const assertNoPageErrors = trackPageErrors(page);
      try {
        await page.goto(`${baseUrl}/ar/topics/science/`, { waitUntil: NAVIGATION_READY_EVENT });
        const audioButton = page.locator('.card-audio-btn').first();
        await audioButton.waitFor();
        await audioButton.click();
        await page.waitForFunction(() => Boolean(window.__spokenArabic));
        assert.deepEqual(await page.evaluate(() => window.__spokenArabic), {
          text: "من يُشتهر بقانون الجاذبية الكونية بعد مشاهدة سقوط تفاحة؟",
          voice: "Microsoft Salma Online (Natural)",
          lang: "ar-EG",
          rate: 0.92,
          pitch: 1,
        });
        assert.equal(await audioButton.getAttribute('aria-label'), 'إيقاف');
        assert.equal(await page.evaluate(() => (
          performance.getEntriesByType('resource')
            .some(entry => new URL(entry.name).pathname === '/speech-quality.js')
        )), true);
        await audioButton.evaluate(button => button.click());
        await page.waitForFunction(() => (
          document.querySelector('.card-audio-btn')?.getAttribute('aria-label') === 'اقرأ بصوت عالٍ'
        ));
        assert.equal(await audioButton.getAttribute('aria-label'), 'اقرأ بصوت عالٍ');
        assert.equal(await page.evaluate(() => window.__speechCancelled), true);
        assertNoPageErrors();
      } finally {
        await context.close();
      }
    });

    await runTest("long English and Arabic cards expand without inner scrolling", async () => {
      const context = await createContext(browser, {
        viewport: { width: 360, height: 640 },
        isMobile: true,
        hasTouch: true,
        serviceWorkers: "block",
      });
      await setCurrentDeniedConsent(context);
      const page = await context.newPage();
      const assertNoPageErrors = trackPageErrors(page);
      try {
        for (const route of ["/story-mysteries", "/ar/topics/story-mysteries/"]) {
          await page.goto(`${baseUrl}${route}`, { waitUntil: NAVIGATION_READY_EVENT });
          await page.waitForFunction(() => document.querySelectorAll("#cardGrid .riddle-card").length === 20);
          await page.waitForLoadState("networkidle");
          const problems = await page.locator("#cardGrid .card-face").evaluateAll((faces) => faces.flatMap((face) => {
            const style = getComputedStyle(face);
            const overflow = `${style.overflow} ${style.overflowY}`;
            const clipped = face.scrollHeight > face.clientHeight + 1;
            return /\b(?:auto|scroll)\b/u.test(overflow) || clipped
              ? [{
                  card: face.closest(".riddle-card")?.id,
                  side: face.className,
                  overflow,
                  clientHeight: face.clientHeight,
                  scrollHeight: face.scrollHeight,
                }]
              : [];
          }));
          assert.deepEqual(problems, [], `${route} contains an internally scrolling or clipped card:\n${JSON.stringify(problems, null, 2)}`);
        }
        assertNoPageErrors();
      } finally {
        await context.close();
      }
    });

    await runTest("mobile fixed UI and install sequencing", async () => {
      const viewport = { width: 320, height: 568 };
      const context = await createContext(browser, {
        viewport,
        isMobile: true,
        hasTouch: true,
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      const assertNoPageErrors = trackPageErrors(page);
      try {
        await page.goto(`${baseUrl}/`, { waitUntil: NAVIGATION_READY_EVENT });
        await page.locator("#bottomNav").waitFor();
        await page.evaluate(() => {
          const promptEvent = new Event("beforeinstallprompt", { cancelable: true });
          Object.defineProperties(promptEvent, {
            prompt: { value: () => undefined },
            userChoice: { value: Promise.resolve({ outcome: "dismissed" }) },
          });
          window.dispatchEvent(promptEvent);
        });
        assert.equal(await page.locator("#installBanner").count(), 0);

        const consentRect = await page.locator("#privacyConsentBanner").boundingBox();
        const navRect = await page.locator("#bottomNav").boundingBox();
        assertInsideViewport(consentRect, viewport, "Privacy banner");
        assertInsideViewport(navRect, viewport, "Bottom navigation");
        assert(consentRect.y + consentRect.height <= navRect.y + 0.5, "Privacy banner overlaps bottom navigation");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

        await page.locator('[data-consent-action="essential"]').click();
        await page.locator("#installBanner").waitFor();
        const installRect = await page.locator("#installBanner").boundingBox();
        assertInsideViewport(installRect, viewport, "Install banner");
        assert(installRect.y + installRect.height <= navRect.y + 0.5, "Install banner overlaps bottom navigation");

        await page.locator("#hamburgerBtn").click();
        assert.equal(await page.locator("#hamburgerBtn").getAttribute("aria-expanded"), "true");
        assert.equal(await page.locator(".header-actions").evaluate((node) => node.classList.contains("nav-open")), true);
        await page.locator("main").click({ position: { x: 5, y: 5 } });
        assert.equal(await page.locator("#hamburgerBtn").getAttribute("aria-expanded"), "false");
        assertNoPageErrors();
      } finally {
        await context.close();
      }
    });

    await runTest("service worker cold-offline shell and direct game entry", async () => {
      const context = await createContext(browser, {
        viewport: { width: 1024, height: 720 },
        serviceWorkers: "allow",
      });
      await setCurrentDeniedConsent(context);
      const page = await context.newPage();
      const assertNoPageErrors = trackPageErrors(page);
      try {
        await page.goto(`${baseUrl}/chess`, { waitUntil: NAVIGATION_READY_EVENT });
        const activeWorkerScriptUrl = await page.evaluate(async () => {
          if (!("serviceWorker" in navigator)) return null;
          return Promise.race([
            navigator.serviceWorker.ready.then((registration) => (
              registration.active?.scriptURL ?? null
            )),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error("service worker activation timed out")), 60_000);
            }),
          ]);
        });
        assert.match(activeWorkerScriptUrl, /\/sw\.js$/u);
        const controllerScriptUrlHandle = await page.waitForFunction(() => {
          const controller = navigator.serviceWorker.controller;
          return controller?.state === "activated" && controller.scriptURL;
        }, undefined, { timeout: 60_000 });
        const claimedControllerScriptUrl = await controllerScriptUrlHandle.jsonValue();
        await controllerScriptUrlHandle.dispose();
        assert.match(claimedControllerScriptUrl, /\/sw\.js$/u);
        assert.deepEqual(await page.evaluate(async (paths) => (
          Promise.all(paths.map(async (path) => Boolean(await caches.match(path))))
        ), ['/chess', '/science', '/ar/privacy/', '/offline']), [true, true, true, true]);

        // Playwright's Firefox offline toggle rejects top-level navigation
        // before an active service worker can answer it. Dropping the local
        // origin connection instead creates the same network failure inside
        // the service-worker fetch path consistently in all three engines.
        server.setSimulatedNetworkFailure(true);
        const chessNavigation = await page.goto(`${baseUrl}/chess?offline_probe=1`, {
          waitUntil: "commit",
          timeout: 60_000,
        });
        assert(chessNavigation, "offline Chess navigation returned no response");
        assert.equal(chessNavigation.fromServiceWorker(), true);
        await page.locator('h1[data-i18n="chessTitle"]').waitFor();
        assert.match(await page.locator('h1[data-i18n="chessTitle"]').innerText(), /Chess/u);
        await page.goto(`${baseUrl}/science?offline_probe=1`, {
          waitUntil: "commit",
          timeout: 60_000,
        });
        await page.locator("h1").waitFor();
        assert.match(await page.locator("h1").innerText(), /Science/u);
        await page.goto(`${baseUrl}/ar/privacy/?offline_probe=1`, {
          waitUntil: "commit",
          timeout: 30_000,
        });
        assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
        assert.equal(await page.locator("html").getAttribute("lang"), "ar");
        await page.goto(`${baseUrl}/definitely-not-cached/?offline_probe=1`, {
          waitUntil: "commit",
          timeout: 60_000,
        });
        assert.match(await page.title(), /^Offline \| JAKH$/u);
        assert.match(await page.locator("h1").innerText(), /offline/u);
        // WebKit surfaces the intentionally dropped origin connections as
        // page errors even though the service worker returned the asserted
        // cached documents. Ignore only those exact transport diagnostics.
        assertNoPageErrors(BROWSER_ENGINE === "webkit" ? [
          /^TypeError: Load failed$/u,
          /^\/localhost:\d+\/.+(?:\.|due to access control checks\.)$/u,
        ] : []);
      } finally {
        server.setSimulatedNetworkFailure(false);
        await context.close();
      }
    });

    console.log(`Browser regression passed: 5 suites on ${BROWSER_ENGINE}.`);
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
