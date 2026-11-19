import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import test from "node:test";

import { NAVIGATION_GRACE_MS, trackPageErrors } from "./browser-page-errors.mjs";

const LEFT_PAGE = "/localhost:8787/api/content/questions?category=tv-shows-trivia due to access control checks.";

function fakePage() {
  const page = new EventEmitter();
  const mainFrame = { name: "main" };
  const childFrame = { name: "child" };
  page.mainFrame = () => mainFrame;
  let time = 10_000;
  return {
    page,
    now: () => time,
    advance: (ms) => { time += ms; },
    error: (message) => page.emit("pageerror", new Error(message)),
    navigate: ({ frame = mainFrame, navigation = true } = {}) => page.emit("request", { isNavigationRequest: () => navigation, frame: () => frame }),
    commit: (frame = mainFrame) => page.emit("framenavigated", frame),
    childFrame,
  };
}

test("the WebKit left-page API line is set aside only around a main-frame navigation", () => {
  // The release failure of 2026-11-19: the page is reloaded and retries its
  // background request while the next document is still on its way.
  const during = fakePage();
  const assertDuring = trackPageErrors(during.page, { engine: "webkit", now: during.now });
  during.navigate();
  during.advance(250);
  during.error(LEFT_PAGE);
  during.advance(400);
  during.commit();
  assert.doesNotThrow(() => assertDuring());

  // Reported just before the navigation request is seen, or just after it commits.
  const edges = fakePage();
  const assertEdges = trackPageErrors(edges.page, { engine: "webkit", now: edges.now });
  edges.error("/localhost:8787/api/health due to access control checks.");
  edges.advance(NAVIGATION_GRACE_MS);
  edges.navigate();
  edges.advance(30);
  edges.commit();
  edges.advance(NAVIGATION_GRACE_MS);
  edges.error("/127.0.0.1:8787/api/auth/session due to access control checks.");
  assert.doesNotThrow(() => assertEdges());
});

test("the same line still fails a test that did not leave the page", () => {
  const idle = fakePage();
  const assertIdle = trackPageErrors(idle.page, { engine: "webkit", now: idle.now });
  idle.error(LEFT_PAGE);
  assert.throws(() => assertIdle(), /Unexpected page errors:[\s\S]+access control checks/u, "no navigation at all");

  const early = fakePage();
  const assertEarly = trackPageErrors(early.page, { engine: "webkit", now: early.now });
  early.error(LEFT_PAGE);
  early.advance(NAVIGATION_GRACE_MS + 1);
  early.navigate();
  early.commit();
  assert.throws(() => assertEarly(), /access control checks/u, "more than the grace period before a navigation");

  const late = fakePage();
  const assertLate = trackPageErrors(late.page, { engine: "webkit", now: late.now });
  late.navigate();
  late.commit();
  late.advance(NAVIGATION_GRACE_MS + 1);
  late.error(LEFT_PAGE);
  assert.throws(() => assertLate(), /access control checks/u, "more than the grace period after the new page committed");

  const framed = fakePage();
  const assertFramed = trackPageErrors(framed.page, { engine: "webkit", now: framed.now });
  framed.navigate({ frame: framed.childFrame });
  framed.navigate({ navigation: false });
  framed.commit(framed.childFrame);
  framed.error(LEFT_PAGE);
  assert.throws(() => assertFramed(), /access control checks/u, "an iframe navigation or an ordinary request is not leaving the page");
});

test("nothing is set aside in other engines, for other hosts or for other errors", () => {
  for (const engine of ["chromium", "firefox", undefined]) {
    const other = fakePage();
    const assertOther = trackPageErrors(other.page, { engine, now: other.now });
    other.navigate();
    other.error(LEFT_PAGE);
    other.commit();
    assert.throws(() => assertOther(), /access control checks/u, `${engine}: strict`);
  }
  for (const message of [
    "TypeError: undefined is not an object (evaluating 'state.catalog.categories')",
    "/api.riddlearabia.com/api/health due to access control checks.",
    "/localhost:4310/data/science.json due to access control checks.",
    "TypeError: Load failed",
  ]) {
    const strict = fakePage();
    const assertStrict = trackPageErrors(strict.page, { engine: "webkit", now: strict.now });
    strict.navigate();
    strict.error(message);
    strict.commit();
    assert.throws(() => assertStrict(), /Unexpected page errors/u, message);
  }
});

test("a test's own allow-list still applies, and a pending navigation keeps its window open", () => {
  const allowed = fakePage();
  const assertAllowed = trackPageErrors(allowed.page, { engine: "webkit", now: allowed.now });
  allowed.error("TypeError: Load failed");
  assert.throws(() => assertAllowed());
  assert.doesNotThrow(() => assertAllowed([/^TypeError: Load failed$/u]));

  const pending = fakePage();
  const assertPending = trackPageErrors(pending.page, { engine: "webkit", now: pending.now });
  pending.navigate();
  pending.advance(5_000);
  pending.error(LEFT_PAGE);
  assert.doesNotThrow(() => assertPending(), "the old page is still being left until the new one commits");
});

test("the browser suite and its case files share this one tracker", () => {
  const suite = readFileSync(new URL("./browser-regression.mjs", import.meta.url), "utf8");
  assert.match(suite, /import \{ trackPageErrors as trackEnginePageErrors \} from "\.\/browser-page-errors\.mjs";/u);
  assert.match(suite, /const trackPageErrors = \(page\) => trackEnginePageErrors\(page, \{ engine: BROWSER_ENGINE \}\);/u);
  assert.equal(suite.match(/function trackPageErrors/gu), null, "no second, stricter-or-looser copy");
});
