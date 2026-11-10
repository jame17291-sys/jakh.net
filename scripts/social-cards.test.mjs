import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, ROTATION, buildPlan, cardFits, card, cardHtml, captions, imagePaths, collection } from "./social-cards.mjs";
import { RIDDLE_ARABIA_SEO_PAGES } from "./riddlearabia-seo.mjs";
import { reelHtml, audioExpression } from "./social-reels.mjs";

const HELD_CATEGORIES = ["economics-and-finance", "law-middle-east", "medical-questions", "pharmacy", "survival"];

test("the rotation names real collections with published cards, and never a held category", () => {
  for (const key of ROTATION) {
    const page = collection(key);
    assert.ok((page.cards || []).length >= 24, `${key} has enough cards to rotate`);
    for (const [topic] of page.cards) assert.ok(!HELD_CATEGORIES.includes(topic), `${key} draws from ${topic}`);
  }
});

test("a plan is deterministic, visits every collection in turn and never repeats a card", () => {
  const first = buildPlan({ startDate: "2026-11-11", days: 28 });
  const second = buildPlan({ startDate: "2026-11-11", days: 28 });
  assert.deepEqual(first, second);
  assert.equal(first.length, 28);
  assert.equal(new Set(first.map((entry) => entry.id)).size, 28);
  assert.deepEqual(first.slice(0, ROTATION.length).map((entry) => entry.collection), [...ROTATION]);
  assert.equal(first[0].date, "2026-11-11");
  assert.equal(first[27].date, "2026-12-08");
  for (const entry of first) assert.ok(cardFits(card(entry.topic, entry.id)), `${entry.id} is short and easy or medium`);
});

test("cards already used by an earlier plan are excluded from the next one", () => {
  const first = buildPlan({ startDate: "2026-11-11", days: 28 });
  const next = buildPlan({ startDate: "2026-12-09", days: 28, used: new Set(first.map((entry) => entry.id)) });
  const overlap = next.filter((entry) => first.some((previous) => previous.id === entry.id));
  assert.deepEqual(overlap, []);
});

test("the committed November plan matches its generator, has both images per day and bilingual captions", () => {
  const planPath = path.join(ROOT, "docs", "social", "plan-2026-11.json");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const expected = buildPlan({ startDate: plan.startDate, days: plan.days.length });
  assert.deepEqual(plan.days.map(({ day, date, collection: key, topic, id, reel }) => ({ day, date, collection: key, topic, id, reel })), expected);
  assert.deepEqual(plan.days.filter((entry) => entry.reel).map((entry) => entry.date), ["2026-11-12", "2026-11-19", "2026-11-26", "2026-12-03"], "reels fall on Thursdays");
  for (const entry of plan.days) {
    const paths = imagePaths(entry);
    assert.ok(fs.existsSync(path.join(ROOT, paths.question)), `${paths.question} exists`);
    assert.ok(fs.existsSync(path.join(ROOT, paths.answer)), `${paths.answer} exists`);
    assert.deepEqual(entry.captions, captions(entry));
    const item = card(entry.topic, entry.id);
    assert.ok(entry.captions.instagram.includes(item.question.ar) && entry.captions.instagram.includes(item.question.en));
    assert.ok(!entry.captions.instagram.includes(item.answer.en), "the caption never spoils the answer");
    assert.match(entry.captions.facebook, /\?ref=facebook/u);
  }
});

test("reel markup carries question, answer, the collection link and a seek function; audio is synthesised", () => {
  const entry = buildPlan({ startDate: "2026-11-11", days: 2 })[1];
  const item = card(entry.topic, entry.id);
  const html = reelHtml(entry);
  assert.ok(html.includes(item.question.ar) && html.includes(item.question.en) && html.includes(item.answer.ar) && html.includes(item.answer.en));
  assert.ok(html.includes(`riddlearabia.com${collection(entry.collection).paths.en}`));
  assert.ok(html.includes("window.seek = function"));
  assert.match(audioExpression(), /^[0-9A-Za-z_.*+()\/,-]+$/u, "the ffmpeg expression contains no quoting hazards");
  assert.ok(fs.existsSync(path.join(ROOT, "assets", "social", "2026-11-19-history-004.mp4")), "the first Thursday reel is rendered");
});

test("card markup escapes content and carries both languages", () => {
  const entry = buildPlan({ startDate: "2026-11-11", days: 1 })[0];
  const item = card(entry.topic, entry.id);
  const html = cardHtml(entry, "question");
  assert.ok(html.includes(item.question.ar) && html.includes(item.question.en));
  assert.ok(!html.includes(item.answer.en));
  const fake = { ...entry };
  const original = item.question.en;
  item.question.en = 'Who said "<b>hi</b>" & left?';
  try {
    assert.ok(cardHtml(fake, "question").includes("&lt;b&gt;hi&lt;/b&gt;&quot; &amp; left"));
  } finally {
    item.question.en = original;
  }
});

test("every collection page's cards are still unique across the SEO surface (the plan relies on it)", () => {
  const seen = new Map();
  for (const page of RIDDLE_ARABIA_SEO_PAGES) {
    for (const [, id] of page.cards || []) {
      assert.ok(!seen.has(id), `${id} is featured on both ${seen.get(id)} and ${page.key}`);
      seen.set(id, page.key);
    }
  }
});
