import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  cleanupExpiredVerifiedChallenges,
  createVerifiedChallenge,
  submitVerifiedChallenge,
  verifiedLeaderboard,
  VERIFIED_CHALLENGE_TTL_MS,
  VERIFIED_MINIMUM_MS,
  VERIFIED_QUESTION_COUNT,
} from "../dist/verified-scoring.js";

const SESSION_TOKEN = "A".repeat(43);
const USER = {
  id: "user-verified-1",
  username: "verified_player",
  email: "player@example.com",
  avatar: "🧠",
  role: "USER",
  is_banned: 0,
  token_hash: "stored-session-token-hash",
};
const DIFFICULTIES = ["easy", "medium", "hard", "very-advanced"];
const CURATED_CATEGORY_IDS = [
  "law-middle-east",
  "pharmacy",
  "philosophy",
  "relationship-questions",
  "social-sciences",
  "software-and-computing",
  "story-mysteries",
  "world-habits-and-etiquette",
];
const SOURCE_CARDS = Array.from({ length: 40 }, (_, index) => {
  const number = index + 1;
  const difficulty = DIFFICULTIES[Math.floor(index / 10)];
  return {
    id: `currencies-${number}`,
    difficulty,
    question: {
      en: `Verified question ${number}?`,
      ar: `سؤال موثّق ${number}؟`,
    },
    answer: {
      en: `Answer ${number}`,
      ar: `إجابة ${number}`,
    },
  };
});

