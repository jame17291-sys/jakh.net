import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

import { startBrowserSite } from "./local-browser-site.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_ROOT = resolve(process.env.JAKH_SITE_ROOT || REPOSITORY_ROOT);
const SITE_MANIFEST_PATH = process.env.JAKH_SITE_MANIFEST
  ? resolve(process.env.JAKH_SITE_MANIFEST)
  : null;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const ROUTES = [
  ["English home", "/"],
  ["Arabic home", "/ar/"],
  ["English topic index", "/mind-lab"],
  ["Arabic topic index", "/ar/mind-lab/"],
  ["English quiz", "/science"],
  ["Arabic quiz", "/ar/topics/science/"],
  ["game hub", "/play"],
  ["privacy center", "/privacy"],
  ["admin", "/admin"],
  ["Go game", "/go"],
  ["SET game", "/set"],
  ["Diplomacy game", "/diplomacy"],
  ["Chess game", "/chess"],
  ["Mastermind game", "/mastermind"],
  ["Reversi game", "/reversi"],
  ["Codenames game", "/codenames"],
  ["Catan game", "/catan"],
  ["Backgammon game", "/backgammon"],
  ["Hanabi game", "/hanabi"],
  ["offline fallback", "/offline"],
];

async function configureContext(context, { completedDaily = false, ownerAdmin = false } = {}) {
  await context.addInitScript(({ seedCompletedDaily }) => {
    localStorage.setItem("jakh-consent-v1", JSON.stringify({
      version: 2,
      noticeVersion: "2026-08-01",
      analytics: false,
      updatedAt: new Date(0).toISOString(),
      source: "accessibility-browser",
    }));
    if (seedCompletedDaily) {
      const today = new Date().toISOString().split("T")[0];
      const card = {
        id: "accessibility-daily-card",
        categorySlug: "science",
        categoryTitle: { en: "Science", ar: "العلوم" },
        categoryEmoji: "🔬",
        difficulty: "easy",
        question: { en: "Which planet is closest to the Sun?", ar: "ما الكوكب الأقرب إلى الشمس؟" },
        answer: { en: "Mercury", ar: "عطارد" },
      };
      sessionStorage.setItem(`jakh-daily-${today}`, JSON.stringify(card));
      localStorage.setItem(`jakh-daily-outcome-${today}`, JSON.stringify({
        cardId: card.id,
        categoryId: card.categorySlug,
        result: "correct",
        recordedAt: new Date(0).toISOString(),
      }));
    }
  }, { seedCompletedDaily: completedDaily });
  await context.route("https://api.jakh.net/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const fulfillJson = (body, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    if (path === "/api/health") {
      await fulfillJson({
        ok: true,
        schema: "8",
        targetSchema: "8",
        features: { registration: true, accountRecovery: true, accountDeletion: true },
      });
      return;
    }
    if (ownerAdmin && path === "/api/user/profile") {
      await fulfillJson({
        id: "owner-a11y",
        username: "AccessibilityOwner",
        email: "owner@example.test",
        role: "OWNER",
        avatar: "🛡️",
      });
      return;
    }
    if (ownerAdmin && path === "/api/admin/overview") {
      await fulfillJson({
        metrics: {
          users: 12,
          administrators: 2,
          activeSessions: 4,
          solved: 350,
          pendingSuggestions: 1,
          suspendedUsers: 1,
        },
        permissions: { canViewEmail: true },
        recentUsers: [{
          id: "member-a11y",
          username: "MemberOne",
          email: "member@example.test",
          role: "USER",
          createdAt: "2026-08-01T08:00:00.000Z",
        }],
        recentSuggestions: [{
          id: "suggestion-a11y",
          text: "Add a geography challenge.",
          email: "reader@example.test",
          status: "new",
          createdAt: "2026-08-01T09:00:00.000Z",
        }],
      });
      return;
    }
    if (ownerAdmin && path === "/api/admin/security") {
      await fulfillJson({ stepUp: { expiresAt: null } });
      return;
    }
    if (ownerAdmin && path === "/api/admin/users") {
      await fulfillJson({
        users: [
          {
            id: "owner-a11y",
            username: "AccessibilityOwner",
            email: "owner@example.test",
            role: "OWNER",
            isBanned: false,
            createdAt: "2026-07-01T08:00:00.000Z",
            lastLoginAt: "2026-08-01T10:00:00.000Z",
          },
          {
            id: "member-a11y",
            username: "MemberOne",
            email: "member@example.test",
            role: "USER",
            isBanned: false,
            createdAt: "2026-08-01T08:00:00.000Z",
            lastLoginAt: "2026-08-01T09:30:00.000Z",
          },
        ],
        nextOffset: null,
        permissions: { canViewEmail: true },
      });
      return;
    }
    if (ownerAdmin && path === "/api/admin/suggestions") {
      await fulfillJson({
        suggestions: [{
          id: "suggestion-a11y",
          text: "Add a geography challenge.",
          email: "reader@example.test",
          status: "new",
          createdAt: "2026-08-01T09:00:00.000Z",
        }],
        nextOffset: null,
        permissions: { canViewEmail: true },
      });
      return;
    }
    if (ownerAdmin && path === "/api/admin/audit") {
      await fulfillJson({
        events: [{
          id: "audit-a11y",
          actorUsername: "AccessibilityOwner",
          action: "suggestion.status_changed",
          targetType: "suggestion",
          targetId: "suggestion-a11y",
          detail: JSON.stringify({ from: "new", to: "reviewed" }),
          createdAt: "2026-08-01T10:30:00.000Z",
        }],
      });
      return;
    }
    if (path === "/api/auth/session") {
      await fulfillJson({ authenticated: false });
      return;
    }
    await fulfillJson({ error: "Not found", code: "NOT_FOUND" }, 404);
  });
}

