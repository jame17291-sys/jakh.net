import assert from "node:assert/strict";
import test from "node:test";

import { auditProductionHygiene } from "./validate-production-hygiene.mjs";

test("production remains free-tier compatible, clean, and media-consistent", () => {
  const report = auditProductionHygiene();
  assert.deepEqual(report.failures, []);
  assert.equal(report.summary.categoryIllustrations, 56);
  assert.ok(report.summary.deployableFiles < 20_000);
  assert.ok(report.summary.workerCronTriggers <= 5);
});
