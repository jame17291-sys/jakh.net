import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { buildBattleQuestions, connectBattle, createBattle } from "../dist/battle.js";
import { QUARANTINED_CATEGORY_IDS } from "../dist/content-safety.js";

const cards = Array.from({ length: 8 }, (_, index) => ({
  id: `science-${String(index + 1).padStart(3, "0")}`,
  difficulty: index < 4 ? "easy" : "hard",
  question: { en: `Question ${index}`, ar: `سؤال ${index}` },
  answer: { en: `Answer ${index}`, ar: `جواب ${index}` },
  quickFire: {
    answer: { en: `Answer ${index}`, ar: `جواب ${index}` },
    distractors: {
      en: [`Alternative ${index} A`, `Alternative ${index} B`, `Alternative ${index} C`],
      ar: [`بديل ${index} أ`, `بديل ${index} ب`, `بديل ${index} ج`],
    },
    explanation: { en: `Reason for answer ${index}.`, ar: `سبب الإجابة ${index}.` },
  },
}));

test("battle questions preserve bilingual answer alignment", () => {
  const questions = buildBattleQuestions(cards, "hard", 3);
  assert.equal(questions.length, 3);
  for (const question of questions) {
    assert.match(question.id, /^science-00[5-8]$/u);
    assert.equal(question.options.en.length, 4);
    assert.equal(question.options.ar.length, 4);
    assert.equal(question.options.en[question.correctIndex], question.answer.en);
    assert.equal(question.options.ar[question.correctIndex], question.answer.ar);
    const original = cards.find((card) => card.id === question.id).quickFire;
    for (let index = 0; index < 4; index += 1) {
      const enOrder = [original.answer.en, ...original.distractors.en].indexOf(question.options.en[index]);
      assert.equal(question.options.ar[index], [original.answer.ar, ...original.distractors.ar][enOrder]);
    }
  }
});

test("battle never manufactures distractors from other cards or generic fallbacks", () => {
  const [question] = buildBattleQuestions([cards[0]], "all", 5);
  assert.deepEqual(new Set(question.options.en), new Set([
    cards[0].quickFire.answer.en, ...cards[0].quickFire.distractors.en,
  ]));
  const unprepared = cards.map(({ quickFire: _quickFire, ...card }) => card);
  assert.deepEqual(buildBattleQuestions(unprepared, "all", 5), []);
  assert.deepEqual(buildBattleQuestions([null, {}, ...unprepared], "all", 5), []);
});

const eligibilityCases = [
  ["missing choices", (card) => { delete card.quickFire; }],
  ["array choices", (card) => { card.quickFire = []; }],
  ["incorrect authored answer", (card) => { card.quickFire.answer.en = "Another answer"; }],
  ["wrong-language correct answer", (card) => { card.quickFire.answer.ar = card.answer.en; }],
  ["missing Arabic question", (card) => { card.question.ar = " "; }],
  ["missing Arabic canonical answer", (card) => { card.answer.ar = " "; }],
  ["missing explanation", (card) => { delete card.quickFire.explanation; }],
  ["empty explanation", (card) => { card.quickFire.explanation.ar = " "; }],
  ["oversized explanation", (card) => { card.quickFire.explanation.en = "a".repeat(1201); }],
  ["missing distractors", (card) => { delete card.quickFire.distractors.ar; }],
  ["too few distractors", (card) => { card.quickFire.distractors.ar.pop(); }],
  ["too many distractors", (card) => { card.quickFire.distractors.en.push("Extra"); }],
  ["non-string distractor", (card) => { card.quickFire.distractors.en[0] = 42; }],
  ["oversized label", (card) => { card.quickFire.distractors.en[0] = "a".repeat(121); }],
  ["too many words", (card) => { card.quickFire.distractors.en[0] = Array(21).fill("one").join(" "); }],
  ["empty normalized choice", (card) => { card.quickFire.distractors.en[0] = "..."; }],
  ["duplicate English choice", (card) => { card.quickFire.distractors.en[1] = ` THE ${card.quickFire.distractors.en[0]}! `; }],
  ["duplicate Arabic choice", (card) => { card.quickFire.distractors.ar[1] = "بَدِيـل ۰ ا"; }],
  ["canonical answer used as distractor", (card) => { card.quickFire.distractors.en[0] = card.answer.en; }],
  ["cross-language canonical collision", (card) => { card.quickFire.distractors.en[0] = card.answer.ar; }],
  ["accepted alias used as distractor", (card) => {
    card.acceptedAnswers = { en: ["Accepted alternative"] };
    card.quickFire.distractors.en[0] = "The accepted alternative!";
  }],
  ["non-array accepted aliases", (card) => { card.acceptedAnswers = { en: "bad" }; }],
  ["non-string accepted aliases", (card) => { card.acceptedAnswers = { ar: [12] }; }],
  ["empty accepted alias", (card) => { card.acceptedAnswers = { en: [" "] }; }],
  ...[
    ["negative sign", "5", "-5"],
    ["plus sign", "5", "+5"],
    ["fraction slash", "1 2", "1/2"],
    ["decimal separator", "3 5", "3.5"],
    ["leading decimal separator", "5", ".5"],
    ["percentage", "50", "50%"],
  ].map(([name, canonical, authored]) => [name, (card) => {
    card.answer.en = canonical;
    card.quickFire.answer.en = authored;
  }]),
];

