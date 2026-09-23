import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";

import { startBrowserSite } from "./local-browser-site.mjs";
import { CASES as AKSHIFHA_CASES } from "../akshifha-cases.js";
import { AKSHIFHA_UI } from "../akshifha-copy.js";

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
const GAME_SMOKE_FIXTURES = Object.freeze([
  { name: "Akshifha", route: "/akshifha?case=the-first-van&mode=practice", root: "#ak-case", action: "#ak-hint" },
  { name: "Chess", route: "/chess", root: "#chessBoard", action: "#btn2Players" },
  { name: "Mastermind", route: "/mastermind", root: "#mmBoard", action: "#hintBtn" },
  { name: "Go", route: "/go", root: "#goBoard", action: "#goPassBtn" },
  { name: "Reversi", route: "/reversi", root: "#rvBoard", action: "#rvMode2P" },
  { name: "Codenames", route: "/codenames", root: "#cnGrid", action: "#cnPassBtn" },
  { name: "Catan", route: "/catan", root: "#catan-board", action: "#btn-restart" },
  { name: "Backgammon", route: "/backgammon", root: "#bgBoard", action: '#bgOuter button:has-text("New Game")' },
  { name: "SET", route: "/set", root: "#setGrid", action: "#setBtnHint" },
  { name: "Hanabi", route: "/hanabi", root: "#hbHumanCards", action: "#hbClueSuitBtn" },
  { name: "Diplomacy", route: "/diplomacy", root: "#dip-map", action: "#btn-resolve" },
]);