function apiRequest(path, body, method = "POST") {
  return new Request(`https://api.jakh.net${path}`, {
    method,
    headers: {
      cookie: `__Host-jakh_session=${SESSION_TOKEN}`,
      "cf-connecting-ip": "203.0.113.61",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  first() {
    return this.database.first(this.sql, this.values);
  }

  run() {
    return this.database.run(this.sql, this.values);
  }

  all() {
    return this.database.all(this.sql, this.values);
  }
}

class FakeDatabase {
  constructor() {
    this.challenges = new Map();
    this.statements = [];
    this.batches = [];
    this.leaderboardRows = [];
  }

  prepare(sql) {
    const statement = new FakeStatement(this, sql);
    this.statements.push(statement);
    return statement;
  }

  async batch(statements) {
    this.batches.push(statements);
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }

  async first(sql, values) {
    if (sql.includes("JOIN users")) return USER;
    if (sql.includes("INSERT INTO rate_limits")) return { count: 1 };

    if (sql.includes("FROM verified_score_sessions") && sql.includes("challenge_token_hash = ?")) {
      const [id, userId, tokenHash] = values;
      const row = this.challenges.get(id);
      return row && row.user_id === userId && row.challenge_token_hash === tokenHash
        ? { ...row }
        : null;
    }

    if (sql.includes("UPDATE verified_score_sessions") && sql.includes("RETURNING id")) {
      const [
        correctCount,
        score,
        elapsedMs,
        completedAt,
        id,
        userId,
        tokenHash,
        notBeforeTime,
        expiryTime,
      ] = values;
      const row = this.challenges.get(id);
      if (
        !row
        || row.user_id !== userId
        || row.challenge_token_hash !== tokenHash
        || row.status !== "pending"
        || row.not_before_at > notBeforeTime
        || row.expires_at < expiryTime
      ) {
        return null;
      }
      Object.assign(row, {
        status: "completed",
        correct_count: correctCount,
        score,
        elapsed_ms: elapsedMs,
        completed_at: completedAt,
        verified: 1,
      });
      return { id };
    }

    return null;
  }

  async run(sql, values) {
    if (sql.includes("INSERT INTO verified_score_sessions")) {
      const [
        id,
        userId,
        categoryId,
        tokenHash,
        cardIdsJson,
        answerHashesJson,
        questionCount,
        startedAt,
        notBeforeAt,
        expiresAt,
        createdAt,
      ] = values;
      this.challenges.set(id, {
        id,
        user_id: userId,
        category_id: categoryId,
        challenge_token_hash: tokenHash,
        card_ids_json: cardIdsJson,
        answer_hashes_json: answerHashesJson,
        question_count: questionCount,
        started_at: startedAt,
        not_before_at: notBeforeAt,
        expires_at: expiresAt,
        status: "pending",
        correct_count: null,
        score: null,
        elapsed_ms: null,
        completed_at: null,
        verified: 0,
        created_at: createdAt,
      });
      return { success: true };
    }

    if (sql.includes("WHERE id = ? AND status = 'pending'")) {
      const row = this.challenges.get(values[0]);
      if (row?.status === "pending") row.status = "expired";
      return { success: true };
    }

    if (sql.includes("WHERE user_id = ? AND category_id = ? AND status = 'pending'")) {
      for (const row of this.challenges.values()) {
        if (row.user_id === values[0] && row.category_id === values[1] && row.status === "pending") {
          row.status = "expired";
        }
      }
      return { success: true };
    }

    if (sql.includes("WHERE status = 'pending' AND expires_at <= ?")) {
      for (const row of this.challenges.values()) {
        if (row.status === "pending" && row.expires_at <= values[0]) row.status = "expired";
      }
      return { success: true };
    }

    if (sql.includes("DELETE FROM verified_score_sessions")) {
      const cutoff = values[0];
      let deleted = 0;
      for (const [id, row] of this.challenges) {
        if (deleted >= 500) break;
        if (row.status === "expired" && row.expires_at <= cutoff) {
          this.challenges.delete(id);
          deleted += 1;
        }
      }
      return { success: true, meta: { changes: deleted } };
    }

    return { success: true };
  }

  async all(sql) {
    if (sql.includes("WITH eligible")) return { results: this.leaderboardRows };
    return { results: [] };
  }
}

function scoringEnv(database = new FakeDatabase()) {
  return {
    DB: database,
    PASSWORD_PEPPER: "password-pepper-longer-than-24-characters",
    IP_HASH_SALT: "ip-hash-salt-longer-than-24-characters",
    STATIC_ORIGIN: "https://jakh.net",
  };
}

async function issueChallenge(t, sourceCards = SOURCE_CARDS) {
  const database = new FakeDatabase();
  const env = scoringEnv(database);
  const clock = { now: Date.UTC(2026, 6, 31, 10, 0, 0) };
  t.mock.method(Date, "now", () => clock.now);
  t.mock.method(globalThis, "fetch", async (request) => {
    assert.equal(String(request), "https://jakh.net/data/currencies.json");
    return new Response(JSON.stringify(sourceCards), {
      headers: { "content-type": "application/json" },
    });
  });

  const response = await createVerifiedChallenge(
    apiRequest("/api/scores/verified/challenge", { categoryId: "currencies" }),
    env,
  );
  const challenge = await response.json();
  const sourceAnswers = new Map(sourceCards.map((card) => [card.id, card.answer]));
  const answers = challenge.questions.map(({ cardId }) => ({
    cardId,
    answer: sourceAnswers.get(cardId).en,
  }));
  return { answers, challenge, clock, database, env, response };
}

function submitRequest(challenge, answers) {
  return apiRequest("/api/scores/verified/submit", {
    challengeId: challenge.challengeId,
    submissionToken: challenge.submissionToken,
    answers,
  });
}

test("challenge creation commits answers server-side and exposes only ten questions", async (t) => {
  const { challenge, database, response } = await issueChallenge(t);
  const stored = database.challenges.get(challenge.challengeId);

  assert.equal(response.status, 201);
  assert.equal(challenge.categoryId, "currencies");
  assert.equal(challenge.questionCount, VERIFIED_QUESTION_COUNT);
  assert.equal(challenge.questions.length, VERIFIED_QUESTION_COUNT);
  assert.equal(new Set(challenge.questions.map(({ cardId }) => cardId)).size, VERIFIED_QUESTION_COUNT);
  assert.equal(challenge.submissionToken.length, 43);
  assert.equal(challenge.challengeId.length, 24);
  assert.equal(challenge.notBeforeAt - challenge.startedAt, VERIFIED_MINIMUM_MS);
  assert.equal(challenge.expiresAt - challenge.startedAt, VERIFIED_CHALLENGE_TTL_MS);
  assert.doesNotMatch(JSON.stringify(challenge), /"answer"\s*:/u);
  assert.doesNotMatch(stored.answer_hashes_json, /Answer \d+|إجابة/u);
  assert.equal(JSON.parse(stored.answer_hashes_json).length, VERIFIED_QUESTION_COUNT);
  assert.deepEqual(
    challenge.questions.reduce((counts, question) => ({
      ...counts,
      [question.difficulty]: (counts[question.difficulty] || 0) + 1,
    }), {}),
    { easy: 3, medium: 3, hard: 2, "very-advanced": 2 },
  );
});

test("ordinary published answer alternatives and Arabic orthographic variants are accepted", async (t) => {
  const aliasCards = SOURCE_CARDS.slice(0, VERIFIED_QUESTION_COUNT).map((card) => ({
    ...card,
    question: { ...card.question },
    answer: { ...card.answer },
  }));
  aliasCards[0].answer.en = "The Tyke / Tike";
  aliasCards[0].acceptedAnswers = { en: ["Tyke", "Tike"] };
  aliasCards[1].answer.en = "Yuan (Renminbi)";
  aliasCards[1].acceptedAnswers = { en: ["Yuan", "Renminbi"] };
  aliasCards[2].answer.ar = "إِقْلِيم";
  aliasCards[3].answer.en = "Sofa / couch";
  aliasCards[3].acceptedAnswers = { en: ["Sofa", "couch"] };
  const { answers, challenge, clock, env } = await issueChallenge(t, aliasCards);
  for (const submitted of answers) {
    if (submitted.cardId === "currencies-1") submitted.answer = "Tike";
    if (submitted.cardId === "currencies-2") submitted.answer = "Renminbi";
    if (submitted.cardId === "currencies-3") submitted.answer = "اقليم";
    if (submitted.cardId === "currencies-4") submitted.answer = "couch";
  }
  clock.now = challenge.startedAt + VERIFIED_MINIMUM_MS + 1_000;

  const response = await submitVerifiedChallenge(submitRequest(challenge, answers), env);
  const payload = await response.json();

  assert.equal(payload.correctCount, VERIFIED_QUESTION_COUNT);
  assert.equal(payload.verified, true);
});

test("challenge selection excludes long explanatory answers", async (t) => {
  const impossibleCard = {
    ...SOURCE_CARDS[10],
    question: { ...SOURCE_CARDS[10].question },
    answer: {
      en: `${"x".repeat(97)} (short fragment)`,
      ar: `${"س".repeat(97)} (مقتطف قصير)`,
    },
  };
  const sourceCards = [...SOURCE_CARDS.slice(0, VERIFIED_QUESTION_COUNT), impossibleCard];
  const { challenge } = await issueChallenge(t, sourceCards);

  assert.equal(challenge.questions.length, VERIFIED_QUESTION_COUNT);
  assert.equal(
    challenge.questions.some(({ cardId }) => cardId === impossibleCard.id),
    false,
  );
});

test("curated bilingual accepted answers make explanatory cards verifiable", async (t) => {
  const cards = SOURCE_CARDS.slice(0, VERIFIED_QUESTION_COUNT).map((card, index) => ({
    ...card,
    question: { ...card.question },
    answer: {
      en: `${"Long explanatory context ".repeat(6)}for term ${index + 1}.`,
      ar: `${"سياق تفسيري طويل ".repeat(8)}للمصطلح ${index + 1}.`,
    },
    acceptedAnswers: {
      en: [`Term ${index + 1}`],
      ar: [`المصطلح ${index + 1}`],
    },
  }));
  const { answers, challenge, clock, env } = await issueChallenge(t, cards);
  for (const submitted of answers) {
    const index = cards.findIndex((card) => card.id === submitted.cardId);
    submitted.answer = cards[index].acceptedAnswers.en[0];
  }
  clock.now = challenge.startedAt + VERIFIED_MINIMUM_MS + 1_000;

  const response = await submitVerifiedChallenge(submitRequest(challenge, answers), env);
  const payload = await response.json();

  assert.equal(payload.correctCount, VERIFIED_QUESTION_COUNT);
  assert.equal(payload.verified, true);
});

test("acceptedAnswers rejects arrays in place of the bilingual object", async (t) => {
  const cards = SOURCE_CARDS.slice(0, VERIFIED_QUESTION_COUNT).map((card) => ({
    ...card,
    question: { ...card.question },
    answer: { ...card.answer },
  }));
  cards[0].acceptedAnswers = [];
  const database = new FakeDatabase();
  const env = scoringEnv(database);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(cards)));

  await assert.rejects(
    createVerifiedChallenge(
      apiRequest("/api/scores/verified/challenge", { categoryId: "currencies" }),
      env,
    ),
    (error) => error?.status === 503 && error?.code === "QUESTION_SOURCE_INVALID",
  );
  assert.equal(database.challenges.size, 0);
});

test("acceptedAnswers rejects normalized duplicates", async (t) => {
  const cards = SOURCE_CARDS.slice(0, VERIFIED_QUESTION_COUNT).map((card) => ({
    ...card,
    question: { ...card.question },
    answer: { ...card.answer },
  }));
  cards[0].acceptedAnswers = { en: ["Same term", "same-term"] };
  const database = new FakeDatabase();
  const env = scoringEnv(database);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(cards)));

  await assert.rejects(
    createVerifiedChallenge(
      apiRequest("/api/scores/verified/challenge", { categoryId: "currencies" }),
      env,
    ),
    (error) => error?.status === 503 && error?.code === "QUESTION_SOURCE_INVALID",
  );
  assert.equal(database.challenges.size, 0);
});