function formatViolations(label, violations) {
  return violations.map((violation) => {
    const nodes = violation.nodes.slice(0, 5).map((node) => {
      const target = node.target.join(" ");
      return `    ${target}: ${node.failureSummary || node.html}`;
    }).join("\n");
    return `  [${violation.impact || "unknown"}] ${violation.id} — ${violation.help}\n${nodes}`;
  }).join("\n");
}

async function auditRoute(context, baseUrl, label, route, { readySelector = "" } = {}) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
    assert.equal(response?.status(), 200, `${label} returned ${response?.status()}`);
    await page.locator("body").waitFor({ state: "visible" });
    if (readySelector) await page.locator(readySelector).waitFor({ state: "visible" });
    await page.waitForTimeout(250);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    assert.equal(
      results.violations.length,
      0,
      `${label} has WCAG violations:\n${formatViolations(label, results.violations)}`,
    );
    assert.deepEqual(pageErrors, [], `${label} emitted page errors:\n${pageErrors.join("\n")}`);
    return results.passes.length;
  } finally {
    await page.close();
  }
}

async function auditOwnerAdmin(context, baseUrl, lang) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const tabFixtures = [
    ["overview", "#metricGrid .metric-card"],
    ["people", "#peopleResults .person-card"],
    ["feedback", "#feedbackResults .feedback-card"],
    ["audit", "#auditResults .audit-item"],
    ["security", "#stepUpPill"],
  ];
  let passes = 0;
  try {
    const response = await page.goto(`${baseUrl}/admin${lang === "ar" ? "?lang=ar" : ""}`, { waitUntil: "domcontentloaded" });
    assert.equal(response?.status(), 200, `OWNER admin ${lang} returned ${response?.status()}`);
    await page.locator("#adminApp").waitFor({ state: "visible" });
    for (const [tab, readySelector] of tabFixtures) {
      await page.locator(`#${tab}Tab`).click();
      await page.locator(`[data-panel="${tab}"]`).waitFor({ state: "visible" });
      await page.locator(readySelector).first().waitFor({ state: "visible" });
      await page.waitForTimeout(75);
      const label = `OWNER admin ${lang.toUpperCase()} ${tab}`;
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      assert.equal(
        results.violations.length,
        0,
        `${label} has WCAG violations:\n${formatViolations(label, results.violations)}`,
      );
      passes += results.passes.length;
      console.log(`PASS axe state: ${label}`);
    }
    if (lang === "ar") {
      const computed = await page.evaluate(() => {
        const eyebrow = document.querySelector(".eyebrow");
        return {
          lang: document.documentElement.lang,
          direction: getComputedStyle(document.documentElement).direction,
          fontFamily: getComputedStyle(document.body).fontFamily,
          letterSpacing: eyebrow ? getComputedStyle(eyebrow).letterSpacing : "missing",
          textTransform: eyebrow ? getComputedStyle(eyebrow).textTransform : "missing",
        };
      });
      assert.equal(computed.lang, "ar");
      assert.equal(computed.direction, "rtl");
      assert.match(computed.fontFamily, /Noto Sans Arabic/u);
      assert.ok(["normal", "0px"].includes(computed.letterSpacing), `Arabic tracking is ${computed.letterSpacing}`);
      assert.equal(computed.textTransform, "none");
      console.log("PASS computed Arabic admin typography");
    }
    assert.deepEqual(pageErrors, [], `OWNER admin ${lang} emitted page errors:\n${pageErrors.join("\n")}`);
    return { passes, tabCount: tabFixtures.length };
  } finally {
    await page.close();
  }
}

