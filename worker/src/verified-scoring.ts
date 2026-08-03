import {
  enforceRateLimit,
  RETENTION_CLEANUP_BATCH_SIZE,
  requireUser,
  runBoundedRetentionCleanup,
} from "./db.js";
import { getCardIndex, isPublicCard } from "./catalog.js";
import {
  QUARANTINED_CATEGORY_IDS,
  isQuarantinedCategory,
  requirePublicCategory,
} from "./content-safety.js";
import { ApiError, json, parseJson } from "./http.js";
import { applyPublishedContentOverrides } from "./content.js";
import { randomToken, sha256 } from "./security.js";
import type { Env } from "./types.js";

/**
 * Server-checking boundary
 * ------------------------
 * The Worker chooses the questions, fetches the canonical source itself, and
 * commits peppered answer digests to D1 before returning a challenge. The
 * browser receives question text, but never the answer field or an answer key.
 * Completion is a single conditional UPDATE, so a challenge can be scored once.
 *
 * This checks that a submission matches an issued challenge. It does not prove
 * who supplied the answers and is not remote proctoring. The public learning
 * library necessarily publishes its answers, so lookups and automation remain
 * possible.
 */

export const VERIFIED_QUESTION_COUNT = 10;
export const VERIFIED_CHALLENGE_TTL_MS = 15 * 60 * 1_000;
export const VERIFIED_MINIMUM_MS = VERIFIED_QUESTION_COUNT * 2_000;
export const SERVER_CHECKED_SCORE_TYPE = "server-checked";
export const SERVER_CHECKED_AUTOMATION_DISCLAIMER =
  "The server checks submitted answers, but does not verify who answered or prevent lookups or automation.";

const CATEGORY_PATTERN = /^[a-z0-9-]{2,64}$/u;
const CARD_ID_PATTERN = /^[A-Za-z0-9_-]{2,96}$/u;
const CHALLENGE_ID_PATTERN = /^[A-Za-z0-9_-]{24}$/u;
const CHALLENGE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const DIGEST_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const MAX_ANSWER_LENGTH = 256;
const MAX_CANONICAL_ANSWER_LENGTH = 96;
const MAX_CANONICAL_ANSWER_WORDS = 14;
const MAX_EXPLICIT_ANSWERS_PER_LANGUAGE = 8;
const DIFFICULTY_ORDER = ["easy", "medium", "hard", "very-advanced"] as const;
const DIFFICULTIES = new Set<string>(DIFFICULTY_ORDER);

interface SourceCard {
  id?: unknown;
  difficulty?: unknown;
  question?: { en?: unknown; ar?: unknown };
  answer?: { en?: unknown; ar?: unknown };
  acceptedAnswers?: { en?: unknown; ar?: unknown };
}

interface CanonicalCard {
  id: string;
  difficulty: string;
  question: { en: string; ar: string };
  answer: { en: string; ar: string };
  acceptedAnswers?: { en?: string[]; ar?: string[] };
}

interface AnswerCommitment {
  cardId: string;
  digests: string[];
}

interface ChallengeRow {
  id: string;
  category_id: string;
  card_ids_json: string;
  answer_hashes_json: string;
  question_count: number;
  started_at: number;
  not_before_at: number;
  expires_at: number;
  status: string;
}

interface SubmittedAnswer {
  cardId?: unknown;
  answer?: unknown;
}

interface LeaderboardRow {
  username: string;
  avatar: string;
  score: number;
  categoryId: string;
  correctCount: number;
  questionCount: number;
}

function publicScoreContract(): {
  scoreType: typeof SERVER_CHECKED_SCORE_TYPE;
  serverChecked: true;
  proctored: false;
  scoring: "accuracy-only";
  automationDisclaimer: typeof SERVER_CHECKED_AUTOMATION_DISCLAIMER;
} {
  return {
    scoreType: SERVER_CHECKED_SCORE_TYPE,
    serverChecked: true,
    proctored: false,
    scoring: "accuracy-only",
    automationDisclaimer: SERVER_CHECKED_AUTOMATION_DISCLAIMER,
  };
}

function normalizeCategory(value: unknown): string {
  if (typeof value !== "string" || !CATEGORY_PATTERN.test(value)) {
    throw new ApiError(400, "Invalid category", undefined, "INVALID_CATEGORY");
  }
  return value;
}