test("natural-language or is not split into a false answer alias", async (t) => {
  const cards = SOURCE_CARDS.slice(0, VERIFIED_QUESTION_COUNT).map((card) => ({
    ...card,
    question: { ...card.question },
    answer: { ...card.answer },
  }));
  cards[0].answer.en = "One gene influences two or more traits";
  const { answers, challenge, clock, env } = await issueChallenge(t, cards);
  const submitted = answers.find((answer) => answer.cardId === cards[0].id);
  submitted.answer = "more traits";
  clock.now = challenge.startedAt + VERIFIED_MINIMUM_MS + 1_000;

  const response = await submitVerifiedChallenge(submitRequest(challenge, answers), env);
  const payload = await response.json();

  assert.equal(payload.correctCount, VERIFIED_QUESTION_COUNT - 1);
});

test("parenthetical details, fractions, measurements, and formulas are not answer aliases", async (t) => {
  const cards = SOURCE_CARDS.slice(0, VERIFIED_QUESTION_COUNT).map((card) => ({
    ...card,
    question: { ...card.question },
    answer: { ...card.answer },
  }));
  const cases = [
    {
      answer: { en: "One (with four compartments)", ar: "واحدة (بأربعة حجرات)" },
      invalidFragment: "with four compartments",
    },
    {
      answer: { en: "The Battle of Waterloo (1815)", ar: "معركة واترلو (1815)" },
      invalidFragment: "1815",
    },
    {
      answer: { en: "1/3", ar: "1/3" },
      invalidFragment: "1",
    },
    {
      answer: { en: "Around 120/80 mmHg", ar: "حوالي 120/80 ملم زئبق" },
      invalidFragment: "120",
    },
    {
      answer: { en: "P = Force / Area", ar: "P = القوة / المساحة" },
      invalidFragment: "Force",
    },
  ];
  for (let index = 0; index < cases.length; index += 1) {
    cards[index].answer = cases[index].answer;
  }
  const { answers, challenge, clock, env } = await issueChallenge(t, cards);
  for (let index = 0; index < cases.length; index += 1) {
    const submitted = answers.find((answer) => answer.cardId === cards[index].id);
    submitted.answer = cases[index].invalidFragment;
  }
  clock.now = challenge.startedAt + VERIFIED_MINIMUM_MS + 1_000;

  const response = await submitVerifiedChallenge(submitRequest(challenge, answers), env);
  const payload = await response.json();

  assert.equal(payload.correctCount, VERIFIED_QUESTION_COUNT - cases.length);
});

