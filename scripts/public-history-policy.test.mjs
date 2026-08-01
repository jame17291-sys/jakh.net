import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const application = fs.readFileSync(path.join(root, "app.js"), "utf8");
const policyBlock = application.match(
  /\/\/ BEGIN PUBLIC HISTORY POLICY[^\n]*\n([\s\S]*?)\/\/ END PUBLIC HISTORY POLICY/u,
)?.[1];

function loadPolicy() {
  assert.ok(policyBlock, "app.js public-history policy block is missing");
  const context = vm.createContext({ Set });
  new vm.Script(`${policyBlock}\nglobalThis.policy = { projectPublicSolvedMap, projectPublicFavoriteIds, cloudMutationIsDeletionOnly, cloudMutationMayPublish, dailyRecordIsUnavailableForPublication };`)
    .runInContext(context);
  return context.policy;
}

test("public history projection hides held IDs without mutating recoverable raw records", () => {
  const { projectPublicSolvedMap, projectPublicFavoriteIds } = loadPolicy();
  const allowed = new Set(["public-1", "public-2"]);
  const rawSolved = {
    "public-1": { status: "easy", categoryId: "science" },
    "held-1": { status: "hard", categoryId: "medical-questions" },
  };
  const rawFavorites = ["held-1", "public-2", "public-2"];

  assert.deepEqual(
    JSON.parse(JSON.stringify(projectPublicSolvedMap(rawSolved, allowed))),
    { "public-1": { status: "easy", categoryId: "science" } },
  );
  assert.deepEqual([...projectPublicFavoriteIds(rawFavorites, allowed)], ["public-2"]);
  assert.equal(rawSolved["held-1"].categoryId, "medical-questions");
  assert.deepEqual(rawFavorites, ["held-1", "public-2", "public-2"]);
});

test("cloud retry policy publishes only public cards while allowing deletion-only cleanup", () => {
  const { cloudMutationIsDeletionOnly, cloudMutationMayPublish } = loadPolicy();
  const allowed = new Set(["public-1"]);
  const publicAdd = { endpoint: "/user/favorite", method: "POST", body: { cardId: "public-1", action: "add" } };
  const heldAdd = { endpoint: "/user/favorite", method: "POST", body: { cardId: "held-1", action: "add" } };
  const heldFavoriteDelete = { endpoint: "/user/favorite", method: "POST", body: { cardId: "held-1", action: "remove" } };
  const heldProgressDelete = { endpoint: "/user/progress", method: "DELETE", body: { cardId: "held-1" } };

  assert.equal(cloudMutationMayPublish(publicAdd, allowed), true);
  assert.equal(cloudMutationMayPublish(heldAdd, allowed), false);
  assert.equal(cloudMutationMayPublish(heldFavoriteDelete, allowed), true);
  assert.equal(cloudMutationMayPublish(heldProgressDelete, allowed), true);
  assert.equal(cloudMutationIsDeletionOnly(heldFavoriteDelete), true);
  assert.equal(cloudMutationMayPublish({ endpoint: "/user/progress", method: "DELETE", body: {} }, allowed), false);
});

test("daily history accepts current and legacy public identities while rejecting held or unknown cards", () => {
  const { dailyRecordIsUnavailableForPublication } = loadPolicy();
  const allowed = new Set(["public-1"]);
  const heldCategories = new Set(["medical-questions"]);
  assert.equal(
    dailyRecordIsUnavailableForPublication(
      { cardId: "held-1", categorySlug: "medical-questions" },
      allowed,
      heldCategories,
      true,
    ),
    true,
  );
  assert.equal(
    dailyRecordIsUnavailableForPublication(
      { cardId: "unknown-1", categorySlug: "science" },
      allowed,
      heldCategories,
      true,
    ),
    true,
  );
  assert.equal(
    dailyRecordIsUnavailableForPublication(
      { cardId: "public-1", categorySlug: "science" },
      allowed,
      heldCategories,
      true,
    ),
    false,
  );
  assert.equal(
    dailyRecordIsUnavailableForPublication(
      { id: "public-1", categorySlug: "science" },
      allowed,
      heldCategories,
      true,
    ),
    false,
  );
  assert.equal(
    dailyRecordIsUnavailableForPublication(
      { id: "public-1", cardId: "public-1", categorySlug: "science", categoryId: "SCIENCE" },
      allowed,
      heldCategories,
      true,
    ),
    false,
  );
});

test("daily history fails closed for malformed or conflicting cached identities", () => {
  const { dailyRecordIsUnavailableForPublication } = loadPolicy();
  const allowed = new Set(["public-1"]);
  const heldCategories = new Set(["medical-questions"]);
  const malformed = [
    null,
    [],
    {},
    { id: "public-1" },
    { categorySlug: "science" },
    { id: 1, categorySlug: "science" },
    { id: "../public-1", categorySlug: "science" },
    { id: "public-1", cardId: "public-2", categorySlug: "science" },
    { id: "public-1", categorySlug: "science", categoryId: "biology" },
    { id: "public-1", categorySlug: "../science" },
  ];
  for (const record of malformed) {
    assert.equal(
      dailyRecordIsUnavailableForPublication(record, allowed, heldCategories, false),
      true,
      JSON.stringify(record),
    );
  }
  assert.equal(
    dailyRecordIsUnavailableForPublication(
      { id: "held-1", categorySlug: " MEDICAL-QUESTIONS " },
      allowed,
      heldCategories,
      false,
    ),
    true,
  );
});

test("runtime gates history before first render and clears paired held daily state", () => {
  assert.match(
    application,
    /await Promise\.all\(\[[\s\S]*loadCardIndex\(\)\.catch\(\(\) => null\)[\s\S]*\]\);[\s\S]*rerender\(\);/u,
  );
  assert.match(application, /const guestSolved = getRawGuestSolvedMap\(\);/u);
  assert.match(application, /const guestFavs = getRawGuestFavorites\(\);/u);
  assert.doesNotMatch(
    application,
    /safeStorageRemove\('local', GUEST_KEYS\.solved\);\s*safeStorageRemove\('local', GUEST_KEYS\.favorites\);\s*return true;/u,
  );
  assert.match(
    application,
    /safeStorageRemove\('session', cacheKey\);[\s\S]{0,320}safeStorageRemove\('local', outcomeKey\);/u,
  );
  assert.match(
    application,
    /if \(!cloudMutationMayPublish\(item, publicCardIds\)\) \{[\s\S]*remaining\.push\(item\);[\s\S]*continue;/u,
  );
});
