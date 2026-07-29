import assert from "node:assert/strict";
import test from "node:test";
import { buildBattleQuestions, connectBattle } from "../dist/battle.js";

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

test("WebSocket connection attempts are rate-limited before room lookup", async () => {
  let roomLookups = 0;
  const statement = {
    bind() {
      return this;
    },
    async first() {
      return { count: 31 };
    },
  };
  const env = {
    DB: {
      prepare() {
        return statement;
      },
    },
    BATTLE_ROOMS: {
      idFromName(code) {
        roomLookups += 1;
        return code;
      },
      get() {
        throw new Error("A rate-limited connection must not reach the room");
      },
    },
    IP_HASH_SALT: "test-ip-hash-salt-at-least-24-characters",
  };
  const request = new Request("https://api.jakh.net/ws/battle?code=SCI23456", {
    headers: {
      upgrade: "websocket",
      "cf-connecting-ip": "203.0.113.10",
    },
  });

  await assert.rejects(
    () => connectBattle(request, env),
    (error) => error?.status === 429,
  );
  assert.equal(roomLookups, 0);
});

test("impossible room codes are rejected without creating random Durable Objects", async () => {
  let databaseCalls = 0;
  let roomLookups = 0;
  const env = {
    DB: {
      prepare() {
        databaseCalls += 1;
        throw new Error("Invalid codes must not consume the rate limiter");
      },
    },
    BATTLE_ROOMS: {
      idFromName() {
        roomLookups += 1;
        throw new Error("Invalid codes must not create a Durable Object");
      },
    },
    IP_HASH_SALT: "test-ip-hash-salt-at-least-24-characters",
  };
  const request = new Request("https://api.jakh.net/ws/battle?code=SCI00000", {
    headers: { upgrade: "websocket" },
  });

  await assert.rejects(
    () => connectBattle(request, env),
    (error) => error?.status === 400,
  );
  assert.equal(databaseCalls, 0);
  assert.equal(roomLookups, 0);
});