function randomInt(max: number): number {
  if (!Number.isSafeInteger(max) || max <= 0) throw new Error("Invalid random range");
  const ceiling = Math.floor(0x1_0000_0000 / max) * max;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while ((value[0] || 0) >= ceiling);
  return (value[0] || 0) % max;
}

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [result[index], result[target]] = [result[target] as T, result[index] as T];
  }
  return result;
}

function acceptedAnswersAreValid(value: SourceCard["acceptedAnswers"]): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  for (const language of ["en", "ar"] as const) {
    const answers = value[language];
    if (answers === undefined) continue;
    if (
      !Array.isArray(answers)
      || answers.length > MAX_EXPLICIT_ANSWERS_PER_LANGUAGE
      || answers.some((answer) => (
        typeof answer !== "string" || !conciseCanonicalAnswer(answer)
      ))
    ) return false;
    const normalized = answers.map(normalizeAnswer);
    if (new Set(normalized).size !== normalized.length) return false;
  }
  return true;
}

function isCanonicalCard(value: SourceCard): value is CanonicalCard {
  return typeof value.id === "string"
    && CARD_ID_PATTERN.test(value.id)
    && typeof value.difficulty === "string"
    && DIFFICULTIES.has(value.difficulty)
    && typeof value.question?.en === "string"
    && Boolean(value.question.en.trim())
    && typeof value.question?.ar === "string"
    && Boolean(value.question.ar.trim())
    && typeof value.answer?.en === "string"
    && Boolean(value.answer.en.trim())
    && typeof value.answer?.ar === "string"
    && Boolean(value.answer.ar.trim())
    && acceptedAnswersAreValid(value.acceptedAnswers);
}

