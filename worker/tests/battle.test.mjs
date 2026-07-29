import assert from "node:assert/strict";
import test from "node:test";
import { buildBattleQuestions } from "../dist/battle.js";

const cards = Array.from({ length: 8 }, (_, index) => ({
  id: `science-${index}`,
  difficulty: index < 4 ? "easy" : "hard",
  question: { en: `Question ${index}`, ar: `سؤال ${index}` },
  answer: { en: `Answer ${index}`, ar: `جواب ${index}` },
}));

test("battle questions preserve bilingual answer alignment", () => {
  const questions = buildBattleQuestions(cards, "hard", 3);
  assert.equal(questions.length, 3);
  for (const question of questions) {
    assert.match(question.id, /^science-[4-7]$/u);
    assert.equal(question.options.en.length, 4);
    assert.equal(question.options.ar.length, 4);
    assert.equal(question.options.en[question.correctIndex], question.answer.en);
    assert.equal(question.options.ar[question.correctIndex], question.answer.ar);
  }
});

test("wrapped category files are accepted", () => {
  assert.equal(buildBattleQuestions({ cards }, "all", 5).length, 5);
});
