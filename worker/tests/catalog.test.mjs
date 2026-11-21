import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalStatus,
  formerCategoriesOf,
  getCardIndex,
  isPublicCard,
  publicCardCategory,
  successorCategory,
  validateCard,
  wasCardCategory,
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
  assert.equal(Object.keys(index).length, 3_638);
  assert.deepEqual(index["currencies-3"], ["currencies", "easy"]);
});

test("card validation binds ids, categories, and scoring difficulty", async () => {
  const card = await validateCard({}, "currencies-3", "currencies");
  assert.deepEqual(card, { categoryId: "currencies", difficulty: "easy" });
  assert.equal(canonicalStatus("correct", card.difficulty), "easy");
  assert.equal(canonicalStatus("wrong-easy", card.difficulty), "wrong-easy");

  assert.throws(
    () => canonicalStatus("very-advanced", card.difficulty),
    (error) => error?.status === 400,
  );
  await assert.rejects(
    validateCard({}, "currencies-3", "science"),
    (error) => error?.status === 400,
  );
});

test("cards moved by the 2026-10-25 topic merges keep their ids and follow saved rows to their new topic", async () => {
  const merge = JSON.parse(await readFile(new URL("../../docs/content-review/topic-merge-2026-10-25.json", import.meta.url), "utf8"));
  // The later 2026-10-25 phase-2 content pass removed some moved cards; they
  // leave the index and the move history, and saved rows for them stay hidden.
  const phase2 = JSON.parse(await readFile(new URL("../../docs/content-review/content-phase2-2026-10-25.json", import.meta.url), "utf8"));
  const laterRemoved = new Set(phase2.removed.map((entry) => entry.id));
  const index = await getCardIndex({});
  assert.ok(merge.moved.some((move) => laterRemoved.has(move.id)));
  for (const move of merge.moved.filter((item) => laterRemoved.has(item.id))) {
    assert.equal(index[move.id], undefined, move.id);
    assert.equal(wasCardCategory(move.id, move.from), false, move.id);
    await assert.rejects(validateCard({}, move.id, move.from), (error) => error?.status === 400);
    assert.equal(publicCardCategory(move.id, move.from), null);
    assert.equal(publicCardCategory(move.id, move.to), null);
  }
  for (const move of merge.moved.filter((item) => !laterRemoved.has(item.id))) {
    assert.deepEqual(index[move.id]?.[0], move.to, move.id);
    assert.equal(wasCardCategory(move.id, move.from), true, move.id);
    assert.equal(wasCardCategory(move.id, move.to), false, move.id);
    // Old clients and saved rows may still name the former topic: accepted,
    // and always reported or stored under the current topic.
    assert.deepEqual(await validateCard({}, move.id, move.from), { categoryId: move.to, difficulty: index[move.id][1] });
    assert.deepEqual(await validateCard({}, move.id, move.to), { categoryId: move.to, difficulty: index[move.id][1] });
    assert.equal(publicCardCategory(move.id, move.from), move.to);
    assert.equal(publicCardCategory(move.id, move.to), move.to);
    // Battles and server-checked scoring still bind cards to their current topic only.
    assert.equal(isPublicCard(move.id, move.from), false, move.id);
    assert.equal(isPublicCard(move.id, move.to), true, move.id);
  }
  await assert.rejects(validateCard({}, "science-093", "biology"), (error) => error?.status === 400);
  assert.equal(publicCardCategory("science-093", "biology"), null);
  assert.equal(publicCardCategory("science-001", "science"), "science");
  assert.equal(publicCardCategory("currencies-1", "science"), null);
  assert.equal(publicCardCategory("survival-1", "survival"), null);
  assert.equal(publicCardCategory("missing-card", "science"), null);
  assert.equal(publicCardCategory(undefined, "science"), null);
  for (const removed of merge.removed) {
    assert.equal(index[removed.id], undefined, removed.id);
    await assert.rejects(validateCard({}, removed.id, removed.category), (error) => error?.status === 400);
    assert.equal(publicCardCategory(removed.id, removed.category), null);
  }
  for (const topic of merge.retiredTopics) {
    assert.equal(successorCategory(topic.slug), topic.successor);
    assert.ok(!Object.values(index).some(([categoryId]) => categoryId === topic.slug), topic.slug);
  }
  assert.equal(successorCategory("science"), "science");
  assert.deepEqual(formerCategoriesOf("science"), ["physical-and-life-sciences"]);
  assert.deepEqual(formerCategoriesOf("chemistry"), ["physical-and-life-sciences", "science"]);
  assert.deepEqual(formerCategoriesOf("software-and-computing"), ["coding-and-design"]);
  assert.deepEqual(formerCategoriesOf("currencies"), []);
  assert.equal(wasCardCategory("toString", "science"), false);
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
        && error?.message === "Category is temporarily unavailable"
        && error?.headers?.["retry-after"] === "86400",
      categoryId,
    );
  }

  assert.equal(isPublicCard("science-001", "science"), true);
  assert.equal(isPublicCard("medical-questions-001", "science"), false);
});
