import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalStatus,
  getCardIndex,
  isPublicCard,
  validateCard,
} from "../dist/catalog.js";
import {
  isQuarantinedCategory,
  PRODUCTION_QUARANTINE_MANIFEST_SHA256,
  QUARANTINED_CATEGORY_IDS,
} from "../dist/content-safety.js";

const EXPECTED_QUARANTINED_COUNTS = Object.freeze({
  "economics-and-finance": 40,
  "law-middle-east": 48,
  "medical-questions": 100,
  pharmacy: 50,
  survival: 40,
});

test("generated card index contains the complete validated catalog", async () => {
  const index = await getCardIndex({});
  assert.equal(Object.keys(index).length, 3_553);
  assert.deepEqual(index["currencies-1"], ["currencies", "easy"]);
});

test("card validation binds ids, categories, and scoring difficulty", async () => {
  const card = await validateCard({}, "currencies-1", "currencies");
  assert.deepEqual(card, { categoryId: "currencies", difficulty: "easy" });
  assert.equal(canonicalStatus("correct", card.difficulty), "easy");
  assert.equal(canonicalStatus("wrong-easy", card.difficulty), "wrong-easy");

  assert.throws(
    () => canonicalStatus("very-advanced", card.difficulty),
    (error) => error?.status === 400,
  );
  await assert.rejects(
    validateCard({}, "currencies-1", "science"),
    (error) => error?.status === 400,
  );
});

test("the immutable production quarantine covers every one of the 278 held cards", async () => {
  assert.deepEqual(
    [...QUARANTINED_CATEGORY_IDS],
    Object.keys(EXPECTED_QUARANTINED_COUNTS),
  );

  const index = await getCardIndex({});
  const counts = Object.fromEntries(QUARANTINED_CATEGORY_IDS.map((categoryId) => [
    categoryId,
    Object.values(index).filter(([indexedCategory]) => indexedCategory === categoryId).length,
  ]));

  assert.deepEqual(counts, EXPECTED_QUARANTINED_COUNTS);
  assert.equal(Object.values(counts).reduce((sum, count) => sum + count, 0), 278);
  assert.equal(isQuarantinedCategory("science"), false);
});

test("Worker quarantine stays in exact parity with the generated production manifest", async () => {
  const manifestBytes = await readFile(
    new URL("../../docs/content-review/production-quarantine.json", import.meta.url),
  );
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const index = await getCardIndex({});
  const manifestCategories = manifest.categories.map(({ slug }) => slug).sort();
  const workerCategories = [...QUARANTINED_CATEGORY_IDS].sort();
  const manifestCardIds = manifest.categories.flatMap(({ cardIds }) => cardIds).sort();
  const workerCardIds = Object.entries(index)
    .filter(([, [categoryId]]) => isQuarantinedCategory(categoryId))
    .map(([cardId]) => cardId)
    .sort();

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.state, "active");
  assert.equal(
    createHash("sha256").update(manifestBytes).digest("hex"),
    PRODUCTION_QUARANTINE_MANIFEST_SHA256,
  );
  assert.deepEqual(manifestCategories, workerCategories);
  assert.deepEqual(manifestCardIds, workerCardIds);
  assert.equal(manifest.totalCards, workerCardIds.length);
  assert.equal(
    manifest.categories.reduce((sum, category) => sum + category.cardCount, 0),
    workerCardIds.length,
  );
});

test("held categories and cards fail closed at the canonical API boundary", async () => {
  const index = await getCardIndex({});

  for (const categoryId of QUARANTINED_CATEGORY_IDS) {
    const cardId = Object.entries(index).find(([, [indexedCategory]]) => (
      indexedCategory === categoryId
    ))?.[0];
    assert.equal(typeof cardId, "string", categoryId);
    assert.equal(isPublicCard(cardId, categoryId), false, categoryId);
    await assert.rejects(
      validateCard({}, cardId, categoryId),
      (error) => error?.status === 503
        && error?.code === "CATEGORY_QUARANTINED"
        && error?.headers?.["retry-after"] === "86400",
      categoryId,
    );
  }

  assert.equal(isPublicCard("science-001", "science"), true);
  assert.equal(isPublicCard("medical-questions-001", "science"), false);
});
