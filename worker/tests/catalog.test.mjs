import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalStatus,
  getCardIndex,
  validateCard,
} from "../dist/catalog.js";

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