function normalizeAnswer(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\u0610-\u061a\u0640\u064b-\u065f\u0670\u06d6-\u06ed]/gu, "")
    .replace(/[أإآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/\p{P}+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function conciseCanonicalAnswer(value: string): boolean {
  const normalized = normalizeAnswer(value);
  return normalized.length > 0
    && normalized.length <= MAX_CANONICAL_ANSWER_LENGTH
    && normalized.split(" ").length <= MAX_CANONICAL_ANSWER_WORDS;
}

function canonicalAnswerVariants(value: string): string[] {
  const variants = new Set<string>([value]);
  const terminalParenthetical = /^(.+?)\s*\([^()]*\)\s*$/u.exec(value.trim());
  const primaryAnswer = terminalParenthetical?.[1]?.trim();
  if (primaryAnswer) variants.add(primaryAnswer);
  return [...variants];
}

function answerVariants(card: CanonicalCard, language: "en" | "ar"): string[] {
  const canonical = card.answer[language];
  return [
    ...(conciseCanonicalAnswer(canonical) ? canonicalAnswerVariants(canonical) : []),
    ...(card.acceptedAnswers?.[language] || []),
  ];
}

function hasVerifiableAnswer(card: CanonicalCard, language: "en" | "ar"): boolean {
  return answerVariants(card, language).some(conciseCanonicalAnswer);
}

function answerAliases(card: CanonicalCard): string[] {
  const aliases = new Set<string>();
  const englishVariants = answerVariants(card, "en");
  for (const variant of englishVariants) {
    const normalized = normalizeAnswer(variant);
    if (!normalized) continue;
    aliases.add(normalized);
    const withoutArticle = normalized.replace(/^(?:a|an|the)\s+/u, "");
    if (withoutArticle) aliases.add(withoutArticle);
  }
  const arabicVariants = answerVariants(card, "ar");
  for (const variant of arabicVariants) {
    const normalized = normalizeAnswer(variant);
    if (normalized) aliases.add(normalized);
  }
  return [...aliases];
}

function submittableAnswerAliases(card: CanonicalCard): string[] {
  return answerAliases(card).filter((alias) => alias.length <= MAX_ANSWER_LENGTH);
}

async function answerDigest(
  env: Env,
  challengeId: string,
  cardId: string,
  answer: string,
): Promise<string> {
  return sha256(
    `${env.PASSWORD_PEPPER}\u0000verified-score-v1\u0000${challengeId}\u0000${cardId}\u0000${answer}`,
  );
}

async function rateKey(env: Env, userId: string, operation: string): Promise<string> {
  return sha256(`${env.IP_HASH_SALT}:verified-score:${operation}:${userId}`);
}

function canonicalCategoryCards(
  env: Env,
  categoryId: string,
  source: unknown,
): CanonicalCard[] {
  if (!Array.isArray(source)) {
    throw new ApiError(503, "Canonical question source is invalid", undefined, "QUESTION_SOURCE_INVALID");
  }

  const cardIndex = getCardIndex(env);
  const seen = new Set<string>();
  const cards: CanonicalCard[] = [];
  for (const raw of source) {
    if (!raw || typeof raw !== "object" || !isCanonicalCard(raw as SourceCard)) {
      throw new ApiError(503, "Canonical question source is invalid", undefined, "QUESTION_SOURCE_INVALID");
    }
    const card = raw as CanonicalCard;
    const indexEntry = cardIndex[card.id];
    if (
      seen.has(card.id)
      || !indexEntry
      || indexEntry[0] !== categoryId
      || indexEntry[1] !== card.difficulty
    ) {
      throw new ApiError(503, "Canonical question source is invalid", undefined, "QUESTION_SOURCE_INVALID");
    }
    seen.add(card.id);
    cards.push(card);
  }

  const eligibleCards = cards.filter((card) => (
    hasVerifiableAnswer(card, "en")
    && hasVerifiableAnswer(card, "ar")
    && submittableAnswerAliases(card).length > 0
  ));
  if (eligibleCards.length < VERIFIED_QUESTION_COUNT) {
    throw new ApiError(
      400,
      "Not enough questions for server-checked scoring",
      undefined,
      "SERVER_CHECKED_CATEGORY_UNAVAILABLE",
    );
  }
  return eligibleCards;
}

async function loadCategoryCards(env: Env, categoryId: string): Promise<CanonicalCard[]> {
  requirePublicCategory(categoryId);
  const cardIndex = getCardIndex(env);
  if (!Object.values(cardIndex).some((entry) => entry[0] === categoryId)) {
    throw new ApiError(400, "Invalid category", undefined, "INVALID_CATEGORY");
  }

  let response: Response;
  try {
    response = await fetch(new URL(`/data/${categoryId}.json`, env.STATIC_ORIGIN), {
      headers: { accept: "application/json" },
    });
  } catch {
    throw new ApiError(503, "Canonical question source is unavailable", undefined, "QUESTION_SOURCE_UNAVAILABLE");
  }
  if (!response.ok) {
    throw new ApiError(503, "Canonical question source is unavailable", undefined, "QUESTION_SOURCE_UNAVAILABLE");
  }

  let source: unknown;
  try {
    source = await response.json();
  } catch {
    throw new ApiError(503, "Canonical question source is invalid", undefined, "QUESTION_SOURCE_INVALID");
  }
  const overridden = await applyPublishedContentOverrides(env, categoryId, source as SourceCard[]);
  return canonicalCategoryCards(env, categoryId, overridden);
}

function selectChallengeCards(cards: readonly CanonicalCard[]): CanonicalCard[] {
  const buckets = DIFFICULTY_ORDER
    .map((difficulty) => shuffled(cards.filter((card) => card.difficulty === difficulty)))
    .filter((bucket) => bucket.length > 0);
  const selected: CanonicalCard[] = [];
  const selectedIds = new Set<string>();
  const perBucket = Math.floor(VERIFIED_QUESTION_COUNT / buckets.length);
  let remainder = VERIFIED_QUESTION_COUNT % buckets.length;

  for (const bucket of buckets) {
    const target = perBucket + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    for (const card of bucket.slice(0, target)) {
      selected.push(card);
      selectedIds.add(card.id);
    }
  }

  if (selected.length < VERIFIED_QUESTION_COUNT) {
    const unused = shuffled(cards.filter((card) => !selectedIds.has(card.id)));
    selected.push(...unused.slice(0, VERIFIED_QUESTION_COUNT - selected.length));
  }
  return shuffled(selected);
}

export async function createVerifiedChallenge(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  await enforceRateLimit(env, await rateKey(env, user.id, "create"), 30, 60 * 60);
  const body = await parseJson<{ categoryId?: unknown }>(request);
  const categoryId = normalizeCategory(body.categoryId);
  requirePublicCategory(categoryId);
  const cards = selectChallengeCards(await loadCategoryCards(env, categoryId));

  const challengeId = randomToken(18);
  const challengeToken = randomToken(32);
  const tokenHash = await sha256(challengeToken);
  const commitments = await Promise.all(cards.map(async (card): Promise<AnswerCommitment> => ({
    cardId: card.id,
    digests: await Promise.all(
      submittableAnswerAliases(card).map((answer) => answerDigest(env, challengeId, card.id, answer)),
    ),
  })));

  const startedAt = Date.now();
  const notBeforeAt = startedAt + VERIFIED_MINIMUM_MS;
  const expiresAt = startedAt + VERIFIED_CHALLENGE_TTL_MS;
  const createdAt = new Date(startedAt).toISOString();
  let results: D1Result[];
  try {
    results = await env.DB.batch([
      env.DB.prepare(
        `UPDATE verified_score_sessions
            SET status = 'expired'
          WHERE user_id = ? AND category_id = ?
            AND status = 'pending' AND expires_at <= ?`,
      ).bind(user.id, categoryId, startedAt),
      env.DB.prepare(
        `INSERT INTO verified_score_sessions (
          id, user_id, category_id, challenge_token_hash, card_ids_json,
          answer_hashes_json, question_count, started_at, not_before_at,
          expires_at, status, verified, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM verified_score_sessions
            WHERE user_id = ? AND category_id = ? AND status = 'pending'
         )
        RETURNING id`,
      ).bind(
        challengeId,
        user.id,
        categoryId,
        tokenHash,
        JSON.stringify(cards.map((card) => card.id)),
        JSON.stringify(commitments),
        VERIFIED_QUESTION_COUNT,
        startedAt,
        notBeforeAt,
        expiresAt,
        createdAt,
        user.id,
        categoryId,
      ),
    ]);
  } catch (error) {
    if (
      /UNIQUE constraint failed:[^\n]*verified_score_sessions\.user_id[^\n]*category_id/iu
        .test(String(error))
    ) {
      throw new ApiError(
        409,
        "A current server-checked challenge already exists for this category",
        undefined,
        "SERVER_CHECKED_CHALLENGE_ACTIVE",
      );
    }
    throw error;
  }
  const inserted = results[1]?.results?.some((row) => (
    typeof row === "object" && row !== null && "id" in row && row.id === challengeId
  ));
  if (!inserted) {
    throw new ApiError(
      409,
      "A current server-checked challenge already exists for this category",
      undefined,
      "SERVER_CHECKED_CHALLENGE_ACTIVE",
    );
  }

  return json({
    ...publicScoreContract(),
    challengeId,
    submissionToken: challengeToken,
    categoryId,
    questionCount: VERIFIED_QUESTION_COUNT,
    startedAt,
    notBeforeAt,
    expiresAt,
    questions: cards.map((card) => ({
      cardId: card.id,
      difficulty: card.difficulty,
      question: card.question,
    })),
  }, 201);
}

export async function discardServerCheckedChallenge(
  request: Request,
  env: Env,
): Promise<Response> {
  const user = await requireUser(request, env);
  await enforceRateLimit(env, await rateKey(env, user.id, "discard"), 60, 60 * 60);
  const body = await parseJson<{
    categoryId?: unknown;
    challengeId?: unknown;
    submissionToken?: unknown;
  }>(request, 2_048);
  const categoryId = normalizeCategory(body.categoryId);
  const hasChallengeId = body.challengeId !== undefined;
  const hasSubmissionToken = body.submissionToken !== undefined;
  if (
    hasChallengeId !== hasSubmissionToken
    || (
      hasChallengeId
      && (
        typeof body.challengeId !== "string"
        || !CHALLENGE_ID_PATTERN.test(body.challengeId)
        || typeof body.submissionToken !== "string"
        || !CHALLENGE_TOKEN_PATTERN.test(body.submissionToken)
      )
    )
  ) {
    throw new ApiError(
      400,
      "Invalid challenge",
      undefined,
      "INVALID_SERVER_CHECKED_CHALLENGE",
    );
  }

  let discarded: { id: string } | null;
  if (hasChallengeId) {
    const tokenHash = await sha256(body.submissionToken as string);
    discarded = await env.DB.prepare(
      `UPDATE verified_score_sessions
          SET status = 'expired'
        WHERE user_id = ? AND category_id = ? AND id = ?
          AND challenge_token_hash = ? AND status = 'pending'
      RETURNING id`,
    ).bind(user.id, categoryId, body.challengeId, tokenHash).first<{ id: string }>();
  } else {
    discarded = await env.DB.prepare(
      `UPDATE verified_score_sessions
          SET status = 'expired'
        WHERE user_id = ? AND category_id = ? AND status = 'pending'
      RETURNING id`,
    ).bind(user.id, categoryId).first<{ id: string }>();
  }

  return json({ discarded: Boolean(discarded?.id) });
}

function parseStringArray(value: string, code: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !Array.isArray(parsed)
      || parsed.some((item) => typeof item !== "string" || !CARD_ID_PATTERN.test(item))
      || new Set(parsed).size !== parsed.length
    ) {
      throw new Error("Invalid array");
    }
    return parsed;
  } catch {
    throw new ApiError(503, "Stored challenge is invalid", undefined, code);
  }
}