async function verifyReflow(context, baseUrl, label, route) {
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
    await page.locator("body").waitFor({ state: "visible" });
    await page.waitForTimeout(100);
    const overflow = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      const hasIntentionalHorizontalScroller = (element) => {
        for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const overflowX = getComputedStyle(parent).overflowX;
          if (["auto", "scroll"].includes(overflowX) && parent.scrollWidth > parent.clientWidth + 1) return true;
        }
        return false;
      };
      const documentProblems = document.documentElement.scrollWidth > viewportWidth + 1
        ? [{
            selector: "document",
            rect: {
              width: document.documentElement.scrollWidth,
              viewportWidth,
            },
          }]
        : [];
      const elementProblems = [...document.querySelectorAll("body *")]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden" || style.position === "fixed") return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 0
            && (rect.left < -1 || rect.right > viewportWidth + 1)
            && !hasIntentionalHorizontalScroller(element);
        })
        .slice(0, 10)
        .map((element) => ({ selector: element.id ? `#${element.id}` : element.className || element.tagName, rect: element.getBoundingClientRect().toJSON() }));
      return [...documentProblems, ...elementProblems].slice(0, 10);
    });
    assert.deepEqual(overflow, [], `${label} overflows at the 200% equivalent viewport:\n${JSON.stringify(overflow, null, 2)}`);
  } finally {
    await page.close();
  }
}

async function main() {
  const server = await startBrowserSite({
    siteRoot: SITE_ROOT,
    manifestPath: SITE_MANIFEST_PATH,
    loopbackHost: "127.0.0.1",
  });
  const { artifactManifest, baseUrl } = server;
  const configuredExecutable = process.env.JAKH_BROWSER_EXECUTABLE;
  const macChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const executablePath = configuredExecutable || (existsSync(macChrome) ? macChrome : undefined);
  const browser = await chromium.launch({ headless: true, executablePath });

  try {
    const standardContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await configureContext(standardContext);
    let rulesPassed = 0;
    for (const [label, route] of ROUTES) {
      rulesPassed += await auditRoute(standardContext, baseUrl, label, route);
      console.log(`PASS axe: ${label}`);
    }
    await standardContext.close();

    if (artifactManifest) {
      const response = await fetch(`${baseUrl}/`, { redirect: "error" });
      assert.equal(response.headers.get("x-jakh-site-version"), artifactManifest.buildId);
      assert.match(response.headers.get("content-security-policy") || "", /frame-ancestors 'none'/u);
      console.log(`PASS exact artifact edge identity: ${artifactManifest.buildId}`);
    }

    const forcedColorsContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      forcedColors: "active",
      reducedMotion: "reduce",
    });
    await configureContext(forcedColorsContext);
    for (const [label, route] of ROUTES) {
      rulesPassed += await auditRoute(forcedColorsContext, baseUrl, `${label} (forced colors)`, route);
      console.log(`PASS axe forced colors: ${label}`);
    }
    await forcedColorsContext.close();

    // Halving a 1280×800 CSS viewport exercises the same responsive layout
    // available after 200% browser zoom, including media-query reflow. CSS
    // `zoom: 200%` would only magnify boxes and create false positives because
    // it does not update viewport media queries.
    const zoomContext = await browser.newContext({ viewport: { width: 640, height: 400 } });
    await configureContext(zoomContext);
    for (const [label, route] of ROUTES) {
      await verifyReflow(zoomContext, baseUrl, label, route);
      console.log(`PASS 200% reflow: ${label}`);
    }
    await zoomContext.close();

    const completedDailyContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await configureContext(completedDailyContext, { completedDaily: true });
    rulesPassed += await auditRoute(
      completedDailyContext,
      baseUrl,
      "completed daily challenge",
      "/",
      { readySelector: ".daily-challenge-card.daily-done .daily-done-badge" },
    );
    console.log("PASS axe state: completed daily challenge");
    await completedDailyContext.close();

    const ownerAdminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await configureContext(ownerAdminContext, { ownerAdmin: true });
    let adminTabFixtures = 0;
    for (const lang of ["en", "ar"]) {
      const result = await auditOwnerAdmin(ownerAdminContext, baseUrl, lang);
      rulesPassed += result.passes;
      adminTabFixtures += result.tabCount;
    }
    await ownerAdminContext.close();

    console.log(`Accessibility browser audit passed: ${ROUTES.length} standard routes, ${ROUTES.length} forced-color routes, ${ROUTES.length} zoom checks, 1 completed-daily state, ${adminTabFixtures} OWNER-admin tab states, ${rulesPassed} Axe rule passes.`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