test("a category with fewer than ten concise bilingual answers is unavailable", async (t) => {
  const impossibleCard = {
    ...SOURCE_CARDS[10],
    question: { ...SOURCE_CARDS[10].question },
    answer: {
      en: `${"x".repeat(97)} (short fragment)`,
      ar: `${"س".repeat(97)} (مقتطف قصير)`,
    },
  };
  const database = new FakeDatabase();
  const env = scoringEnv(database);
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify([
    ...SOURCE_CARDS.slice(0, VERIFIED_QUESTION_COUNT - 1),
    impossibleCard,
  ])));

  await assert.rejects(
    createVerifiedChallenge(
      apiRequest("/api/scores/verified/challenge", { categoryId: "currencies" }),
      env,
    ),
    (error) => error?.status === 400 && error?.code === "VERIFIED_CATEGORY_UNAVAILABLE",
  );
  assert.equal(database.challenges.size, 0);
});

test("every curated explanation-heavy category can issue a verified challenge", async (t) => {
  const sources = new Map(await Promise.all(CURATED_CATEGORY_IDS.map(async (categoryId) => [
    categoryId,
    JSON.parse(await readFile(
      new URL(`../../data/${categoryId}.json`, import.meta.url),
      "utf8",
    )),
  ])));
  const database = new FakeDatabase();
  const env = scoringEnv(database);
  t.mock.method(globalThis, "fetch", async (request) => {
    const categoryId = new URL(String(request)).pathname.match(/^\/data\/(.+)\.json$/u)?.[1];
    const source = sources.get(categoryId);
    return source
      ? new Response(JSON.stringify(source), { headers: { "content-type": "application/json" } })
      : new Response("Not found", { status: 404 });
  });

  for (const categoryId of CURATED_CATEGORY_IDS) {
    const response = await createVerifiedChallenge(
      apiRequest("/api/scores/verified/challenge", { categoryId }),
      env,
    );
    const payload = await response.json();
    assert.equal(response.status, 201, categoryId);
    assert.equal(payload.categoryId, categoryId);
    assert.equal(payload.questionCount, VERIFIED_QUESTION_COUNT);
    assert.equal(payload.questions.length, VERIFIED_QUESTION_COUNT);
  }
});