function parseCommitments(value: string): AnswerCommitment[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !Array.isArray(parsed)
      || parsed.some((item) => (
        !item
        || typeof item !== "object"
        || typeof (item as AnswerCommitment).cardId !== "string"
        || !CARD_ID_PATTERN.test((item as AnswerCommitment).cardId)
        || !Array.isArray((item as AnswerCommitment).digests)
        || (item as AnswerCommitment).digests.length < 1
        || (item as AnswerCommitment).digests.some(
          (digest) => typeof digest !== "string" || !DIGEST_PATTERN.test(digest),
        )
      ))
      || new Set(parsed.map((item) => (item as AnswerCommitment).cardId)).size !== parsed.length
    ) {
      throw new Error("Invalid commitments");
    }
    return parsed as AnswerCommitment[];
  } catch {
    throw new ApiError(503, "Stored challenge is invalid", undefined, "STORED_CHALLENGE_INVALID");
  }
}

function normalizeSubmittedAnswer(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_ANSWER_LENGTH) {
    throw new ApiError(
      400,
      "Invalid server-checked answer",
      undefined,
      "INVALID_SERVER_CHECKED_ANSWER",
    );
  }
  const normalized = normalizeAnswer(value);
  if (!normalized) {
    throw new ApiError(
      400,
      "Invalid server-checked answer",
      undefined,
      "INVALID_SERVER_CHECKED_ANSWER",
    );
  }
  return normalized;
}