test("ambiguous or incomplete authored choices are excluded in either language", () => {
  for (const [name, mutate] of eligibilityCases) {
    const card = structuredClone(cards[0]);
    mutate(card);
    assert.deepEqual(buildBattleQuestions([card], "all", 5), [], name);
  }
});

test("concise canonical variants and explicit aliases remain valid", () => {
  const card = structuredClone(cards[0]);
  card.answer = { en: "The answer (with context)", ar: "شرح طويل للإجابة الصحيحة" };
  card.acceptedAnswers = { ar: ["إجابة ٤٢"] };
  card.quickFire.answer = { en: " Answer ", ar: " إجابة ۴۲ " };
  const [question] = buildBattleQuestions([card], "all", 5);
  assert.equal(question.answer.en, "Answer");
  assert.equal(question.answer.ar, "إجابة ۴۲");
  assert.equal(question.options.en[question.correctIndex], "Answer");
});

test("choice equivalence preserves meaningful math notation and normalizes matching digits", () => {
  for (const [canonical, authored, wrong] of [
    ["−5", "-5", "5"],
    ["1/2", "½", "1 2"],
    ["3.5", "٣٫٥", "3 5"],
    ["50%", "５０%", "50"],
  ]) {
    const card = structuredClone(cards[0]);
    card.answer = { en: canonical, ar: canonical };
    card.quickFire.answer = { en: authored, ar: authored };
    card.quickFire.distractors = { en: [wrong, "100", "200"], ar: [wrong, "١٠٠", "٢٠٠"] };
    assert.equal(buildBattleQuestions([card], "all", 5).length, 1, `${canonical} / ${authored}`);
  }
});

test("Battle and guest Quick Fire agree on bilingual authored-choice eligibility", () => {
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const start = app.indexOf("function quickFireChoiceKey(");
  const end = app.indexOf("function clearTimedQuizTimers(", start);
  assert.ok(start >= 0 && end > start, "The shared client eligibility contract must remain testable");
  const context = vm.createContext({});
  vm.runInContext(`${app.slice(start, end)};this.isEligible = card => Boolean(preparedQuickFire(card));`, context);
  const cases = [structuredClone(cards[0]), ...eligibilityCases.map(([, mutate]) => {
    const card = structuredClone(cards[0]);
    mutate(card);
    return card;
  })];
  for (const card of cases) {
    assert.equal(buildBattleQuestions([card], "all", 5).length > 0, context.isEligible(card));
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

test("Battle creation requires five prepared questions without disabling the practice catalog", async (t) => {
  for (const source of [
    cards.map(({ quickFire: _quickFire, ...card }) => card),
    cards.slice(0, 4),
  ]) {
    const captured = { fetches: 0, roomLookups: 0 };
    const env = createBattleEnv(captured);
    t.mock.method(globalThis, "fetch", async () => {
      captured.fetches += 1;
      return Response.json(source);
    });
    await assert.rejects(
      createBattle(createBattleRequest("science"), env),
      (error) => error?.status === 400
        && error?.code === "BATTLE_CONTENT_NOT_READY"
        && /free practice library/u.test(error.message),
    );
    assert.deepEqual(captured, { fetches: 1, roomLookups: 0 });
    assert.ok(source.every((card) => card.question.en && card.answer.ar));
    t.mock.restoreAll();
  }
});

test("Battle creation sends only authored choices to the room", async (t) => {
  const captured = { fetches: 0, roomLookups: 0 };
  const env = createBattleEnv(captured);
  let initialized;
  env.BATTLE_ROOMS = {
    idFromName(code) { captured.roomLookups += 1; return code; },
    get() {
      return {
        async fetch(request) {
          initialized = await request.json();
          return new Response(null, { status: 201 });
        },
      };
    },
  };
  t.mock.method(globalThis, "fetch", async () => Response.json(cards));
  const response = await createBattle(createBattleRequest("science"), env);
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.match(result.code, /^SCI[A-HJ-NP-Z2-9]{5}$/u);
  assert.equal(initialized.code, result.code);
  assert.equal(initialized.hostToken, result.hostId);
  assert.equal(initialized.questions.length, 5);
  assert.equal(captured.roomLookups, 1);
  for (const question of initialized.questions) {
    const authored = cards.find((card) => card.id === question.id).quickFire;
    assert.deepEqual(new Set(question.options.en), new Set([authored.answer.en, ...authored.distractors.en]));
    assert.deepEqual(new Set(question.options.ar), new Set([authored.answer.ar, ...authored.distractors.ar]));
    assert.equal(question.options.en[question.correctIndex], question.answer.en);
  }
});

test("Battle does not use choices invalidated by a published question edit", async (t) => {
  const captured = { fetches: 0, roomLookups: 0 };
  const env = createBattleEnv(captured);
  const prepared = cards.slice(0, 5);
  env.DB = {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() { return sql.includes("schema_meta") ? { value: "9" } : { count: 1 }; },
        async all() {
          return { results: [{ questionId: prepared[0].id, snapshotJson: JSON.stringify({
            question: { ...prepared[0].question, ar: "سؤال مختلف" },
            answer: prepared[0].answer,
          }) }] };
        },
      };
    },
  };
  t.mock.method(globalThis, "fetch", async () => Response.json(prepared));
  await assert.rejects(
    createBattle(createBattleRequest("science"), env),
    (error) => error?.status === 400 && error?.code === "BATTLE_CONTENT_NOT_READY",
  );
  assert.equal(captured.roomLookups, 0);
});

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
