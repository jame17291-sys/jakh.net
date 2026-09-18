import assert from "node:assert/strict";
import test from "node:test";
import { inspectFeaturedCollections } from "./content-review-featured-lib.mjs";

function fixture() {
  return {
    pages: [{
      key: "cartoons",
      cards: [["cartoons", "one"], ["cartoons", "two"]],
    }],
    cards: {
      cartoons: [
        { id: "one", subcategory: { en: "Series One", ar: "المسلسل الأول" }, question: { en: "In Series One, who travels?", ar: "في المسلسل الأول، من يسافر؟" }, answer: { en: "A", ar: "أ" } },
        { id: "two", subcategory: { en: "Series Two", ar: "المسلسل الثاني" }, question: { en: "In Series Two, who travels?", ar: "في المسلسل الثاني، من يسافر؟" }, answer: { en: "B", ar: "ب" } },
      ],
    },
    policy: {
      collections: {
        cartoons: {
          cardCount: 2,
          sourceCategories: ["cartoons"],
          minSubcategories: 2,
          requireSubcategoryInQuestion: true,
        },
      },
      holds: [],
    },
  };
}

test("mixed featured content carries its series context in both languages", () => {
  const f = fixture();
  assert.deepEqual(inspectFeaturedCollections(f.pages, f.cards, f.policy).errors, []);
  f.cards.cartoons[1].question.ar = "من يسافر؟";
  assert.match(inspectFeaturedCollections(f.pages, f.cards, f.policy).errors.join("\n"), /ar question must name its series/u);
});

test("a featured hold cannot silently return to a selection", () => {
  const f = fixture();
  f.policy.holds = [{ id: "two", reason: "Contradictory bilingual answer" }];
  assert.match(inspectFeaturedCollections(f.pages, f.cards, f.policy).errors.join("\n"), /unresolved editorial hold/u);
});

test("duplicate selections and unapproved source categories are rejected", () => {
  const f = fixture();
  f.pages[0].cards[1] = ["other", "one"];
  const errors = inspectFeaturedCollections(f.pages, f.cards, f.policy).errors.join("\n");
  assert.match(errors, /duplicate selection/u);
  assert.match(errors, /source category is not declared/u);
});
