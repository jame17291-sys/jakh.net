import { ApiError, json, parseJson } from "./http.js";
import { enforceRateLimit } from "./db.js";
import { clientIp, randomToken, sha256 } from "./security.js";
import type { BattleQuestion, Env } from "./types.js";

interface Card {
  id?: unknown;
  difficulty?: unknown;
  question?: { en?: unknown; ar?: unknown };
  answer?: { en?: unknown; ar?: unknown };
}

interface ValidCard {
  id: string;
  difficulty: string;
  question: { en: string; ar: string };
  answer: { en: string; ar: string };
}

const DIFFICULTIES = new Set(["all", "easy", "medium", "hard", "very-advanced"]);
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_PATTERN = /^[A-Z]{3}[A-HJ-NP-Z2-9]{5}$/u;
const CONNECT_RATE_LIMIT = 30;
const CONNECT_RATE_WINDOW_SECONDS = 60;

function randomInt(max: number): number {
  if (!Number.isSafeInteger(max) || max <= 0) throw new Error("Invalid random range");
  const ceiling = Math.floor(0x1_0000_0000 / max) * max;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while ((value[0] || 0) >= ceiling);
  return (value[0] || 0) % max;
}

function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [result[index], result[target]] = [result[target] as T, result[index] as T];
  }
  return result;
}

function validCard(card: Card): card is ValidCard {
  return typeof card.id === "string"
    && typeof card.difficulty === "string"
    && typeof card.question?.en === "string"
    && typeof card.question?.ar === "string"
    && typeof card.answer?.en === "string"
    && typeof card.answer?.ar === "string";
}

export function buildBattleQuestions(
  source: unknown,
  difficulty: string,
  requestedCount: number,
): BattleQuestion[] {
  const rawCards = Array.isArray(source) ? source : [];
  const allCards = rawCards.filter((card): card is ValidCard => validCard(card as Card));
  const pool = difficulty === "all"
    ? allCards
    : allCards.filter((card) => card.difficulty === difficulty);

  return shuffled(pool).slice(0, requestedCount).map((card) => {
    const seen = new Set([
      card.answer.en.trim().toLowerCase(),
      card.answer.ar.trim().toLowerCase(),
    ]);
    const distractors = shuffled(allCards.filter((candidate) => candidate.id !== card.id)).filter((candidate) => {
      const en = candidate.answer.en.trim().toLowerCase();
      const ar = candidate.answer.ar.trim().toLowerCase();
      if (seen.has(en) || seen.has(ar)) return false;
      seen.add(en);
      seen.add(ar);
      return true;
    }).slice(0, 3);

    const fallbacks = [
      { answer: { en: "None of the above", ar: "لا شيء مما سبق" } },
      { answer: { en: "All of the above", ar: "كل ما سبق" } },
      { answer: { en: "Not enough information", ar: "المعلومات غير كافية" } },
    ];
    while (distractors.length < 3) {
      distractors.push(fallbacks[distractors.length] as (typeof distractors)[number]);
    }

    const en = [card.answer.en, ...distractors.map((item) => item.answer.en)];
    const ar = [card.answer.ar, ...distractors.map((item) => item.answer.ar)];
    const order = shuffled([0, 1, 2, 3]);

    return {
      id: card.id,
      question: card.question,
      answer: card.answer,
      options: {
        en: order.map((index) => en[index] || ""),
        ar: order.map((index) => ar[index] || ""),
      },
      correctIndex: order.indexOf(0),
    };
  });
}

function generateCode(category: string): string {
  const prefix = category.replace(/[^a-z]/giu, "").slice(0, 3).toUpperCase().padEnd(3, "J");
  let suffix = "";
  for (let index = 0; index < 5; index += 1) suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${prefix}${suffix}`;
}

export async function createBattle(request: Request, env: Env): Promise<Response> {
  const ipKey = await sha256(`${env.IP_HASH_SALT}:battle:${clientIp(request)}`);
  await enforceRateLimit(env, ipKey, 20, 60 * 60);

  const body = await parseJson<{ category?: unknown; difficulty?: unknown; questionCount?: unknown }>(request);
  const category = typeof body.category === "string" ? body.category.trim().toLowerCase() : "";
  const difficulty = typeof body.difficulty === "string" ? body.difficulty : "all";
  const parsedCount = Number(body.questionCount);
  const questionCount = Number.isInteger(parsedCount) ? Math.min(30, Math.max(5, parsedCount)) : 10;

  if (!/^[a-z0-9-]{2,64}$/u.test(category)) throw new ApiError(400, "Invalid category");
  if (!DIFFICULTIES.has(difficulty)) throw new ApiError(400, "Invalid difficulty");

  const sourceUrl = new URL(`/data/${category}.json`, env.STATIC_ORIGIN);
  const sourceResponse = await fetch(sourceUrl, { headers: { accept: "application/json" } });
  if (!sourceResponse.ok) throw new ApiError(400, "Category is unavailable");
  const questions = buildBattleQuestions(await sourceResponse.json(), difficulty, questionCount);
  if (!questions.length) throw new ApiError(400, "No questions are available for this selection");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode(category);
    const hostToken = randomToken(24);
    const id = env.BATTLE_ROOMS.idFromName(code);
    const stub = env.BATTLE_ROOMS.get(id);
    const response = await stub.fetch(new Request("https://battle.internal/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, category, difficulty, hostToken, questions }),
    }));
    if (response.status === 201) {
      return json({ code, hostId: hostToken }, 201);
    }
    if (response.status !== 409) throw new ApiError(503, "Could not create the battle room");
  }

  throw new ApiError(503, "Could not allocate a unique battle room");
}

export async function connectBattle(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    throw new ApiError(426, "WebSocket upgrade required");
  }
  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase() || "";
  if (!ROOM_CODE_PATTERN.test(code)) throw new ApiError(400, "Invalid room code");
  if (!request.headers.get("origin")) throw new ApiError(403, "Origin is not allowed");

  const ipKey = await sha256(`${env.IP_HASH_SALT}:battle-connect:${clientIp(request)}`);
  await enforceRateLimit(env, ipKey, CONNECT_RATE_LIMIT, CONNECT_RATE_WINDOW_SECONDS);

  const stub = env.BATTLE_ROOMS.get(env.BATTLE_ROOMS.idFromName(code));
  const internalRequest = new Request("https://battle.internal/connect", request);
  internalRequest.headers.set(
    "x-jakh-client-key",
    await sha256(`${env.IP_HASH_SALT}:battle-participant:${clientIp(request)}`),
  );
  return stub.fetch(internalRequest);
}