test("a fully correct answer set earns a server-verified score and consumes the challenge", async (t) => {
  const { answers, challenge, clock, database, env } = await issueChallenge(t);
  clock.now = challenge.startedAt + VERIFIED_MINIMUM_MS + 1_000;

  const response = await submitVerifiedChallenge(submitRequest(challenge, answers), env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.verified, true);
  assert.equal(payload.correctCount, VERIFIED_QUESTION_COUNT);
  assert.equal(payload.questionCount, VERIFIED_QUESTION_COUNT);
  assert.equal(payload.elapsedMs, VERIFIED_MINIMUM_MS + 1_000);
  assert.equal(payload.score, 10_279);
  assert.equal(database.challenges.get(challenge.challengeId).status, "completed");
  assert.equal(database.challenges.get(challenge.challengeId).verified, 1);
});

test("incorrect answers are scored by the Worker without trusting a claimed client score", async (t) => {
  const { answers, challenge, clock, env } = await issueChallenge(t);
  clock.now = challenge.startedAt + VERIFIED_MINIMUM_MS + 2_000;
  answers[0] = { ...answers[0], answer: "definitely incorrect" };

  const response = await submitVerifiedChallenge(submitRequest(challenge, answers), env);
  const payload = await response.json();

  assert.equal(payload.verified, true);
  assert.equal(payload.correctCount, VERIFIED_QUESTION_COUNT - 1);
  assert.equal(payload.score, 9_000);
  assert.equal("claimedScore" in payload, false);
});

test("a completed challenge cannot be replayed", async (t) => {
  const { answers, challenge, clock, env } = await issueChallenge(t);
  clock.now = challenge.startedAt + VERIFIED_MINIMUM_MS + 1_000;
  await submitVerifiedChallenge(submitRequest(challenge, answers), env);

  await assert.rejects(
    submitVerifiedChallenge(submitRequest(challenge, answers), env),
    (error) => error?.status === 409 && error?.code === "VERIFIED_CHALLENGE_REPLAYED",
  );
});

test("changing a challenge card is rejected as tampering and does not consume it", async (t) => {
  const { answers, challenge, clock, database, env } = await issueChallenge(t);
  clock.now = challenge.startedAt + VERIFIED_MINIMUM_MS + 1_000;
  answers[0] = { ...answers[0], cardId: "currencies-999" };

  await assert.rejects(
    submitVerifiedChallenge(submitRequest(challenge, answers), env),
    (error) => error?.status === 400 && error?.code === "VERIFIED_CHALLENGE_TAMPERED",
  );
  assert.equal(database.challenges.get(challenge.challengeId).status, "pending");
});

test("an expired challenge is marked expired and cannot be scored", async (t) => {
  const { answers, challenge, clock, database, env } = await issueChallenge(t);
  clock.now = challenge.startedAt + VERIFIED_CHALLENGE_TTL_MS + 1;

  await assert.rejects(
    submitVerifiedChallenge(submitRequest(challenge, answers), env),
    (error) => error?.status === 410 && error?.code === "VERIFIED_CHALLENGE_EXPIRED",
  );
  assert.equal(database.challenges.get(challenge.challengeId).status, "expired");
});

