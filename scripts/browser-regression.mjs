import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const SITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      assert(address && typeof address === "object");
      resolveListen(address.port);
    });
  });
}

function close(server) {
  return new Promise((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
}

async function regularFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function resolveStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relative = normalize(decoded).replace(/^[/\\]+/u, "");
  const candidate = resolve(SITE_ROOT, relative || "index.html");
  if (candidate !== SITE_ROOT && !candidate.startsWith(`${SITE_ROOT}${sep}`)) return null;

  const possibilities = [];
  if (decoded.endsWith("/")) possibilities.push(join(candidate, "index.html"));
  possibilities.push(candidate);
  if (!extname(candidate)) {
    possibilities.push(`${candidate}.html`);
    possibilities.push(join(candidate, "index.html"));
  }
  for (const possibility of possibilities) {
    if (await regularFile(possibility)) return possibility;
  }
  return null;
}

function createStaticServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const path = await resolveStaticPath(url.pathname);
    if (!path) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const headers = {
      "cache-control": "public, max-age=0, must-revalidate",
      "content-type": MIME_TYPES.get(extname(path).toLowerCase()) || "application/octet-stream",
      "x-content-type-options": "nosniff",
    };
    if (path.endsWith(`${sep}sw.js`)) headers["service-worker-allowed"] = "/";
    const body = await readFile(path);
    response.writeHead(200, headers);
    response.end(request.method === "HEAD" ? undefined : body);
  });
}

async function mockApi(context) {
  await context.route("https://api.jakh.net/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/health") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          schema: "8",
          targetSchema: "8",
          features: { registration: true, accountRecovery: true, accountDeletion: true },
        }),
      });
      return;
    }
    if (path === "/api/auth/session") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ authenticated: false }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Not found", code: "NOT_FOUND" }),
    });
  });
}

function trackPageErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return () => assert.deepEqual(errors, [], `Unexpected page errors:\n${errors.join("\n")}`);
}

async function createContext(browser, options = {}) {
  const context = await browser.newContext(options);
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
  const server = createStaticServer();
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}`;
  const configuredExecutable = process.env.JAKH_BROWSER_EXECUTABLE;
  const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executablePath = configuredExecutable
    || (existsSync(macChrome) ? macChrome : undefined);
  const browser = await chromium.launch({ headless: true, executablePath });

  try {
    await runTest("search and modal focus behavior", async () => {
      const context = await createContext(browser, { viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const assertNoPageErrors = trackPageErrors(page);
      try {
        await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
        await page.locator("#globalSearchBtn").waitFor();
        await page.locator('[data-consent-action="essential"]').click();
        await page.locator("h1").waitFor();

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
        await page.keyboard.press("Escape");
        await page.locator("#globalSearchOverlay").waitFor({ state: "hidden" });
        await page.waitForFunction(() => document.activeElement?.id === "globalSearchBtn");
        assert.equal(await page.evaluate(() => document.activeElement?.id), "globalSearchBtn");

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
      const context = await createContext(browser, { viewport: { width: 1280, height: 800 } });
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
        await page.goto(`${baseUrl}/science.html?utm_source=browser&q=atom&difficulty=hard`, {
          waitUntil: "domcontentloaded",
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
        await firstFlip.click();
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

    await runTest("mobile fixed UI and install sequencing", async () => {
      const viewport = { width: 320, height: 568 };
      const context = await createContext(browser, { viewport, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const assertNoPageErrors = trackPageErrors(page);
      try {
        await page.goto(`${baseUrl}/`, { waitUntil: "domcontentloaded" });
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
      const context = await createContext(browser, { viewport: { width: 1024, height: 720 } });
      await setCurrentDeniedConsent(context);
      const page = await context.newPage();
      const assertNoPageErrors = trackPageErrors(page);
      try {
        await page.goto(`${baseUrl}/chess.html`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(async () => {
          if (!("serviceWorker" in navigator)) return false;
          const registration = await navigator.serviceWorker.ready;
          return Boolean(registration.active);
        }, undefined, { timeout: 60_000 });
        await page.reload({ waitUntil: "domcontentloaded" });
        assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);

        await context.setOffline(true);
        await page.goto(`${baseUrl}/science.html?offline_probe=1`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        await page.locator("h1").waitFor();
        assert.match(await page.locator("h1").innerText(), /Science/u);
        await page.goto(`${baseUrl}/ar/privacy/?offline_probe=1`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
        assert.equal(await page.locator("html").getAttribute("lang"), "ar");
        await page.goto(`${baseUrl}/definitely-not-cached/`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        assert.match(await page.title(), /^Offline \| JAKH$/u);
        assert.match(await page.locator("h1").innerText(), /offline/u);
        assertNoPageErrors();
      } finally {
        await context.setOffline(false);
        await context.close();
      }
    });

    console.log("Browser regression passed: 4 suites.");
  } finally {
    await browser.close();
    await close(server);
  }
}

await main();
