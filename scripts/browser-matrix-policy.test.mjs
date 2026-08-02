import assert from "node:assert/strict";
import test from "node:test";

import {
  isRetryableWebKitTransportFailure,
  MAX_WEBKIT_TRANSPORT_ATTEMPTS,
} from "./browser-matrix-policy.mjs";

test("WebKit matrix retry is bounded and accepts only the observed transport disconnect", () => {
  assert.equal(MAX_WEBKIT_TRANSPORT_ATTEMPTS, 3);
  assert.equal(
    isRetryableWebKitTransportFailure("webkit", "page.goto: Connection terminated unexpectedly"),
    true,
  );
  assert.equal(
    isRetryableWebKitTransportFailure("chromium", "page.goto: Connection terminated unexpectedly"),
    false,
  );
  for (const failure of [
    "AssertionError: Arabic button text differed",
    "page.goto: Timeout 60000ms exceeded",
    "browser.newContext: Connection terminated unexpectedly",
    "service worker activation timed out",
  ]) {
    assert.equal(isRetryableWebKitTransportFailure("webkit", failure), false, failure);
  }
});
