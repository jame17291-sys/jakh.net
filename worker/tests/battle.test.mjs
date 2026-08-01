import assert from "node:assert/strict";
import test from "node:test";
import { buildBattleQuestions, connectBattle, createBattle } from "../dist/battle.js";
import { QUARANTINED_CATEGORY_IDS } from "../dist/content-safety.js";

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

test("non-array category payloads are rejected", () => {
  assert.deepEqual(buildBattleQuestions({ cards }, "all", 5), []);
});

function createBattleRequest(category, difficulty = "all") {
  return new Request("https://api.jakh.net/api/battle/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.11",
    },
    body: JSON.stringify({ category, difficulty, questionCount: 5 }),
  });
}

function createBattleEnv(captured) {
  return {
    DB: {
      prepare() {
        return {
          bind() {
            return this;
          },
          async first() {
            return { count: 1 };
          },
        };
      },
    },
    BATTLE_ROOMS: {
      idFromName() {
        captured.roomLookups += 1;
        throw new Error("Rejected content must not allocate a Durable Object");
      },
    },
    IP_HASH_SALT: "test-ip-hash-salt-at-least-24-characters",
    STATIC_ORIGIN: "https://jakh.net",
  };
}

test("Battle creation denies all held categories before content fetch or room allocation", async (t) => {
  const captured = { fetches: 0, roomLookups: 0 };
  const env = createBattleEnv(captured);
  t.mock.method(globalThis, "fetch", async () => {
    captured.fetches += 1;
    throw new Error("Held content must not be fetched");
  });

  for (const category of QUARANTINED_CATEGORY_IDS) {
    await assert.rejects(
      createBattle(createBattleRequest(category), env),
      (error) => error?.status === 503 && error?.code === "CATEGORY_QUARANTINED",
      category,
    );
  }

  assert.deepEqual(captured, { fetches: 0, roomLookups: 0 });
});

test("Battle creation rejects a held or mismatched card even when selection would omit it", async (t) => {
  const captured = { fetches: 0, roomLookups: 0 };
  const env = createBattleEnv(captured);
  t.mock.method(globalThis, "fetch", async () => {
    captured.fetches += 1;
    return new Response(JSON.stringify([
      ...Array.from({ length: 5 }, (_, index) => ({
        id: `science-${String(index + 21).padStart(3, "0")}`,
        difficulty: "hard",
        question: { en: `Question ${index}`, ar: `سؤال ${index}` },
        answer: { en: `Answer ${index}`, ar: `جواب ${index}` },
      })),
      {
        id: "medical-questions-001",
        difficulty: "easy",
        question: { en: "Held question", ar: "سؤال معلّق" },
        answer: { en: "Held answer", ar: "جواب معلّق" },
      },
    ]), { headers: { "content-type": "application/json" } });
  });

  await assert.rejects(
    createBattle(createBattleRequest("science", "hard"), env),
    (error) => error?.status === 503 && error?.code === "QUESTION_SOURCE_INVALID",
  );
  assert.deepEqual(captured, { fetches: 1, roomLookups: 0 });
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
      origin: "https://jakh.net",
    },
  });

  await assert.rejects(
    () => connectBattle(request, env),
    (error) => error?.status === 429,
  );
  assert.equal(roomLookups, 0);
});

test("WebSocket connections require a browser Origin", async () => {
  let databaseCalls = 0;
  const env = {
    DB: {
      prepare() {
        databaseCalls += 1;
        throw new Error("Missing-origin requests must not consume the rate limiter");
      },
    },
    BATTLE_ROOMS: {},
    IP_HASH_SALT: "test-ip-hash-salt-at-least-24-characters",
  };
  const request = new Request("https://api.jakh.net/ws/battle?code=SCI23456", {
    headers: { upgrade: "websocket" },
  });
  await assert.rejects(
    () => connectBattle(request, env),
    (error) => error?.status === 403,
  );
  assert.equal(databaseCalls, 0);
});

test("WebSocket upgrade forwards only trusted Worker version metadata", async () => {
  for (const workerVersionId of [null, "11111111-1111-4111-8111-111111111111"]) {
    let forwardedVersion;
    const upgradeResponse = { status: 101, webSocket: {} };
    const statement = {
      bind() { return this; },
      async first() { return { count: 1 }; },
    };
    const env = {
      ...(workerVersionId ? { CF_VERSION_METADATA: { id: workerVersionId, tag: "", timestamp: "" } } : {}),
      DB: { prepare() { return statement; } },
      BATTLE_ROOMS: {
        idFromName(code) { return code; },
        get() {
          return {
            async fetch(request) {
              forwardedVersion = request.headers.get("x-jakh-worker-version");
              return upgradeResponse;
            },
          };
        },
      },
      IP_HASH_SALT: "test-ip-hash-salt-at-least-24-characters",
    };
    const request = new Request("https://api.jakh.net/ws/battle?code=SCI23456", {
      headers: {
        upgrade: "websocket",
        origin: "https://jakh.net",
        "cf-connecting-ip": "203.0.113.10",
        "x-jakh-worker-version": "attacker-supplied",
      },
    });

    assert.equal(await connectBattle(request, env), upgradeResponse);
    assert.equal(forwardedVersion, workerVersionId);
  }
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