function scoreFor(correctCount: number): number {
  return correctCount * 1_000;
}

async function expirePendingChallenge(env: Env, challengeId: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE verified_score_sessions SET status = 'expired' WHERE id = ? AND status = 'pending'",
  ).bind(challengeId).run();
}

export async function submitVerifiedChallenge(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  await enforceRateLimit(env, await rateKey(env, user.id, "submit"), 60, 60 * 60);
  const body = await parseJson<{
    challengeId?: unknown;
    submissionToken?: unknown;
    answers?: unknown;
  }>(request, 16_384);
  if (typeof body.challengeId !== "string" || !CHALLENGE_ID_PATTERN.test(body.challengeId)) {
    throw new ApiError(400, "Invalid challenge", undefined, "INVALID_SERVER_CHECKED_CHALLENGE");
  }
  if (typeof body.submissionToken !== "string" || !CHALLENGE_TOKEN_PATTERN.test(body.submissionToken)) {
    throw new ApiError(400, "Invalid challenge", undefined, "INVALID_SERVER_CHECKED_CHALLENGE");
  }
  if (!Array.isArray(body.answers) || body.answers.length !== VERIFIED_QUESTION_COUNT) {
    throw new ApiError(
      400,
      "Invalid server-checked answer set",
      undefined,
      "INVALID_SERVER_CHECKED_ANSWER_SET",
    );
  }

  const tokenHash = await sha256(body.submissionToken);
  const row = await env.DB.prepare(
    `SELECT id, category_id, card_ids_json, answer_hashes_json, question_count,
            started_at, not_before_at, expires_at, status
       FROM verified_score_sessions
      WHERE id = ? AND user_id = ? AND challenge_token_hash = ?`,
  ).bind(body.challengeId, user.id, tokenHash).first<ChallengeRow>();
  if (!row) {
    throw new ApiError(404, "Challenge not found", undefined, "SERVER_CHECKED_CHALLENGE_NOT_FOUND");
  }
  if (isQuarantinedCategory(row.category_id)) {
    await expirePendingChallenge(env, row.id);
    requirePublicCategory(row.category_id);
  }
  if (row.status !== "pending") {
    throw new ApiError(
      409,
      "Challenge has already been used",
      undefined,
      "SERVER_CHECKED_CHALLENGE_REPLAYED",
    );
  }
  if (
    !CATEGORY_PATTERN.test(row.category_id)
    || !Number.isSafeInteger(row.question_count)
    || !Number.isSafeInteger(row.started_at)
    || !Number.isSafeInteger(row.not_before_at)
    || !Number.isSafeInteger(row.expires_at)
    || row.not_before_at <= row.started_at
    || row.expires_at <= row.not_before_at
  ) {
    throw new ApiError(503, "Stored challenge is invalid", undefined, "STORED_CHALLENGE_INVALID");
  }

  const currentTime = Date.now();
  if (currentTime > row.expires_at) {
    await expirePendingChallenge(env, row.id);
    throw new ApiError(410, "Challenge has expired", undefined, "SERVER_CHECKED_CHALLENGE_EXPIRED");
  }
  if (currentTime < row.not_before_at) {
    throw new ApiError(
      409,
      "Challenge was completed too quickly",
      undefined,
      "SERVER_CHECKED_CHALLENGE_TOO_FAST",
    );
  }
  if (row.question_count !== VERIFIED_QUESTION_COUNT) {
    throw new ApiError(503, "Stored challenge is invalid", undefined, "STORED_CHALLENGE_INVALID");
  }

  const expectedCardIds = parseStringArray(row.card_ids_json, "STORED_CHALLENGE_INVALID");
  const commitments = parseCommitments(row.answer_hashes_json);
  if (
    expectedCardIds.length !== VERIFIED_QUESTION_COUNT
    || commitments.length !== VERIFIED_QUESTION_COUNT
    || expectedCardIds.some((cardId) => !isPublicCard(cardId, row.category_id))
  ) {
    await expirePendingChallenge(env, row.id);
    throw new ApiError(503, "Stored challenge is invalid", undefined, "STORED_CHALLENGE_INVALID");
  }

  let correctCount = 0;
  const submitted = body.answers as SubmittedAnswer[];
  for (let index = 0; index < VERIFIED_QUESTION_COUNT; index += 1) {
    const expectedCardId = expectedCardIds[index];
    const commitment = commitments[index];
    const answer = submitted[index];
    if (
      !expectedCardId
      || !commitment
      || !answer
      || typeof answer !== "object"
      || answer.cardId !== expectedCardId
      || commitment.cardId !== expectedCardId
    ) {
      throw new ApiError(
        400,
        "Challenge questions were changed",
        undefined,
        "SERVER_CHECKED_CHALLENGE_TAMPERED",
      );
    }
    const normalized = normalizeSubmittedAnswer(answer.answer);
    const digest = await answerDigest(env, row.id, expectedCardId, normalized);
    if (commitment.digests.includes(digest)) correctCount += 1;
  }

  const elapsedMs = currentTime - row.started_at;
  const score = scoreFor(correctCount);
  const completedAt = new Date(currentTime).toISOString();
  const claimed = await env.DB.prepare(
    `UPDATE verified_score_sessions
        SET status = 'completed', correct_count = ?, score = ?, elapsed_ms = ?,
            completed_at = ?, verified = 1
      WHERE id = ? AND user_id = ? AND challenge_token_hash = ?
        AND status = 'pending' AND not_before_at <= ? AND expires_at >= ?
      RETURNING id`,
  ).bind(
    correctCount,
    score,
    elapsedMs,
    completedAt,
    row.id,
    user.id,
    tokenHash,
    currentTime,
    currentTime,
  ).first<{ id: string }>();
  if (claimed?.id !== row.id) {
    throw new ApiError(
      409,
      "Challenge has already been used",
      undefined,
      "SERVER_CHECKED_CHALLENGE_REPLAYED",
    );
  }

  return json({
    ...publicScoreContract(),
    challengeId: row.id,
    categoryId: row.category_id,
    correctCount,
    questionCount: VERIFIED_QUESTION_COUNT,
    elapsedMs,
    score,
  });
}

