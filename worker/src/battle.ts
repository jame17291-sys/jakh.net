import { ApiError, json, parseJson } from "./http.js";
import { applyPublishedContentOverrides } from "./content.js";
import { enforceRateLimit } from "./db.js";
import { isPublicCard } from "./catalog.js";
import { requirePublicCategory } from "./content-safety.js";
import { clientIp, randomToken, sha256 } from "./security.js";
import type { BattleQuestion, Env } from "./types.js";

interface Card {
  id?: unknown;
  difficulty?: unknown;
  question?: { en?: unknown; ar?: unknown };
  answer?: { en?: unknown; ar?: unknown };
  acceptedAnswers?: { en?: unknown; ar?: unknown };
  quickFire?: unknown;
}

interface ValidCard {
  id: string;
  difficulty: string;
  question: { en: string; ar: string };
  answer: { en: string; ar: string };
  acceptedAnswers?: { en?: unknown; ar?: unknown };
  quickFire?: unknown;
}

interface AuthoredChoices {
  answer: { en: string; ar: string };
  distractors: { en: string[]; ar: string[] };
  explanation: { en: string; ar: string };
}

const DIFFICULTIES = new Set(["all", "easy", "medium", "hard", "very-advanced"]);
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_PATTERN = /^[A-Z]{3}[A-HJ-NP-Z2-9]{5}$/u;
const CONNECT_RATE_LIMIT = 30;
const CONNECT_RATE_WINDOW_SECONDS = 60;
const MINIMUM_BATTLE_QUESTIONS = 5;

function choiceKey(value: string, language: "en" | "ar"): string {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\u0610-\u061a\u0640\u064b-\u065f\u0670\u06d6-\u06ed]/gu, "")
    .replace(/[أإآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/gu, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/−/gu, "-").replace(/[⁄∕]/gu, "/").replace(/٫/gu, ".")
    .replace(/\p{P}/gu, (character, index: number, text: string) => {
      if (character === "-" || character === "/" || character === "%") return character;
      if (character === "." && /[0-9]/u.test(text[index + 1] || "")) return character;
      return " ";
    })
    .replace(/\s+/gu, " ")
    .trim();
  return language === "en" ? normalized.replace(/^(?:a|an|the)\s+/u, "") : normalized;
}

function correctKeys(card: ValidCard, language: "en" | "ar"): Set<string> | null {
  const canonical = card.answer[language];
  const accepted = card.acceptedAnswers?.[language];
  if (
    !canonical.trim()
    || (accepted !== undefined && (
      !Array.isArray(accepted)
      || accepted.some((answer) => typeof answer !== "string" || !answer.trim())
    ))
  ) return null;
  const primaryAnswer = /^(.+?)\s*\([^()]*\)\s*$/u.exec(canonical.trim())?.[1]?.trim();
  return new Set([
    canonical,
    ...(primaryAnswer ? [primaryAnswer] : []),
    ...(Array.isArray(accepted) ? accepted as string[] : []),
  ].map((answer) => choiceKey(answer, language)).filter(Boolean));
}

function conciseChoice(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= 120
    && value.trim().split(/\s+/u).length <= 20;
}

function authoredChoices(card: ValidCard): AuthoredChoices | null {
  if (!card.quickFire || typeof card.quickFire !== "object" || Array.isArray(card.quickFire)) return null;
  const choices = card.quickFire as Partial<AuthoredChoices>;
  const correct = { en: correctKeys(card, "en"), ar: correctKeys(card, "ar") };
  if (!correct.en?.size || !correct.ar?.size) return null;
  const allCorrect = new Set([...correct.en, ...correct.ar]);
  for (const language of ["en", "ar"] as const) {
    const answer = choices.answer?.[language];
    const distractors = choices.distractors?.[language];
    const explanation = choices.explanation?.[language];
    if (
      !card.question[language].trim()
      || !card.answer[language].trim()
      || !conciseChoice(answer)
      || !correct[language]?.has(choiceKey(answer, language))
      || !Array.isArray(distractors)
      || distractors.length !== 3
      || !distractors.every(conciseChoice)
      || typeof explanation !== "string"
      || !explanation.trim()
      || explanation.length > 1200
    ) return null;
    const keys = [answer, ...distractors].map((value) => choiceKey(value, language));
    if (keys.some((key) => !key) || new Set(keys).size !== 4) return null;
    if (keys.slice(1).some((key) => allCorrect.has(key))) return null;
  }
  const valid = choices as AuthoredChoices;
  return {
    answer: { en: valid.answer.en.trim(), ar: valid.answer.ar.trim() },
    distractors: {
      en: valid.distractors.en.map((choice) => choice.trim()),
      ar: valid.distractors.ar.map((choice) => choice.trim()),
    },
    explanation: { en: valid.explanation.en.trim(), ar: valid.explanation.ar.trim() },
  };
}

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

function validCard(value: unknown): value is ValidCard {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const card = value as Card;
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
  const pool = rawCards.flatMap((card) => {
    if (!validCard(card) || (difficulty !== "all" && card.difficulty !== difficulty)) return [];
    const choices = authoredChoices(card);
    return choices ? [{ card, choices }] : [];
  });

  return shuffled(pool).slice(0, requestedCount).map(({ card, choices }) => {
    const en = [choices.answer.en, ...choices.distractors.en];
    const ar = [choices.answer.ar, ...choices.distractors.ar];
    const order = shuffled([0, 1, 2, 3]);

    return {
      id: card.id,
      question: card.question,
      answer: choices.answer,
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
  requirePublicCategory(category);

  const sourceUrl = new URL(`/data/${category}.json`, env.STATIC_ORIGIN);
  const sourceResponse = await fetch(sourceUrl, { headers: { accept: "application/json" } });
  if (!sourceResponse.ok) throw new ApiError(400, "Category is unavailable");
  let source: unknown;
  try {
    source = await sourceResponse.json();
  } catch {
    throw new ApiError(503, "Canonical question source is invalid", undefined, "QUESTION_SOURCE_INVALID");
  }
  if (
    !Array.isArray(source)
    || source.some((card) => !validCard(card) || !isPublicCard(card.id, category))
  ) {
    throw new ApiError(503, "Canonical question source is invalid", undefined, "QUESTION_SOURCE_INVALID");
  }
  const overriddenSource = await applyPublishedContentOverrides(env, category, source as ValidCard[]);
  const questions = buildBattleQuestions(overriddenSource, difficulty, questionCount);
  if (questions.length < MINIMUM_BATTLE_QUESTIONS) {
    throw new ApiError(
      400,
      "This selection does not yet have five questions with complete authored choices. Try All difficulties or another category, or play the free practice library.",
      undefined,
      "BATTLE_CONTENT_NOT_READY",
    );
  }
  if (questions.some((question) => !isPublicCard(question.id, category))) {
    throw new ApiError(
      503,
      "Canonical question source is invalid",
      undefined,
      "QUESTION_SOURCE_INVALID",
    );
  }

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
  internalRequest.headers.delete("x-jakh-worker-version");
  const workerVersionId = env.CF_VERSION_METADATA?.id;
  if (workerVersionId) internalRequest.headers.set("x-jakh-worker-version", workerVersionId);
  internalRequest.headers.set(
    "x-jakh-client-key",
    await sha256(`${env.IP_HASH_SALT}:battle-participant:${clientIp(request)}`),
  );
  return stub.fetch(internalRequest);
}
