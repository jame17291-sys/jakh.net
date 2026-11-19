import assert from "node:assert/strict";

// WebKit logs "Fetch API cannot load <url> due to access control checks." when
// a page that is being left has an API request cancelled, or starts or retries
// one while the next document is on its way, and Playwright reports that log
// line as a page error. It stopped the static release of 2026-11-19 in the
// Shuffle Challenge test, whose page loads the next card in the background.
// Every /api/ request in the browser suite is answered by a mock with CORS
// headers, so around a navigation the line says nothing about the product. It
// is set aside only in WebKit, only for the mocked API, and only from one
// second before a main-frame navigation starts until one second after it
// commits. Anywhere else it still fails the test, as it does in other engines.
export const WEBKIT_LEFT_PAGE_API_FETCH = /^\/(?:localhost|127\.0\.0\.1):\d+\/api\/\S+ due to access control checks\.$/u;
export const NAVIGATION_GRACE_MS = 1_000;

export function trackPageErrors(page, { engine, now = Date.now } = {}) {
  const errors = [];
  const navigations = [];
  page.on("pageerror", (error) => errors.push({ message: error.message, at: now() }));
  if (engine === "webkit") {
    const isMainFrame = (frame) => {
      try {
        return frame === page.mainFrame();
      } catch {
        return false;
      }
    };
    page.on("request", (request) => {
      let leavesPage = false;
      try {
        leavesPage = request.isNavigationRequest() && isMainFrame(request.frame());
      } catch {
        // Requests without a frame (service workers) never leave the page.
      }
      if (leavesPage) navigations.push({ started: now(), committed: null });
    });
    page.on("framenavigated", (frame) => {
      const current = navigations[navigations.length - 1];
      if (isMainFrame(frame) && current && current.committed === null) current.committed = now();
    });
  }
  const causedByLeavingThePage = ({ message, at }) => WEBKIT_LEFT_PAGE_API_FETCH.test(message)
    && navigations.some(({ started, committed }) => (
      at >= started - NAVIGATION_GRACE_MS && at <= (committed ?? Infinity) + NAVIGATION_GRACE_MS
    ));
  return (allowedPatterns = []) => {
    const unexpected = errors
      .filter((error) => !causedByLeavingThePage(error))
      .map((error) => error.message)
      .filter((message) => !allowedPatterns.some((pattern) => pattern.test(message)));
    assert.deepEqual(unexpected, [], `Unexpected page errors:\n${unexpected.join("\n")}`);
  };
}