export async function verifiedLeaderboard(request: Request, env: Env): Promise<Response> {
  const categoryParam = new URL(request.url).searchParams.get("category");
  const categoryId = categoryParam === null ? null : normalizeCategory(categoryParam);
  if (categoryId) requirePublicCategory(categoryId);
  if (
    categoryId
    && !Object.values(getCardIndex(env)).some((entry) => entry[0] === categoryId)
  ) {
    throw new ApiError(400, "Invalid category", undefined, "INVALID_CATEGORY");
  }

  const quarantinePlaceholders = QUARANTINED_CATEGORY_IDS.map(() => "?").join(", ");
  const categoryClause = categoryId ? "AND s.category_id = ?" : "";
  const query = `
    WITH eligible AS (
      SELECT u.username, u.avatar, s.user_id, s.category_id AS categoryId,
             (s.correct_count * 1000) AS score, s.correct_count AS correctCount,
             s.question_count AS questionCount,
             ROW_NUMBER() OVER (
               PARTITION BY s.user_id
               ORDER BY s.correct_count DESC, s.completed_at ASC, s.id ASC
             ) AS userBest
        FROM verified_score_sessions s
        JOIN users u ON u.id = s.user_id
       WHERE s.status = 'completed' AND s.verified = 1 AND u.is_banned = 0
         AND s.category_id NOT IN (${quarantinePlaceholders})
         ${categoryClause}
    )
    SELECT username, avatar, score, categoryId, correctCount, questionCount
     FROM eligible
     WHERE userBest = 1
     ORDER BY score DESC, username COLLATE NOCASE ASC, categoryId ASC
     LIMIT 50`;
  const statement = env.DB.prepare(query);
  const bindings = [
    ...QUARANTINED_CATEGORY_IDS,
    ...(categoryId ? [categoryId] : []),
  ];
  const result = await statement.bind(...bindings).all<LeaderboardRow>();

  return json({
    status: "active",
    ...publicScoreContract(),
    categoryId,
    leaderboard: result.results.map((row, index) => ({
      rank: index + 1,
      username: row.username,
      avatar: row.avatar,
      score: row.score,
      categoryId: row.categoryId,
      correctCount: row.correctCount,
      questionCount: row.questionCount,
    })),
  }, 200, { "cache-control": "public, max-age=30" });
}

