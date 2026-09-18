import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "generate-learning-audit-ledger.mjs");
const ledgerPath = path.join(root, "docs", "content-review", "learning-audit-ledger.json");

test("learning audit ledger covers every source card without inferring approval", () => {
  const generated = spawnSync(process.execPath, [script, "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(generated.status, 0, generated.stderr);

  const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.summary.total, 3553);
  assert.equal(ledger.cards.length, 3553);
  assert.equal(ledger.summary.byDisposition.unreviewed, 3553);
  assert.equal(ledger.summary.byProgrammeEligibility["held-pending-substantive-review"], 3553);
  assert.equal(ledger.summary.byRuntimeProjection["public-legacy-projection"], 3275);
  assert.equal(ledger.summary.byRuntimeProjection.quarantined, 278);

  const example = ledger.cards.find((card) => card.id === "currencies-1");
  assert.ok(example);
  assert.equal(example.review.substantiveStatus, "not-started");
  assert.equal(example.review.languages.equivalence, "not-reviewed");
  assert.equal(example.publication.programmeEligibility, "held-pending-substantive-review");
  assert.match(example.contentVersion, /^[a-f0-9]{64}$/u);
});