test("an implausibly fast submission is rejected without consuming the challenge", async (t) => {
  const { answers, challenge, clock, database, env } = await issueChallenge(t);
  clock.now = challenge.startedAt + VERIFIED_MINIMUM_MS - 1;

  await assert.rejects(
    submitVerifiedChallenge(submitRequest(challenge, answers), env),
    (error) => error?.status === 409 && error?.code === "VERIFIED_CHALLENGE_TOO_FAST",
  );
  assert.equal(database.challenges.get(challenge.challengeId).status, "pending");
});

test("leaderboard SQL admits only completed verified sessions and one best result per user", async () => {
  const database = new FakeDatabase();
  database.leaderboardRows = [{
    username: "verified_player",
    avatar: "🧠",
    score: 10_250,
    categoryId: "currencies",
    correctCount: 10,
    questionCount: 10,
    elapsedMs: 50_000,
    completedAt: "2026-07-31T10:01:00.000Z",
  }];
  const response = await verifiedLeaderboard(
    new Request("https://api.jakh.net/api/scores/verified/leaderboard?category=currencies"),
    scoringEnv(database),
  );
  const payload = await response.json();
  const statement = database.statements.find(({ sql }) => sql.includes("WITH eligible"));

  assert.match(statement.sql, /s\.status = 'completed' AND s\.verified = 1/u);
  assert.match(statement.sql, /PARTITION BY s\.user_id/u);
  assert.match(statement.sql, /WHERE userBest = 1/u);
  assert.match(statement.sql, /LIMIT 50/u);
  assert.deepEqual(statement.values, ["currencies"]);
  assert.equal(payload.status, "active");
  assert.equal(payload.scoreType, "server-verified");
  assert.deepEqual(payload.leaderboard[0], {
    rank: 1,
    username: "verified_player",
    avatar: "🧠",
    score: 10_250,
    categoryId: "currencies",
    correctCount: 10,
    questionCount: 10,
  });
  assert.equal("elapsedMs" in payload.leaderboard[0], false);
  assert.equal("completedAt" in payload.leaderboard[0], false);
  assert.equal(response.headers.get("cache-control"), "public, max-age=30");
});

test("cleanup expires pending challenges and deletes only expired rows older than 24 hours", async (t) => {
  const now = Date.UTC(2026, 6, 31, 10, 0, 0);
  t.mock.method(Date, "now", () => now);
  const database = new FakeDatabase();
  const seed = (id, status, expiresAt) => database.challenges.set(id, {
    id,
    status,
    expires_at: expiresAt,
  });
  seed("old-expired", "expired", now - 25 * 60 * 60 * 1_000);
  seed("recent-expired", "expired", now - 23 * 60 * 60 * 1_000);
  seed("pending-expired", "pending", now - 1);
  seed("pending-future", "pending", now + 1);
  seed("completed-old", "completed", now - 100 * 60 * 60 * 1_000);

  await cleanupExpiredVerifiedChallenges(scoringEnv(database));

  assert.equal(database.batches.length, 1);
  assert.equal(database.batches[0].length, 2);
  assert.equal(database.challenges.has("old-expired"), false);
  assert.equal(database.challenges.get("recent-expired").status, "expired");
  assert.equal(database.challenges.get("pending-expired").status, "expired");
  assert.equal(database.challenges.get("pending-future").status, "pending");
  assert.equal(database.challenges.get("completed-old").status, "completed");
  assert.match(database.batches[0][1].sql, /LIMIT 500/u);
});

test("migration enforces ownership, single-use state, verified completion, and leaderboard indexes", async () => {
  const migration = await readFile(
    new URL("../migrations/0003_verified_scoring.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /REFERENCES users\(id\) ON DELETE CASCADE/u);
  assert.match(migration, /challenge_token_hash TEXT NOT NULL UNIQUE/u);
  assert.match(migration, /status IN \('pending', 'completed', 'expired'\)/u);
  assert.match(migration, /verified = 0 OR status = 'completed'/u);
  assert.match(migration, /verified_score_sessions_one_pending_idx/u);
  assert.match(migration, /verified_score_sessions_leaderboard_idx/u);
  assert.match(migration, /verified_score_sessions_global_leaderboard_idx/u);
  assert.match(migration, /VALUES \('schema_version', '3'\)/u);
});