export async function cleanupExpiredVerifiedChallenges(env: Env): Promise<void> {
  const currentTime = Date.now();
  await runBoundedRetentionCleanup(env.DB, "server-checked-challenges", [
    {
      name: "expired-pending-challenges",
      prepare: () => env.DB.prepare(
        `UPDATE verified_score_sessions
            SET status = 'expired'
          WHERE id IN (
            SELECT id FROM verified_score_sessions
             WHERE status = 'pending' AND expires_at <= ?
             LIMIT ${RETENTION_CLEANUP_BATCH_SIZE}
          )`,
      ).bind(currentTime),
      probe: () => env.DB.prepare(
        `SELECT id FROM verified_score_sessions
          WHERE status = 'pending' AND expires_at <= ?
          LIMIT 1`,
      ).bind(currentTime),
    },
    {
      name: "old-expired-challenges",
      prepare: () => env.DB.prepare(
        `DELETE FROM verified_score_sessions
          WHERE id IN (
            SELECT id
              FROM verified_score_sessions
             WHERE status = 'expired' AND expires_at <= ?
             LIMIT ${RETENTION_CLEANUP_BATCH_SIZE}
          )`,
      ).bind(currentTime - 24 * 60 * 60 * 1_000),
      probe: () => env.DB.prepare(
        `SELECT id FROM verified_score_sessions
          WHERE status = 'expired' AND expires_at <= ?
          LIMIT 1`,
      ).bind(currentTime - 24 * 60 * 60 * 1_000),
    },
  ]);
}