async function mockApi(context, { battle = null, profile = null } = {}) {
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const origin = request.headers().origin || "https://riddlearabia.com";
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
        body: JSON.stringify({ authenticated: Boolean(profile) }),
      });
      return;
    }
    if (profile && ['/api/user/profile', '/api/user/privacy', '/api/user/streak'].includes(path)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(path === '/api/user/profile' ? profile
          : path === '/api/user/privacy' ? { privacy: { usageAnalyticsEnabled: false } }
          : { streak: 0, freezeCount: 0 }),
      });
      return;
    }
    if (battle && path === "/api/battle/create" && request.method() === "POST") {
      try {
        battle.creates.push(JSON.parse(request.postData() || "{}"));
      } catch {
        battle.creates.push({});
      }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        headers,
        body: JSON.stringify({ code: battle.code, hostId: battle.hostId }),
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

async function createContext(browser, options = {}, mockOptions = {}) {
  const compatibleOptions = { ...options };
  if (BROWSER_ENGINE === "firefox") delete compatibleOptions.isMobile;
  const context = await browser.newContext(compatibleOptions);
  context.setDefaultNavigationTimeout(60_000);
  context.setDefaultTimeout(60_000);
  await mockApi(context, mockOptions);
  return context;
}

async function installBattleSocketMock(context, { code, hostId }) {
  await context.addInitScript(({ roomCode, roomHostId }) => {
    const storageKey = `__riddlearabia_battle_browser_${roomCode}`;
    const question = {
      index: 0,
      total: 5,
      text: { en: "Which planet is known as the Red Planet?", ar: "أي كوكب يُعرف بالكوكب الأحمر؟" },
      options: {
        en: ["Mars", "Venus", "Jupiter", "Mercury"],
        ar: ["المريخ", "الزهرة", "المشتري", "عطارد"],
      },
    };

    const initialRoom = () => ({
      code: roomCode,
      category: "science",
      difficulty: "all",
      phase: "lobby",
      currentQ: 0,
      totalQ: question.total,
      players: [],
      answers: {},
      event: "room-update",
    });
    const readRoom = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || "");
        if (parsed?.code === roomCode && Array.isArray(parsed.players)) return parsed;
      } catch {
        // A malformed test value behaves like an empty room.
      }
      return initialRoom();
    };
    const writeRoom = (room, event) => {
      const next = { ...room, event };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    };
    const snapshot = (room) => {
      const players = room.players.map(({ id, name, score, streak }) => ({ id, name, score, streak }));
      return {
        code: room.code,
        category: room.category,
        difficulty: room.difficulty,
        phase: room.phase,
        currentQ: room.currentQ,
        totalQ: room.totalQ,
        hostId: room.players.find((player) => player.isHost)?.id || null,
        players,
        answeredCount: Object.keys(room.answers || {}).length,
        totalPlayers: players.length,
      };
    };
    const messageFor = (room) => {
      if (room.event === "question") {
        return { type: "question", roomState: snapshot(room), question, timeMs: 15_000 };
      }
      return { type: "room-update", roomState: snapshot(room) };
    };

    class BattleSocket {
      constructor(url) {
        this.url = String(url);
        this.readyState = BattleSocket.CONNECTING;
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;
        this.playerId = null;
        this.listeners = new Map();
        this.onStorage = (event) => {
          if (event.key !== storageKey || !event.newValue || this.readyState !== BattleSocket.OPEN) return;
          try {
            this.emit(messageFor(JSON.parse(event.newValue)));
          } catch {
            // Test transport ignores malformed broadcasts just like a failed socket frame.
          }
        };
        window.addEventListener("storage", this.onStorage);
        window.__battleSocketUrls = [...(window.__battleSocketUrls || []), this.url];
        queueMicrotask(() => {
          if (this.readyState !== BattleSocket.CONNECTING) return;
          this.readyState = BattleSocket.OPEN;
          this.dispatch("open", { target: this });
        });
      }

      addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
      }

      removeEventListener(type, listener) {
        this.listeners.get(type)?.delete(listener);
      }

      dispatch(type, event) {
        const handler = this[`on${type}`];
        if (typeof handler === "function") handler.call(this, event);
        for (const listener of this.listeners.get(type) || []) listener.call(this, event);
      }

      emit(payload, delayMs = 0) {
        const dispatch = () => {
          if (this.readyState === BattleSocket.OPEN) {
            this.dispatch("message", { data: JSON.stringify(payload), target: this });
          }
        };
        if (delayMs > 0) setTimeout(dispatch, delayMs);
        else queueMicrotask(dispatch);
      }

      send(raw) {
        if (this.readyState !== BattleSocket.OPEN) throw new Error("Battle socket is not open");
        let payload;
        try {
          payload = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (payload?.type === "join-room") {
          const room = readRoom();
          const isHost = payload.hostId === roomHostId && !room.players.some((player) => player.isHost);
          const playerId = isHost ? "host-player" : "guest-player";
          if (!room.players.some((player) => player.id === playerId)) {
            room.players.push({
              id: playerId,
              name: String(payload.name || "Player"),
              score: 0,
              streak: 0,
              isHost,
            });
          }
          this.playerId = playerId;
          const saved = writeRoom(room, "room-update");
          // Hold the guest acknowledgement until the assertion has observed
          // the pending UI. A fixed 50ms mock response can win the browser
          // automation round trip and hide this state on a fast machine.
          const acknowledge = () => this.emit({ type: "joined", playerId, isHost });
          if (isHost) acknowledge();
          else window.__releaseBattleJoinAck = () => {
            delete window.__releaseBattleJoinAck;
            acknowledge();
          };
          this.emit(messageFor(saved));
          return;
        }
        if (payload?.type === "start-game") {
          const room = readRoom();
          const player = room.players.find((candidate) => candidate.id === this.playerId);
          if (!player?.isHost || room.phase !== "lobby") return;
          if (room.players.length < 2) {
            this.emit({
              type: "error",
              code: "NEED_ANOTHER_PLAYER",
              message: "Invite another player to start",
            });
            return;
          }
          room.phase = "question";
          room.currentQ = 0;
          room.answers = {};
          this.emit(messageFor(writeRoom(room, "question")));
        }
      }

      close() {
        if (this.readyState === BattleSocket.CLOSED) return;
        this.readyState = BattleSocket.CLOSED;
        window.removeEventListener("storage", this.onStorage);
        queueMicrotask(() => this.dispatch("close", { target: this }));
      }
    }

    Object.assign(BattleSocket, {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
    });
    Object.defineProperty(window, "WebSocket", {
      configurable: true,
      writable: true,
      value: BattleSocket,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__battleCopiedText = String(text);
        },
      },
    });
  }, { roomCode: code, roomHostId: hostId });
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
    await runTest("lightweight hubs share responsive navigation without unrelated downloads", async () => {
      for (const width of [320, 768, 1280]) {
        const context = await createContext(browser, {
          viewport: { width, height: 900 },
          serviceWorkers: "block",
        });
        await setCurrentDeniedConsent(context);
        const page = await context.newPage();
        const assertNoPageErrors = trackPageErrors(page);
        const requests = [];
        page.on('request', (request) => requests.push(new URL(request.url())));
        try {
          for (const [route, active, language] of [
            ['/', 'home', 'en'], ['/ar/', 'home', 'ar'],
            ['/play', 'games', 'en'], ['/ar/play/', 'games', 'ar'],
            ['/collections', 'library', 'en'], ['/ar/collections/', 'library', 'ar'],
            ['/riddles', 'library', 'en'], ['/ar/alghaz/', 'library', 'ar'],
          ]) {
            requests.length = 0;
            await page.goto(`${baseUrl}${route}`, { waitUntil: NAVIGATION_READY_EVENT });
            await page.locator('.primary-navigation').waitFor();
            await page.waitForLoadState('networkidle');
            assert.equal(await page.locator('html').getAttribute('lang'), language, `${route} language`);
            assert.equal(await page.locator('html').getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr');
            assert.equal(await page.locator('.primary-navigation').count(), 1);
            assert.deepEqual(await page.locator('.primary-navigation a').evaluateAll((links) => links.map((link) => link.dataset.nav)),
              ['home', 'library', 'games', 'daily']);
            assert.equal(await page.locator('.primary-navigation [aria-current="page"]').getAttribute('data-nav'), active);
            assert.equal(await page.locator('#hamburgerBtn, #bottomNav').count(), 0);
            assert.equal(await page.locator('[data-site-profile]').getAttribute('href'),
              language === 'ar' ? '/ar/mind-lab/?profile=1' : '/mind-lab?profile=1');
            assert.equal(await page.locator('.language-route-link').getAttribute('hreflang'), language === 'ar' ? 'en' : 'ar');
            const geometry = await page.evaluate(() => ({
              viewport: window.innerWidth,
              document: document.documentElement.scrollWidth,
              body: document.body.scrollWidth,
              outside: [...document.querySelectorAll('main *, header *, footer *')].flatMap((node) => {
                const rect = node.getBoundingClientRect();
                return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1)
                  ? [{ tag: node.tagName, id: node.id, class: node.className, left: rect.left, right: rect.right }]
                  : [];
              }).slice(0, 8),
            }));
            assert(Math.max(geometry.document, geometry.body) <= geometry.viewport + 1,
              `${route} overflows at ${width}px: ${JSON.stringify(geometry)}`);
            for (const link of await page.locator('.primary-navigation a, .site-utilities a').all()) {
              const rect = await link.boundingBox();
              assertInsideViewport(rect, { width, height: 900 }, `${route} navigation link`);
              assert(rect.height >= 44, `${route} navigation target is shorter than 44px at ${width}px`);
            }
            const unrelated = requests.filter((url) => url.origin !== new URL(baseUrl).origin
              || url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/')
              || /^\/(?:app|auth-enhancements|battle-mode|search-leaderboard|speech-quality|akshifha(?:-engine|-cases|-copy|-study)?)\b.*\.(?:js|css)$/u.test(url.pathname));
            assert.deepEqual(unrelated.map((url) => url.href), [], `${route} downloaded a feature unrelated to its page`);
          }
          assertNoPageErrors();
        } finally {
          await context.close();
        }
      }
    });

    await runTest("search and modal focus behavior", async () => {
      const context = await createContext(browser, {
        viewport: { width: 1280, height: 800 },
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      const assertNoPageErrors = trackPageErrors(page);
      try {
        const navigation = await page.goto(`${baseUrl}/mind-lab`, { waitUntil: NAVIGATION_READY_EVENT });
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

        await page.locator(".language-route-link").click();
        await page.waitForURL(`${baseUrl}/ar/mind-lab/`);
        assert.equal(await page.locator("html").getAttribute("lang"), "ar");
        assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
        await page.locator(".language-route-link").click();
        await page.waitForURL(`${baseUrl}/mind-lab`);
        assert.equal(await page.locator("html").getAttribute("lang"), "en");
        assertNoPageErrors();
      } finally {
        await context.close();
      }
    });

    await runTest("signed-in owner utilities remain usable with a long username on narrow screens", async () => {
      const username = 'OwnerWithAnExtremelyLongDisplayNameForLayoutChecks';
      for (const language of ['en', 'ar']) {
        const viewport = { width: 320, height: 800 };
        const context = await createContext(browser, { viewport, serviceWorkers: 'block' }, {
          profile: { id: 'layout-owner', username, role: 'OWNER', avatar: '🛡️', progress: [], favorites: [] },
        });
        await setCurrentDeniedConsent(context);
        const page = await context.newPage();
        const assertNoPageErrors = trackPageErrors(page);
        try {
          await page.goto(`${baseUrl}${language === 'ar' ? '/ar/mind-lab/' : '/mind-lab'}`, { waitUntil: NAVIGATION_READY_EVENT });
          await page.locator('#adminNavBtn').waitFor({ state: 'visible' });
          assert.equal(await page.locator('#openAuthBtn').innerText(), language === 'ar' ? 'حسابي' : 'Profile');
          assert.equal(await page.locator('#openAuthBtn').getAttribute('title'), username);
          assert.equal(await page.locator('#adminNavBtn').getAttribute('href'), language === 'ar' ? '/admin?lang=ar' : '/admin');
          assert.equal(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth + 1), true);
          for (const link of await page.locator('.primary-navigation a, .site-utilities a').all()) {
            const rect = await link.boundingBox();
            assertInsideViewport(rect, viewport, 'signed-in owner navigation');
            assert(rect.height >= 44, 'signed-in owner navigation target must remain at least 44px tall');
          }
          await page.locator('#openAuthBtn').click();
          await page.locator('#signedInAccountPanel').waitFor({ state: 'visible' });
          assert((await page.locator('#authModal').innerText()).includes(username), 'account details still identify the signed-in user');
          await page.waitForFunction(() => document.activeElement?.id === 'signedInAccountPanel');
          await page.keyboard.press('Escape');
          await page.locator('#authModal').waitFor({ state: 'hidden' });
          await page.waitForFunction(() => document.activeElement?.id === 'openAuthBtn');
          assertNoPageErrors();
        } finally {
          await context.close();
        }
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
        await page.locator("#playModeQuickFireBtn").waitFor({ state: 'attached' });
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

        // Science remains freely browsable but has no authored choice set yet.
        // Never synthesize wrong answers from unrelated questions to fill it.
        await page.locator('.more-play-modes > summary').click();
        await page.locator("#playModeQuickFireBtn").click();
        await page.waitForFunction(() => document.querySelector('.toast')?.textContent?.includes('Quick Fire'));
        assert.equal(await page.locator('#timedQuizOverlay:not(.hidden)').count(), 0);
        await page.goto(`${baseUrl}/math`, { waitUntil: NAVIGATION_READY_EVENT });
        await page.locator("#playModeQuickFireBtn").waitFor({ state: 'attached' });
        await page.waitForLoadState('networkidle');
        await page.locator('.more-play-modes > summary').click();
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
        assert.equal((await page.locator("#tqProgressText").innerText()).trim(), "1 / 10");
        assert.ok((await page.locator("#tqAnswer").innerText()).length > 0);
        await page.locator("#tqNextBtn").click();
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
        await page.goto(`${baseUrl}/mind-lab`, { waitUntil: NAVIGATION_READY_EVENT });
        await page.locator(".primary-navigation").waitFor();
        await page.waitForFunction(() => document.querySelectorAll('#categoryDirectoryGrid .category-card').length > 0);
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
        const navRect = await page.locator(".primary-navigation").boundingBox();
        assertInsideViewport(consentRect, viewport, "Privacy banner");
        assertInsideViewport(navRect, viewport, "Primary navigation");
        assert(navRect.y + navRect.height <= consentRect.y + 0.5, "Privacy banner overlaps primary navigation");
        assert.equal(await page.locator("#bottomNav, #hamburgerBtn").count(), 0, "duplicate navigation must not return");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

        await page.locator('[data-consent-action="essential"]').click();
        await page.locator("#installBanner").waitFor();
        const installRect = await page.locator("#installBanner").boundingBox();
        assertInsideViewport(installRect, viewport, "Install banner");
        assert(navRect.y + navRect.height <= installRect.y + 0.5, "Install banner overlaps primary navigation");

        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const footerMetrics = await page.locator(".site-footer").evaluate((footer) => {
          const links = [...footer.querySelectorAll('a')].map((link) => link.getBoundingClientRect());
          const install = document.getElementById('installBanner').getBoundingClientRect();
          return {
            lastLinkBottom: Math.max(...links.map((rect) => rect.bottom)),
            installTop: install.top,
            viewportBottom: window.innerHeight,
            trailingDocumentSpace: document.documentElement.scrollHeight - (window.scrollY + window.innerHeight),
          };
        });
        assert(Math.abs(footerMetrics.trailingDocumentSpace) <= 1, `mobile page has blank scroll space after the footer: ${JSON.stringify(footerMetrics)}`);
        assert(footerMetrics.lastLinkBottom <= footerMetrics.installTop + 1, `install banner obscures footer links: ${JSON.stringify(footerMetrics)}`);
        await page.evaluate(() => window.scrollTo(0, 0));
        for (const link of await page.locator('.primary-navigation a').all()) {
          assert.equal(await link.isVisible(), true, "main navigation must remain visible without a hamburger menu");
        }
        assertNoPageErrors();
      } finally {
        await context.close();
      }
    });

    await runTest("Daily Challenge is one bilingual destination with persistent local outcomes", async () => {
      for (const language of ['en', 'ar']) {
        const context = await createContext(browser, { viewport: { width: 360, height: 800 }, serviceWorkers: 'block' });
        await setCurrentDeniedConsent(context);
        const page = await context.newPage();
        const assertNoPageErrors = trackPageErrors(page);
        const dailyRoute = language === 'ar' ? '/ar/daily/' : '/daily';
        try {
          await page.goto(`${baseUrl}${language === 'ar' ? '/ar/' : '/'}`, { waitUntil: NAVIGATION_READY_EVENT });
          await page.locator('.primary-navigation [data-nav="daily"]').click();
          await page.waitForURL(`${baseUrl}${dailyRoute}`);
          await page.locator('.daily-challenge-q').waitFor({ state: 'visible' });
          const question = await page.locator('.daily-challenge-q').innerText();
          assert(question.trim().length > 0);
          assert.equal(await page.locator('.primary-navigation [aria-current="page"]').getAttribute('data-nav'), 'daily');
          assert.equal(await page.locator('html').getAttribute('lang'), language);
          await page.locator('#flipDailyBtn').click();
          await page.locator('.daily-challenge-answer').waitFor({ state: 'visible' });
          assert((await page.locator('.daily-challenge-answer').innerText()).trim().length > 0);
          await page.locator('#dailyKnewBtn').click();
          await page.locator('.daily-done').waitFor({ state: 'visible' });
          await page.reload({ waitUntil: NAVIGATION_READY_EVENT });
          await page.locator('.daily-done').waitFor({ state: 'visible' });
          assert.equal(await page.locator('.daily-challenge-q').innerText(), question);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
          assertNoPageErrors();
        } finally {
          await context.close();
        }
      }
    });

    await runTest("every game loads a playable surface and responds to an action", async () => {
      const context = await createContext(browser, {
        viewport: { width: 1280, height: 800 },
        serviceWorkers: "block",
      });
      await setCurrentDeniedConsent(context);
      try {
        for (const fixture of GAME_SMOKE_FIXTURES) {
          const page = await context.newPage();
          const assertNoPageErrors = trackPageErrors(page);
          try {
            const response = await page.goto(`${baseUrl}${fixture.route}`, {
              waitUntil: NAVIGATION_READY_EVENT,
            });
            assert.equal(response?.status(), 200, `${fixture.name} returned ${response?.status()}`);
            const root = page.locator(fixture.root);
            await root.waitFor({ state: "visible" });
            const action = page.locator(fixture.action).first();
            await action.waitFor({ state: "visible" });
            assert.equal(await action.isDisabled(), false, `${fixture.name} action is unexpectedly disabled`);
            await action.click();
            await page.waitForTimeout(50);
            await root.waitFor({ state: "visible" });
            assertNoPageErrors();
          } finally {
            await page.close();
          }
        }
      } finally {
        await context.close();
      }
    });

    await runTest("Akshifha bilingual deduction, selection limits, progress, and responsive layout", async () => {
      const cake = AKSHIFHA_CASES.find((item) => item.id === "the-first-van");
      const revealCase = AKSHIFHA_CASES.find((item) => item.id === "one-table-please");
      assert(cake && revealCase, "Akshifha browser fixtures require the authored cake and booking cases");
      const wrongOption = cake.options.find((option) => option.id !== cake.solution.optionId);
      assert(wrongOption, "The cake case needs a distractor to exercise incorrect submissions");
      const progressKey = "riddlearabia-akshifha-v1";
      const paths = { en: "/akshifha", ar: "/ar/games/akshifha/" };

      // Real browser checks, deliberately not replaced by source or mock-DOM
      // assertions. Each locale/viewport starts with a fresh guest casebook.
      for (const width of [320, 1280]) {
        for (const language of ["en", "ar"]) {
          const context = await createContext(browser, {
            viewport: { width, height: 900 },
            serviceWorkers: "block",
          });
          await setCurrentDeniedConsent(context);
          const page = await context.newPage();
          const assertNoPageErrors = trackPageErrors(page);
          const consoleErrors = [];
          page.on("console", (message) => {
            if (message.type() === "error") consoleErrors.push(message.text());
          });
          const label = `Akshifha ${language} at ${width}px`;
          const readProgress = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), progressKey);
          const casebookStatus = (id) => page.locator(`#ak-case-list [data-case-id="${id}"] .ak-case-entry-status`);
          const assertNoHorizontalOverflow = async (stage) => {
            const metrics = await page.evaluate(() => {
              const viewportWidth = document.documentElement.clientWidth;
              const surfaces = [...document.querySelectorAll(".unified-header, .ak-main, .ak-evidence-grid, .ak-options, .ak-casebook, .ak-footer")]
                .filter((node) => node.getClientRects().length)
                .map((node) => {
                  const rect = node.getBoundingClientRect();
                  return { name: node.className, left: rect.left, right: rect.right };
                });
              return {
                viewportWidth,
                documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
                surfaces,
              };
            });
            assert(metrics.documentWidth <= metrics.viewportWidth + 1,
              `${label}, ${stage}: horizontal document overflow ${JSON.stringify(metrics)}`);
            for (const surface of metrics.surfaces) {
              assert(surface.left >= -1 && surface.right <= metrics.viewportWidth + 1,
                `${label}, ${stage}: surface outside viewport ${JSON.stringify(surface)}`);
            }
          };

          try {
            const response = await page.goto(`${baseUrl}${paths[language]}?case=${cake.id}&mode=practice`, {
              waitUntil: NAVIGATION_READY_EVENT,
            });
            assert.equal(response?.status(), 200, `${label}: route response`);
            await page.locator("#ak-game").waitFor({ state: "visible" });
            assert.equal(await page.locator("html").getAttribute("lang"), language);
            assert.equal(await page.locator("html").getAttribute("dir"), language === "ar" ? "rtl" : "ltr");
            assert.equal(await page.locator("#ak-case-title").innerText(), cake.title[language]);
            assert.equal(await page.locator('.language-route-link').getAttribute('hreflang'), language === 'ar' ? 'en' : 'ar');
            assert.equal(await page.locator("#ak-case-list [data-case-id]").count(), 11);
            assert.equal(await page.locator("#ak-check").isDisabled(), true);
            assert.equal(await page.locator('#ak-evidence input[type="checkbox"]:checked').count(), 0);
            assert.equal(await page.locator('#ak-evidence [data-proof="true"]').count(), 0,
              `${label}: the evidence must not disclose the solution before completion`);
            await assertNoHorizontalOverflow("initial case");

            const firstClue = page.locator(`#ak-evidence input[value="${cake.solution.evidenceIds[0]}"]`);
            const secondClue = page.locator(`#ak-evidence input[value="${cake.solution.evidenceIds[1]}"]`);
            await firstClue.check();
            assert.equal(await page.locator("#ak-check").isDisabled(), true, `${label}: one clue is incomplete`);
            await secondClue.check();
            assert.equal(await page.locator('#ak-evidence input[type="checkbox"]:checked').count(), 2);
            assert.equal(await page.locator('#ak-evidence input[type="checkbox"]:not(:checked):disabled').count(), cake.evidence.length - 2,
              `${label}: a third clue cannot be selected`);
            assert.equal(await firstClue.isDisabled(), false, `${label}: selected clues remain available for swapping`);
            await firstClue.uncheck();
            assert.equal(await page.locator('#ak-evidence input[type="checkbox"]:disabled').count(), 0,
              `${label}: unselecting a clue unlocks the alternatives`);
            await firstClue.check();
            await page.locator(`#ak-options input[value="${wrongOption.id}"]`).check();
            await page.locator("#ak-check").click();
            assert.equal(await page.locator("#ak-feedback").getAttribute("data-wrong"), "true");
            assert.equal(await page.locator("#ak-feedback").innerText(), AKSHIFHA_UI[language].akWrong);
            assert.equal(await page.locator("#ak-result").isVisible(), false);
            assert.equal(await casebookStatus(cake.id).innerText(), AKSHIFHA_UI[language].akUnplayed);
            assert.equal(await readProgress(), null, `${label}: an incorrect check is not a completion`);

            await page.locator(`#ak-options input[value="${cake.solution.optionId}"]`).check();
            await page.locator("#ak-check").click();
            await page.locator("#ak-result").waitFor({ state: "visible" });
            assert.equal(await page.locator("#ak-result-title").innerText(), AKSHIFHA_UI[language].akSolved);
            assert.equal(await page.locator("#ak-explanation").innerText(), cake.explanation[language]);
            assert.equal(await page.locator("#ak-proof li").count(), 2);
            assert.equal(await page.locator("#ak-check").isDisabled(), true);
            assert.equal(await casebookStatus(cake.id).innerText(), AKSHIFHA_UI[language].akStatusSolved);
            assert.deepEqual((await readProgress()).cases[cake.id], {
              completed: true, attempts: 2, hintsUsed: 0, revealed: false,
            }, `${label}: only the completed personal result is stored`);
            await assertNoHorizontalOverflow("solved explanation");

            await page.reload({ waitUntil: NAVIGATION_READY_EVENT });
            await page.locator("#ak-game").waitFor({ state: "visible" });
            assert.equal(await casebookStatus(cake.id).innerText(), AKSHIFHA_UI[language].akStatusSolved,
              `${label}: the casebook persists across reload`);
            const otherLanguage = language === "en" ? "ar" : "en";
            await page.locator('.language-route-link').click();
            await page.waitForURL((url) => url.pathname === paths[otherLanguage]
              && url.searchParams.get("case") === cake.id && url.searchParams.get("mode") === "practice");
            await page.locator("#ak-game").waitFor({ state: "visible" });
            assert.equal(await page.locator("html").getAttribute("lang"), otherLanguage);
            assert.equal(await page.locator("html").getAttribute("dir"), otherLanguage === "ar" ? "rtl" : "ltr");
            assert.equal(await page.locator("#ak-case-title").innerText(), cake.title[otherLanguage],
              `${label}: changing language preserves the exact case`);
            assert.equal(await casebookStatus(cake.id).innerText(), AKSHIFHA_UI[otherLanguage].akStatusSolved);
            assert.equal(await page.locator('.primary-navigation [data-nav="games"]').getAttribute("href"),
              otherLanguage === "ar" ? "/ar/play/" : "/play");
            assert.equal(await page.locator('a[data-i18n="akPrivacy"]').getAttribute("href"),
              otherLanguage === "ar" ? "/ar/privacy/" : "/privacy");
            await assertNoHorizontalOverflow("language switch");

            await page.locator(`#ak-case-list [data-case-id="${revealCase.id}"]`).click();
            assert.equal(await page.locator("#ak-case-title").innerText(), revealCase.title[otherLanguage]);
            await page.locator("#ak-reveal").click();
            await page.locator("#ak-reveal-confirm").waitFor({ state: "visible" });
            await page.locator("#ak-reveal-no").click();
            assert.equal(await page.locator("#ak-reveal-confirm").isVisible(), false);
            assert.equal(await page.locator("#ak-result").isVisible(), false, `${label}: cancel does not reveal`);
            await page.locator("#ak-reveal").click();
            await page.locator("#ak-reveal-yes").click();
            await page.locator("#ak-result").waitFor({ state: "visible" });
            assert.equal(await page.locator("#ak-result-title").innerText(), AKSHIFHA_UI[otherLanguage].akRevealed);
            assert.equal(await page.locator("#ak-explanation").innerText(), revealCase.explanation[otherLanguage]);
            const progress = await readProgress();
            assert.deepEqual(progress.cases[revealCase.id], {
              completed: true, attempts: 0, hintsUsed: 0, revealed: true,
            }, `${label}: revealing is stored separately from solving`);
            assert.equal(progress.cases[cake.id].revealed, false, `${label}: another case cannot overwrite the solved result`);
            assert.equal(Object.keys(progress.cases).length, 2);
            await assertNoHorizontalOverflow("revealed explanation");
            await page.reload({ waitUntil: NAVIGATION_READY_EVENT });
            await page.locator("#ak-game").waitFor({ state: "visible" });
            assert.equal(await casebookStatus(revealCase.id).innerText(), AKSHIFHA_UI[otherLanguage].akStatusRevealed,
              `${label}: revealed status also persists across reload`);
            assertNoPageErrors();
            assert.deepEqual(consoleErrors, [], `${label}: unexpected console errors:\n${consoleErrors.join("\n")}`);
          } finally {
            await context.close();
          }
        }
      }
    });

    await runTest("Battle query invite joins a second player and starts the same question", async () => {
      const battle = {
        code: "SCI7X2KQ",
        hostId: "host-token",
        creates: [],
      };
      const context = await createContext(browser, {
        viewport: { width: 1280, height: 800 },
        serviceWorkers: "block",
      }, { battle });
      await installBattleSocketMock(context, battle);
      const host = await context.newPage();
      const guest = await context.newPage();
      const assertHostErrors = trackPageErrors(host);
      const assertGuestErrors = trackPageErrors(guest);
      try {
        await host.goto(`${baseUrl}/mind-lab`, { waitUntil: NAVIGATION_READY_EVENT });
        await host.locator("#battleNavBtn").click();
        await host.locator("#battleNameInput").waitFor({ state: "visible" });
        await host.locator("#battleNameInput").fill("Host");
        await host.locator("#battleCatSelect").selectOption("math");
        await host.locator("#battleCreateBtn").click();
        await host.locator("#battleShareBtn").waitFor({ state: "visible" });
        assert.deepEqual(battle.creates, [{ category: "math", difficulty: "all", questionCount: 10 }]);
        await host.locator("#battleStartBtn").waitFor({ state: "visible" });
        assert.equal(await host.locator("#battleStartBtn").isDisabled(), true);
        assert.match(await host.locator(".battle-waiting-msg").innerText(), /Invite one friend/u);

        await host.locator("#battleShareBtn").click();
        await host.waitForFunction(() => typeof window.__battleCopiedText === "string");
        const copiedText = await host.evaluate(() => window.__battleCopiedText);
        const inviteText = copiedText.split("\n").find((value) => value.startsWith("http"));
        assert(inviteText, `Battle invite clipboard payload did not contain a URL: ${copiedText}`);
        const inviteUrl = new URL(inviteText);
        assert.equal(inviteUrl.origin, new URL(baseUrl).origin);
        assert.equal(inviteUrl.pathname, "/mind-lab");
        assert.equal(inviteUrl.searchParams.get("battle"), battle.code);
        assert.equal(inviteUrl.hash, "");

        await guest.goto(inviteUrl.href, { waitUntil: NAVIGATION_READY_EVENT });
        await guest.locator("#battleCodeInput").waitFor({ state: "visible" });
        assert.equal(await guest.locator("#battleCodeInput").inputValue(), battle.code);
        await guest.locator("#battleNameInput").fill("Guest");
        await guest.locator("#battleJoinBtn").click();
        await guest.waitForFunction(() => document.querySelector("#battleJoinBtn")?.disabled === true);
        assert.equal(await guest.locator("#battleJoinBtn").isDisabled(), true);
        assert.equal(await guest.locator("#battleJoinBtn").getAttribute('aria-busy'), 'true');
        await guest.evaluate(() => window.__releaseBattleJoinAck());
        await guest.locator("#battleShareBtn").waitFor({ state: "visible" });
        await host.locator(".battle-player-row").filter({ hasText: "Guest" }).waitFor({ state: "visible" });
        await host.waitForFunction(() => document.querySelector("#battleStartBtn")?.disabled === false);
        assert.equal(await host.locator("#battleStartBtn").isDisabled(), false);
        await host.locator("#battleStartBtn").click();

        for (const page of [host, guest]) {
          await page.locator("#battleOptions").waitFor({ state: "visible" });
          assert.equal(await page.locator("#battleOptions .battle-option-btn").count(), 4);
          assert.match(await page.locator(".battle-player-count").innerText(), /2 players/u);
          const socketUrl = await page.evaluate(() => window.__battleSocketUrls?.[0]);
          assert(socketUrl, "Battle did not open a WebSocket");
          const socket = new URL(socketUrl);
          assert.equal(socket.pathname, "/ws/battle");
          assert.equal(socket.searchParams.get("code"), battle.code);
        }
        assertHostErrors();
        assertGuestErrors();
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
      const coldRequests = [];
      context.on('request', (request) => coldRequests.push(new URL(request.url()).pathname));
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
        ), ['/science', '/ar/privacy/', '/akshifha', '/offline']), [false, false, false, true]);
        assert.deepEqual(coldRequests.filter((pathname) => (
          pathname.startsWith('/data/') || /^\/akshifha(?:[./]|$)/u.test(pathname)
        )), [], 'opening Chess must not prefetch unrelated games or question data');

        // The first document arrives before service-worker control. Visit the
        // selected routes after activation so the demand cache can save their
        // document, runtime, and data. Never warm unrelated routes at install.
        await page.goto(`${baseUrl}/chess?cache_visit=1`, { waitUntil: NAVIGATION_READY_EVENT });
        await page.locator('#chessBoard').waitFor({ state: 'visible' });
        await page.waitForLoadState('networkidle');
        await page.goto(`${baseUrl}/science`, { waitUntil: NAVIGATION_READY_EVENT });
        await page.waitForFunction(() => document.querySelectorAll('#cardGrid .riddle-card').length === 20);
        await page.waitForLoadState('networkidle');
        await page.goto(`${baseUrl}/ar/privacy/`, { waitUntil: NAVIGATION_READY_EVENT });
        await page.locator('h1').waitFor();
        await page.waitForLoadState('networkidle');
        assert.deepEqual(await page.evaluate(async (paths) => (
          Promise.all(paths.map(async (path) => Boolean(await caches.match(path))))
        ), ['/chess', '/science', '/data/science.json', '/ar/privacy/', '/offline']), [true, true, true, true, true]);

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
        assert.match(await page.title(), /^Offline \| Riddle Arabia$/u);
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

    console.log(`Browser regression passed: 12 suites on ${BROWSER_ENGINE}.`);
  } finally {
    await browser.close();
    await server.close();
  }
}

try {
  await main();
} catch (error) {
  console.error("\nBrowser regression failed");
  console.error(error?.stack || error);
  for (const [label, value] of [["Actual", error?.actual], ["Expected", error?.expected]]) {
    if (value === undefined) continue;
    try {
      console.error(`${label}:\n${JSON.stringify(value, null, 2)}`);
    } catch {
      console.error(`${label}:\n${String(value)}`);
    }
  }
  process.exitCode = 1;
}
